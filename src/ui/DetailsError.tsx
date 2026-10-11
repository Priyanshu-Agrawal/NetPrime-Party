/**
 * DetailsError — a details screen that couldn't load: a way back, what happened in plain words, and a retry.
 * Never a dead end (it used to be a raw "fetch failed: …" line with no back button).
 */
import { colors, ms, spacing } from "@/theme/bearoom";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "./Button";
import { IconButton } from "./IconButton";
import { Text } from "./Text";

interface Props {
  /** What failed to load, as it reads in a sentence ("this title"). */
  what: string;
  onBack: () => void;
  onRetry: () => void;
}

export function DetailsError({ what, onBack, onRetry }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <View style={[styles.header, { marginTop: Math.max(insets.top, ms(16)) }]}>
        <IconButton onPress={onBack} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </IconButton>
      </View>
      <View style={styles.body}>
        <Ionicons name="cloud-offline-outline" size={ms(44)} color={colors.textFaint} />
        <Text variant="bodyDim" style={styles.message}>
          {`Couldn't load ${what}. Check your connection and try again.`}
        </Text>
        <Button label="Try again" onPress={onRetry} variant="glass" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg },
  body: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, paddingHorizontal: spacing.xl },
  message: { textAlign: "center" },
});

export default DetailsError;
