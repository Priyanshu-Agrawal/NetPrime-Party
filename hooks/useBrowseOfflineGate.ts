import { useCallback } from "react";
import { useDispatch } from "react-redux";
import { useConnectivity } from "@/hooks/useConnectivity";
import { TMDB_TAG, tmdbApi, useHeroQuery } from "@/src/store/services/tmdbApi";
import { workerApi } from "@/src/store/services/workerApi";

/**
 * Shared offline gate for browse surfaces (Home, Search, catalog grids).
 *
 * `hero` (trending/all) is the app-wide "we have connectivity-loaded content"
 * signal: present ⇒ the app has been online this session and has a feed to
 * show even if the connection later drops (cached content + the slim banner);
 * absent while offline ⇒ nothing to show ⇒ the caller renders a full
 * `OfflineState` page instead of a wall of broken rails.
 *
 * `reload` re-pulls every TMDB query on screen (hero + every self-fetching rail)
 * and the worker config — the single action behind pull-to-refresh and the
 * offline page's "Try again". It invalidates instead of clearing the cache, so
 * rails keep their items while they refetch: clearing swapped every rail to its
 * skeleton at once (~1,800 native views torn down in one frame, then rebuilt).
 */
export function useBrowseOfflineGate() {
  const dispatch = useDispatch();
  const offline = useConnectivity();
  const { data: hero, isError: heroError } = useHeroQuery();
  const hasContent = (hero?.length ?? 0) > 0;

  const reload = useCallback(() => {
    dispatch(tmdbApi.util.invalidateTags([TMDB_TAG]));
    dispatch(workerApi.util.invalidateTags(["Config"]));
  }, [dispatch]);

  // Take over with the full page when there's NOTHING to show AND we've settled
  // into a failure — either the device is offline, or the feed's primary fetch
  // errored (server down / captive portal / requests failing though "connected").
  // Never during the normal initial online load (hero still fetching, no error).
  const showOffline = !hasContent && (offline || heroError);

  return { offline, hasContent, showOffline, reload };
}
