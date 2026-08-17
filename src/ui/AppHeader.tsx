/**
 * AppHeader — shared Bearoom top bar: paw + wordmark, search icon, Host Party pill.
 */
import { colors, glow, ms, radius, spacing } from "@/theme/bearoom";
import { layout } from "@/theme/styles/layout";
import { pressedStyle } from "@/theme/styles/interaction";
import { Ionicons } from "@expo/vector-icons";
import { openJoinParty, openSearchTab } from "@/src/navigation/actions";
import React from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { BrandWordmark } from "./BrandWordmark";
import { IconButton } from "./IconButton";
import { Text } from "./Text";

interface Props {
  showSearch?: boolean;
  onSearchPress?: () => void;
  style?: ViewStyle;
}

export function AppHeader({ showSearch = true, onSearchPress, style }: Props) {
  return (
    <View style={[styles.bar, style]}>
      <View style={styles.brandRow}>
        <BrandWordmark size={ms(22)} />
      </View>
      <View style={styles.actions}>
        {showSearch ? (
          <IconButton onPress={onSearchPress ?? openSearchTab} size={layout.headerControl}>
            <Ionicons name="search" size={ms(18)} color={colors.text} />
          </IconButton>
        ) : null}
        <Pressable
          style={({ pressed }) => [styles.hostBtn, pressed && pressedStyle]}
          onPress={openJoinParty}
          hitSlop={6}
        >
          <Ionicons name="people" size={ms(15)} color={colors.onHoney} />
          <Text variant="label" style={styles.hostText}>
            Host Party
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  brandRow: { flexDirection: "row", alignItems: "center" },
  actions: { flexDirection: "row", alignItems: "center", gap: layout.railGap },
  hostBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(5),
    backgroundColor: colors.honey,
    paddingHorizontal: spacing.md,
    height: layout.headerControl,
    borderRadius: radius.pill,
    ...glow.honey,
  },
  hostText: { color: colors.onHoney, fontSize: ms(12) },
});

export default AppHeader;
