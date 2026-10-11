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

/** The plugin host's streams for a title. Health is recorded as each plugin settles — a plugin still running when the
 * host returns early is judged when it actually finishes, never counted healthy just for having started. */
function streamsFor(req: TitleRequest, deps: Pick<ResolveDeps, "getStreams" | "health">) {
  return deps.getStreams(
    { tmdbId: req.tmdbId, type: req.type, season: req.season, episode: req.episode },
    {
      onSettled: (pluginKey, failure) => {
        if (!failure) deps.health.record(sourceIdOf(pluginKey), true);
        else if (countsAgainstSource(failure.reason)) deps.health.record(sourceIdOf(pluginKey), false);
      },
    },
  );
}

/**
 * The title page's look-ahead (spec §6.1): what the plugins found, ranked, without probing — no request reaches a stream
 * host. The plugin host caches the streams for 15 minutes, so Play right after reuses them.
 */
export async function previewPlayback(req: TitleRequest, deps: Omit<ResolveDeps, "probe">): Promise<{ ranked: PlaybackCandidate[]; complete: boolean }> {
  deps.warm?.();
  // Only successes reach source health here: a preview runs on every title browsed, and its timeouts under load are
  // ours, not the source's.
  const host = await deps.getStreams(
    { tmdbId: req.tmdbId, type: req.type, season: req.season, episode: req.episode },
    { onSettled: (pluginKey, failure) => !failure && deps.health.record(sourceIdOf(pluginKey), true) },
  );
  const all = toCandidates(host.streams, { originalLanguage: req.originalLanguage, titleName: req.titleName, originalTitle: req.originalTitle });
  // Complete = every plugin answered: a failed one might have had the language. A quick "nothing here" is an answer.
  const answered = host.complete && host.failures.every((f) => f.reason === "empty-fast");
  return { ranked: rankCandidates(all, { platform: deps.platform, languages: deps.languages, isDown: (id) => deps.health.isDown(id) }), complete: answered };
}

export async function resolvePlayback(req: TitleRequest, deps: ResolveDeps): Promise<ResolveResult> {
  deps.warm?.();
  const host = await streamsFor(req, deps);

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
