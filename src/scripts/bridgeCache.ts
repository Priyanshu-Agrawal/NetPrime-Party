/**
 * bridgeCache.ts — OTA injection-script cache (Phase 6).
 *
 * The app no longer bundles the hijack script. On launch it diffs the per-provider
 * `script_version` from /config against the MMKV cache and, only when something
 * changed, fetches the bodies from /scripts and stores them. HijackPlayer reads
 * the cached script synchronously at inject time.
 *
 * NO bundled fallback (deliberate — see the providers no-fallback decision): if
 * nothing is cached (first launch offline), there's no script to inject and the
 * provider simply won't be hijack-controllable until a sync succeeds.
 */
import { universalStorage as storage } from "@/services/storage/universalStorage";
import { sha256Hex } from "@/utils/sha256";
import { devBridgeEnabled } from "./devGenericBridge";

const CACHE_KEY = "bridge.scripts.v1";
// H2: the bridge is arbitrary JS injected into the provider WebView, so it must
// arrive over TLS — an http worker URL is a MITM injection vector. Refuse a
// non-https worker outright (dev localhost is exempt so `wrangler dev` still works).
const RAW_WORKER_URL = process.env.EXPO_PUBLIC_WORKER_URL ?? "";
const WORKER_URL = isSafeWorkerUrl(RAW_WORKER_URL) ? RAW_WORKER_URL : "";

function isSafeWorkerUrl(u: string): boolean {
  if (!u) return false;
  try {
    const { protocol, hostname } = new URL(u);
    if (protocol === "https:") return true;
    if (protocol !== "http:") return false;
    // Allow plain http ONLY for local / private-network dev hosts (localhost,
    // *.local, and RFC-1918 LAN ranges — the docs suggest a LAN IP for wrangler dev).
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".local")) return true;
    return (
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    );
  } catch {
    return false;
  }
}

/**
 * H2: the `version` tag is a content hash (`<id>@<sha256[:8]>`), so verify the
 * fetched body hashes to it before we cache/inject — a corrupted or swapped body
 * (or a /scripts vs /config version mismatch) is dropped rather than injected as
 * JS into the WebView. Scripts with no version tag are accepted (nothing to check
 * against); a present tag MUST match.
 */
function bodyMatchesVersion(script: string, version: string | null): boolean {
  if (!version) return true;
  const at = version.lastIndexOf("@");
  const want = (at >= 0 ? version.slice(at + 1) : version).toLowerCase();
  if (!/^[0-9a-f]{6,64}$/.test(want)) return true; // not a hash tag → nothing to verify
  return sha256Hex(script).slice(0, want.length) === want;
}

type Entry = { version: string | null; script: string };
type CacheMap = Record<string, Entry>;

function readCache(): CacheMap {
  try {
    const s = storage.getString(CACHE_KEY);
    return s ? (JSON.parse(s) as CacheMap) : {};
  } catch {
    return {};
  }
}

function writeCache(m: CacheMap): void {
  try {
    storage.set(CACHE_KEY, JSON.stringify(m));
  } catch {
    /* MMKV write failure is non-fatal — we just re-sync next launch. */
  }
}

/** The cached injection script for a provider (synchronous — for inject time). */
export function getCachedScript(providerId: string): string | null {
  const cached = readCache()[providerId]?.script ?? null;
  // Dev builds only (folded away in release): the bundled generic bridge for providers
  // given a dev version by devGenericBridge (EXPO_PUBLIC_DEV_GENERIC_BRIDGE=1).
  if (__DEV__ && cached == null && providerId !== "videasy" && devBridgeEnabled()) {
    return (require("./generic-bridge") as typeof import("./generic-bridge")).GENERIC_BRIDGE;
  }
  return cached;
}

/** The cached script version (for telemetry / staleness checks). */
export function getCachedVersion(providerId: string): string | null {
  return readCache()[providerId]?.version ?? null;
}

/**
 * Diff /config-reported versions against the cache; if any provider's script is
 * new/changed, fetch the full /scripts payload once and update the cache. No-ops
 * when nothing changed (the common launch) or when the worker is unreachable.
 */
export async function syncScripts(
  want: { id: string; scriptVersion: string | null }[],
): Promise<void> {
  if (!WORKER_URL) return;
  const cache = readCache();
  const stale = want.some(
    (w) => w.scriptVersion != null && cache[w.id]?.version !== w.scriptVersion,
  );
  if (!stale) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${WORKER_URL.replace(/\/$/, "")}/scripts`, {
      signal: controller.signal,
    });
    if (!res.ok) return;
    const scripts = (await res.json()) as {
      id: string;
      version: string | null;
      script: string;
    }[];
    const next: CacheMap = { ...cache };
    for (const s of scripts) {
      if (!s.id || !s.script) continue;
      // H2: drop a body that doesn't match its content-hash version tag (never
      // cache/inject unverified JS). Keep any previously-verified cached entry.
      if (!bodyMatchesVersion(s.script, s.version ?? null)) {
        console.warn(`bridgeCache: ${s.id} body failed hash check (version ${s.version}) — not caching.`);
        continue;
      }
      next[s.id] = { version: s.version ?? null, script: s.script };
    }
    writeCache(next);
  } catch {
    /* offline / worker down / timeout → keep whatever's cached */
  } finally {
    clearTimeout(timer);
  }
}
