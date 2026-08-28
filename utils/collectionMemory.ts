/**
 * Personalized franchise memory (MMKV).
 *
 * TMDB has no "list collections" endpoint, so a dynamic Franchises rail has to
 * DERIVE its set. This is the personalized half (source "B"): whenever the user
 * opens a movie that belongs to a TMDB collection, we remember that collection
 * (id + name + poster). The Home rail then merges these with the curated seed and
 * the TMDB-popular harvest (source "A", see tmdbApi `harvestedCollections`), so the
 * rail grows toward the sagas THIS user actually browses.
 *
 * Most-recent first, capped (the cap ages out stale ones), no TTL — a franchise
 * you like stays relevant. Mirrors the failureMemory MMKV pattern.
 */
import { universalStorage as storage } from "@/services/storage/universalStorage";

const KEY = "colmem.v1";
const CAP = 24;

export interface SeenCollection {
  id: number;
  name?: string;
  poster_path?: string | null;
}

function read(): SeenCollection[] {
  try {
    const raw = storage.getString(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as SeenCollection[]) : [];
  } catch {
    return [];
  }
}

function write(list: SeenCollection[]) {
  try {
    storage.set(KEY, JSON.stringify(list.slice(0, CAP)));
  } catch {}
}

/**
 * Record a collection the user just engaged with — pass a movie's
 * `belongs_to_collection` object directly (no-op if absent/invalid).
 */
export function recordCollection(
  c: { id?: number; name?: string; poster_path?: string | null } | null | undefined,
): void {
  if (!c || typeof c.id !== "number") return;
  const list = read();
  // Move-to-front, dedupe by id, refreshing the stored metadata.
  write([
    { id: c.id, name: c.name, poster_path: c.poster_path ?? null },
    ...list.filter((x) => x.id !== c.id),
  ]);
}

/** The personalized collection ids, most-recent first. */
export function getSeenCollectionIds(): number[] {
  return read().map((c) => c.id);
}
