import { goBack } from "@/src/navigation/actions";
import type { RootNavigation } from "@/src/navigation/helpers";
import { Button, IconButton, Text, BouncyPressable } from "@/src/ui";
import { colors, glow, ms, radius, spacing, font } from "@/theme/bearoom";
import { gradients } from "@/theme/styles/gradients";
import { layout } from "@/theme/styles/layout";
import { normalizeRoomCode } from "@/utils/roomCode";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import React, { useRef, useState } from "react";
import { Keyboard, Pressable, StyleSheet, TextInput, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming, FadeIn } from "react-native-reanimated";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const CODE_LEN = 6;

export default function JoinParty() {
  const navigation = useNavigation<RootNavigation>();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState("");
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const valid = code.length >= 4;

  const shakeX = useSharedValue(0);

  const triggerError = (msg: string) => {
    setError(msg);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    shakeX.value = withSequence(
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 50 }),
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 50 }),
      withTiming(0, { duration: 50 })
    );
  };

  const join = () => {
    if (!valid) {
      triggerError(`Enter all ${CODE_LEN} digits`);
      return;
    }
    // The Party screen's join result drives "room not found"; no client-side stub.
    navigation.replace("Party", { role: "guest", room: code });
  };

  const host = () => navigation.replace("MainTabs");
  const cells = Array.from({ length: CODE_LEN }, (_, i) => i);

  const rShakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  return (
    <View style={styles.root}>
      <LinearGradient colors={[...gradients.joinPartyGlow]} style={styles.topGlow} pointerEvents="none" />

      <View style={[styles.bar, { paddingTop: insets.top + spacing.sm - 2 }]}>
        <IconButton onPress={goBack} size={layout.iconButton}>
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

        <Animated.View style={[styles.cellRow, rShakeStyle]}>
          <Pressable style={styles.cellRowInner} onPress={() => inputRef.current?.focus()}>
            {cells.map((i) => {
              const char = code[i] ?? "";
              const active = focused && i === Math.min(code.length, CODE_LEN - 1);
              return (
                <View
                  key={i}
                  style={[
                    styles.cell,
                    char ? styles.cellFilled : null,
                    active ? styles.cellActive : null,
                    error ? styles.cellError : null,
                  ]}
                >
                  {char ? (
                    <Text variant="display" style={[styles.cellText, error && styles.cellTextError]}>
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
              onChangeText={(t) => {
                setError(null);
                setCode(normalizeRoomCode(t).slice(0, CODE_LEN));
              }}
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
        </Animated.View>

        {error ? (
          <Animated.Text entering={FadeIn} style={styles.errorText}>
            {error}
          </Animated.Text>
        ) : (
          <View style={styles.errorPlaceholder} />
        )}

        <Button label="Join Party" onPress={join} disabled={!valid} full style={styles.joinBtn} />

        <BouncyPressable onPress={host} hitSlop={8} style={styles.hostLink}>
          <Text variant="label" honey>
            or browse to start a party
          </Text>
          <Ionicons name="arrow-forward" size={ms(15)} color={colors.honey} />
        </BouncyPressable>
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
  bar: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, zIndex: 10 },

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
    marginBottom: spacing.xxl,
    maxWidth: ms(300),
    fontSize: ms(14),
    lineHeight: ms(20),
  },

  cellRow: {
    alignSelf: "stretch",
  },
  cellRowInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(9),
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
  cellError: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  cellText: { fontSize: ms(26) },
  cellTextError: { color: colors.danger },
  caret: { width: 2, height: ms(28), borderRadius: 1, backgroundColor: colors.honey },
  hiddenInput: { position: "absolute", opacity: 0, width: 1, height: 1 },

  errorText: { color: colors.danger, fontSize: ms(14), fontFamily: font.bodyMed, marginTop: ms(12), textAlign: "center" },
  errorPlaceholder: { height: ms(14), marginTop: ms(12) },

  joinBtn: { alignSelf: "stretch", marginTop: spacing.xl },
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
