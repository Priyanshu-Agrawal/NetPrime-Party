/**
 * @file schemas.ts
 * Zod schemas for the NetPrime edge worker.
 *
 * These schemas are the **single source of truth** for three things at once:
 *  1. Runtime request/response validation (Hono rejects bad input automatically).
 *  2. Static TypeScript types (via `z.infer`).
 *  3. The auto-generated OpenAPI spec + Swagger UI (via the `.openapi()` metadata).
 *
 * Because of (3), you never hand-write API docs — edit a schema here and the
 * `/openapi.json` spec and `/docs` page update themselves.
 *
 * NOTE: `z` is imported from `@hono/zod-openapi`, not `zod`. It is the same Zod
 * augmented with the `.openapi()` method used to attach OpenAPI metadata.
 */

import { z } from "@hono/zod-openapi";

/* -------------------------------------------------------------------------- */
/*  Provider (mirrors the `public.providers` table in Supabase)               */
/* -------------------------------------------------------------------------- */

/**
 * Hijack capability overlay (JSONB) — how/whether the app's injected bridge can
 * drive this provider's <video> for watch-party sync. Empirically probed.
 */
export const HijackSchema = z
  .object({
    supported: z.boolean().openapi({ example: true }),
    videoLocation: z.enum(["top", "same-origin-iframe"]).optional(),
    navHosts: z.array(z.string()).optional().openapi({ example: ["player.videasy.to"] }),
    autoplayParam: z.string().optional().openapi({ example: "autoplay=false" }),
    unstable: z.boolean().optional(),
    notes: z.string().optional(),
  })
  .openapi("Hijack");

/**
 * A streaming provider row from `public.providers` (full-dynamic playback shape),
 * ordered by `priority` asc. The player builds embed URLs from `url_movie`/
 * `url_tv` and gates WebView navigation with `allowed_domain` + `hijack.navHosts`.
 */
export const ProviderSchema = z
  .object({
    id: z.string().openapi({ example: "videasy" }),
    name: z.string().openapi({ example: "NetPrime" }),
    enabled: z.boolean().openapi({ example: true }),
    priority: z.number().int().openapi({ example: 1 }),
    url_movie: z.string().openapi({ example: "https://player.videasy.to/movie/${id}" }),
    url_tv: z
      .string()
      .nullable()
      .openapi({ example: "https://player.videasy.to/tv/${id}/${season}/${episode}" }),
    allowed_domain: z.string().openapi({ example: "https://player.videasy.to" }),
    hijack: HijackSchema,
  })
  .openapi("Provider");

/** Inferred TypeScript type for a provider row. */
export type Provider = z.infer<typeof ProviderSchema>;

/* -------------------------------------------------------------------------- */
/*  GET /config                                                               */
/* -------------------------------------------------------------------------- */

/** App-level configuration returned to the mobile/web client on launch. */
export const AppConfigSchema = z
  .object({
    appVersion: z.string().openapi({ example: "2.0.0" }),
    maintenanceMode: z.boolean().openapi({ example: false }),
    providers: z.array(ProviderSchema),
  })
  .openapi("AppConfig");

/* -------------------------------------------------------------------------- */
/*  GET /scrape                                                               */
/* -------------------------------------------------------------------------- */

/** Query string for the title-level aggregator. */
export const ScrapeQuerySchema = z.object({
  tmdbId: z.string().min(1).openapi({
    param: { name: "tmdbId", in: "query", required: true },
    example: "550",
  }),
  type: z.enum(["movie", "tv"]).default("movie").openapi({
    param: { name: "type", in: "query" },
    example: "movie",
  }),
});

/** A single selectable audio track on a resolved stream. */
export const AudioTrackSchema = z
  .object({
    language: z.string().openapi({ example: "hi" }),
    label: z.string().openapi({ example: "Hindi" }),
  })
  .openapi("AudioTrack");

/** Stream metadata; shape varies by provider tier, so all fields are optional. */
export const StreamDetailsSchema = z
  .object({
    url: z.string().optional().openapi({
      example: "https://cdn.vidsrc_to.com/streams/550/master.m3u8",
    }),
    qualities: z.array(z.string()).optional().openapi({ example: ["1080p", "720p"] }),
    audioTracks: z.array(AudioTrackSchema).optional(),
    message: z.string().optional(),
  })
  .openapi("StreamDetails");

/**
 * Per-provider resolution outcome.
 * - `success`                       server-side scrape produced a direct m3u8.
 * - `requires_client_for_stream`    metadata OK, client must mount a WebView to
 *                                   snatch the IP-locked stream (Tier 2).
 * - `not_found`                     title not carried by this provider.
 * - `failed_use_webview_for_everything`  scrape errored; fall back to WebView.
 */
export const ScrapeStatus = z.enum([
  "success",
  "requires_client_for_stream",
  "not_found",
  "failed_use_webview_for_everything",
]);

export const ScrapeResultSchema = z
  .object({
    provider: z.string().openapi({ example: "videasy" }),
    status: ScrapeStatus.openapi({ example: "requires_client_for_stream" }),
    details: StreamDetailsSchema.optional(),
  })
  .openapi("ScrapeResult");

export const ScrapeResponseSchema = z
  .object({
    tmdbId: z.string().openapi({ example: "550" }),
    availableProviders: z.array(ScrapeResultSchema),
  })
  .openapi("ScrapeResponse");

/** Inferred type used by the /scrape handler to build its response. */
export type ScrapeResult = z.infer<typeof ScrapeResultSchema>;

/* -------------------------------------------------------------------------- */
/*  GET /health  &  POST /cache/purge                                         */
/* -------------------------------------------------------------------------- */

export const HealthSchema = z
  .object({
    status: z.literal("ok"),
    service: z.string().openapi({ example: "netprime-worker" }),
    time: z.string().openapi({ example: "2026-08-19T13:37:00.000Z" }),
  })
  .openapi("Health");

export const PurgeResponseSchema = z
  .object({
    purged: z.boolean().openapi({ example: true }),
    message: z.string().openapi({ example: "Providers cache cleared." }),
  })
  .openapi("PurgeResponse");

/* -------------------------------------------------------------------------- */
/*  Shared error envelope                                                     */
/* -------------------------------------------------------------------------- */

export const ErrorSchema = z
  .object({
    error: z.string().openapi({ example: "Validation failed" }),
    issues: z.array(z.any()).optional(),
  })
  .openapi("Error");

/* -------------------------------------------------------------------------- */
/*  POST /report — provider failure/success telemetry                         */
/* -------------------------------------------------------------------------- */

/**
 * Playback outcome for a (provider, title) attempt. `success` is REQUIRED as the
 * denominator — a failure count without successes would auto-disable the most
 * popular provider. `not_found` is a per-title catalog gap, not provider ill
 * health. `playback_stall` = bound then died mid-stream (WAF token rotation).
 */
export const ReportOutcome = z.enum([
  "success",
  "no_bind",
  "http_error",
  "render_crash",
  "captcha_block",
  "playback_stall",
  "not_found",
  "manual_switch",
]);

export const ReportRequestSchema = z
  .object({
    providerId: z.string().min(1).openapi({ example: "videasy" }),
    tmdbId: z.string().min(1).openapi({ example: "550" }),
    mediaType: z.enum(["movie", "tv"]).openapi({ example: "movie" }),
    outcome: ReportOutcome.openapi({ example: "no_bind" }),
    /** 0ms (never bound) vs 20min (mid-stream stall) → very different weight. */
    timeToFailMs: z.number().int().nonnegative().optional().openapi({ example: 10000 }),
    /** Which Phase-6 injection script was live — separates old-script failures from post-fix. */
    scriptVersion: z.string().optional().openapi({ example: "videasy@3" }),
    platform: z.enum(["ios", "android", "web"]).openapi({ example: "android" }),
    appVersion: z.string().optional().openapi({ example: "2.1.0" }),
    /** Untrusted free text — capped, stored as-is, never rendered or executed. */
    errorMessage: z.string().max(300).optional(),
  })
  .openapi("ReportRequest");
// NOTE: country + client id are DERIVED server-side (CF geo + hashed IP) and are
// deliberately NOT accepted from the client.

export const ReportAcceptedSchema = z
  .object({ accepted: z.boolean().openapi({ example: true }) })
  .openapi("ReportAccepted");
