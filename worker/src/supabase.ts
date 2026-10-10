/**
 * @file supabase.ts
 * Edge-cached data access for the `providers` table.
 *
 * Reads go through the Cloudflare Cache API under a single, stable key so that
 * `/config` and `/scrape` share the same cached payload (previously they cached
 * under their own request URLs and never shared a hit). The cache holds for
 * `s-maxage=60`; `purgeProviders()` clears it on demand after you edit rows in
 * Supabase.
 */

import type { Provider } from "./schemas";
import {
  LKG_KEY,
  parseLkg,
  resolveProviders,
  writeLkgIfChanged,
  type LiveOutcome,
  type LkgRecord,
  type ProvidersResult,
} from "./configResolve";

/**
 * Environment bindings. Names are read root-first (`EXPO_PUBLIC_*`, which is
 * what the repo-root `.env.local` uses and what `wrangler dev` loads via the
 * symlinked `.dev.vars`), then fall back to worker-native secret names set for
 * production with `wrangler secret put`.
 */
/** Minimal shape of the Workers Rate Limiting binding (env.<name>.limit). */
export type RateLimiter = { limit(opts: { key: string }): Promise<{ success: boolean }> };

export type Bindings = {
  SUPABASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Service-role key — REQUIRED to write provider_reports (RLS-locked table).
   *  Set with `wrangler secret put SUPABASE_SERVICE_ROLE_KEY`. */
  SUPABASE_SERVICE_ROLE_KEY?: string;
  /** Optional rate-limit binding for /report (see wrangler.toml [[ratelimits]]). */
  REPORT_LIMITER?: RateLimiter;
  /** Shared secret gating POST /cache/purge (H1). Set in prod with
   *  `wrangler secret put PURGE_TOKEN`; when unset, purge is open (dev only). */
  PURGE_TOKEN?: string;
  /** Server-only salt so `client_hash` is a keyed HMAC, not a brute-forceable
   *  bare SHA-256 of the IP (M7). Set with `wrangler secret put IP_HASH_SALT`. */
  IP_HASH_SALT?: string;
  /** TMDB proxy base URL used by the franchise harvest in LOCAL dev only (a plain
   *  fetch). Non-secret; defaults to the app's proxy. */
  TMDB_PROXY_URL?: string;
  /** Service binding to the TMDB proxy worker (same account). Prod reaches TMDB
   *  through this — same-zone workers.dev HTTP subrequests are blocked. See
   *  wrangler.toml [[services]]. Absent in local dev → falls back to a plain fetch. */
  TMDB_PROXY?: { fetch: (req: Request) => Promise<Response> };
  /** Durable last-known-good provider list (Workers KV). Optional: without it an
   *  outage degrades to an empty, non-killswitch list. See configResolve.ts. */
  CONFIG_LKG?: KVNamespace;
  /** Remote lane switches ("1"/"true"/"on"/"yes" = on). See flags.ts. */
  FLAG_EMBED_API_LANE?: string;
  FLAG_NATIVE_LANE?: string;
  FLAG_PLUGIN_HOST?: string;
};

/**
 * A synthetic, stable cache key. It never hits the network — it only has to be
 * a valid https GET Request for the Cache API to key on it.
 */
const PROVIDERS_CACHE_KEY = new Request("https://internal.cache/providers");
const SCRIPTS_CACHE_KEY = new Request("https://internal.cache/scripts");

/** Resolve the Supabase URL + key from either naming convention. */
function resolveCredentials(env: Bindings): { url?: string; key?: string } {
  return {
    url: env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL,
    key:
      env.SUPABASE_ANON_KEY ||
      env.SUPABASE_PUBLISHABLE_KEY ||
      env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

/** Minimal shape we need from the execution context (avoids coupling to a
 * specific `@cloudflare/workers-types` / Hono `ExecutionContext` version). */
type Waitable = { waitUntil(promise: Promise<unknown>): void };

/** A row from the rolling-24h `provider_health` view. */
interface HealthRow {
  provider_id: string;
  failure_rate: number | null;
  distinct_clients: number | null;
}

/** A provider is "unhealthy" (auto-demoted) only above BOTH thresholds — a high
 *  distinct-client-weighted failure RATE and a real sample size, so one bad title
 *  or a single abusive client can't sink it. Never auto-DISABLED (that stays the
 *  manual killswitch); only demoted below healthy providers in the ordering. */
const UNHEALTHY_RATE = 0.5;
const MIN_SAMPLE = 3;

/**
 * Read the `provider_health` view with the SERVICE-ROLE key (the view aggregates
 * the RLS-locked provider_reports table). Best-effort: returns [] on missing key
 * / error / timeout, so ordering degrades to plain priority.
 */
async function fetchHealth(env: Bindings): Promise<HealthRow[]> {
  const url = env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  try {
    const res = await fetch(
      `${url}/rest/v1/provider_health?select=provider_id,failure_rate,distinct_clients`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!res.ok) return [];
    return (await res.json()) as HealthRow[];
  } catch {
    return [];
  }
}

/**
 * Stable partition: demote chronically-failing providers below healthy ones while
 * preserving priority order within each group. Party launch is unaffected — it
 * picks a party-capable provider explicitly, not `providers[0]` — so this only
 * steers the SOLO default toward a working source.
 */
function reorderByHealth(providers: Provider[], health: HealthRow[]): Provider[] {
  if (!health.length) return providers;
  const bad = new Set(
    health
      .filter(
        (h) =>
          (h.failure_rate ?? 0) >= UNHEALTHY_RATE && (h.distinct_clients ?? 0) >= MIN_SAMPLE,
      )
      .map((h) => h.provider_id),
  );
  if (!bad.size) return providers;
  return [
    ...providers.filter((p) => !bad.has(p.id)),
    ...providers.filter((p) => bad.has(p.id)),
  ];
}

/** One Supabase read of the enabled providers, health-ordered. Never throws. */
async function fetchLiveProviders(env: Bindings): Promise<LiveOutcome> {
  const { url, key } = resolveCredentials(env);
  if (!url || !key) return { ok: false, reason: "missing-credentials" };
  // Only enabled providers leave the edge. Clearing/disabling rows in Supabase makes
  // /config genuinely empty over the wire — now flagged `killswitch:true` — so the
  // app goes "dumb" during store review. The heavy `bridge_script` body is NEVER
  // sent here (served separately via /scripts); only its version tag.
  const cols = "id,name,enabled,priority,url_movie,url_tv,allowed_domain,hijack,script_version";
  const endpoint = `${url}/rest/v1/providers?select=${cols}&enabled=eq.true&order=priority.asc`;
  try {
    const res = await fetch(endpoint, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000), // never let a hung Supabase call hang the worker
    });
    if (!res.ok) return { ok: false, reason: `supabase-${res.status}` };
    const raw = (await res.json()) as Provider[];
    // Health-aware ordering: demote chronically-failing providers below healthy
    // ones (best-effort — no health data ⇒ plain priority order).
    return { ok: true, providers: reorderByHealth(raw, await fetchHealth(env)) };
  } catch (err) {
    console.error("Supabase request failed or timed out:", err);
    return { ok: false, reason: "network" };
  }
}

/**
 * The provider list for /config, with outage awareness.
 * Live answers are edge-cached 60 s (shared with /scrape) and mirrored to KV as
 * last-known-good; when Supabase doesn't answer we serve that copy, marked stale.
 */
export async function getProvidersResult(env: Bindings, ctx: Waitable): Promise<ProvidersResult> {
  const cache = caches.default;
  const hit = await cache.match(PROVIDERS_CACHE_KEY);
  if (hit) return resolveProviders({ ok: true, providers: (await hit.json()) as Provider[] }, null);

  const live = await fetchLiveProviders(env);
  if (live.ok) {
    const response = new Response(JSON.stringify(live.providers), {
      headers: { "Content-Type": "application/json", "Cache-Control": "s-maxage=60" },
    });
    // Persist to the edge cache without delaying the response to the client.
    ctx.waitUntil(cache.put(PROVIDERS_CACHE_KEY, response));
    if (env.CONFIG_LKG) {
      ctx.waitUntil(
        writeLkgIfChanged(env.CONFIG_LKG, live.providers, new Date()).catch((e) =>
          console.error("LKG write failed:", e),
        ),
      );
    }
    return resolveProviders(live, null);
  }

  let lkg: LkgRecord | null = null;
  try {
    lkg = env.CONFIG_LKG ? parseLkg(await env.CONFIG_LKG.get(LKG_KEY)) : null;
  } catch (e) {
    console.error("LKG read failed:", e);
  }
  console.error(`Serving ${lkg ? "last-known-good" : "no"} providers: ${live.reason}`);
  return resolveProviders(live, lkg);
}

/** Back-compat for /scrape: just the list (now also survives outages via LKG). */
export async function getProviders(env: Bindings, ctx: Waitable): Promise<Provider[]> {
  return (await getProvidersResult(env, ctx)).providers;
}

/**
 * A served injection script (compiled core+delta) for one provider.
 * `script` is the raw JS string HijackPlayer injects; `version` is the CLI tag.
 */
export interface ProviderScript {
  id: string;
  version: string | null;
  script: string;
}

/**
 * Fetch the injection scripts for enabled providers that have one, edge-cached.
 * Heavy payload → its own cache key, served only from /scripts (never /config).
 */
export async function getScripts(env: Bindings, ctx: Waitable): Promise<ProviderScript[]> {
  const cache = caches.default;
  let response = await cache.match(SCRIPTS_CACHE_KEY);

  if (!response) {
    const { url, key } = resolveCredentials(env);
    if (!url || !key) {
      console.error("Missing Supabase environment variables.");
      return [];
    }
    const endpoint =
      `${url}/rest/v1/providers?select=id,script_version,bridge_script` +
      `&enabled=eq.true&bridge_script=not.is.null&order=priority.asc`;
    let res: Response;
    try {
      res = await fetch(endpoint, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      console.error("Supabase /scripts request failed or timed out:", err);
      return [];
    }
    if (!res.ok) {
      console.error(`Supabase responded ${res.status} for scripts.`);
      return [];
    }
    const rows = (await res.json()) as {
      id: string;
      script_version: string | null;
      bridge_script: string | null;
    }[];
    const scripts: ProviderScript[] = rows
      .filter((r) => r.bridge_script)
      .map((r) => ({ id: r.id, version: r.script_version, script: r.bridge_script as string }));
    response = new Response(JSON.stringify(scripts), {
      headers: { "Content-Type": "application/json", "Cache-Control": "s-maxage=60" },
    });
    ctx.waitUntil(cache.put(SCRIPTS_CACHE_KEY, response.clone()));
  }

  return response.json();
}

/**
 * Drop the cached provider list + scripts so the next read hits Supabase fresh.
 * Call after editing rows (or uploading a script) instead of waiting out the TTL.
 *
 * @returns `true` if either cache entry existed and was removed.
 */
export async function purgeProviders(): Promise<boolean> {
  const [a, b] = await Promise.all([
    caches.default.delete(PROVIDERS_CACHE_KEY),
    caches.default.delete(SCRIPTS_CACHE_KEY),
  ]);
  return a || b;
}

/** A provider_reports row (server-derived fields added by the /report route). */
export type ReportRow = Record<string, unknown>;

/**
 * Insert a telemetry row using the SERVICE-ROLE key (the table is RLS-locked with
 * no client policies, so only this path can write — that's the anti-poisoning
 * guarantee). Best-effort: never throws into the request path.
 *
 * @returns `true` on a successful insert.
 */
export async function insertReport(env: Bindings, row: ReportRow): Promise<boolean> {
  const url = env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("report: missing SUPABASE_SERVICE_ROLE_KEY / URL — cannot write.");
    return false;
  }
  try {
    const res = await fetch(`${url}/rest/v1/provider_reports`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error(`report: Supabase insert responded ${res.status}`);
    return res.ok;
  } catch (err) {
    console.error("report: insert failed/timed out:", err);
    return false;
  }
}

/**
 * Keyed hash of the client IP for the distinct-client id — privacy: we store a
 * hash, never the raw IP. A bare SHA-256 is NOT enough: the IPv4 space is ~4B
 * values, brute-forceable in seconds, so an unsalted digest ≈ the raw IP (M7).
 * With `salt` set (production, `wrangler secret put IP_HASH_SALT`) this is an
 * HMAC-SHA256 that can't be reversed without the server secret. Without a salt
 * (dev/unset) it degrades to the old plain digest with a warning — production
 * MUST set the secret. Both paths return the same 32-hex-char shape so distinct-
 * client counting is unaffected by whether the salt is present.
 */
export async function hashIp(ip: string, salt?: string): Promise<string> {
  const enc = new TextEncoder();
  const toHex = (buf: ArrayBuffer) =>
    [...new Uint8Array(buf)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 32);
  if (salt) {
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      enc.encode(salt),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    return toHex(await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(ip)));
  }
  console.warn("hashIp: IP_HASH_SALT not set — client_hash is reversible. Set the secret in production.");
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(ip)));
}
