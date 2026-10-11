import { useScreenFocused } from "@/hooks/useScreenFocused";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { createShimmerPlaceholder, type ShimmerPlaceholderProps } from "react-native-shimmer-placeholder";

const BaseShimmer = createShimmerPlaceholder(LinearGradient);

/**
 * The app's shimmering placeholder. It animates only while its screen is on screen:
 * the shimmer loops natively every frame, and a frozen hidden screen never commits the
 * "loaded" state that would unmount it — Search's 24 skeletons, mounted at launch
 * behind everything, cost ~300 ms/s of the UI thread on the Nothing Phone 1.
 */
export function Shimmer(props: ShimmerPlaceholderProps) {
  const onScreen = useScreenFocused();
  return <BaseShimmer {...props} stopAutoRun={props.stopAutoRun || !onScreen} />;
}
