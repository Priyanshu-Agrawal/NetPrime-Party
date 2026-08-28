import type { FeedManifest } from "@/types/feed";
import { FEED_SCHEMA_VERSION } from "@/types/feed";

// The canonical default Home feed (array order = render order). Arrangement:
//   1 Continue watching · 2 Recommended · 3 Browse by Genre (discovery entry — a
//   chip row with a Movie/TV toggle, kept HIGH so genre-jump needs no scrolling),
//   then content rails in descending-priority pairs: trending → franchises →
//   popular → top-rated → upcoming → deep-cut sagas. Distinct rails only (dropped
//   the overlapping now_playing≈popular / airing_today≈tv-popular). Icon scheme:
//   grid=genres, flame=trending, film=popular movies, star=top-rated,
//   calendar=upcoming, tv=popular series. Hero + party CTA are fixed chrome in HomeView.
export const HOME_FEED_FALLBACK: FeedManifest = {
  version: FEED_SCHEMA_VERSION,
  sections: [
    { id: "continue",    type: "continueWatching" },
    { id: "because",     type: "becauseYouWatched" },
    // Region-personalized: popular locally-produced content (a MIXED movie+TV rail),
    // region CF-detected via /config (client-defaults to IN). Additive — the global
    // "Popular Movies"/"Popular Series" rails below stay as-is. Self-hides if empty.
    { id: "region-pop",  type: "regionPopular" },
    // Discovery entry point — a Movie/TV-toggle genre chip row, placed high (right
    // after the personalized rails) so browsing by genre never means scrolling past
    // the whole feed. `kind` is just the toggle's initial side.
    { id: "genres",      type: "genreRow", title: "Browse by Genre", kind: "movie" },
    { id: "trend-tv",    type: "tmdbRail", title: "Trending Shows",   path: "trending/tv/week",    kind: "tv",    icon: "flame",    seeAll: true },
    { id: "trend-movie", type: "tmdbRail", title: "Trending Movies",  path: "trending/movie/week", kind: "movie", icon: "flame",    seeAll: true },
    // Curated TMDB collection ids — editable server-side via AppConfig.homeFeed. The
    // FranchisesRail self-drops any id that fails to resolve (or has no poster).
    // Avengers, Harry Potter, Star Wars, LOTR, Fast & Furious, John Wick, M:I, Jurassic.
    { id: "franchises",  type: "franchises", title: "Iconic Franchises", dynamic: true, collectionIds: [86311, 1241, 10, 119, 9485, 404609, 87359, 328] },
    { id: "pop-movie",   type: "tmdbRail", title: "Popular Movies",   path: "movie/popular",       kind: "movie", icon: "film",     seeAll: true },
    { id: "pop-tv",      type: "tmdbRail", title: "Popular Series",   path: "tv/popular",          kind: "tv",    icon: "tv",       seeAll: true },
    { id: "top-movie",   type: "tmdbRail", title: "Top Rated Movies", path: "movie/top_rated",     kind: "movie", icon: "star",     seeAll: true },
    { id: "top-tv",      type: "tmdbRail", title: "Top Rated Series", path: "tv/top_rated",        kind: "tv",    icon: "star",     seeAll: true },
    { id: "upcoming",    type: "tmdbRail", title: "Upcoming",         path: "movie/upcoming",      kind: "movie", icon: "calendar", seeAll: true },
    // Dark Knight, Matrix, Pirates, X-Men, Transformers, Spider-Man (Raimi), Hunger
    // Games, Despicable Me, Shrek, James Bond, Toy Story, The Hobbit.
    { id: "franchises-2", type: "franchises", title: "More Blockbuster Sagas", collectionIds: [263, 2344, 295, 748, 8650, 556, 131635, 86066, 2150, 645, 10193, 121938] },
  ],
};
