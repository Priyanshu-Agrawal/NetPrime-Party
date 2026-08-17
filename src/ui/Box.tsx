import React from "react";
import { View, type ViewProps, type ViewStyle } from "react-native";
import { colors, radius as radiusTokens, spacing } from "@/theme/bearoom";

type SpacingKey = keyof typeof spacing;
type RadiusKey = keyof typeof radiusTokens;
type ColorKey = keyof typeof colors;

type Props = ViewProps & {
  p?: SpacingKey | number;
  px?: SpacingKey | number;
  py?: SpacingKey | number;
  pt?: SpacingKey | number;
  pb?: SpacingKey | number;
  pl?: SpacingKey | number;
  pr?: SpacingKey | number;
  gap?: SpacingKey | number;
  bg?: ColorKey;
  radius?: RadiusKey | number;
  flex?: number;
  row?: boolean;
  center?: boolean;
  fill?: boolean;
};

function resolveSpacing(v?: SpacingKey | number): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "number") return v;
  return spacing[v];
}

function resolveRadius(v?: RadiusKey | number): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "number") return v;
  return radiusTokens[v];
}

export function Box({
  p,
  px,
  py,
  pt,
  pb,
  pl,
  pr,
  gap,
  bg,
  radius: r,
  flex,
  row,
  center,
  fill,
  style,
  children,
  ...rest
}: Props) {
  const s: ViewStyle = {};
  const pad = resolveSpacing(p);
  if (pad != null) s.padding = pad;
  if (px != null) {
    s.paddingHorizontal = resolveSpacing(px);
  } else if (pl != null || pr != null) {
    if (pl != null) s.paddingLeft = resolveSpacing(pl);
    if (pr != null) s.paddingRight = resolveSpacing(pr);
  }
  if (py != null) {
    s.paddingVertical = resolveSpacing(py);
  } else {
    if (pt != null) s.paddingTop = resolveSpacing(pt);
    if (pb != null) s.paddingBottom = resolveSpacing(pb);
  }
  if (gap != null) s.gap = resolveSpacing(gap);
  if (bg) s.backgroundColor = colors[bg];
  const rad = resolveRadius(r);
  if (rad != null) s.borderRadius = rad;
  if (flex != null) s.flex = flex;
  if (row) s.flexDirection = "row";
  if (center) {
    s.alignItems = "center";
    s.justifyContent = "center";
  }
  if (fill) s.flex = 1;

  return (
    <View style={[s, style]} {...rest}>
      {children}
    </View>
  );
}

export default Box;
