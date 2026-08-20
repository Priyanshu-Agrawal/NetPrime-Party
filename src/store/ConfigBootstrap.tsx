import { useEffect } from "react";
import { useGetConfigQuery } from "@/src/store/services/workerApi";
import { syncScripts } from "@/src/scripts/bridgeCache";

/**
 * Headless component: mounting it holds a live subscription to `GET /config`,
 * so the provider registry + maintenance flag load on launch and stay warm
 * (refetchOnReconnect). It renders nothing — the data lands in the RTK Query
 * cache and, via `matchFulfilled`, in the `providers` slice.
 *
 * It also drives the OTA bridge-script sync: whenever /config arrives, diff the
 * per-provider `script_version` against the MMKV cache and fetch /scripts only
 * when something changed.
 *
 * Render once, high in the tree, inside <Provider>.
 */
export default function ConfigBootstrap() {
    const { data } = useGetConfigQuery();

    useEffect(() => {
        if (data?.providers?.length) {
            void syncScripts(
                data.providers.map((p) => ({ id: p.id, scriptVersion: p.script_version })),
            );
        }
    }, [data]);

    return null;
}
