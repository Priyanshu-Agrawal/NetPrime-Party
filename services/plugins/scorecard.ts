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
import type { HostResult, ResolveRequest } from "./PluginHost";
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
  getStreams(req: ResolveRequest, opts?: { onStreams?(pluginKey: string, streams: PluginStream[]): void }): Promise<HostResult>;
  probe(c: PlaybackCandidate, ctx: ProbeContext): Promise<PlaybackCandidate>;
  platform: "ios" | "android";
  now(): number;
  bytesUsed(): number;
  budgetBytes: number;
  stopped(): boolean;
  onProgress?(done: number, total: number): void;
  /** Probes per title (the rest count as returned, not as playable). */
  probeLimit: number;
}

export interface PluginScore {
  pluginId: string;
  titlesWithStreams: number;
  streams: number;
  playable: number;
  hindiPlayable: number;
  wrong: number;
  failures: Record<string, number>;
}

export interface TitleScore {
  name: string;
  streams: number;
  playable: number;
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

export async function scoreRepo(titles: BenchTitle[], deps: ScoreDeps): Promise<ScoreReport> {
  const startBytes = deps.bytesUsed();
  const used = () => deps.bytesUsed() - startBytes;
  const plugins = new Map<string, PluginScore & { seen: Set<string> }>();
  const plugin = (id: string) => {
    let p = plugins.get(id);
    if (!p) {
      p = { pluginId: id, titlesWithStreams: 0, streams: 0, playable: 0, hindiPlayable: 0, wrong: 0, failures: {}, seen: new Set() };
      plugins.set(id, p);
    }
    return p;
  };
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
    const host = await deps.getStreams(
      { tmdbId: t.tmdbId, type: t.type, season: t.season, episode: t.episode },
      { onStreams: () => (firstStreamMs ??= deps.now() - started) },
    );
    for (const f of host.failures) {
      const p = plugin(pluginIdOf(f.pluginKey));
      p.failures[f.reason] = (p.failures[f.reason] ?? 0) + 1;
    }
    const all = toCandidates(host.streams, { originalLanguage: t.originalLanguage, titleName: t.name });
    for (const c of all) {
      const p = plugin(pluginIdOf(c.sourceId + "@"));
      p.streams++;
      if (!p.seen.has(t.tmdbId)) {
        p.seen.add(t.tmdbId);
        p.titlesWithStreams++;
      }
    }
    const score: TitleScore = { name: t.name, streams: all.length, playable: 0, hindiPlayable: 0, wrong: 0, firstStreamMs };
    if (!halt()) {
      // Rank for this platform (what it can't play is dropped before probing; the probe can still drop more).
      const shortlist = rankCandidates(all, { platform: deps.platform, languages: ["hi"], isDown: () => false }).slice(0, deps.probeLimit);
      const ctx: ProbeContext = { kind: t.type, runtimeMin: t.runtimeMin };
      for (const c of await probeByBackend(shortlist, (c) => deps.probe(c, ctx))) {
        const p = plugin(pluginIdOf(c.sourceId + "@"));
        if (c.verdict === "rejected" && c.rejectReason === "duration") {
          score.wrong++;
          p.wrong++;
        }
        if (c.verdict !== "ok" || !c.platforms[deps.platform]) continue;
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
