import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";
import {
    type MediaCategory,
    type MediaItem,
    type MediaKind,
    type ReportReason,
    getCategories,
    recentMedia,
    reportMedia,
    searchMedia,
    shareTrigger,
    trendingMedia,
} from "@/services/gifs";

/**
 * RTK Query wrapper over the KLIPY client (services/gifs.ts). We keep the direct
 * device→KLIPY calls (KLIPY ToS forbids proxying) and reuse the exact media
 * mapping; RTK Query adds caching + dedupe + generated hooks on top via
 * `queryFn` (so no baseUrl — the underlying functions build the KLIPY URLs).
 *
 * The read endpoints are queries (cached so re-opening the picker or repeating a
 * search is instant). Share/report are mutations; sharing invalidates `Recent`
 * so the "recently shared" rail refreshes.
 */
export const klipyApi = createApi({
    reducerPath: "klipyApi",
    baseQuery: fakeBaseQuery(),
    tagTypes: ["Recent"],
    endpoints: (build) => ({
        klipyTrending: build.query<
            MediaItem[],
            { kind: MediaKind; customerId: string; limit?: number }
        >({
            queryFn: async ({ kind, customerId, limit }) => ({
                data: await trendingMedia(kind, customerId, limit),
            }),
            keepUnusedDataFor: 600,
        }),

        klipySearch: build.query<
            MediaItem[],
            { kind: MediaKind; query: string; customerId: string; limit?: number }
        >({
            queryFn: async ({ kind, query, customerId, limit }) => ({
                data: await searchMedia(kind, query, customerId, limit),
            }),
            keepUnusedDataFor: 300,
        }),

        klipyRecent: build.query<
            MediaItem[],
            { kind: MediaKind; customerId: string; limit?: number }
        >({
            queryFn: async ({ kind, customerId, limit }) => ({
                data: await recentMedia(kind, customerId, limit),
            }),
            providesTags: ["Recent"],
            keepUnusedDataFor: 120,
        }),

        klipyCategories: build.query<
            MediaCategory[],
            { kind: MediaKind; locale?: string }
        >({
            queryFn: async ({ kind, locale }) => ({
                data: await getCategories(kind, locale),
            }),
            keepUnusedDataFor: 3600,
        }),

        // Fire-and-forget personalization/reporting signals. Void payloads —
        // the underlying calls already swallow their own errors.
        klipyShare: build.mutation<
            null,
            { kind: MediaKind; slug: string; customerId: string; q?: string }
        >({
            queryFn: ({ kind, slug, customerId, q }) => {
                shareTrigger(kind, slug, customerId, q);
                return { data: null };
            },
            invalidatesTags: ["Recent"],
        }),

        klipyReport: build.mutation<
            null,
            { kind: MediaKind; slug: string; customerId: string; reason: ReportReason }
        >({
            queryFn: ({ kind, slug, customerId, reason }) => {
                reportMedia(kind, slug, customerId, reason);
                return { data: null };
            },
        }),
    }),
});

export const {
    useKlipyTrendingQuery,
    useKlipySearchQuery,
    useLazyKlipySearchQuery,
    useKlipyRecentQuery,
    useKlipyCategoriesQuery,
    useKlipyShareMutation,
    useKlipyReportMutation,
} = klipyApi;
