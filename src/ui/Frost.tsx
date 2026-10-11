/**
 * Frost — frosted-glass backdrop, drop-in for the old `<BlurView style={absoluteFill} />`.
 *
 * Uses @sbaiahmed1/react-native-blur (v4.7.1): SwiftUI-backed blur on iOS, and on
 * Android a hardware (RenderEffect) blur via qmblurview with a redirectable capture
 * root — the goal being to avoid re-capturing the whole window every frame the video
 * paints, which is what made expo-blur's dimezisBlurView stutter playback.
 *
 * RULE: never place Frost directly over the live video surface — even a hardware blur
 * must re-capture a changing backdrop each frame. Use it on static surfaces
 * (cards, headers, chips, bars) only.
 *
 * Only on the screen that's on screen: the Android blur hooks the WINDOW's pre-draw, so
 * a blur on a covered screen (the floating tab bar under a party) still re-blurred on
 * every video frame — 73% of the main thread on the Nothing Phone 1. Covered, it's a
 * plain tint instead.
 */
import { useScreenFocused } from "@/hooks/useScreenFocused";
import { colors } from "@/theme/bearoom";
import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurView } from "@sbaiahmed1/react-native-blur";

interface Props {
  /** Maps from the old expo-blur `intensity` (0–100). */
  intensity?: number;
  tint?: "dark" | "light";
  style?: StyleProp<ViewStyle>;
  /** False while the surface is hidden (e.g. an overlay faded to 0 but still mounted). */
  active?: boolean;
}

export function Frost({ intensity = 40, tint = "dark", style, active = true }: Props) {
  const onScreen = useScreenFocused();
  if (!onScreen || !active) {
    const backgroundColor = tint === "dark" ? colors.glassChipBg : colors.surfaceStrong;
    return <View pointerEvents="none" style={[style ?? StyleSheet.absoluteFill, { backgroundColor }]} />;
  }
  return (
    <BlurView
      blurType={tint}
      blurAmount={Math.max(0, Math.min(100, Math.round(intensity)))}
      style={style ?? StyleSheet.absoluteFill}
    />
  );
}

export default Frost;
