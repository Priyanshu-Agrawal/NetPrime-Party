import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";
import { colors, ms, radius } from "@/theme/bearoom";
import { Text } from "./Text";

interface Props {
  rating: number;
  size?: "sm" | "md";
}

export function RatingBadge({ rating, size = "sm" }: Props) {
  const iconSize = size === "sm" ? ms(9) : ms(10);
  const fontSize = size === "sm" ? ms(9) : ms(11);
  return (
    <View style={[styles.badge, size === "md" && styles.badgeMd]}>
      <Ionicons name="star" size={iconSize} color={colors.honey} />
      <Text variant="caption" style={[styles.text, { fontSize }]}>
        {rating.toFixed(1)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: ms(6),
    left: ms(6),
    flexDirection: "row",
    alignItems: "center",
    gap: ms(2),
    backgroundColor: colors.scrim,
    paddingHorizontal: ms(5),
    paddingVertical: ms(2),
    borderRadius: radius.pill,
  },
  badgeMd: {
    top: ms(8),
    left: ms(8),
    paddingHorizontal: ms(6),
    paddingVertical: ms(3),
  },
  text: { color: colors.text, fontFamily: "Inter_600SemiBold" },
});

export default RatingBadge;
