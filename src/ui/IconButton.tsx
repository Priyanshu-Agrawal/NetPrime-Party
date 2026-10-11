import { colors, ms, radius } from "@/theme/bearoom";
import { layout } from "@/theme/styles/layout";
import React from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import { BouncyPressable } from "./BouncyPressable";
import { Glass } from "./glass";

interface Props {
  onPress?: () => void;
  children: React.ReactNode;
  size?: number;
  style?: ViewStyle;
  /** Screen-reader label — icon-only buttons announce nothing without it. */
  accessibilityLabel?: string;
  /** "none" inside a Modal: never blur the screen behind (another window on Android). */
  backdrop?: "auto" | "none";
}

export function IconButton({ onPress, children, size = layout.iconButton, style, accessibilityLabel, backdrop = "auto" }: Props) {
  const d = ms(size);
  return (
    <BouncyPressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.btn, { width: d, height: d }, style]}
    >
      <Glass material="control" radius={radius.pill} backdrop={backdrop} interactive />
      {children}
    </BouncyPressable>
  );
}

/** @deprecated Use IconButton */
export const GlassIconButton = IconButton;

const styles = StyleSheet.create({
  btn: {
    borderRadius: radius.pill,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default IconButton;
