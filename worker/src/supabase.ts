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
};

/**
 * A synthetic, stable cache key. It never hits the network — it only has to be
 * a valid https GET Request for the Cache API to key on it.
 */
const PROVIDERS_CACHE_KEY = new Request("https://internal.cache/providers");

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

/**
 * Fetch all providers ordered by priority, with a 60s edge cache.
 *
 * @param env  Worker bindings (Supabase creds).
 * @param ctx  Execution context, used to persist the cache write without
 *             blocking the response (`ctx.waitUntil`).
 * @returns    The provider list, or `[]` if creds are missing / Supabase errors
 *             (callers degrade gracefully rather than 500).
 */
export async function getProviders(
  env: Bindings,
  ctx: Waitable,
): Promise<Provider[]> {
  const cache = caches.default;
  let response = await cache.match(PROVIDERS_CACHE_KEY);

  if (!response) {
    const { url, key } = resolveCredentials(env);
    if (!url || !key) {
      console.error("Missing Supabase environment variables.");
      return [];
    }

    // Only enabled providers leave the edge. Clearing/disabling rows in Supabase
    // makes /config genuinely empty over the wire — the app has no baked-in
    // fallback, so it goes "dumb" (nothing observable) during store review.
    const endpoint = `${url}/rest/v1/providers?select=*&enabled=eq.true&order=priority.asc`;
    let res: Response;
    try {
      res = await fetch(endpoint, {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        // Never let a hung Supabase call hang the worker.
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      console.error("Supabase request failed or timed out:", err);
      return [];
    }

    if (!res.ok) {
      console.error(`Supabase responded ${res.status} for providers.`);
      return [];
    }

    const data = await res.text();
    response = new Response(data, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=60",
      },
    });

    // Persist to the edge cache without delaying the response to the client.
    ctx.waitUntil(cache.put(PROVIDERS_CACHE_KEY, response.clone()));
  }

  return response.json();
}

/**
 * Drop the cached provider list so the next read hits Supabase fresh.
 * Call after editing rows in the dashboard instead of waiting out the TTL.
 *
 * @returns `true` if an entry existed and was removed.
 */
export function purgeProviders(): Promise<boolean> {
  return caches.default.delete(PROVIDERS_CACHE_KEY);
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

/** SHA-256 of the client IP (privacy: we store a hash, never the raw IP). */
export async function hashIp(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}
