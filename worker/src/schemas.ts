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

/** Per-provider feature flags stored as JSONB in Postgres. */
export const CapabilitiesSchema = z
  .object({
    watchParty: z.boolean().openapi({ example: true }),
    pip: z.boolean().openapi({ example: true }),
  })
  .openapi("Capabilities");

/**
 * A streaming provider row from `public.providers`, ordered by `priority` asc.
 * `user_description` / `dev_description` are nullable in the DB.
 */
export const ProviderSchema = z
  .object({
    id: z.string().openapi({ example: "videasy" }),
    name: z.string().openapi({ example: "NetPrime (Videasy)" }),
    enabled: z.boolean().openapi({ example: true }),
    unstable: z.boolean().openapi({ example: false }),
    url_template: z
      .string()
      .openapi({ example: "https://player.videasy.to/movie/${id}" }),
    requires_client_sniff: z.boolean().openapi({ example: true }),
    capabilities: CapabilitiesSchema,
    priority: z.number().int().openapi({ example: 1 }),
    user_description: z.string().nullable().openapi({
      example: "The absolute best choice for multiple Audio Dubs and Anime.",
    }),
    dev_description: z.string().nullable().openapi({
      example: "Tier 2 Fallback. Strict IP-locked tokens. Requires WebView.",
    }),
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
