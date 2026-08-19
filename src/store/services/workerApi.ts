import type {
    AppConfig,
    PurgeResponse,
    ScrapeArgs,
    ScrapeResponse,
} from "@/src/types/worker.types";
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

/**
 * Base URL of the NetPrime edge worker (Cloudflare). Set via env:
 *   EXPO_PUBLIC_WORKER_URL=https://netprime-worker.<subdomain>.workers.dev
 * For local dev against `wrangler dev`, use your machine's LAN IP, e.g.
 *   EXPO_PUBLIC_WORKER_URL=http://192.168.1.50:8787
 * If unset, queries fail gracefully and the providers slice stays empty.
 */
const WORKER_URL = process.env.EXPO_PUBLIC_WORKER_URL ?? "";

/**
 * RTK Query service for the edge worker. This is the app's data + cache layer
 * for remote config and stream resolution — components use the generated hooks
 * (`useGetConfigQuery`, etc.) and the store caches/dedupes automatically.
 */
export const workerApi = createApi({
    reducerPath: "workerApi",
    baseQuery: fetchBaseQuery({ baseUrl: WORKER_URL }),
    // `Config` is the only invalidatable resource; purging re-fetches it.
    tagTypes: ["Config"],
    // Re-pull config when the device regains connectivity (RN-friendly).
    refetchOnReconnect: true,
    endpoints: (build) => ({
        /**
         * App bootstrap config + provider registry. The worker edge-caches this
         * for 60s; we keep the client copy for 5 min so brief unmounts don't
         * refetch. `providesTags: ['Config']` lets a purge invalidate it.
         */
        getConfig: build.query<AppConfig, void>({
            query: () => "/config",
            keepUnusedDataFor: 18000,
            providesTags: ["Config"],
        }),

        /**
         * Resolve a title across all enabled providers. Cached per (tmdbId,type)
         * so revisiting a title within the window is instant.
         */
        scrapeTitle: build.query<ScrapeResponse, ScrapeArgs>({
            query: ({ tmdbId, type = "movie" }) =>
                `/scrape?tmdbId=${encodeURIComponent(tmdbId)}&type=${type}`,
            keepUnusedDataFor: 120,
        }),

        /**
         * Invalidate the worker's provider cache (call after editing rows in
         * Supabase). Invalidating the `Config` tag makes any mounted
         * `getConfig` subscription refetch fresh data.
         */
        purgeCache: build.mutation<PurgeResponse, void>({
            query: () => ({ url: "/cache/purge", method: "POST" }),
            invalidatesTags: ["Config"],
        }),
    }),
});

export const {
    useGetConfigQuery,
    useLazyGetConfigQuery,
    useScrapeTitleQuery,
    useLazyScrapeTitleQuery,
    usePurgeCacheMutation,
} = workerApi;
