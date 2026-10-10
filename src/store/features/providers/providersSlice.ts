import { type Provider } from "@/components/player/providerRegistry";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { workerApi } from "@/src/store/services/workerApi";
import { DEFAULT_FLAGS, type AppConfig, type FeatureFlags } from "@/src/types/worker.types";
import { shouldAcceptConfig } from "./configCache";
import { remoteToProviders } from "./mappers";

interface ProvidersState {
    /**
     * @description The live provider list (playback shape). Starts EMPTY — there
     * is NO baked-in fallback — and is filled only from the Supabase /config (or
     * the device's copy of the last good one). If the server deliberately sends
     * none (`killswitch`: cleared for store review, or a global kill), the app
     * deliberately shows none.
     */
    providers: Provider[];
    /**
     * @description Whether the maintenance mode is enabled
     */
    maintenanceMode: boolean;
    /**
     * @description Server-detected client country (ISO 3166-1) from /config, or
     * null. Drives the "Popular in your region" rail; consumers default it (IN).
     */
    region: string | null;
    /** True when what we show came from a cache (device or worker LKG), not a fresh Supabase read. */
    stale: boolean;
    /** Remote lane switches (/config.flags). Default all off. */
    flags: FeatureFlags;
    /** Where the current data came from. The device cache never overwrites "live". */
    source: "none" | "cache" | "live";
}

const initialState: ProvidersState = {
    providers: [],
    maintenanceMode: false,
    region: null,
    stale: false,
    flags: DEFAULT_FLAGS,
    source: "none",
};

function applyConfig(state: ProvidersState, cfg: AppConfig): void {
    state.providers = remoteToProviders(cfg.providers ?? []);
    state.maintenanceMode = cfg.maintenanceMode;
    state.region = cfg.region ?? null;
    state.flags = cfg.flags ?? DEFAULT_FLAGS;
}

/**
 * Apply a /config answer. NO baked-in fallback still holds — but an empty list is
 * only believed when it's an explicit killswitch; an outage answer keeps whatever
 * we already show (device cache or the previous live list) and marks it stale.
 * Builds a brand-new object (no spread of an Immer draft), so it is safe both as a
 * pure function in tests and as a case-reducer return value.
 */
export function reduceConfig(state: ProvidersState, payload: AppConfig): ProvidersState {
    if (!shouldAcceptConfig(payload)) {
        return { ...state, stale: true };
    }
    return {
        providers: remoteToProviders(payload.providers ?? []),
        maintenanceMode: payload.maintenanceMode,
        region: payload.region ?? null,
        flags: payload.flags ?? DEFAULT_FLAGS,
        source: "live",
        stale: payload.stale === true,
    };
}

const providersSlice = createSlice({
    name: 'providers',
    initialState,
    reducers: {
        setProviders: (state, action: PayloadAction<Provider[]>) => {
            state.providers = action.payload;
        },
        setMaintenanceMode: (state, action: PayloadAction<boolean>) => {
            state.maintenanceMode = action.payload;
        },
        /** Cold-start hydration from the device's last good /config (ConfigBootstrap). */
        hydrateFromCache: (state, action: PayloadAction<AppConfig>) => {
            if (state.source !== "none") return; // never overwrite fresher data
            applyConfig(state, action.payload);
            state.source = "cache";
            state.stale = true;
        },
    },
    // Derive the provider list + maintenance flag from the /config query, so a
    // single fetch keeps everything in sync app-wide (see reduceConfig).
    extraReducers: (builder) => {
        builder.addMatcher(
            workerApi.endpoints.getConfig.matchFulfilled,
            (state, { payload }) => {
                // The outage branch mutates the draft in place; only the accept
                // branch returns a new object, which never contains a draft.
                if (!shouldAcceptConfig(payload)) {
                    state.stale = true;
                    return;
                }
                return reduceConfig(state, payload);
            },
        );
    },
});

export const { setProviders, setMaintenanceMode, hydrateFromCache } = providersSlice.actions;
export type { ProvidersState };

export default providersSlice.reducer;
