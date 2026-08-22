import { goBack } from "@/src/navigation/actions";
import { IconButton } from "./IconButton";
import { Text } from "./Text";
import { colors, ms, spacing } from "@/theme/bearoom";
import { layout } from "@/theme/styles/layout";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";

export function LibraryScreenHeader({ title }: { title: string }) {
  return (
    <View style={styles.header}>
      <IconButton onPress={goBack} size={38}>
        <Ionicons name="chevron-back" size={ms(21)} color={colors.text} />
      </IconButton>
      <Text variant="h2">{title}</Text>
      <View style={{ width: ms(38) }} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingBottom: layout.railGap,
  },
});
