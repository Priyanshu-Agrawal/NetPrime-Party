/**
 * Home preferences — Settings › Preferences › Home. Currently a single toggle for
 * the personalized "Because you've been watching" rail; a place to grow future
 * home-feed toggles.
 */
import { LibraryScreenHeader, Screen, Text } from "@/src/ui";
import { getPersonalRecs, setPersonalRecs } from "@/utils/prefs";
import { colors, ms, radius, spacing } from "@/theme/bearoom";
import React, { useState } from "react";
import { StyleSheet, Switch, View } from "react-native";

export default function HomePrefsScreen() {
  const [personalRecs, setPersonalRecsState] = useState(getPersonalRecs());

  const toggle = (v: boolean) => {
    setPersonalRecsState(v);
    setPersonalRecs(v);
  };

  return (
    <Screen edges={["top"]}>
      <LibraryScreenHeader title="Home" />
      <View style={styles.body}>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.label}>Recommended for you</Text>
              <Text variant="caption" style={styles.sub}>
                Show the “Because you’ve been watching” rail on Home, built from your recent watches.
              </Text>
            </View>
            <Switch
              value={personalRecs}
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
