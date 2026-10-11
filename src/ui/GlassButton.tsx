/**
 * GlassButton — glass Pressable for round buttons and pills. blur={false} = solid warm tint.
 */
import { colors, radius } from "@/theme/bearoom";
import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { BouncyPressable } from "./BouncyPressable";
import { Glass } from "./glass";

interface Props {
  onPress?: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  hitSlop?: number;
  /** Glass (default) or a solid warm tint. */
  blur?: boolean;
  /** Screen-reader label — required for icon-only buttons that render no text. */
  accessibilityLabel?: string;
}

export function GlassButton({ onPress, children, style, disabled, hitSlop = 6, blur = true, accessibilityLabel }: Props) {
  return (
    <BouncyPressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.btn, style]}
    >
      {blur ? (
        <Glass material="control" radius={radius.pill} interactive />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.solid]} />
      )}
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
  solid: { backgroundColor: colors.surfaceStrong },
});

export default GlassButton;
