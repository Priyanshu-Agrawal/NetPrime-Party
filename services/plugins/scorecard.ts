/**
 * The repo scorecard (spec §9 row 2): what a candidate plugin repo really plays on this device. Titles run one at a
 * time through the repo's own plugin host; the top candidates go through the real StreamProbe. "Playable" means probed
 * `ok` for this platform, "Hindi" means playable and carrying `hi`, "wrong" means the probe rejected it on length.
 * Every run watches a data budget (the network may be metered) and can be stopped.
 */
import { toCandidates, type PlaybackCandidate } from "@/services/playback/candidate";
import type { ProbeContext } from "@/services/playback/probe";
import { rankCandidates } from "@/services/playback/rank";
import { probeByBackend } from "@/services/playback/resolver";
import type { HostResult, PluginFailure, ResolveRequest } from "./PluginHost";
import type { PluginStream } from "./streams";

export interface BenchTitle {
  tmdbId: string;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
  name: string;
  runtimeMin?: number;
  originalLanguage?: string;
}

export interface ScoreDeps {
  /** Every plugin the repo loaded: each gets a row, even one that never answered. */
  pluginIds: string[];
  getStreams(
    req: ResolveRequest,
    opts?: { onStreams?(pluginKey: string, streams: PluginStream[]): void; onSettled?(pluginKey: string, failure?: PluginFailure): void },
  ): Promise<HostResult>;
  probe(c: PlaybackCandidate, ctx: ProbeContext): Promise<PlaybackCandidate>;
  platform: "ios" | "android";
  now(): number;
  bytesUsed(): number;
  budgetBytes: number;
  stopped(): boolean;
  onProgress?(done: number, total: number): void;
  /** Probes per title, shared round-robin across plugins (each plugin's best first). */
  probeLimit: number;
}

export interface PluginScore {
  pluginId: string;
  /** Titles where it answered (streams or a real "none"). */
  answered: number;
  /** Titles where it answered with no streams. */
  empty: number;
  /** Titles where it never settled (the run stopped first). */
  notRun: number;
  titlesWithStreams: number;
  streams: number;
  probed: number;
  playable: number;
  /** Platform ok, not rejected, but the probe couldn't confirm it (time ran out, or an MP4's index sits at the end). */
  unverified: number;
  hindiPlayable: number;
  wrong: number;
  failures: Record<string, number>;
}

export interface TitleScore {
  name: string;
  streams: number;
  probed: number;
  playable: number;
  unverified: number;
  hindiPlayable: number;
  wrong: number;
  firstStreamMs: number | null;
}

export interface ScoreReport {
  titles: TitleScore[];
  plugins: PluginScore[];
  bytes: number;
  stoppedBy: "done" | "budget" | "user";
}

const pluginIdOf = (key: string) => key.split("@")[0].split("/").slice(1).join("/");

/** Each plugin's best candidate first, then each one's second, … up to `limit`: no plugin hides another. */
export function roundRobin(ranked: PlaybackCandidate[], limit: number): PlaybackCandidate[] {
  const bySource = new Map<string, PlaybackCandidate[]>();
  for (const c of ranked) {
    const list = bySource.get(c.sourceId) ?? [];
    list.push(c);
    bySource.set(c.sourceId, list);
  }
  const out: PlaybackCandidate[] = [];
  for (let round = 0; out.length < limit; round++) {
    let any = false;
    for (const list of bySource.values()) {
      if (!list[round]) continue;
      any = true;
      out.push(list[round]);
      if (out.length >= limit) break;
    }
    if (!any) break;
  }
  return out;
}

export async function scoreRepo(titles: BenchTitle[], deps: ScoreDeps): Promise<ScoreReport> {
  const startBytes = deps.bytesUsed();
  const used = () => deps.bytesUsed() - startBytes;
  const plugins = new Map<string, PluginScore & { seen: Set<string> }>();
  const plugin = (id: string) => {
    let p = plugins.get(id);
    if (!p) {
      p = {
        pluginId: id,
        answered: 0,
        empty: 0,
        notRun: 0,
        titlesWithStreams: 0,
        streams: 0,
        probed: 0,
        playable: 0,
        unverified: 0,
        hindiPlayable: 0,
        wrong: 0,
        failures: {},
        seen: new Set(),
      };
      plugins.set(id, p);
    }
    return p;
  };
  for (const id of deps.pluginIds) plugin(id);
  const out: TitleScore[] = [];
  let stoppedBy: ScoreReport["stoppedBy"] = "done";
  const halt = (): boolean => {
    if (deps.stopped()) stoppedBy = "user";
    else if (used() >= deps.budgetBytes) stoppedBy = "budget";
    else return false;
    return true;
  };

  for (let i = 0; i < titles.length; i++) {
    if (halt()) break;
    const t = titles[i];
    const started = deps.now();
    let firstStreamMs: number | null = null;
    const settled = new Set<string>();
    const answeredNow = new Set<string>();
    const host = await deps.getStreams(
      { tmdbId: t.tmdbId, type: t.type, season: t.season, episode: t.episode },
      {
        onStreams: () => (firstStreamMs ??= deps.now() - started),
        onSettled: (key, failure) => {
          const id = pluginIdOf(key);
          settled.add(id);
          const p = plugin(id);
          if (failure) p.failures[failure.reason] = (p.failures[failure.reason] ?? 0) + 1;
          else {
            p.answered++;
            answeredNow.add(id);
          }
        },
      },
    );
    const all = toCandidates(host.streams, { originalLanguage: t.originalLanguage, titleName: t.name });
    const withStreams = new Set<string>();
    for (const c of all) {
      const p = plugin(pluginIdOf(c.sourceId + "@"));
      p.streams++;
      withStreams.add(p.pluginId);
      if (!p.seen.has(t.tmdbId)) {
        p.seen.add(t.tmdbId);
        p.titlesWithStreams++;
      }
    }
    for (const p of plugins.values()) {
      if (!settled.has(p.pluginId)) p.notRun++;
      else if (answeredNow.has(p.pluginId) && !withStreams.has(p.pluginId)) p.empty++;
    }
    const score: TitleScore = { name: t.name, streams: all.length, probed: 0, playable: 0, unverified: 0, hindiPlayable: 0, wrong: 0, firstStreamMs };
    if (!halt()) {
      // Rank for this platform (what it can't play is dropped before probing), then share the probes round-robin.
      const ranked = rankCandidates(all, { platform: deps.platform, languages: ["hi"], isDown: () => false });
      const ctx: ProbeContext = { kind: t.type, runtimeMin: t.runtimeMin };
      for (const c of await probeByBackend(roundRobin(ranked, deps.probeLimit), (c) => deps.probe(c, ctx))) {
        const p = plugin(pluginIdOf(c.sourceId + "@"));
        score.probed++;
        p.probed++;
        if (c.verdict === "rejected") {
          if (c.rejectReason === "duration") {
            score.wrong++;
            p.wrong++;
          }
          continue;
        }
        if (!c.platforms[deps.platform]) continue;
        if (c.verdict === "unverified") {
          score.unverified++;
          p.unverified++;
          continue;
        }
        score.playable++;
        p.playable++;
        if (c.languages.includes("hi")) {
          score.hindiPlayable++;
          p.hindiPlayable++;
        }
      }
    }
    out.push(score);
    deps.onProgress?.(i + 1, titles.length);
    if (stoppedBy !== "done") break;
  }

  const ranked = [...plugins.values()]
    .map(({ seen: _seen, ...p }) => p)
    .sort((a, b) => b.playable - a.playable || b.hindiPlayable - a.hindiPlayable || b.streams - a.streams || a.pluginId.localeCompare(b.pluginId));
  return { titles: out, plugins: ranked, bytes: used(), stoppedBy };
}

/** A file a reviewer can't read before pinning: very long lines, `_0x` identifier soup, or one giant string payload. */
export function looksObfuscated(source: string): boolean {
  const lines = source.split("\n").length;
  if (source.length / Math.max(1, lines) > 400) return true;
  if ((source.match(/_0x[0-9a-f]{4,}/gi) ?? []).length >= 20) return true;
  let longest = 0;
  for (const m of source.matchAll(/"[^"\n]{2048,}"|'[^'\n]{2048,}'|`[^`]{2048,}`/g)) longest = Math.max(longest, m[0].length);
  return longest > 0 && longest / source.length > 0.3;
}
