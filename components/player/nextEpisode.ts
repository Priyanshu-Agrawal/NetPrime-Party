export interface SeasonInfo {
  season_number: number;
  episode_count: number;
}

/** The episode after S{season}E{ep}: the next in the season, else E1 of the next non-empty numbered season. */
export function nextEpisode(seasons: SeasonInfo[] | undefined, season: number, ep: number): { season: number; ep: number } | null {
  if (!seasons?.length) return null;
  const current = seasons.find((s) => s.season_number === season);
  if (current && ep < current.episode_count) return { season, ep: ep + 1 };
  const later = seasons
    .filter((s) => s.season_number > season && s.season_number > 0 && s.episode_count > 0)
    .sort((a, b) => a.season_number - b.season_number)[0];
  return later ? { season: later.season_number, ep: 1 } : null;
}
