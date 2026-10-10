/**
 * Per-title provider failure memory (MMKV) — the cross-session complement to
 * PlayerScreen's session-scoped `excludedIds`.
 *
 * When a provider fails for a specific title (hard error / no-bind / stall), we
 * remember it keyed by media, so the NEXT time that title is opened the default
 * source biases away from the provider that failed — without ever stranding the
 * user (if every provider recently failed, we still fall back to the top one).
 * Entries expire after a short TTL so a transient blip doesn't blacklist a
 * provider for a title forever (mirrors the "don't negative-cache failures >4h"
 * rule from the Phase-9 scrape-cache plan). A `success` clears the memory.
 */
import { universalStorage as storage } from "@/services/storage/universalStorage";

const KEY = "failmem.v1";
/** How long a remembered failure biases selection for a title (4h). */
const TTL_MS = 4 * 60 * 60 * 1000;

/** mediaKey -> providerId -> lastFailedAt (epoch ms). */
type FailMap = Record<string, Record<string, number>>;

interface MediaLike {
  tmdbId: string;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
}

/** Stable per-title key (episode-specific for TV, since availability differs). */
export function mediaKey(m: MediaLike): string {
  return m.type === "tv"
    ? `tv:${m.tmdbId}:${m.season ?? 1}:${m.episode ?? 1}`
    : `movie:${m.tmdbId}`;
}

function readAll(): FailMap {
  try {
    return JSON.parse(storage.getString(KEY) ?? "{}") as FailMap;
  } catch {
    return {};
  }
}

/** Drop expired entries so the map stays bounded, then persist. */
function writePruned(map: FailMap): void {
  const now = Date.now();
  for (const k of Object.keys(map)) {
    for (const pid of Object.keys(map[k])) {
      if (now - map[k][pid] >= TTL_MS) delete map[k][pid];
    }
    if (Object.keys(map[k]).length === 0) delete map[k];
  }
  // Never let a storage write throw into the player failure path (recordProviderFailure
  // runs inside error handling) — failure memory is best-effort.
  try {
    storage.set(KEY, JSON.stringify(map));
  } catch {
    /* best-effort */
  }
}

/** Remember that `providerId` failed for this title just now. */
export function recordProviderFailure(key: string, providerId: string): void {
  const all = readAll();
  (all[key] ??= {})[providerId] = Date.now();
  writePruned(all);
}

/** Forget a failure (call on a sustained success — the provider works now). */
export function clearProviderFailure(key: string, providerId: string): void {
  const all = readAll();
  if (all[key]?.[providerId] == null) return;
  delete all[key][providerId];
  if (Object.keys(all[key]).length === 0) delete all[key];
  writePruned(all);
}

/** Provider ids that failed for this title within the TTL window. */
export function getRecentlyFailed(key: string): Set<string> {
  const entry = readAll()[key];
  if (!entry) return new Set();
  const now = Date.now();
  return new Set(
    Object.entries(entry)
      .filter(([, ts]) => now - ts < TTL_MS)
      .map(([id]) => id),
  );
}

// Dev builds only: lets device test scripts start each pinned-provider run from a clean
// slate (globalThis.__resetFailureMemory() over CDP). Folded away in release builds.
if (__DEV__) {
  (globalThis as unknown as { __resetFailureMemory?: () => void }).__resetFailureMemory = () =>
    storage.set(KEY, "{}");
}
