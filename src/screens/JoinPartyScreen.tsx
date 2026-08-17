/**
 * Join a Watch Party — enter the host's short room code to join.
 */
import type { RootNavigation } from "@/src/navigation/helpers";
import { Button, IconButton, Text } from "@/src/ui";
import { colors, glow, ms, radius, spacing } from "@/theme/bearoom";
import { gradients } from "@/theme/styles/gradients";
import { layout } from "@/theme/styles/layout";
import { pressedStyle } from "@/theme/styles/interaction";
import { normalizeRoomCode } from "@/utils/roomCode";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import React, { useRef, useState } from "react";
import { Keyboard, Pressable, StyleSheet, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const CODE_LEN = 6;

export default function JoinParty() {
  const navigation = useNavigation<RootNavigation>();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const valid = code.length >= 4;

  const join = () => {
    if (!valid) return;
    navigation.replace("Party", { role: "guest", room: code });
  };

  const host = () => navigation.replace("MainTabs");
  const cells = Array.from({ length: CODE_LEN }, (_, i) => i);

  return (
    <View style={styles.root}>
      <LinearGradient colors={[...gradients.joinPartyGlow]} style={styles.topGlow} pointerEvents="none" />

      <View style={[styles.bar, { paddingTop: insets.top + spacing.sm - 2 }]}>
        <IconButton onPress={() => navigation.goBack()} size={layout.iconButton}>
          <Ionicons name="chevron-back" size={ms(22)} color={colors.text} />
        </IconButton>
      </View>

      <KeyboardAvoidingView
        style={[styles.scroll, styles.body]}
        behavior="padding"
        removeClippedSubviews
        onTouchStart={() => Keyboard.dismiss()}
      >
        <View style={styles.heroWrap}>
          <View style={styles.heroGlow} />
          <View style={styles.heroRing}>
            <Ionicons name="paw" size={ms(44)} color={colors.honey} />
          </View>
        </View>

        <Text variant="display" style={styles.title}>
          Join the watch party
        </Text>
        <Text variant="bodyDim" style={styles.subtitle}>
          Enter the room code your pack shared with you.
        </Text>

        <Pressable style={styles.cellRow} onPress={() => inputRef.current?.focus()}>
          {cells.map((i) => {
            const char = code[i] ?? "";
            const active = focused && i === Math.min(code.length, CODE_LEN - 1);
            return (
              <View
                key={i}
                style={[styles.cell, char ? styles.cellFilled : null, active ? styles.cellActive : null]}
              >
                {char ? (
                  <Text variant="display" style={styles.cellText}>
                    {char}
                  </Text>
                ) : active ? (
                  <View style={styles.caret} />
                ) : null}
              </View>
            );
          })}
          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={(t) => setCode(normalizeRoomCode(t).slice(0, CODE_LEN))}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={styles.hiddenInput}
            keyboardType="visible-password"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={CODE_LEN}
            caretHidden
            returnKeyType="go"
            onSubmitEditing={join}
          />
        </Pressable>

        <Button label="Join Party" onPress={join} disabled={!valid} full style={styles.joinBtn} />

        <Pressable onPress={host} hitSlop={8} style={({ pressed }) => [styles.hostLink, pressed && pressedStyle]}>
          <Text variant="label" honey>
            or Host your own room
          </Text>
          <Ionicons name="arrow-forward" size={ms(15)} color={colors.honey} />
        </Pressable>
      </KeyboardAvoidingView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + ms(14) }]}>
        <Ionicons name="sync" size={ms(13)} color={colors.textFaint} />
        <Text variant="caption">Watch in perfect sync</Text>
        <Text variant="caption" style={styles.footerDot}>
          •
        </Text>
        <Text variant="caption">free</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topGlow: { position: "absolute", top: 0, left: 0, right: 0, height: ms(260) },
  bar: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },

  scroll: { flex: 1 },
  body: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: spacing.xxl + 8,
    justifyContent: "center",
    marginTop: -ms(40),
  },

  heroWrap: { alignItems: "center", justifyContent: "center", marginBottom: ms(22) },
  heroGlow: {
    position: "absolute",
    width: ms(150),
    height: ms(150),
    borderRadius: radius.pill,
    backgroundColor: colors.honeyGlow,
    opacity: 0.28,
  },
  heroRing: {
    width: ms(104),
    height: ms(104),
    borderRadius: radius.pill,
    backgroundColor: colors.honeySoft,
    borderWidth: 1.5,
    borderColor: colors.honey,
    alignItems: "center",
    justifyContent: "center",
    ...glow.honey,
  },

  title: { fontSize: ms(28), textAlign: "center" },
  subtitle: {
    textAlign: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.xxl + 8,
    maxWidth: ms(300),
    fontSize: ms(14),
    lineHeight: ms(20),
  },

  cellRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(9),
    alignSelf: "stretch",
    justifyContent: "center",
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: ms(58),
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cellFilled: { backgroundColor: colors.surfaceStrong, borderColor: colors.borderStrong },
  cellActive: { borderColor: colors.honey, borderWidth: 1.5, backgroundColor: colors.honeySoft },
  cellText: { fontSize: ms(26) },
  caret: { width: 2, height: ms(28), borderRadius: 1, backgroundColor: colors.honey },
  hiddenInput: { position: "absolute", opacity: 0, width: 1, height: 1 },

  joinBtn: { alignSelf: "stretch", marginTop: spacing.xxxl },
  hostLink: { flexDirection: "row", alignItems: "center", gap: spacing.sm - 2, marginTop: ms(18), paddingVertical: spacing.sm - 2 },

  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm - 2,
  },
  footerDot: { color: colors.textFaint },
});
