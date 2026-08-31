/**
 * AppHeader — shared Bearoom top bar: paw + wordmark, search icon, and one
 * party affordance whose meaning depends on whether a room is already live.
 *
 * No session  → "Watch together", which opens the host/join screen.
 * Session live → a "● CODE" chip that takes you straight back to the room.
 *
 * Offering "Host Party" to someone already hosting was the bug this fixes: it
 * would have minted a SECOND room and silently abandoned the first.
 */
import { colors, glow, ms, radius, spacing } from "@/theme/bearoom";
import { layout } from "@/theme/styles/layout";
import { pressedStyle } from "@/theme/styles/interaction";
import { Ionicons } from "@expo/vector-icons";
import { enterParty, openJoinParty, openSearchTab } from "@/src/navigation/actions";
import { usePartySession, usePartySnapshot } from "@/services/party/PartySession";
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
  const inSession = !!usePartySession().request;
  const code = usePartySnapshot((s) => s?.code ?? null);
  const live = inSession && !!code;
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
        {live ? (
          <Pressable
            style={({ pressed }) => [styles.roomChip, pressed && pressedStyle]}
            onPress={() => enterParty({ room: code!, role: "guest" })}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Back to room ${code}`}
          >
            <View style={styles.liveDot} />
            <Text variant="label" style={styles.roomChipText}>
              {code}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.hostBtn, pressed && pressedStyle]}
            onPress={openJoinParty}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Watch together"
          >
            <Ionicons name="people" size={ms(15)} color={colors.onHoney} />
            <Text variant="label" style={styles.hostText}>
              Watch together
            </Text>
          </Pressable>
        )}
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
  // The live-room chip is deliberately quieter than the honey CTA: it reports a
  // state you're already in rather than inviting a new action.
  roomChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(6),
    paddingHorizontal: spacing.md,
    height: layout.headerControl,
    borderRadius: radius.pill,
    backgroundColor: colors.honeySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.honey,
  },
  roomChipText: { color: colors.honey, fontSize: ms(12), letterSpacing: 1 },
  liveDot: { width: ms(6), height: ms(6), borderRadius: ms(3), backgroundColor: colors.honey },
});

export default AppHeader;
