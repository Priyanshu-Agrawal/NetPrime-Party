import { colors, ms, radius } from "@/theme/bearoom";
import { layout } from "@/theme/styles/layout";
import { Frost } from "./Frost";
import React from "react";
import { Platform, StyleSheet, View, type ViewStyle } from "react-native";
import { BouncyPressable } from "./BouncyPressable";

interface Props {
  onPress?: () => void;
  children: React.ReactNode;
  intensity?: number;
  size?: number;
  style?: ViewStyle;
  /** Screen-reader label — icon-only buttons announce nothing without it. */
  accessibilityLabel?: string;
}

export function IconButton({
  onPress,
  children,
  intensity = 55,
  size = layout.iconButton,
  style,
  accessibilityLabel,
}: Props) {
  const d = ms(size);
  return (
    <BouncyPressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.btn,
        { width: d, height: d },
        style,
      ]}
    >
      <Frost intensity={intensity} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.tint]} />
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
  tint: { backgroundColor: colors.overlay },
});

export default IconButton;
