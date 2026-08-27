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
        };
    },
});

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
} = tmdbApi;
