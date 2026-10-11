import type { PlaybackCandidate } from "./candidate";

/**
 * rankCandidates (spec §5.6) — an explicit order, no opaque score: playable here; the wanted languages in order (a
 * stream whose language is unknown sits after them but before a known other language); healthy sources first;
 * verified before unverified; taller first; then whoever answered first.
 */
export interface RankContext {
  platform: "ios" | "android";
  /** Wanted languages, most wanted first ("original" already resolved to a code). */
  languages: string[];
  isDown(sourceId: string): boolean;
}

export function languageRank(c: PlaybackCandidate, wanted: string[]): number {
  for (let i = 0; i < wanted.length; i++) if (c.languages.includes(wanted[i])) return i;
  return c.languages.length ? wanted.length + 1 : wanted.length;
}

export function rankCandidates(cands: PlaybackCandidate[], ctx: RankContext): PlaybackCandidate[] {
  return cands
    .filter((c) => c.verdict !== "rejected" && c.platforms[ctx.platform])
    .map((c) => ({
      c,
      lang: languageRank(c, ctx.languages),
      down: ctx.isDown(c.sourceId) ? 1 : 0,
      unverified: c.verdict === "ok" ? 0 : 1,
      height: c.quality?.height ?? 0,
    }))
    .sort((a, b) => a.lang - b.lang || a.down - b.down || a.unverified - b.unverified || b.height - a.height || a.c.order - b.c.order)
    .map((x) => x.c);
}
