/**
 * HoneyButton — the primary Bearoom action. Solid honey pill with a soft glow
 * (variant "honey"), a frosted secondary ("glass"), or a bare "ghost".
 */
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { colors, font, glow, radius } from "@/theme/bearoom";

type Variant = "honey" | "glass" | "ghost";

interface Props {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  full?: boolean;
  glowing?: boolean;
  style?: ViewStyle;
}

export function HoneyButton({
  label,
  onPress,
  variant = "honey",
  icon,
  disabled,
  loading,
  full,
  glowing = true,
  style,
}: Props) {
  const isHoney = variant === "honey";
  const fg = isHoney ? colors.onHoney : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        full && { alignSelf: "stretch" },
        isHoney && styles.honey,
        variant === "glass" && styles.glass,
        variant === "ghost" && styles.ghost,
        isHoney && glowing && !disabled ? glow.honey : null,
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
          <Text style={[styles.label, { color: fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: radius.pill,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  honey: { backgroundColor: colors.honey },
  glass: {
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  ghost: { backgroundColor: "transparent" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: { fontFamily: font.headlineSemi, fontSize: 16 },
});

export default HoneyButton;
