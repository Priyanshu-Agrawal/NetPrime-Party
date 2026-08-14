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

/** Route params for a details screen based on media type. */
export function detailsRoute(item: MediaItem, fallback: "movie" | "tv") {
  const type = itemType(item, fallback);
  return {
    pathname: (type === "tv" ? "/(player)/tvDetails" : "/(player)/details") as
      | "/(player)/tvDetails"
      | "/(player)/details",
    params: { id: String(item.id), type },
  };
}
