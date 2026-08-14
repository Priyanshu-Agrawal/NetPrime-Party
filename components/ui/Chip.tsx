/**
 * Chip — a rounded pill. Active = honey-outlined with a honey tint + honey text;
 * inactive = frosted surface with dim text. Used for filters, genres, tags.
 */
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, type ViewStyle } from "react-native";
import { colors, font, radius } from "@/theme/bearoom";

interface Props {
  label: string;
  active?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  style?: ViewStyle;
}

export function Chip({ label, active, icon, onPress, style }: Props) {
  const fg = active ? colors.honey : colors.textDim;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active ? styles.active : styles.inactive,
        pressed && { opacity: 0.8 },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={14} color={fg} /> : null}
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  active: { backgroundColor: colors.honeySoft, borderColor: colors.honey },
  inactive: { backgroundColor: colors.surfaceStrong, borderColor: colors.border },
  label: { fontFamily: font.label, fontSize: 13 },
});

export default Chip;
