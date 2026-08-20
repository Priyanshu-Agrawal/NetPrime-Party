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

const CACHE_KEY = "bridge.scripts.v1";
const WORKER_URL = process.env.EXPO_PUBLIC_WORKER_URL ?? "";

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
  return readCache()[providerId]?.script ?? null;
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
      if (s.id && s.script) next[s.id] = { version: s.version ?? null, script: s.script };
    }
    writeCache(next);
  } catch {
    /* offline / worker down / timeout → keep whatever's cached */
  } finally {
    clearTimeout(timer);
  }
}
