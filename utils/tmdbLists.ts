/**
 * Fetch TMDB "list" endpoints (trending, popular, top-rated, upcoming, …) through
 * the app's existing proxy token — powers the home-screen rails + hero.
 */
import { API_HEADERS, API_URL } from "@/contexts/movieContext/movieContext";

export interface MediaItem {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
  media_type?: "movie" | "tv";
  genre_ids?: number[];
  popularity?: number;
}

export async function fetchList(path: string): Promise<MediaItem[]> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${API_URL}${path}${sep}language=en-US`, {
    headers: API_HEADERS,
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return (data.results ?? []).filter(
    (m: MediaItem) => m.poster_path || m.backdrop_path,
  );
}

export interface ListPageResult {
  results: MediaItem[];
  page: number;
  total_pages: number;
}

/** Paginated TMDB list fetch — powers library "See all" screens. */
export async function fetchListPage(path: string, page: number): Promise<ListPageResult> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${API_URL}${path}${sep}language=en-US&page=${page}`, {
    headers: API_HEADERS,
  });
  if (!res.ok) {
    throw new Error(`HTTP error! status: ${res.status}`);
  }
  const data = await res.json().catch(() => ({}));
  const results = (data.results ?? []).filter(
    (m: MediaItem) => m.poster_path,
  ) as MediaItem[];
  return {
    results,
    page: data.page ?? page,
    total_pages: data.total_pages ?? 1,
  };
}

export function itemType(item: MediaItem, fallback: "movie" | "tv"): "movie" | "tv" {
  if (item.media_type === "movie" || item.media_type === "tv") return item.media_type;
  // trending/all tags media_type; category endpoints don't → use the rail's kind.
  return item.name && !item.title ? "tv" : fallback;
}

export function itemTitle(item: MediaItem): string {
  return item.title || item.name || "Untitled";
}

export function itemYear(item: MediaItem): string {
  return (item.release_date || item.first_air_date || "").slice(0, 4);
}

/** Navigation target for a details screen based on media type. */
export type DetailsRoute =
  | { screen: "MovieDetails"; params: { id: string; type: "movie" } }
  | { screen: "TvDetails"; params: { id: string; type: "tv" } };

export function detailsRoute(item: MediaItem, fallback: "movie" | "tv"): DetailsRoute {
  const type = itemType(item, fallback);
  if (type === "tv") {
    return { screen: "TvDetails", params: { id: String(item.id), type: "tv" } };
  }
  return { screen: "MovieDetails", params: { id: String(item.id), type: "movie" } };
}
