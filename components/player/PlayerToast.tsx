/**
 * One-line notice over the player (spec §6.3): a language change or source switch is never silent. Solid surface —
 * no blur or glow on a video screen.
 */
import { colors, font, ms, radius } from "@/theme/bearoom";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

export interface PlayerNotice {
  /** Changes for every new notice (restarts the clock). */
  id: number;
  message: string;
  action?: { label: string; onPress: () => void };
}

export const NOTICE_MS = 5000;

export function PlayerToast({ notice, onDone }: { notice: PlayerNotice | null; onDone: () => void }) {
  const [opacity] = useState(() => new Animated.Value(0));
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  const id = notice?.id;
  useEffect(() => {
    if (id == null) return;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const t = setTimeout(() => done.current(), NOTICE_MS);
    return () => clearTimeout(t);
  }, [id, opacity]);

  if (!notice) return null;
  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, { opacity }]}>
      <View style={styles.toast} accessibilityRole="alert" accessibilityLiveRegion="polite">
        <Text style={styles.text} numberOfLines={2}>
          {notice.message}
        </Text>
        {notice.action ? (
          <Pressable accessibilityRole="button" accessibilityLabel={notice.action.label} onPress={notice.action.onPress} style={styles.action} hitSlop={8}>
            <Text style={styles.actionText}>{`${notice.action.label} ▸`}</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Below the controls' top bar, so the back button stays reachable while a notice shows.
  wrap: { position: "absolute", top: ms(56), left: ms(12), right: ms(12), alignItems: "center" },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(10),
    maxWidth: ms(520),
    paddingVertical: ms(9),
    paddingHorizontal: ms(14),
    borderRadius: radius.pill,
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  text: { flexShrink: 1, color: colors.text, fontFamily: font.bodySemi, fontSize: ms(13) },
  action: { paddingHorizontal: ms(10), paddingVertical: ms(4), borderRadius: radius.pill, backgroundColor: colors.honeySoft },
  actionText: { color: colors.honey, fontFamily: font.label, fontSize: ms(12) },
});
