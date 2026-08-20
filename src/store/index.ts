import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import providersReducer from './features/providers/providersSlice';
import playerReducer from './features/player/playerSlice';
import watchPartyReducer from './features/watchParty/watchPartySlice';
import { workerApi } from './services/workerApi';
import { tmdbApi } from './services/tmdbApi';
import { klipyApi } from './services/klipyApi';

export const store = configureStore({
    reducer: {
        providers: providersReducer,
        player: playerReducer,
        watchParty: watchPartyReducer,
        // RTK Query caches: edge worker (config/scrape), TMDB, and KLIPY.
        [workerApi.reducerPath]: workerApi.reducer,
        [tmdbApi.reducerPath]: tmdbApi.reducer,
        [klipyApi.reducerPath]: klipyApi.reducer,
    },
    // Optional: Ignore serializability checks for specific paths if passing complex objects (like WebSockets) later
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            serializableCheck: false,
        }).concat(workerApi.middleware, tmdbApi.middleware, klipyApi.middleware),
});

// Enables refetchOnReconnect (and refetchOnFocus if opted in per-endpoint).
setupListeners(store.dispatch);

// Note: the provider registry's imperative lookups (getProvider /
// defaultHijackProvider) read this store directly — no manual mirroring needed.

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;