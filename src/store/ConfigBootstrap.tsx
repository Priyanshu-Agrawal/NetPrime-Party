import { useGetConfigQuery } from "@/src/store/services/workerApi";

/**
 * Headless component: mounting it holds a live subscription to `GET /config`,
 * so the provider registry + maintenance flag load on launch and stay warm
 * (refetchOnReconnect). It renders nothing — the data lands in the RTK Query
 * cache and, via `matchFulfilled`, in the `providers` slice.
 *
 * Render once, high in the tree, inside <Provider>.
 */
export default function ConfigBootstrap() {
    useGetConfigQuery();
    return null;
}
