import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import providersReducer from './features/providers/providersSlice';
import playerReducer from './features/player/playerSlice';
import watchPartyReducer from './features/watchParty/watchPartySlice';
import { workerApi } from './services/workerApi';

export const store = configureStore({
    reducer: {
        providers: providersReducer,
        player: playerReducer,
        watchParty: watchPartyReducer,
        // RTK Query cache for the edge worker (config / scrape / purge).
        [workerApi.reducerPath]: workerApi.reducer,
    },
    // Optional: Ignore serializability checks for specific paths if passing complex objects (like WebSockets) later
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            serializableCheck: false,
        }).concat(workerApi.middleware),
});

// Enables refetchOnReconnect (and refetchOnFocus if opted in per-endpoint).
setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;