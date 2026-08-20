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
    };
}

/** Enabled providers, ordered by priority, mapped to the app shape. */
export function remoteToProviders(rows: RemoteProviderRow[]): Provider[] {
    return [...rows]
        .filter((r) => r.enabled)
        .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
        .map(remoteToProvider);
}
