import { layoutTokens, ms, radius, spacing } from "@/theme/bearoom";
import { gradients } from "@/theme/styles/gradients";
import { gridColumnWidth } from "@/theme/styles/layout";
import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { Shimmer } from "./Shimmer";

const SHIMMER = [...gradients.shimmerDark];
const DEFAULT_W = gridColumnWidth(3);

export function PosterSkeleton({
  width = DEFAULT_W,
  style,
}: {
  width?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const height = width * (layoutTokens.posterAspect || 1.5);
  return (
    <View style={[styles.card, { width }, style]}>
      <View style={[styles.posterWrap, { width, height }]}>
        <Shimmer
          shimmerColors={SHIMMER}
          style={[styles.poster, { width, height }]}
        />
      </View>
      {/* Title line placeholder */}
      <Shimmer
        shimmerColors={SHIMMER}
        style={[styles.titleLine, { width: width * 0.75 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.xs,
  },
  posterWrap: {
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  poster: {
    borderRadius: radius.lg,
  },
  titleLine: {
    height: ms(10),
    borderRadius: radius.sm,
    marginTop: spacing.sm - 1,
  },
});

export default PosterSkeleton;
