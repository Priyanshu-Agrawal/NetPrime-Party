import type { FeedManifest } from "@/types/feed";
import { FEED_SCHEMA_VERSION } from "@/types/feed";

// The canonical default feed. Curated for DISTINCT rails (dropped the overlapping
// now_playing≈popular and airing_today≈tv/popular; added Trending Movies), with a
// consistent icon scheme: flame=trending, film=popular movies, star=top-rated,
// calendar=upcoming, tv=popular series. Hero + party CTA stay fixed chrome in HomeView.
export const HOME_FEED_FALLBACK: FeedManifest = {
  version: FEED_SCHEMA_VERSION,
  sections: [
    { id: "continue",    type: "continueWatching" },
    { id: "because",     type: "becauseYouWatched" },
    { id: "trend-tv",    type: "tmdbRail", title: "Trending Shows",   path: "trending/tv/week",    kind: "tv",    icon: "flame",    seeAll: true },
    { id: "trend-movie", type: "tmdbRail", title: "Trending Movies",  path: "trending/movie/week", kind: "movie", icon: "flame",    seeAll: true },
    { id: "pop-movie",   type: "tmdbRail", title: "Popular Movies",   path: "movie/popular",       kind: "movie", icon: "film",     seeAll: true },
    { id: "top-movie",   type: "tmdbRail", title: "Top Rated Movies", path: "movie/top_rated",     kind: "movie", icon: "star",     seeAll: true },
    { id: "upcoming",    type: "tmdbRail", title: "Upcoming",         path: "movie/upcoming",      kind: "movie", icon: "calendar", seeAll: true },
    { id: "pop-tv",      type: "tmdbRail", title: "Popular Series",   path: "tv/popular",          kind: "tv",    icon: "tv",       seeAll: true },
    { id: "top-tv",      type: "tmdbRail", title: "Top Rated Series", path: "tv/top_rated",        kind: "tv",    icon: "star",     seeAll: true },
  ],
};
