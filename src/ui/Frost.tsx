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
 */
import React from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { BlurView } from "@sbaiahmed1/react-native-blur";

interface Props {
  /** Maps from the old expo-blur `intensity` (0–100). */
  intensity?: number;
  tint?: "dark" | "light";
  style?: StyleProp<ViewStyle>;
}

export function Frost({ intensity = 40, tint = "dark", style }: Props) {
  return (
    <BlurView
      blurType={tint}
      blurAmount={Math.max(0, Math.min(100, Math.round(intensity)))}
      style={style ?? StyleSheet.absoluteFill}
    />
  );
}

export default Frost;
