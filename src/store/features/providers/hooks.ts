import { useAppSelector } from "@/src/store/hooks";
import type { Provider } from "@/components/player/providerRegistry";

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
