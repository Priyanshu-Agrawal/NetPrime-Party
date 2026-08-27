/**
 * Blend recommendation lists from several "seed" titles into one ranked feed.
 * Used by the home "For You" rail: merge the recs of the last few watched titles,
 * drop anything already watched (or poster-less), and rank by cross-seed frequency
 * (a title several of your watches point to is a stronger signal) then rating.
 */
export interface RecCandidate {
  id: number;
  poster_path?: string | null;
  title?: string;
  name?: string;
  vote_average?: number;
  media_type?: "movie" | "tv";
}

export function blendRecs(
  recLists: RecCandidate[][],
  excludeIds: Set<number>,
  limit = 20,
): RecCandidate[] {
  const byId = new Map<number, { item: RecCandidate; freq: number }>();
  for (const list of recLists) {
    for (const r of list) {
      if (!r || !r.poster_path || excludeIds.has(r.id)) continue;
      const existing = byId.get(r.id);
      if (existing) existing.freq += 1;
      else byId.set(r.id, { item: r, freq: 1 });
    }
  }
  return [...byId.values()]
    .sort((a, b) => b.freq - a.freq || (b.item.vote_average ?? 0) - (a.item.vote_average ?? 0))
    .slice(0, limit)
    .map((e) => e.item);
}
