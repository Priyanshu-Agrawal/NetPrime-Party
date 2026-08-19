import { StreamProvider } from "./providers.types";

/**
 * Response shapes for the NetPrime edge worker (worker/src/index.ts).
 * These mirror the worker's Zod schemas — see worker/src/schemas.ts and the
 * live OpenAPI spec at `${EXPO_PUBLIC_WORKER_URL}/openapi.json`.
 */

/** `GET /config` — app bootstrap config + provider registry. */
export interface AppConfig {
    appVersion: string;
    maintenanceMode: boolean;
    providers: StreamProvider[];
}

/** Per-provider resolution outcome from `GET /scrape`. */
export type ScrapeStatus =
    | "success"
    | "requires_client_for_stream"
    | "not_found"
    | "failed_use_webview_for_everything";

export interface StreamDetails {
    url?: string;
    qualities?: string[];
    audioTracks?: { language: string; label: string }[];
    message?: string;
}

export interface ScrapeResult {
    provider: string;
    status: ScrapeStatus;
    details?: StreamDetails;
}

/** `GET /scrape?tmdbId=&type=` — title resolution across all enabled providers. */
export interface ScrapeResponse {
    tmdbId: string;
    availableProviders: ScrapeResult[];
}

/** Query args for the scrape endpoint. */
export interface ScrapeArgs {
    tmdbId: string;
    type?: "movie" | "tv";
}

/** `POST /cache/purge` — invalidate the server-side provider cache. */
export interface PurgeResponse {
    purged: boolean;
    message: string;
}
