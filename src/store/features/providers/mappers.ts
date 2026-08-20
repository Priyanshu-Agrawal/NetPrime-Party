import type { Provider } from "@/components/player/providerRegistry";
import type { RemoteProviderRow } from "@/src/types/worker.types";

/**
 * Map a Supabase provider row (/config) to the app's playback `Provider` shape.
 * The DB is the full-dynamic source: url_movie/url_tv/allowed_domain/hijack all
 * come from Supabase, so adding or retargeting a provider needs no app update.
 */
export function remoteToProvider(row: RemoteProviderRow): Provider {
    return {
        id: row.id,
        name: row.name,
        urls: { movie: row.url_movie, tv: row.url_tv ?? row.url_movie },
        allowedDomain: row.allowed_domain,
        hijack: row.hijack ?? { supported: false },
        scriptVersion: row.script_version ?? null,
    };
}

/**
 * Enabled providers, mapped to the app shape. Ordering is OWNED by the worker:
 * `/config` returns providers by priority AND demotes chronically-failing ones
 * (provider_health), so we PRESERVE the server order here — re-sorting by priority
 * client-side would undo the health demotion. The app stays dumb; the server is
 * the single source of truth for order (consistent with the no-fallback design).
 */
export function remoteToProviders(rows: RemoteProviderRow[]): Provider[] {
    return rows.filter((r) => r.enabled).map(remoteToProvider);
}
