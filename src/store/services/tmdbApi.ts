import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";
import { API_HEADERS, API_URL } from "@/contexts/movieContext/movieContext";
import {
    type ListPageResult,
    type MediaItem,
    fetchList,
    fetchListPage,
} from "@/utils/tmdbLists";
import { fetchDetails } from "@/utils/tmdbDetails";

/**
 * RTK Query layer over the existing TMDB helpers (utils/tmdbLists,
 * utils/tmdbDetails) and the direct proxy fetches. Implemented with `queryFn`
 * so every proven transform/extractor stays untouched — this only adds caching,
 * request dedupe, and generated hooks. Replaces the bespoke module cache in
 * src/features/home/tmdbCache.ts (RTK Query keeps entries warm via
 * keepUnusedDataFor, so Home no longer flashes skeleton on tab focus).
 *
 * `MediaType` responses for details/season/search are raw TMDB JSON (`unknown`);
 * screens pass them to the pure extractors (pickTrailer, topCast, pickProviders…).
 */

const raw = async (path: string): Promise<any> => {
    const sep = path.includes("?") ? "&" : "?";
    const res = await fetch(`${API_URL}${path}${sep}language=en-US`, {
        headers: API_HEADERS,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
};

export const tmdbApi = createApi({
    reducerPath: "tmdbApi",
    baseQuery: fakeBaseQuery<string>(),
    endpoints: (build) => ({
        /** Home rails — a TMDB list path e.g. "movie/popular", "trending/tv/week". */
        list: build.query<MediaItem[], string>({
            queryFn: async (path) => ({ data: await fetchList(path) }),
            keepUnusedDataFor: 600,
        }),

        /** Hero carousel — trending, backdrop-only, top 8. */
        hero: build.query<MediaItem[], void>({
            queryFn: async () => {
                const r = await fetchList("trending/all/week");
                return { data: r.filter((m) => m.backdrop_path).slice(0, 8) };
            },
            keepUnusedDataFor: 600,
        }),

        /** Paginated list — library "See all" screens. */
        listPage: build.query<ListPageResult, { path: string; page: number }>({
            queryFn: async ({ path, page }) => ({
                data: await fetchListPage(path, page),
            }),
            keepUnusedDataFor: 300,
        }),

        /** Rich details (append_to_response bundle) — raw TMDB JSON for extractors. */
        details: build.query<any, { type: "movie" | "tv"; id: string }>({
            queryFn: async ({ type, id }) => ({ data: await fetchDetails(type, id) }),
            keepUnusedDataFor: 600,
        }),

        /** A single TV season (episodes list). */
        season: build.query<any, { id: string; season: number }>({
            queryFn: async ({ id, season }) => ({
                data: await raw(`tv/${id}/season/${season}`),
            }),
            keepUnusedDataFor: 600,
        }),

        /** Multi search (movies + tv + people). Returns raw page for the caller to filter. */
        searchMulti: build.query<any, { query: string; page: number }>({
            queryFn: async ({ query, page }) => ({
                data: await raw(`search/multi?query=${encodeURIComponent(query)}&page=${page}`),
            }),
            keepUnusedDataFor: 120,
        }),

        /** Discover by streaming provider (tv + movie in parallel), US region. */
        discoverByProvider: build.query<
            { tv: any; movie: any },
            { providerId: number; page: number }
        >({
            queryFn: async ({ providerId, page }) => {
                const q = `sort_by=popularity.desc&watch_region=US&with_watch_providers=${providerId}&page=${page}`;
                const [tv, movie] = await Promise.all([
                    raw(`discover/tv?${q}`),
                    raw(`discover/movie?${q}`),
                ]);
                return { data: { tv, movie } };
            },
            keepUnusedDataFor: 120,
        }),

        /** Trending across all media for a given day-page (Search browse default). */
        trendingAllDay: build.query<any, { page: number }>({
            queryFn: async ({ page }) => ({
                data: await raw(`trending/all/day?page=${page}`),
            }),
            keepUnusedDataFor: 120,
        }),
    }),
});

export const {
    useListQuery,
    useHeroQuery,
    useListPageQuery,
    useLazyListPageQuery,
    useDetailsQuery,
    useSeasonQuery,
    useLazySeasonQuery,
    useLazySearchMultiQuery,
    useLazyDiscoverByProviderQuery,
    useLazyTrendingAllDayQuery,
} = tmdbApi;
