import { registrableDomain } from "@/services/plugins/limiter";
import type { HostResult, PluginFailure, ResolveRequest } from "@/services/plugins/PluginHost";
import { toCandidates, type PlaybackCandidate } from "./candidate";
import { countsAgainstSource, type SourceHealth } from "./health";
import type { ProbeContext } from "./probe";
import { rankCandidates } from "./rank";

/**
 * One title → ranked native candidates (spec §5.5–5.6): ask the plugin host, read candidates, probe the top few
 * (one request stream per backend at a time, backends in parallel), rank for this device and the wanted languages.
 * Plugin outcomes feed source health on the way.
 */
export interface TitleRequest {
  tmdbId: string;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
  /** The film or show name, so a language word in it isn't read as the stream's language. */
  titleName?: string;
  /** TMDB original_title / original_name, stripped the same way. */
  originalTitle?: string;
  /** TMDB runtime (minutes) for the length check. */
  runtimeMin?: number;
  /** TMDB original_language — what "Original audio" means. */
  originalLanguage?: string;
}

export interface ResolveDeps {
  getStreams(req: ResolveRequest, opts?: { onSettled?(pluginKey: string, failure?: PluginFailure): void }): Promise<HostResult>;
  probe(c: PlaybackCandidate, ctx: ProbeContext): Promise<PlaybackCandidate>;
  health: Pick<SourceHealth, "isDown" | "record">;
  platform: "ios" | "android";
  /** Wanted languages, resolved (see utils/languagePrefs.resolveOrder). */
  languages: string[];
  /** Keep the sandbox mounted for this resolve and a while after. */
  warm?(): void;
}

export interface ResolveResult {
  /** Playable here, best first. */
  ranked: PlaybackCandidate[];
  rejected: PlaybackCandidate[];
  failures: PluginFailure[];
  /** Every plugin answered (no early return). */
  complete: boolean;
}

export const PROBE_TOP = 4;

export function sourceIdOf(pluginKey: string): string {
  return pluginKey.split("@")[0];
}

function backendOf(url: string): string {
  try {
    return registrableDomain(new URL(url).hostname);
  } catch {
    return "?";
  }
}

export async function probeByBackend(cands: PlaybackCandidate[], probe: (c: PlaybackCandidate) => Promise<PlaybackCandidate>): Promise<PlaybackCandidate[]> {
  const groups = new Map<string, PlaybackCandidate[]>();
  for (const c of cands) {
    const g = groups.get(backendOf(c.url)) ?? [];
    g.push(c);
    groups.set(backendOf(c.url), g);
  }
  const done = new Map<string, PlaybackCandidate>();
  await Promise.all(
    [...groups.values()].map(async (group) => {
      for (const c of group) done.set(c.key, await probe(c));
    }),
  );
  return cands.map((c) => done.get(c.key) ?? c);
}

export async function resolvePlayback(req: TitleRequest, deps: ResolveDeps): Promise<ResolveResult> {
  deps.warm?.();
  // Health is recorded as each plugin settles — a plugin still running when the host returns early is judged when
  // it actually finishes, never counted healthy just for having started.
  const host = await deps.getStreams(
    { tmdbId: req.tmdbId, type: req.type, season: req.season, episode: req.episode },
    {
      onSettled: (pluginKey, failure) => {
        if (!failure) deps.health.record(sourceIdOf(pluginKey), true);
        else if (countsAgainstSource(failure.reason)) deps.health.record(sourceIdOf(pluginKey), false);
      },
    },
  );

  const all = toCandidates(host.streams, { originalLanguage: req.originalLanguage, titleName: req.titleName, originalTitle: req.originalTitle });
  const ctx = { platform: deps.platform, languages: deps.languages, isDown: (id: string) => deps.health.isDown(id) };
  const shortlist = rankCandidates(all, ctx).slice(0, PROBE_TOP);
  const probeCtx: ProbeContext = { kind: req.type === "movie" ? "movie" : "tv", runtimeMin: req.runtimeMin };
  const probed = await probeByBackend(shortlist, (c) => deps.probe(c, probeCtx));
  const byKey = new Map(probed.map((c) => [c.key, c]));
  const merged = all.map((c) => byKey.get(c.key) ?? c);
  return {
    ranked: rankCandidates(merged, ctx),
    rejected: merged.filter((c) => c.verdict === "rejected"),
    failures: host.failures,
    complete: host.complete,
  };
}
