/**
 * BrandWordmark — Bearoom logotype with honey "r" (same weight/size as surrounding letters).
 */
import { colors, font, ms } from "@/theme/bearoom";
import React from "react";
import { Image, StyleSheet, Text, View, type TextStyle } from "react-native";

interface Props {
  size?: number;
  /** Show the Bearoom mark to the left of the logotype. */
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
        <Image
          source={require("../../assets/images/brandmark.png")}
          style={{ width: size * 1.2, height: size * 1.2, marginRight: size * 0.3 }}
          resizeMode="contain"
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
