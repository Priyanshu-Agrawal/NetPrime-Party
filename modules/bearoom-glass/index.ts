import { requireNativeViewManager } from "expo-modules-core";
import type { ComponentType, RefAttributes } from "react";
import { Platform, View, type ViewProps } from "react-native";

export interface NativeGlassViewProps extends ViewProps {
  /** Native tag of the BearoomGlassBackdrop to blur (findNodeHandle). */
  backdropTag: number | null;
  /** Blur radius in dp. */
  blurRadius: number;
  /** Saturation multiplier applied to the blurred backdrop (1 = unchanged). */
  saturation: number;
  /** processColor() result painted under the blurred copy: the backdrop holds content, not its background. */
  baseColor: number | null;
  /** processColor() result drawn over the blur. */
  overlayColor: number | null;
}

const android = Platform.OS === "android";

/** What glass may blur (Android: records its children for the glass views; elsewhere a plain View). */
export const NativeGlassBackdrop: ComponentType<ViewProps & RefAttributes<View>> = android
  ? requireNativeViewManager("BearoomGlass", "BearoomGlassBackdrop")
  : View;

/** Android 12+ glass view; null on other platforms. */
export const NativeGlassView: ComponentType<NativeGlassViewProps> | null = android
  ? requireNativeViewManager("BearoomGlass", "BearoomGlassView")
  : null;
