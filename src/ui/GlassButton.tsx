/**
 * GlassButton — frosted-glass Pressable for controls over the app background.
 */
import { colors, radius } from "@/theme/bearoom";
import { Frost } from "./Frost";
import React from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { BouncyPressable } from "./BouncyPressable";

interface Props {
  onPress?: () => void;
  children: React.ReactNode;
  intensity?: number;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  hitSlop?: number;
  /** Real frosted blur (default). false = solid tint — use over/near video: the blur re-samples every frame and stutters playback. */
  blur?: boolean;
}

export function GlassButton({ onPress, children, intensity = 42, style, disabled, hitSlop = 6, blur = true }: Props) {
  return (
    <BouncyPressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      style={[styles.btn, style]}
    >
      {blur ? <Frost intensity={intensity} style={StyleSheet.absoluteFill} /> : null}
      <View style={[StyleSheet.absoluteFill, blur ? styles.tint : styles.solid]} />
      {children}
    </BouncyPressable>
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
  tint: { backgroundColor: colors.overlay },
  solid: { backgroundColor: colors.surfaceStrong },
});

export default GlassButton;
