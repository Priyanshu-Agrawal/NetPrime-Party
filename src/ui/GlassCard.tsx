/**
 * GlassCard — a glass surface (Glass + hairline border) for bars, sheets, CTA cards and grouped rows.
 * blur={false} draws a plain warm tint instead (repeated cards inside lists).
 */
import { colors, radius } from "@/theme/bearoom";
import React from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { Glass, type GlassMaterial } from "./glass";

interface Props extends ViewProps {
  blur?: boolean;
  /** Glass material; floating bars by default. */
  material?: GlassMaterial;
  /** False while the card is faded out (player controls). */
  visible?: boolean;
  /** "none" inside a Modal: never blur the screen behind (another window on Android). */
  backdrop?: "auto" | "none";
  rounded?: number;
  bordered?: boolean;
  /** Inner padding; true = 16, or a number. */
  padded?: boolean | number;
}

export function GlassCard({
  blur = true,
  material = "bar",
  visible = true,
  backdrop = "auto",
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
        { borderRadius: rounded, overflow: "hidden", backgroundColor: blur ? "transparent" : colors.surfaceStrong },
        bordered && { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
        style,
      ]}
      {...rest}
    >
      {blur ? <Glass material={material} visible={visible} backdrop={backdrop} radius={rounded} /> : null}
      <View style={{ padding: pad }}>{children}</View>
    </View>
  );
}

export default GlassCard;
