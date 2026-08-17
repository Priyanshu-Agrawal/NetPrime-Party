import React from "react";
import { StyleSheet, View } from "react-native";
import { ms } from "@/theme/bearoom";
import { GlassChip } from "./GlassChip";

interface Props {
  rating: number;
  size?: "sm" | "md";
}

export function RatingBadge({ rating, size = "sm" }: Props) {
  return (
    <View style={[styles.wrap, size === "md" && styles.wrapMd]}>
      <GlassChip label={rating.toFixed(1)} icon="star" size={size} blur={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: ms(6),
    left: ms(6),
  },
  wrapMd: {
    top: ms(8),
    left: ms(8),
  },
});

export default RatingBadge;
