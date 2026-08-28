import { type Provider } from "@/components/player/providerRegistry";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { workerApi } from "@/src/store/services/workerApi";
import { remoteToProviders } from "./mappers";

interface ProvidersState {
    /**
     * @description The live provider list (playback shape). Starts EMPTY — there
     * is NO baked-in fallback — and is filled only from the Supabase /config.
     * If the server sends none (cleared for store review, or a global kill), the
     * app deliberately shows none.
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
}

const initialState: ProvidersState = {
    providers: [],
    maintenanceMode: false,
    region: null,
};

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
    },
    // Derive the provider list + maintenance flag from the /config query, so a
    // single fetch keeps everything in sync app-wide. NO fallback: whatever the
    // server sends is the whole truth (empty → empty, by design).
    extraReducers: (builder) => {
        builder.addMatcher(
            workerApi.endpoints.getConfig.matchFulfilled,
            (state, { payload }) => {
                state.providers = remoteToProviders(payload.providers ?? []);
                state.maintenanceMode = payload.maintenanceMode;
                state.region = payload.region ?? null;
            },
        );
    },
});

export const { setProviders, setMaintenanceMode } = providersSlice.actions;

export default providersSlice.reducer;
