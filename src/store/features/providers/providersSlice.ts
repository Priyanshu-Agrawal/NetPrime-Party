import { StreamProvider } from "@/src/types/providers.types";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { workerApi } from "@/src/store/services/workerApi";

interface ProvidersState {
    /**
     * @description The list of enabled stream providers
     */
    enabledProviders: StreamProvider[];
    /**
     * @description Whether the maintenance mode is enabled
     */
    maintenanceMode: boolean;
}

const initialState: ProvidersState = {
    enabledProviders: [],
    maintenanceMode: false,
};

const providersSlice = createSlice({
    name: 'providers',
    initialState,
    reducers: {
        setEnabledProviders: (state, action: PayloadAction<StreamProvider[]>) => {
            state.enabledProviders = action.payload;
        },
        setMaintenanceMode: (state, action: PayloadAction<boolean>) => {
            state.maintenanceMode = action.payload;
        },
    },
    // Derive slice state from the /config query so a single fetch keeps the
    // provider list and maintenance flag in sync app-wide.
    extraReducers: (builder) => {
        builder.addMatcher(
            workerApi.endpoints.getConfig.matchFulfilled,
            (state, { payload }) => {
                state.enabledProviders = payload.providers.filter((p) => p.enabled);
                state.maintenanceMode = payload.maintenanceMode;
            },
        );
    },
});

export const { setEnabledProviders, setMaintenanceMode } = providersSlice.actions;

export default providersSlice.reducer;