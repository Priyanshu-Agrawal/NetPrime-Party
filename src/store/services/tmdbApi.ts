import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";
import { API_HEADERS, API_URL } from "@/contexts/movieContext/movieContext";
import {
    type ListPageResult,
    type MediaItem,
    fetchList,
    fetchListPage,
} from "@/utils/tmdbLists";
import { fetchDetails } from "@/utils/tmdbDetails";
import { fetchWithTimeout } from "@/utils/fetchWithTimeout";

// TMDB `with_watch_providers` requires a `watch_region`. The audience is
// India-first, so default to IN (was hardcoded US). Provider IDs (Netflix=8,
// etc.) are global; only availability filtering is region-scoped.
const WATCH_REGION = "IN";
// Per-region "hits" language for the "Popular in your region" rail (regionPopular):
// bias to the region's flagship film language so the rail reads as recognizable
// hits, not long-tail daily serials. IN → Hindi (Bollywood). Unmapped regions use
// origin-country only (all local languages).
const REGION_LANG: Record<string, string> = { IN: "hi" };

const raw = async (path: string): Promise<any> => {
    const sep = path.includes("?") ? "&" : "?";
    const res = await fetchWithTimeout(`${API_URL}${path}${sep}language=en-US`, {
        headers: API_HEADERS,
    });
    if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
            const errBody = await res.json();
            msg = errBody.status_message || msg;
        } catch {}
        throw new Error(msg);
    }
    return res.json();
};

export const tmdbApi = createApi({
    reducerPath: "tmdbApi",
    baseQuery: fakeBaseQuery<string>(),
    // Re-pull rails/hero/details when the device regains connectivity. The
    // NetInfo → onOnline bridge (src/store/index.ts) dispatches the reconnect
    // action; this opts every endpoint here into refetching on it.
    refetchOnReconnect: true,
    endpoints: (build) => {
        const wrapQuery = (pathFn: (arg: any) => string | Promise<string>) => async (arg: any) => {
            try {
                return { data: await raw(await pathFn(arg)) };
            } catch (e: any) {
                return { error: e.message };
            }
        };

        return {
            list: build.query<MediaItem[], string>({
                queryFn: async (path) => {
                    try { return { data: await fetchList(path) }; }
                    catch (e: any) { return { error: e.message }; }
                },
                keepUnusedDataFor: 600,
            }),
            hero: build.query<MediaItem[], void>({
                queryFn: async () => {
                    try {
                        const r = await fetchList("trending/all/week");
                        return { data: r.filter((m) => m.backdrop_path).slice(0, 8) };
                    } catch (e: any) { return { error: e.message }; }
                },
                keepUnusedDataFor: 600,
            }),
            listPage: build.query<ListPageResult, { path: string; page: number }>({
                queryFn: async ({ path, page }) => {
                    try { return { data: await fetchListPage(path, page) }; }
                    catch (e: any) { return { error: e.message }; }
                },
                keepUnusedDataFor: 300,
            }),
            details: build.query<any, { type: "movie" | "tv"; id: string | number }>({
                queryFn: async ({ type, id }) => {
                    try { return { data: await fetchDetails(type, String(id)) }; }
                    catch (e: any) { return { error: e.message }; }
                },
                keepUnusedDataFor: 600,
            }),
            // Recommendations only (light) — falls back to `similar` when empty.
            // Much cheaper than `details` for the home "Recommended for you" blend,
            // which just needs the rec list, not the full append_to_response payload.
            recommendations: build.query<MediaItem[], { type: "movie" | "tv"; id: string | number }>({
                queryFn: async ({ type, id }) => {
                    try {
                        const recs = await raw(`${type}/${id}/recommendations`);
                        let results: MediaItem[] = recs?.results ?? [];
                        if (results.length === 0) {
                            const sim = await raw(`${type}/${id}/similar`);
                            results = sim?.results ?? [];
                        }
                        return { data: results };
                    } catch (e: any) { return { error: e.message }; }
                },
                keepUnusedDataFor: 600,
            }),
            season: build.query<any, { id: number | string; season: number }>({
                queryFn: wrapQuery(({ id, season }) => `tv/${id}/season/${season}`),
                keepUnusedDataFor: 600,
            }),
            personDetails: build.query<any, number | string>({
                queryFn: wrapQuery((id) => `person/${id}`),
                keepUnusedDataFor: 600,
            }),
            personCredits: build.query<any, number | string>({
                queryFn: wrapQuery((id) => `person/${id}/combined_credits`),
                keepUnusedDataFor: 600,
            }),
            searchMulti: build.query<any, { query: string; page: number }>({
                queryFn: wrapQuery(({ query, page }) => `search/multi?query=${encodeURIComponent(query)}&page=${page}`),
                keepUnusedDataFor: 120,
            }),
            searchMovie: build.query<any, { query: string; page: number }>({
                queryFn: wrapQuery(({ query, page }) => `search/movie?query=${encodeURIComponent(query)}&page=${page}`),
                keepUnusedDataFor: 120,
            }),
            searchTv: build.query<any, { query: string; page: number }>({
                queryFn: wrapQuery(({ query, page }) => `search/tv?query=${encodeURIComponent(query)}&page=${page}`),
                keepUnusedDataFor: 120,
            }),
            searchPerson: build.query<any, { query: string; page: number }>({
                queryFn: wrapQuery(({ query, page }) => `search/person?query=${encodeURIComponent(query)}&page=${page}`),
                keepUnusedDataFor: 120,
            }),
            discoverByProvider: build.query<
                { tv: any; movie: any },
                { providerId: number | null; page: number }
            >({
                queryFn: async ({ providerId, page }) => {
                    try {
                        const filters = providerId ? `&with_watch_providers=${providerId}&watch_region=${WATCH_REGION}` : "";
                        const [tv, movie] = await Promise.all([
                            raw(`discover/tv?page=${page}${filters}&sort_by=popularity.desc`),
                            raw(`discover/movie?page=${page}${filters}&sort_by=popularity.desc`),
                        ]);
                        return { data: { tv, movie } };
                    } catch (e: any) { return { error: e.message }; }
                },
                keepUnusedDataFor: 120,
            }),
            trendingAllDay: build.query<any, { page: number }>({
                queryFn: wrapQuery(({ page }) => `trending/all/day?page=${page}`),
                keepUnusedDataFor: 120,
            }),

            // --- Collections (D2) -------------------------------------------
            // Full collection incl. `parts[]` — powers the Collection screen.
            collection: build.query<any, number | string>({
                queryFn: wrapQuery((id) => `collection/${id}`),
                keepUnusedDataFor: 600,
            }),
            // Light batch: fetch several collections in parallel, keep only the
            // ones with a poster. Powers the Home "Franchises" rail (cards only,
            // no `parts` needed). One hook instead of N — see FranchisesRail.
            collections: build.query<CollectionCard[], number[]>({
                queryFn: async (ids) => {
                    try {
                        const results = await Promise.all(
                            ids.map((id) => raw(`collection/${id}`).catch(() => null)),
                        );
                        const cards: CollectionCard[] = results
                            .filter((c: any) => c && c.poster_path)
                            .map((c: any) => ({
                                id: c.id,
                                name: c.name,
                                poster_path: c.poster_path,
                                backdrop_path: c.backdrop_path ?? null,
                            }));
                        return { data: cards };
                    } catch (e: any) { return { error: e.message }; }
                },
                keepUnusedDataFor: 600,
            }),
            searchCollection: build.query<any, { query: string; page: number }>({
                queryFn: wrapQuery(({ query, page }) => `search/collection?query=${encodeURIComponent(query)}&page=${page}`),
                keepUnusedDataFor: 120,
            }),
            // --- Genres (D3) ------------------------------------------------
            // TMDB's genre id↔name map for a kind (genres are ~static → cache long).
            // Powers the Home "Browse by Genre" chips; each chip opens a
            // discover-by-genre grid (RailSeeAll) via openGenre().
            genreList: build.query<{ id: number; name: string }[], "movie" | "tv">({
                queryFn: async (kind) => {
                    try {
                        const r = await raw(`genre/${kind}/list`);
                        return { data: (r?.genres ?? []) as { id: number; name: string }[] };
                    } catch (e: any) { return { error: e.message }; }
                },
                keepUnusedDataFor: 86400,
            }),
            // "Popular in your region" (local content) — a MIXED movie+TV rail:
            // discover-by-origin-country for both types, tag media_type, merge and
            // re-sort by TMDB popularity. Region (ISO 3166-1) comes from /config's
            // CF-detected country, defaulted client-side. See RegionPopularRail.
            regionPopular: build.query<MediaItem[], string>({
                queryFn: async (region) => {
                    try {
                        const cc = region.toUpperCase();
                        const lang = REGION_LANG[cc];
                        // A: `vote_count.gte` drops the long-tail (0-vote daily serials);
                        // B: the per-region language (when mapped) biases to flagship hits.
                        const path = (kind: string) =>
                            `discover/${kind}?with_origin_country=${encodeURIComponent(cc)}` +
                            (lang ? `&with_original_language=${lang}` : "") +
                            `&vote_count.gte=50&sort_by=popularity.desc`;
                        const [movie, tv] = await Promise.all([raw(path("movie")), raw(path("tv"))]);
                        const merged: MediaItem[] = [
                            ...((movie?.results ?? []) as MediaItem[]).map((m) => ({ ...m, media_type: "movie" as const })),
                            ...((tv?.results ?? []) as MediaItem[]).map((t) => ({ ...t, media_type: "tv" as const })),
                        ]
                            .filter((m) => m.poster_path)
                            .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
                        return { data: merged };
                    } catch (e: any) { return { error: e.message }; }
                },
                keepUnusedDataFor: 600,
            }),
            // NOTE: the TMDB-popular franchise harvest (discovery source "A") moved
            // SERVER-SIDE to the worker's GET /franchises (see worker/src/franchises.ts
            // + workerApi `franchises`), so the ~15 client-side detail fetches are gone.
        };
    },
});

/** A collection reduced to what a rail/search card needs. */
export interface CollectionCard {
    id: number;
    name: string;
    poster_path: string | null;
    backdrop_path: string | null;
}

export const {
    useListQuery,
    useHeroQuery,
    useListPageQuery,
    useLazyListPageQuery,
    useDetailsQuery,
    useRecommendationsQuery,
    useSeasonQuery,
    usePersonDetailsQuery,
    usePersonCreditsQuery,
    useLazySeasonQuery,
    useLazySearchMultiQuery,
    useLazySearchMovieQuery,
    useLazySearchTvQuery,
    useLazySearchPersonQuery,
    useLazyDiscoverByProviderQuery,
    useLazyTrendingAllDayQuery,
    useCollectionQuery,
    useCollectionsQuery,
    useSearchCollectionQuery,
    useLazySearchCollectionQuery,
    useGenreListQuery,
    useRegionPopularQuery,
} = tmdbApi;
