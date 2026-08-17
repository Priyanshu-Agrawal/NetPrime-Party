/**
 * Module-level TMDB list cache — keeps last-fetched data warm so returning to
 * Home never flashes skeleton → content on tab focus.
 */
import { fetchList, type MediaItem } from "@/utils/tmdbLists";

const cache = new Map<string, MediaItem[]>();

export function getCachedList(path: string): MediaItem[] | undefined {
  return cache.get(path);
}

export async function loadList(path: string): Promise<MediaItem[]> {
  const cached = cache.get(path);
  if (cached?.length) {
    void fetchList(path)
      .then((items) => {
        if (items.length) cache.set(path, items);
      })
      .catch(() => {});
    return cached;
  }
  const items = await fetchList(path);
  if (items.length) cache.set(path, items);
  return items;
}

export function getCachedHero(): MediaItem[] | undefined {
  return cache.get("__hero__");
}

export async function loadHero(): Promise<MediaItem[]> {
  const cached = cache.get("__hero__");
  if (cached?.length) {
    void fetchList("trending/all/week")
      .then((r) => {
        const items = r.filter((m) => m.backdrop_path).slice(0, 8);
        if (items.length) cache.set("__hero__", items);
      })
      .catch(() => {});
    return cached;
  }
  const r = await fetchList("trending/all/week");
  const items = r.filter((m) => m.backdrop_path).slice(0, 8);
  if (items.length) cache.set("__hero__", items);
  return items;
}
