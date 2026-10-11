/** Dev-only list of public test streams that open in the native player (spec §6.2.2). */
import { streamsFor } from "@/src/features/dev/testStreams";
import { useTestStreamsEnabled } from "@/src/features/dev/testStreamsGate";
import { openNativePlayer } from "@/src/navigation/actions";
import { IconButton } from "@/src/ui";
import { colors, font, ms, radius, spacing } from "@/theme/bearoom";
import { pressedStyle } from "@/theme/styles/interaction";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TestStreamsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const enabled = useTestStreamsEnabled();
  const streams = streamsFor(Platform.OS === "ios" ? "ios" : "android");

  return (
    <View style={[styles.root, { paddingTop: insets.top + ms(8) }]}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <IconButton accessibilityLabel="Go back" onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={ms(22)} color={colors.text} />
        </IconButton>
        <Text style={styles.title}>Test streams</Text>
      </View>
      {enabled ? (
        <FlatList
          data={streams}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: insets.bottom + spacing.lg }}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Play ${item.title}`}
              style={({ pressed }) => [styles.row, pressed && pressedStyle]}
              onPress={() => openNativePlayer({ streamId: item.id, startedAt: Date.now() })}
            >
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowNote}>{item.note}</Text>
            </Pressable>
          )}
        />
      ) : (
        <Text style={styles.off}>Test streams are switched off.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", gap: ms(12), paddingHorizontal: spacing.lg },
  title: { color: colors.text, fontFamily: font.headline, fontSize: ms(20) },
  row: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    gap: ms(4),
  },
  rowTitle: { color: colors.text, fontFamily: font.headlineSemi, fontSize: ms(15) },
  rowNote: { color: colors.textDim, fontFamily: font.body, fontSize: ms(12) },
  off: { color: colors.textDim, fontFamily: font.body, fontSize: ms(14), padding: spacing.lg },
});
