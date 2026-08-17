import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { colors, ms, radius, spacing } from "@/theme/bearoom";
import { pressedStyle } from "@/theme/styles/interaction";
import { Text } from "./Text";

type Tone = "default" | "accent" | "muted";

interface Props {
  label: string;
  tone?: Tone;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  style?: ViewStyle;
}

export function Badge({ label, tone = "default", icon, onPress, style }: Props) {
  const content = (
    <>
      {icon ? (
        <Ionicons
          name={icon}
          size={ms(13)}
          color={tone === "accent" ? colors.onHoney : colors.textDim}
        />
      ) : null}
      <Text
        variant="caption"
        style={[
          styles.text,
          tone === "accent" && styles.textAccent,
          tone === "muted" && styles.textMuted,
        ]}
      >
        {label}
      </Text>
    </>
  );

  const shell = [
    styles.base,
    tone === "default" && styles.default,
    tone === "accent" && styles.accent,
    tone === "muted" && styles.muted,
    style,
  ];

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [shell, pressed && pressedStyle]}>
        <View style={styles.row}>{content}</View>
      </Pressable>
    );
  }

  return (
    <View style={shell}>
      <View style={styles.row}>{content}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: ms(6),
    borderRadius: radius.pill,
  },
  row: { flexDirection: "row", alignItems: "center", gap: ms(5) },
  default: {
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  accent: { backgroundColor: colors.honey },
  muted: { backgroundColor: colors.surface },
  text: { color: colors.textDim },
  textAccent: { color: colors.onHoney, fontFamily: "Inter_600SemiBold" },
  textMuted: { color: colors.textFaint },
});

export default Badge;
