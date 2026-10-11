import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { findNodeHandle, Platform, type View } from "react-native";

/** Platform facts the engine choice depends on — one module, so tests can swap them. */
export const glassPlatform = {
  os: Platform.OS as string,
  androidApi: Platform.OS === "android" ? Number(Platform.Version) : 0,
  liquidAvailable: Platform.OS === "ios" && isLiquidGlassAvailable() && isGlassEffectAPIAvailable(),
};

/** The native tag the Android glass view uses to find its backdrop. */
export function nativeTagOf(view: View | null): number | null {
  return view ? findNodeHandle(view) : null;
}
