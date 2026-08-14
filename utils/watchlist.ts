/**
 * "My List" — a small local watchlist backed by MMKV. Titles the user saves from
 * Details (the bookmark / + My List actions) land here and show on the My List
 * screen. Synchronous reads/writes keep the bookmark toggle instant.
 */
import { createMMKV } from "react-native-mmkv";

const storage = createMMKV();
const KEY = "watchlist";
const MAX = 300;

export interface WatchlistItem {
  id: string;
  type: "movie" | "tv";
  title: string;
  poster_path?: string;
  addedAt: number;
}

function read(): WatchlistItem[] {
  try {
    const s = storage.getString(KEY);
    return s ? (JSON.parse(s) as WatchlistItem[]) : [];
  } catch {
    return [];
  }
}

function write(list: WatchlistItem[]): void {
  storage.set(KEY, JSON.stringify(list.slice(0, MAX)));
}

const sameItem = (a: { id: string; type: string }, b: { id: string; type: string }) =>
  a.id === b.id && a.type === b.type;

export function getWatchlist(): WatchlistItem[] {
  return read();
}

export function isInWatchlist(id: string | number, type: string): boolean {
  const key = { id: String(id), type };
  return read().some((i) => sameItem(i, key));
}

/** Add if absent, remove if present. Returns the new saved-state (true = saved). */
export function toggleWatchlist(item: {
  id: string | number;
  type: "movie" | "tv";
  title: string;
  poster_path?: string;
}): boolean {
  const entry = { id: String(item.id), type: item.type };
  const list = read();
  if (list.some((i) => sameItem(i, entry))) {
    write(list.filter((i) => !sameItem(i, entry)));
    return false;
  }
  write([{ ...item, id: String(item.id), addedAt: Date.now() }, ...list]);
  return true;
}

export function removeFromWatchlist(id: string | number, type: string): void {
  const entry = { id: String(id), type };
  write(read().filter((i) => !sameItem(i, entry)));
}

export function clearWatchlist(): void {
  write([]);
}
