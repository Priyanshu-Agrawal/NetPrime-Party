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
    return v && Array.isArray(v.providers) && typeof v.maintenanceMode === "boolean" ? (v as AppConfig) : null;
  } catch {
    return null;
  }
}

/** Persist only fresh, accepted answers — never an outage or a stale copy. */
export function saveCachedConfig(cfg: AppConfig, storage: Pick<UniversalStorage, "set">): void {
  if (cfg.stale || !shouldAcceptConfig(cfg)) return;
  try {
    storage.set(CONFIG_CACHE_KEY, JSON.stringify(cfg));
  } catch {
    /* non-fatal: we re-save on the next good answer */
  }
}
