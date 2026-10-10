import { useEffect } from "react";
import { useGetConfigQuery } from "@/src/store/services/workerApi";
import { syncScripts } from "@/src/scripts/bridgeCache";
import { useAppDispatch } from "@/src/store/hooks";
import { hydrateFromCache } from "@/src/store/features/providers/providersSlice";
import { loadCachedConfig, saveCachedConfig } from "@/src/store/features/providers/configCache";
import { universalStorage } from "@/services/storage/universalStorage";

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
 * It also keeps the device's last good /config in MMKV and hydrates from it at
 * launch, so an outage never empties the app (see configCache.ts).
 *
 * Render once, high in the tree, inside <Provider>.
 */
export default function ConfigBootstrap() {
    const { data } = useGetConfigQuery();
    const dispatch = useAppDispatch();

    // Cold start: show the last good /config immediately (and through any outage).
    // The reducer ignores this if a live answer already landed.
    useEffect(() => {
        const cached = loadCachedConfig(universalStorage);
        if (cached) dispatch(hydrateFromCache(cached));
    }, [dispatch]);

    useEffect(() => {
        if (data) saveCachedConfig(data, universalStorage);
        if (data?.providers?.length) {
            void syncScripts(
                data.providers.map((p) => ({ id: p.id, scriptVersion: p.script_version })),
            );
        }
    }, [data]);

    return null;
}
