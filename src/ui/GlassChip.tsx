/**
 * GlassChip — compact frosted pill for metadata on hero slides and poster cards.
 * blur={true} for hero (few instances); blur={false} for poster grids (perf).
 */
import { Ionicons } from "@expo/vector-icons";
import { Frost } from "./Frost";
import React from "react";
import { Platform, StyleSheet, View, type ViewStyle } from "react-native";
import { colors, font, glass, ms, radius, spacing } from "@/theme/bearoom";
import { Text } from "./Text";

interface Props {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  blur?: boolean;
  size?: "sm" | "md";
  style?: ViewStyle;
}

export function GlassChip({
  label,
  icon,
  iconColor = colors.honey,
  blur = false,
  size = "md",
  style,
}: Props) {
  const sm = size === "sm";
  const shell = [
    styles.base,
    sm ? styles.baseSm : styles.baseMd,
    !blur && styles.solid,
    style,
  ];

  return (
    <View style={shell}>
      {blur ? (
        <>
          <Frost intensity={glass.intensity} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, styles.blurScrim]} />
          <View style={[StyleSheet.absoluteFill, styles.blurTint]} />
        </>
      ) : null}
      <View style={styles.row}>
        {icon ? (
          <Ionicons name={icon} size={sm ? ms(9) : ms(12)} color={iconColor} />
        ) : null}
        <Text
          variant="caption"
          style={[styles.label, sm ? styles.labelSm : styles.labelMd]}
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: "hidden",
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassChipBorder,
  },
  baseSm: {
    paddingHorizontal: ms(6),
    paddingVertical: ms(3),
  },
  baseMd: {
    paddingHorizontal: spacing.md,
    paddingVertical: ms(6),
  },
  solid: {
    backgroundColor: colors.glassChipBg,
  },
  blurScrim: {
    backgroundColor: colors.glassChipBg,
  },
  blurTint: {
    backgroundColor: colors.glassChipTint,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(3),
  },
  label: {
    color: colors.text,
    fontFamily: font.bodySemi,
  },
  labelSm: {
    fontSize: ms(10),
    letterSpacing: 0.3,
  },
  labelMd: {
    fontSize: ms(13),
  },
});

export default GlassChip;
