/**
 * AppHeader — the shared Bearoom top bar: paw + "Bea·r·oom" wordmark on the left,
 * an optional search icon + the honey "Host Party" pill on the right. Used across
 * the tab screens (Home, Search, …) so the brand row is identical everywhere.
 *
 * It renders just the row; the host screen positions it (e.g. Home floats it over
 * the hero with a blur-on-scroll background, Search pins it at the top).
 */
import { colors, font, glow, ms, radius } from "@/theme/bearoom";
import { Ionicons } from "@expo/vector-icons";
import { openJoinParty, openSearchTab } from "@/src/navigation/actions";
import React from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";

interface Props {
  /** Show the search icon (hide it where a search field is already on screen). */
  showSearch?: boolean;
  /** Override the search icon action (default: navigate to the Search tab). */
  onSearchPress?: () => void;
  style?: ViewStyle;
}

export function AppHeader({ showSearch = true, onSearchPress, style }: Props) {
  return (
    <View style={[styles.bar, style]}>
      <View style={styles.brandRow}>
        <Ionicons name="paw" size={20} color={colors.honey} />
        <Text style={styles.brand}>
          Bea<Text style={styles.brandAccent}>r</Text>oom
        </Text>
      </View>
      <View style={styles.actions}>
        {showSearch ? (
          <Pressable
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            onPress={onSearchPress ?? openSearchTab}
            hitSlop={6}
          >
            <Ionicons name="search" size={18} color={colors.text} />
          </Pressable>
        ) : null}
        <Pressable
          style={({ pressed }) => [styles.hostBtn, pressed && styles.pressed]}
          onPress={openJoinParty}
          hitSlop={6}
        >
          <Ionicons name="people" size={15} color={colors.onHoney} />
          <Text style={styles.hostText}>Host Party</Text>
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
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.97 }] },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  brand: { color: colors.text, fontFamily: font.headlineXbold, fontSize: ms(22), letterSpacing: 0.2 },
  brandAccent: { color: colors.honey },
  actions: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  hostBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.honey,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: radius.pill,
    ...glow.honey,
  },
  hostText: { color: colors.onHoney, fontFamily: font.label, fontSize: ms(12) },
});

export default AppHeader;
