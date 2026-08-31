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
import { openJoinParty, openSearchTab } from "@/src/navigation/actions";
import { usePartySession, usePartySnapshot } from "@/services/party/PartySession";
import BearAvatar from "@/components/avatar/BearAvatar";
import { generateRandomBearConfig } from "@/services/avatar/bearAvatar";
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

const bearCache = new Map<string, ReturnType<typeof generateRandomBearConfig>>();
function bearFor(userId: string) {
  let c = bearCache.get(userId);
  if (!c) {
    c = generateRandomBearConfig("neutral", userId);
    bearCache.set(userId, c);
  }
  return c;
}

export function AppHeader({ showSearch = true, onSearchPress, style }: Props) {
  const { request, userId, setTrayOpen } = usePartySession();
  const code = usePartySnapshot((s) => s?.code ?? null);
  const live = !!request && !!code;
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
          /* Room presence, not a status readout. Lead with WHO (the bear), the
             code second, and on the app's normal elevated surface — the honey
             outline made it read as a debug badge. Tapping raises the tray, so
             you stay where you are instead of being thrown into the room. */
          <Pressable
            style={({ pressed }) => [styles.roomChip, pressed && pressedStyle]}
            onPress={() => setTrayOpen(true)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Watch party ${code}`}
          >
            {userId ? <BearAvatar config={bearFor(userId)} size={ms(24)} /> : null}
            <Text variant="label" style={styles.roomChipText}>
              {code}
            </Text>
            <Ionicons name="chevron-down" size={ms(13)} color={colors.textDim} />
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
    gap: ms(7),
    paddingLeft: ms(5),
    paddingRight: ms(10),
    height: layout.headerControl,
    borderRadius: radius.pill,
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  roomChipText: { color: colors.text, fontSize: ms(12), letterSpacing: 0.8 },
});

export default AppHeader;
