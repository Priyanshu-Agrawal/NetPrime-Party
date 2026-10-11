/**
 * Playback & data — Settings › Preferences. The title page's language check (spec §6.1) skips mobile data unless the
 * viewer allows it here.
 */
import { LibraryScreenHeader, Screen, Text } from "@/src/ui";
import { colors, ms, radius, spacing } from "@/theme/bearoom";
import { getPreviewOnMetered, setPreviewOnMetered } from "@/utils/prefs";
import React, { useState } from "react";
import { StyleSheet, Switch, View } from "react-native";

export default function PlaybackPrefsScreen() {
  const [onMetered, setOnMetered] = useState(getPreviewOnMetered());

  const toggle = (v: boolean) => {
    setOnMetered(v);
    setPreviewOnMetered(v);
  };

  return (
    <Screen edges={["top"]}>
      <LibraryScreenHeader title="Playback & data" />
      <View style={styles.body}>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.label}>Check languages on mobile data</Text>
              <Text variant="caption" style={styles.sub}>
                Title pages look up which languages a film is in before you press Play. Off saves data.
              </Text>
            </View>
            <Switch
              value={onMetered}
              onValueChange={toggle}
              trackColor={{ false: colors.surfaceStrong, true: colors.honey }}
              thumbColor={colors.text}
              ios_backgroundColor={colors.surfaceStrong}
            />
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: ms(16), paddingTop: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rowText: { flex: 1, gap: ms(2) },
  label: { fontSize: ms(15) },
  sub: { lineHeight: ms(16) },
});
