import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import NetInfo from '@react-native-community/netinfo';
import { isOffline } from '@/utils/connectivity';
import providersReducer from './features/providers/providersSlice';
import { workerApi } from './services/workerApi';
import { tmdbApi } from './services/tmdbApi';
import { klipyApi } from './services/klipyApi';

export const store = configureStore({
    reducer: {
        providers: providersReducer,
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

// Bridge NetInfo → RTK Query's online/offline actions so `refetchOnReconnect`
// actually fires on React Native. The default `setupListeners(dispatch)` only
// wires browser `window` online/offline events, which don't exist in RN, so
// without this the connection actions never dispatch. We dispatch ONLY on a
// real transition: NetInfo fires immediately on subscribe and on every change,
// and re-dispatching `onOnline` while already online would trigger refetch
// storms across every mounted query. (Passing a custom handler replaces the
// default focus wiring too, which was already a no-op in RN.)
setupListeners(store.dispatch, (dispatch, { onOnline, onOffline }) => {
    // Assume online at boot so the first genuine transition is a real OFFLINE,
    // not a redundant cold-start `onOnline` that force-refetches every query.
    let wasOnline = true;
    return NetInfo.addEventListener((state) => {
        const online = !isOffline(state);
        if (online === wasOnline) return;
        wasOnline = online;
        dispatch(online ? onOnline() : onOffline());
    });
});

// Note: the provider registry's imperative lookups (getProvider /
// defaultHijackProvider) read this store directly — no manual mirroring needed.

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;