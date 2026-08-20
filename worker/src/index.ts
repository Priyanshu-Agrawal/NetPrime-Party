/**
 * @file index.ts
 * NetPrime edge worker — Tier-1 config + title aggregator, running on Hono.
 *
 * Why Hono? Express needs Node's `http` server, which Cloudflare Workers do not
 * provide. Hono is the Web-Standards equivalent (routing, middleware, CORS) and
 * its `@hono/zod-openapi` layer turns each route's Zod schema into live API
 * docs — so documentation is generated on demand, never hand-written.
 *
 * Self-documenting endpoints:
 *   GET  /docs          Swagger UI (interactive, try-it-out).
 *   GET  /openapi.json  Raw OpenAPI 3.0 spec (feed to codegen / Postman).
 *
 * API endpoints:
 *   GET  /health        Liveness probe.
 *   GET  /config        App config + provider registry (edge-cached 60s).
 *   GET  /scrape        Per-title provider resolution (mock scraper for now).
 *   POST /cache/purge   Invalidate the provider cache after editing Supabase.
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { cors } from "hono/cors";

import type { Bindings } from "./supabase";
import { getProviders, hashIp, insertReport, purgeProviders } from "./supabase";
import {
  AppConfigSchema,
  ErrorSchema,
  HealthSchema,
  PurgeResponseSchema,
  ReportAcceptedSchema,
  ReportRequestSchema,
  ScrapeQuerySchema,
  ScrapeResponseSchema,
  type ScrapeResult,
} from "./schemas";

/**
 * Client-facing app version. Keep in sync with `app.json` -> expo.version.
 * Single source for both the /config payload and the OpenAPI `info.version`.
 */
const APP_VERSION = "2.1.0";

/**
 * Global maintenance flag. Currently a hardcoded placeholder — it will be
 * driven by a dedicated store-review "listing mode" flag later: during App
 * Store / Play review we flip this on so the app shows info only until the
 * review clears. Not wired to a remote source yet, so it stays false.
 */
const MAINTENANCE_MODE = false;

/**
 * App instance typed with our Worker bindings. `defaultHook` gives every
 * schema-validated route a consistent 400 body when input fails validation,
 * instead of Hono's default error shape.
 */
const app = new OpenAPIHono<{ Bindings: Bindings }>({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json(
        { error: "Validation failed", issues: result.error.issues },
        400,
      );
    }
  },
});

// Global CORS — replaces the hand-rolled header object and handles OPTIONS
// preflight for every route automatically.
app.use("*", cors());

/* -------------------------------------------------------------------------- */
/*  GET /health                                                               */
/* -------------------------------------------------------------------------- */

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["System"],
  summary: "Liveness probe",
  responses: {
    200: {
      content: { "application/json": { schema: HealthSchema } },
      description: "Service is up.",
    },
  },
});

app.openapi(healthRoute, (c) =>
  c.json(
    { status: "ok" as const, service: "netprime-worker", time: new Date().toISOString() },
    200,
  ),
);

/* -------------------------------------------------------------------------- */
/*  GET /config                                                               */
/* -------------------------------------------------------------------------- */

const configRoute = createRoute({
  method: "get",
  path: "/config",
  tags: ["App"],
  summary: "App configuration + provider registry",
  description:
    "Returned to the client on launch. Providers come from Supabase and are edge-cached for 60s.",
  responses: {
    200: {
      content: { "application/json": { schema: AppConfigSchema } },
      description: "App config with the ordered provider list.",
    },
  },
});

app.openapi(configRoute, async (c) => {
  const providers = await getProviders(c.env, c.executionCtx);
  return c.json(
    { appVersion: APP_VERSION, maintenanceMode: MAINTENANCE_MODE, providers },
    200,
  );
});

/* -------------------------------------------------------------------------- */
/*  GET /scrape                                                               */
/* -------------------------------------------------------------------------- */

const scrapeRoute = createRoute({
  method: "get",
  path: "/scrape",
  tags: ["Streams"],
  summary: "Resolve a title across all enabled providers",
  request: { query: ScrapeQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: ScrapeResponseSchema } },
      description: "Per-provider resolution results for the requested title.",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Missing or invalid query parameters.",
    },
  },
});

app.openapi(scrapeRoute, async (c) => {
  const { tmdbId } = c.req.valid("query");

  const providers = await getProviders(c.env, c.executionCtx);
  const enabled = providers.filter((p) => p.enabled);

  const results = await Promise.all(
    enabled.map<Promise<ScrapeResult>>(async (provider) => {
      // Tier 2 — hijackable providers: server can only confirm the title, the
      // client must mount the WebView bridge to drive/snatch the stream.
      if (provider.hijack?.supported) {
        try {
          const titleExists = true; // TODO: real existence check.
          if (!titleExists) return { provider: provider.id, status: "not_found" };

          return {
            provider: provider.id,
            status: "requires_client_for_stream",
            details: {
              qualities: ["1080p", "720p"],
              audioTracks: [
                { language: "hi", label: "Hindi" },
                { language: "en", label: "English" },
              ],
              message:
                "Metadata fetched successfully. Mount WebView to snatch IP-locked m3u8.",
            },
          };
        } catch {
          return { provider: provider.id, status: "failed_use_webview_for_everything" };
        }
      }

      // Tier 1 — direct server-side scrape (mock HTML parse + AES decrypt).
      try {
        return {
          provider: provider.id,
          status: "success",
          details: {
            url: `https://cdn.${provider.id}.com/streams/${tmdbId}/master.m3u8`,
            qualities: ["Auto"],
            audioTracks: [{ language: "en", label: "Original" }],
          },
        };
      } catch {
        return { provider: provider.id, status: "failed_use_webview_for_everything" };
      }
    }),
  );

  const availableProviders = results.filter((r) => r.status !== "not_found");
  return c.json({ tmdbId, availableProviders }, 200);
});

/* -------------------------------------------------------------------------- */
/*  POST /cache/purge                                                         */
/* -------------------------------------------------------------------------- */

const purgeRoute = createRoute({
  method: "post",
  path: "/cache/purge",
  tags: ["System"],
  summary: "Invalidate the provider cache",
  description: "Call after editing rows in Supabase to skip the 60s TTL.",
  responses: {
    200: {
      content: { "application/json": { schema: PurgeResponseSchema } },
      description: "Cache purge result.",
    },
  },
});

app.openapi(purgeRoute, async (c) => {
  const purged = await purgeProviders();
  return c.json(
    {
      purged,
      message: purged ? "Providers cache cleared." : "No cached entry to clear.",
    },
    200,
  );
});

/* -------------------------------------------------------------------------- */
/*  POST /report — provider failure/success telemetry                         */
/* -------------------------------------------------------------------------- */

const reportRoute = createRoute({
  method: "post",
  path: "/report",
  tags: ["System"],
  summary: "Report a playback outcome (provider health telemetry)",
  description:
    "Rate-limited, service-role-backed ingestion. Clients cannot write the table directly. country + client id are derived server-side.",
  request: {
    body: { content: { "application/json": { schema: ReportRequestSchema } } },
  },
  responses: {
    202: {
      content: { "application/json": { schema: ReportAcceptedSchema } },
      description: "Accepted (fire-and-forget; a failed DB write still returns 202).",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Invalid body.",
    },
    429: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Rate limited.",
    },
  },
});

app.openapi(reportRoute, async (c) => {
  const body = c.req.valid("json");

  // Client IP (Cloudflare-provided) — the rate-limit key and, hashed, the
  // distinct-client id. Never store the raw IP.
  const ip = c.req.header("cf-connecting-ip") || "0.0.0.0";

  // Per-IP rate limit (best-effort: if the binding isn't configured, don't block).
  // IP keys are coarse on mobile/NAT, so aggregation also weights by distinct
  // clients — this is the first gate, not the only defense.
  const limiter = c.env.REPORT_LIMITER;
  if (limiter) {
    const { success } = await limiter.limit({ key: `report:${ip}` });
    if (!success) return c.json({ error: "Rate limited" }, 429);
  }

  // Trusted, server-derived geo (do not accept from the client).
  const country = (c.req.raw as unknown as { cf?: { country?: string } }).cf?.country ?? null;
  const clientHash = await hashIp(ip);

  // Best-effort write; telemetry must never break the client, so a failed insert
  // still returns 202.
  c.executionCtx.waitUntil(
    insertReport(c.env, {
      provider_id: body.providerId,
      tmdb_id: body.tmdbId,
      media_type: body.mediaType,
      outcome: body.outcome,
      time_to_fail_ms: body.timeToFailMs ?? null,
      script_version: body.scriptVersion ?? null,
      platform: body.platform,
      app_version: body.appVersion ?? null,
      error_message: body.errorMessage ?? null,
      country,
      client_hash: clientHash,
    }).then(() => undefined),
  );

  return c.json({ accepted: true }, 202);
});

/* -------------------------------------------------------------------------- */
/*  Self-documentation                                                        */
/* -------------------------------------------------------------------------- */

// Raw OpenAPI 3.0 spec, generated from the route schemas above.
app.doc("/openapi.json", {
  openapi: "3.0.0",
  info: {
    version: APP_VERSION,
    title: "NetPrime Edge Worker API",
    description:
      "Config + streaming-provider aggregator for the Bearoom app. Docs are generated from Zod schemas — see /docs.",
  },
  tags: [
    { name: "System", description: "Health and cache control." },
    { name: "App", description: "Client bootstrap configuration." },
    { name: "Streams", description: "Title resolution across providers." },
  ],
});

// Interactive Swagger UI, backed by the spec above.
app.get("/docs", swaggerUI({ url: "/openapi.json" }));

// Root → docs, so hitting the worker in a browser lands somewhere useful.
app.get("/", (c) => c.redirect("/docs"));

// Consistent 404 for anything unmatched.
app.notFound((c) => c.json({ error: "Endpoint not found" }, 404));

export default app;
