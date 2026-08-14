/**
 * Join a Watch Party — enter the host's short room code to join. The guest
 * learns what + where to play from the host's broadcast once connected, so only
 * the code is needed here.
 *
 * Cozy cinema-lounge skin (Stitch "Bearoom Join"): paw hero in a honey ring, a
 * segmented code field, a glowing "Join Party" pill, and a secondary path to
 * host your own room. Responsive via ms() so small phones stay proportional.
 */
import GlassIconButton from "@/components/ui/GlassIconButton";
import HoneyButton from "@/components/ui/HoneyButton";
import { colors, font, glow, ms, radius } from "@/theme/bearoom";
import { normalizeRoomCode } from "@/utils/roomCode";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const CODE_LEN = 6;

export default function JoinParty() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [code, setCode] = React.useState("");
  const inputRef = useRef<TextInput>(null);
  const valid = code.length >= 4;

  // Auto-focus the (invisible) field so the keyboard is ready immediately.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, []);

  const join = () => {
    if (!valid) return;
    router.replace({ pathname: "/party", params: { role: "guest", room: code } });
  };

  // "Host your own room" → back to browsing; a title's "Watch together" starts
  // the host party. (Hosting is content-first, so we send them to pick a title.)
  const host = () => router.replace("/(tabs)");

  const cells = Array.from({ length: CODE_LEN }, (_, i) => i);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Faint honey wash pooling at the top, like the design's radial glow. */}
      <LinearGradient
        colors={["rgba(240,169,60,0.08)", "transparent"]}
        style={styles.topGlow}
        pointerEvents="none"
      />

      <View style={[styles.bar, { paddingTop: insets.top + ms(6) }]}>
        <GlassIconButton onPress={() => router.back()} size={40}>
          <Ionicons name="chevron-back" size={ms(22)} color={colors.text} />
        </GlassIconButton>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.body}
      >
        {/* Paw hero */}
        <View style={styles.heroWrap}>
          <View style={styles.heroGlow} />
          <View style={styles.heroRing}>
            <Ionicons name="paw" size={ms(44)} color={colors.honey} />
          </View>
        </View>

        <Text style={styles.title}>Join the watch party</Text>
        <Text style={styles.subtitle}>Enter the room code your pack shared with you.</Text>

        {/* Segmented code field — a single hidden input drives the cells. */}
        <Pressable style={styles.cellRow} onPress={() => inputRef.current?.focus()}>
          {cells.map((i) => {
            const char = code[i] ?? "";
            const active = i === Math.min(code.length, CODE_LEN - 1);
            return (
              <View
                key={i}
                style={[
                  styles.cell,
                  char ? styles.cellFilled : null,
                  active ? styles.cellActive : null,
                ]}
              >
                {char ? (
                  <Text style={styles.cellText}>{char}</Text>
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

        <HoneyButton
          label="Join Party"
          onPress={join}
          disabled={!valid}
          full
          style={styles.joinBtn}
        />

        <Pressable onPress={host} hitSlop={8} style={styles.hostLink}>
          <Text style={styles.hostText}>or Host your own room</Text>
          <Ionicons name="arrow-forward" size={ms(15)} color={colors.honey} />
        </Pressable>
      </KeyboardAvoidingView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + ms(14) }]}>
        <Ionicons name="sync" size={ms(13)} color={colors.textFaint} />
        <Text style={styles.footerText}>Watch in perfect sync</Text>
        <Text style={styles.footerDot}>•</Text>
        <Text style={styles.footerText}>free</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topGlow: { position: "absolute", top: 0, left: 0, right: 0, height: ms(260) },
  bar: { paddingHorizontal: ms(12), paddingBottom: ms(8) },

  body: { flex: 1, alignItems: "center", paddingHorizontal: ms(28), justifyContent: "center", marginTop: -ms(40) },

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

  title: {
    color: colors.text,
    fontFamily: font.headlineXbold,
    fontSize: ms(28),
    textAlign: "center",
  },
  subtitle: {
    color: colors.textDim,
    fontFamily: font.body,
    fontSize: ms(14),
    lineHeight: ms(20),
    textAlign: "center",
    marginTop: ms(8),
    marginBottom: ms(28),
    maxWidth: ms(300),
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
  cellText: { color: colors.text, fontFamily: font.headlineXbold, fontSize: ms(26) },
  caret: { width: 2, height: ms(28), borderRadius: 1, backgroundColor: colors.honey },
  hiddenInput: { position: "absolute", opacity: 0, width: 1, height: 1 },

  joinBtn: { alignSelf: "stretch", marginTop: ms(32) },
  hostLink: { flexDirection: "row", alignItems: "center", gap: ms(6), marginTop: ms(18), paddingVertical: ms(6) },
  hostText: { color: colors.honey, fontFamily: font.label, fontSize: ms(15) },

  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: ms(6),
  },
  footerText: { color: colors.textFaint, fontFamily: font.bodyMed, fontSize: ms(12) },
  footerDot: { color: colors.textFaint, fontSize: ms(12) },
});
