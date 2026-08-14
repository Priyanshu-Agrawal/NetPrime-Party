/**
 * GlassIconButton — a round frosted-glass button for floating header actions
 * (back / bookmark / share) that sit directly on a poster backdrop. The blur
 * lifts the icon off busy or bright artwork so it stays legible over ANY image,
 * with a subtle dark tint + hairline ring for definition.
 */
import { colors, ms, radius } from "@/theme/bearoom";
import { BlurView } from "expo-blur";
import React from "react";
import { Platform, Pressable, StyleSheet, View, type ViewStyle } from "react-native";

interface Props {
  onPress?: () => void;
  children: React.ReactNode;
  /** Blur strength (default 55 — a strong frost so the bubble reads on any image). */
  intensity?: number;
  size?: number;
  style?: ViewStyle;
}

export function GlassIconButton({ onPress, children, intensity = 55, size = 40, style }: Props) {
  const d = ms(size);
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.btn,
        { width: d, height: d },
        pressed && { opacity: 0.8 },
        style,
      ]}
    >
      <BlurView
        intensity={intensity}
        tint="dark"
        experimentalBlurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, styles.tint]} />
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: radius.pill,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  // A faint dark wash over the blur so a light icon keeps contrast even where the
  // blurred backdrop is bright.
  tint: { backgroundColor: "rgba(16,13,10,0.28)" },
});

export default GlassIconButton;
