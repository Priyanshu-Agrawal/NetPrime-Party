import { useAppSelector } from "@/src/store/hooks";
import type { Provider } from "@/components/player/providerRegistry";
import type { FeatureFlags } from "@/src/types/worker.types";

/** The live provider list (Supabase-backed, bootstrap until /config loads). */
export function useProviders(): Provider[] {
    return useAppSelector((s) => s.providers.providers);
}

/** Just the hijackable (watch-party-capable) providers. */
export function useHijackableProviders(): Provider[] {
    return useAppSelector((s) => s.providers.providers.filter((p) => p.hijack.supported));
}

/** Remote maintenance flag (future store-review "listing mode"). */
export function useMaintenanceMode(): boolean {
    return useAppSelector((s) => s.providers.maintenanceMode);
}

/** Client country (ISO 3166-1) for the "Popular in your region" rail. Server
 *  (CF)-detected via /config; defaults to India-first "IN" when absent. */
export function useRegion(): string {
    return useAppSelector((s) => s.providers.region) ?? "IN";
}

/** Remote lane switches from /config (all off until the operator turns one on). */
export function useFeatureFlags(): FeatureFlags {
    return useAppSelector((s) => s.providers.flags);
}

/** True while the app is running on a cached /config (worker or Supabase outage). */
export function useConfigStale(): boolean {
    return useAppSelector((s) => s.providers.stale);
}
