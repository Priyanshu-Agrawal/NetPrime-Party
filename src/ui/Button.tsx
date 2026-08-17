import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { colors, font, glow, ms, radius, spacing } from "@/theme/bearoom";
import { disabledStyle, pressedStyle } from "@/theme/styles/interaction";
import { Text } from "./Text";

type Variant = "honey" | "glass" | "ghost" | "danger";

interface Props {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  full?: boolean;
  glowing?: boolean;
  size?: "md" | "sm" | "xs";
  style?: ViewStyle;
}

export function Button({
  label,
  onPress,
  variant = "honey",
  icon,
  disabled,
  loading,
  full,
  glowing = true,
  size = "md",
  style,
}: Props) {
  const isHoney = variant === "honey";
  const isDanger = variant === "danger";
  const fg = isHoney || isDanger ? colors.onHoney : colors.text;
  const height = size === "xs" ? ms(34) : size === "sm" ? ms(40) : ms(52);
  const iconSize = size === "xs" ? ms(15) : ms(18);
  const textVariant = size === "md" ? "h3" : "label";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        size === "xs" && styles.xs,
        { height },
        full && styles.full,
        isHoney && styles.honey,
        isDanger && styles.danger,
        variant === "glass" && styles.glass,
        variant === "ghost" && styles.ghost,
        isHoney && glowing && !disabled ? glow.honey : null,
        (disabled || loading) && disabledStyle,
        pressed && pressedStyle,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={iconSize} color={fg} /> : null}
          <Text
            variant={textVariant}
            style={[styles.label, size === "xs" && styles.labelXs, { color: fg }]}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  xs: { paddingHorizontal: spacing.md },
  full: { alignSelf: "stretch" },
  honey: { backgroundColor: colors.honey },
  danger: { backgroundColor: colors.danger },
  glass: {
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  ghost: { backgroundColor: "transparent" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  label: { fontFamily: font.headlineSemi, fontSize: ms(16) },
  labelXs: { fontSize: ms(13) },
});

export default Button;
