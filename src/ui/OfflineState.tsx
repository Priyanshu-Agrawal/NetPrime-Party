/**
 * OfflineState — full-screen "No internet" page for browse surfaces (Home,
 * Search, catalog grids) when the device is offline AND there's nothing cached
 * to show. It replaces a screen full of broken/empty rails: a clear message +
 * one "Try again" action, auto-recovering when connectivity returns (the retry
 * re-runs the screen's fetch).
 *
 * Not for the player/party — those manage their own offline handling. When the
 * app DOES have content loaded and the connection merely drops, the slim
 * ConnectivityBanner covers that transient case instead (see ConnectivityBanner).
 */
import { colors, font, ms, radius, spacing } from "@/theme/bearoom";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Props {
  /** Re-run the screen's fetch (and/or re-check connectivity). */
  onRetry: () => void;
  /** true = device offline (default); false = connected but the fetch failed. */
  offline?: boolean;
  /** Optional override for the subtitle line. */
  message?: string;
}

export function OfflineState({ onRetry, offline = true, message }: Props) {
  const insets = useSafeAreaInsets();
  const title = offline ? "No internet connection" : "Couldn't load your feed";
  const subtitle =
    message ??
    (offline
      ? "Check your connection and try again — your feed loads the moment you're back online."
      : "Something went wrong loading the feed. Pull down to refresh, or try again.");
  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.center}>
        <View style={styles.iconWrap}>
          <Ionicons
            name={offline ? "cloud-offline" : "alert-circle-outline"}
            size={ms(40)}
            color={colors.honey}
          />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <Pressable
          onPress={() => {
            void Haptics.selectionAsync();
            onRetry();
          }}
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
          hitSlop={8}
        >
          <Ionicons name="refresh" size={ms(16)} color={colors.onHoney} />
          <Text style={styles.btnText}>Try again</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xxxl,
    gap: ms(6),
  },
  iconWrap: {
    width: ms(84),
    height: ms(84),
    borderRadius: radius.pill,
    backgroundColor: colors.honeySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: ms(14),
  },
  title: {
    color: colors.text,
    fontFamily: font.headline,
    fontSize: ms(20),
    textAlign: "center",
  },
  subtitle: {
    color: colors.textDim,
    fontFamily: font.body,
    fontSize: ms(14),
    lineHeight: ms(20),
    textAlign: "center",
    maxWidth: ms(300),
    marginBottom: ms(20),
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(8),
    backgroundColor: colors.honey,
    paddingHorizontal: ms(22),
    paddingVertical: ms(12),
    borderRadius: radius.pill,
  },
  btnPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  btnText: { color: colors.onHoney, fontFamily: font.label, fontSize: ms(15) },
});

export default OfflineState;
