import type { z } from "@hono/zod-openapi";
import type { ReportRequestSchema } from "./schemas";
import type { ReportRow } from "./supabase";

/** The provider_reports row for a validated /report body; the new columns only when the client sent them. */
export function reportRow(body: z.infer<typeof ReportRequestSchema>, country: string | null, clientHash: string): ReportRow {
  return {
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
    ...(body.lane ? { lane: body.lane } : {}),
    ...(body.stage ? { stage: body.stage } : {}),
    ...(body.ttffMs != null ? { ttff_ms: body.ttffMs } : {}),
  };
}
