import { colors, layoutTokens, ms, radius, spacing } from "@/theme/bearoom";
import { gradients } from "@/theme/styles/gradients";
import { gridColumnWidth } from "@/theme/styles/layout";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { createShimmerPlaceholder } from "react-native-shimmer-placeholder";

const ShimmerPlaceholder = createShimmerPlaceholder(LinearGradient);
const SHIMMER = [...gradients.shimmerDark];
const SHIMMER_HONEY = [...gradients.shimmerHoney];
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
        <ShimmerPlaceholder
          shimmerColors={SHIMMER}
          style={[styles.poster, { width, height }]}
        />
        {/* Rating chip silhouette */}
        <View style={styles.ratingBadge}>
          <ShimmerPlaceholder
            shimmerColors={SHIMMER_HONEY}
            style={styles.ratingBone}
          />
        </View>
        {/* Format tag silhouette */}
        <View style={styles.tagBadge}>
          <ShimmerPlaceholder
            shimmerColors={SHIMMER}
            style={styles.tagBone}
          />
        </View>
      </View>
      {/* Title line placeholder */}
      <ShimmerPlaceholder
        shimmerColors={SHIMMER}
        style={[styles.titleLine, { width: width * 0.82 }]}
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
    position: "relative",
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  poster: {
    borderRadius: radius.lg,
  },
  ratingBadge: {
    position: "absolute",
    top: ms(6),
    left: ms(6),
    borderRadius: radius.sm,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  ratingBone: {
    width: ms(34),
    height: ms(16),
    borderRadius: radius.sm,
  },
  tagBadge: {
    position: "absolute",
    top: ms(6),
    right: ms(6),
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  tagBone: {
    width: ms(24),
    height: ms(16),
    borderRadius: radius.sm,
  },
  titleLine: {
    height: ms(11),
    borderRadius: radius.sm,
    marginTop: spacing.sm - 2,
  },
});

export default PosterSkeleton;
