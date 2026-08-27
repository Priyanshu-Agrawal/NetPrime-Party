import { useNetInfo } from "@react-native-community/netinfo";
import { isOffline } from "@/utils/connectivity";

/**
 * Reactive connectivity for UI. Returns `true` only when the device is
 * positively offline (see {@link isOffline}); `false` while online OR while the
 * reachability probe is still pending, so consumers never flash a false
 * offline state on first render.
 *
 * Subscribes to the same NetInfo singleton the store bridge uses
 * (`src/store/index.ts`), so the banner and RTK Query stay in agreement.
 */
export function useConnectivity(): boolean {
  const state = useNetInfo();
  return isOffline(state);
}
