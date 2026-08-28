/**
 * @file franchises.ts
 * Dynamic franchise harvest (discovery source "A", server-side).
 *
 * TMDB has no "list collections" endpoint, so we DERIVE one: pull popular +
 * top-rated movies (through the same TMDB proxy the app uses — the token is
 * injected there, so none is needed here) and read each movie's
 * `belongs_to_collection` (a details-only field), deduped → collection ids.
 *
 * Edge-cached ~12h behind a synthetic key so the ~15 TMDB round-trips run at most
 * once per window. The client GETs `/franchises` and merges these ids with its
 * curated seed + the user's own opened collections (`utils/collectionMemory`).
 * Mirrors the getProviders cache pattern in supabase.ts.
 */
import type { Bindings } from "./supabase";

type Waitable = { waitUntil(promise: Promise<unknown>): void };

const FRANCHISES_CACHE_KEY = new Request("https://internal.cache/franchises");
const TTL_S = 60 * 60 * 12; // 12h for a good (non-empty) harvest
const EMPTY_TTL_S = 300; // 5m if the harvest came back empty — retry soon
const DEFAULT_TMDB_PROXY = "https://tmdb.spiderfan-no1.workers.dev/";
const MOVIE_SAMPLE = 24; // details fan-out cap (stays well under the subrequest budget)

async function tmdb(env: Bindings, path: string): Promise<any | null> {
  const sep = path.includes("?") ? "&" : "?";
  const rel = `${path}${sep}language=en-US`;
  try {
    // Prod: go through the service binding (same-zone workers.dev HTTP subrequests
    // are blocked). Local dev (no binding): plain fetch to the public proxy URL.
    const res = env.TMDB_PROXY
      ? await env.TMDB_PROXY.fetch(new Request(`https://tmdb-proxy.internal/${rel}`))
      : await fetch(`${env.TMDB_PROXY_URL || DEFAULT_TMDB_PROXY}${rel}`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function harvest(env: Bindings): Promise<number[]> {
  // Trending surfaces sequels/franchise entries (which carry a collection) far
  // more often than the standalone-heavy popular list, so it leads the sample.
  const [trending, pop, top] = await Promise.all([
    tmdb(env, "trending/movie/week?page=1"),
    tmdb(env, "movie/popular?page=1"),
    tmdb(env, "movie/top_rated?page=1"),
  ]);
  const seenMovies = new Set<number>();
  const movieIds: number[] = [];
  for (const list of [trending, pop, top]) {
    for (const m of list?.results ?? []) {
      if (m?.id && !seenMovies.has(m.id)) {
        seenMovies.add(m.id);
        movieIds.push(m.id);
      }
    }
  }
  const details = await Promise.all(
    movieIds.slice(0, MOVIE_SAMPLE).map((id) => tmdb(env, `movie/${id}`)),
  );
  const out: number[] = [];
  const seenCols = new Set<number>();
  for (const d of details) {
    const col = d?.belongs_to_collection;
    // Don't require a poster on the stub — many collections leave it null here but
    // resolve a poster when fetched fully. The client's useCollectionsQuery fetches
    // each collection and drops the genuinely poster-less ones at render.
    if (col?.id && !seenCols.has(col.id)) {
      seenCols.add(col.id);
      out.push(col.id);
    }
  }
  return out;
}

/**
 * Harvested TMDB-popular collection ids, edge-cached. Returns `[]` on total
 * failure (the client then just renders its curated seed + personalized picks —
 * the rail never hard-fails on the harvest).
 */
export async function getFranchiseCollections(env: Bindings, ctx: Waitable): Promise<number[]> {
  const cache = caches.default;
  const hit = await cache.match(FRANCHISES_CACHE_KEY);
  if (hit) {
    try {
      return (await hit.json()) as number[];
    } catch {
      /* corrupt entry → fall through and re-harvest */
    }
  }
  const ids = await harvest(env);
  const response = new Response(JSON.stringify(ids), {
    headers: {
      "content-type": "application/json",
      "cache-control": `max-age=${ids.length ? TTL_S : EMPTY_TTL_S}`,
    },
  });
  // Persist to the edge cache without delaying the response to the client.
  ctx.waitUntil(cache.put(FRANCHISES_CACHE_KEY, response.clone()));
  return ids;
}
