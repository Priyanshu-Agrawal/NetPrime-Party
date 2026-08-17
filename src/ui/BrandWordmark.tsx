/**
 * BrandWordmark — Bearoom logotype with honey "r" (same weight/size as surrounding letters).
 */
import { colors, font, ms } from "@/theme/bearoom";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";

interface Props {
  size?: number;
  showPaw?: boolean;
  style?: TextStyle;
}

export function BrandWordmark({ size = ms(22), showPaw = true, style }: Props) {
  const wordmark: TextStyle = {
    fontFamily: font.headlineXbold,
    fontSize: size,
    letterSpacing: 0.2,
    color: colors.text,
  };

  return (
    <View style={styles.row}>
      {showPaw ? (
        <Ionicons
          name="paw"
          size={size * 0.9}
          color={colors.honey}
          style={{ marginRight: size * 0.32 }}
        />
      ) : null}
      <Text style={[wordmark, style]}>
        Bea
        <Text style={[wordmark, styles.accent]}>r</Text>
        oom
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  accent: { color: colors.honey },
});

export default BrandWordmark;
