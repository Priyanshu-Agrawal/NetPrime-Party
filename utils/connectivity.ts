import type { NetInfoState } from "@react-native-community/netinfo";

/**
 * Positively-offline test. We report OFFLINE only when we KNOW there is no
 * usable connectivity:
 *   - `isConnected === false`  → no network interface at all, or
 *   - `isInternetReachable === false` → attached to a network but the internet
 *     is unreachable (captive portal, dead Wi-Fi, DNS blackhole).
 *
 * `null`/`undefined` mean "still probing" (NetInfo's initial reachability is
 * `null` until the first probe resolves). We deliberately treat those as ONLINE
 * so nothing flashes a false "No internet" banner on cold start, and RTK Query
 * doesn't dispatch a spurious `onOffline` before the network has been measured.
 */
export function isOffline(
  state: Pick<NetInfoState, "isConnected" | "isInternetReachable">,
): boolean {
  return state.isConnected === false || state.isInternetReachable === false;
}
