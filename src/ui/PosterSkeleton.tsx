import { ms, radius, spacing } from "@/theme/bearoom";
import { gradients } from "@/theme/styles/gradients";
import { gridColumnWidth } from "@/theme/styles/layout";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, View } from "react-native";
import { createShimmerPlaceholder } from "react-native-shimmer-placeholder";

const ShimmerPlaceholder = createShimmerPlaceholder(LinearGradient);
const SHIMMER = [...gradients.shimmerDark];
const DEFAULT_W = gridColumnWidth(3);

export function PosterSkeleton({ width = DEFAULT_W }: { width?: number }) {
  return (
    <View style={[styles.card, { width }]}>
      <ShimmerPlaceholder
        shimmerColors={SHIMMER}
        style={[styles.poster, { width, height: width * 1.5 }]}
      />
      <ShimmerPlaceholder
        shimmerColors={SHIMMER}
        style={[styles.line, { width: width * 0.72 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.lg },
  poster: { borderRadius: radius.lg },
  line: {
    height: ms(10),
    borderRadius: radius.sm,
    marginTop: spacing.sm - 1,
  },
});
