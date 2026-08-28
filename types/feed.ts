// types/feed.ts — shared shape for the server-driven Home feed (mirrored by worker Zod).
export type FeedSectionType =
  | "continueWatching" | "becauseYouWatched"
  | "tmdbRail" | "genreRow" | "franchises" | "editorialRow"; // last 3 reserved (D2/D3/P5)

export interface FeedSectionBase {
  id: string;
  type: FeedSectionType;
  title?: string;
  enabled?: boolean;       // default true
  minAppVersion?: string;  // RESERVED (semver) — gate deferred, no-op in D1
}
export interface TmdbRailSection extends FeedSectionBase {
  type: "tmdbRail";
  path: string;            // TMDB list path, e.g. "movie/popular"
  kind: "movie" | "tv";
  icon?: string;           // Ionicons glyph
  seeAll?: boolean;
  limit?: number;
}
export interface FranchisesSection extends FeedSectionBase {
  type: "franchises";
  collectionIds: number[]; // curated TMDB collection ids — editable server-side (D2)
  dynamic?: boolean;       // merge in the TMDB-popular harvest + the user's opened collections
}
export interface SimpleSection extends FeedSectionBase {
  type: "continueWatching" | "becauseYouWatched" | "genreRow" | "editorialRow";
}
export type FeedSection = TmdbRailSection | FranchisesSection | SimpleSection;

export interface FeedManifest {
  version: number;         // schema version; bump only on a breaking shape change
  sections: FeedSection[];
}
export const FEED_SCHEMA_VERSION = 1;
