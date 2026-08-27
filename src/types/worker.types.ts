import type { HijackCapability } from "@/components/player/hijackCapabilities";
import type { FeedManifest } from "@/types/feed";

/**
 * Response shapes for the NetPrime edge worker (worker/src/index.ts).
 * These mirror the worker's Zod schemas — see worker/src/schemas.ts and the
 * live OpenAPI spec at `${EXPO_PUBLIC_WORKER_URL}/openapi.json`.
 */

/**
 * A provider row from Supabase `public.providers` (full-dynamic playback shape).
 * Mapped to the app's `Provider` via remoteToProvider(). Legacy config columns
 * (url_template, capabilities, descriptions) may also be present but are unused
 * by the player.
 */
export interface RemoteProviderRow {
    id: string;
    name: string;
    enabled: boolean;
    priority: number;
    url_movie: string;
    url_tv: string | null;
    allowed_domain: string;
    hijack: HijackCapability;
    /** Version tag of the served injection script (body fetched from /scripts). */
    script_version: string | null;
}

/** `GET /config` — app bootstrap config + provider registry. */
export interface AppConfig {
    appVersion: string;
    maintenanceMode: boolean;
    providers: RemoteProviderRow[];
    /**
     * Optional server-driven Home feed manifest. Omitted (D1 default) → the
     * client renders its baked-in fallback via `normalizeManifest(undefined)`.
     */
    homeFeed?: FeedManifest;
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

/**
 * Playback outcome reported to `POST /report` (provider health telemetry).
 * `success` is the denominator; `not_found` is a per-title catalog gap, not
 * provider ill-health; `playback_stall` = bound then died mid-stream.
 */
export type ReportOutcome =
    | "success"
    | "no_bind"
    | "http_error"
    | "render_crash"
    | "captcha_block"
    | "playback_stall"
    | "not_found"
    | "manual_switch";

/** Client args for `POST /report`. `country` + client id are derived server-side. */
export interface ReportArgs {
    providerId: string;
    tmdbId: string;
    mediaType: "movie" | "tv";
    outcome: ReportOutcome;
    timeToFailMs?: number;
    scriptVersion?: string;
    platform: "ios" | "android" | "web";
    appVersion?: string;
    errorMessage?: string;
}
