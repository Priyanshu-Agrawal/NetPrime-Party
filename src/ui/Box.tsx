import React, { useMemo } from "react";
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
  const s = useMemo<ViewStyle>(() => {
    const o: ViewStyle = {};
    const pad = resolveSpacing(p);
    if (pad != null) o.padding = pad;
    if (px != null) {
      o.paddingHorizontal = resolveSpacing(px);
    } else if (pl != null || pr != null) {
      if (pl != null) o.paddingLeft = resolveSpacing(pl);
      if (pr != null) o.paddingRight = resolveSpacing(pr);
    }
    if (py != null) {
      o.paddingVertical = resolveSpacing(py);
    } else {
      if (pt != null) o.paddingTop = resolveSpacing(pt);
      if (pb != null) o.paddingBottom = resolveSpacing(pb);
    }
    if (gap != null) o.gap = resolveSpacing(gap);
    if (bg) o.backgroundColor = colors[bg];
    const rad = resolveRadius(r);
    if (rad != null) o.borderRadius = rad;
    if (flex != null) o.flex = flex;
    if (row) o.flexDirection = "row";
    if (center) {
      o.alignItems = "center";
      o.justifyContent = "center";
    }
    if (fill) o.flex = 1;
    return o;
  }, [p, px, py, pt, pb, pl, pr, gap, bg, r, flex, row, center, fill]);

  return (
    <View style={[s, style]} {...rest}>
      {children}
    </View>
  );
}

export default Box;
