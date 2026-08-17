import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { colors, ms, spacing } from "@/theme/bearoom";
import { pressedStyle } from "@/theme/styles/interaction";
import { Text } from "./Text";

interface Props {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onSeeAll?: () => void;
  style?: ViewStyle;
}

export function SectionHeader({ title, icon, onSeeAll, style }: Props) {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.left}>
        {icon ? <Ionicons name={icon} size={ms(16)} color={colors.honey} /> : null}
        <Text variant="h2" style={styles.title}>
          {title}
        </Text>
      </View>
      {onSeeAll ? (
        <Pressable onPress={onSeeAll} hitSlop={8} style={({ pressed }) => [styles.seeAll, pressed && pressedStyle]}>
          <Text variant="caption">See all</Text>
          <Ionicons name="chevron-forward" size={ms(14)} color={colors.textDim} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm + 2,
  },
  left: { flexDirection: "row", alignItems: "center", gap: spacing.sm - 2 },
  title: { fontSize: ms(18), letterSpacing: -0.2 },
  seeAll: { flexDirection: "row", alignItems: "center", gap: ms(2) },
});

export default SectionHeader;
