/**
 * The device's own copy of the last good /config, so a worker or Supabase outage
 * never empties the app. Pure functions over an injected storage (MMKV in the
 * app, a Map in tests).
 */
import type { UniversalStorage } from "@/services/storage/universalStorage.types";
import type { AppConfig } from "@/src/types/worker.types";

export const CONFIG_CACHE_KEY = "config.lkg.v1";

/**
 * Is this /config answer the operator's truth? A list with providers is; so is a
 * deliberate killswitch. An empty list WITHOUT `killswitch` is an outage (or an
 * old worker's error path) — keep what we have instead.
 */
export function shouldAcceptConfig(cfg: Pick<AppConfig, "providers" | "killswitch">): boolean {
  return (cfg.providers?.length ?? 0) > 0 || cfg.killswitch === true;
}

export function loadCachedConfig(storage: Pick<UniversalStorage, "getString">): AppConfig | null {
  const raw = storage.getString(CONFIG_CACHE_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<AppConfig> | null;
    const ok =
      !!v &&
      typeof v.maintenanceMode === "boolean" &&
      Array.isArray(v.providers) &&
      // A non-object entry would throw inside the reducer on every launch.
      v.providers.every((p) => !!p && typeof p === "object");
    return ok ? (v as AppConfig) : null;
  } catch {
    return null;
  }
}

/**
 * Persist accepted answers. A stale (worker last-known-good) answer is skipped —
 * EXCEPT a killswitch: a device that first learns of a kill during an outage must
 * still forget its old providers, or they'd come back on every cold start.
 */
export function saveCachedConfig(cfg: AppConfig, storage: Pick<UniversalStorage, "set">): void {
  if (!shouldAcceptConfig(cfg)) return;
  if (cfg.stale && cfg.killswitch !== true) return;
  try {
    storage.set(CONFIG_CACHE_KEY, JSON.stringify(cfg));
  } catch {
    /* non-fatal: we re-save on the next good answer */
  }
}
