/**
 * GlassCard — a frosted-glass surface (BlurView + warm tint + hairline border).
 * The building block for control bars, sheets, CTA cards, and grouped rows.
 *
 * Perf note: real blur is not free on Android. Use blur={false} for repeated
 * surfaces (e.g. poster cards inside rails) to fall back to a cheap solid tint.
 */
import { BlurView } from "expo-blur";
import React from "react";
import { Platform, StyleSheet, View, type ViewProps } from "react-native";
import { colors, glass, radius } from "@/theme/bearoom";

interface Props extends ViewProps {
  blur?: boolean;
  intensity?: number;
  rounded?: number;
  bordered?: boolean;
  /** Inner padding; true = 16, or a number. */
  padded?: boolean | number;
}

export function GlassCard({
  blur = true,
  intensity = glass.intensity,
  rounded = radius.xl,
  bordered = true,
  padded = false,
  style,
  children,
  ...rest
}: Props) {
  const pad = padded === true ? 16 : typeof padded === "number" ? padded : 0;
  return (
    <View
      style={[
        {
          borderRadius: rounded,
          overflow: "hidden",
          backgroundColor: blur ? "transparent" : colors.surfaceStrong,
        },
        bordered && { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
        style,
      ]}
      {...rest}
    >
      {blur && (
        <>
          <BlurView
            intensity={intensity}
            tint="dark"
            experimentalBlurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
            style={StyleSheet.absoluteFill}
          />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]} />
        </>
      )}
      <View style={{ padding: pad }}>{children}</View>
    </View>
  );
}

export default GlassCard;
