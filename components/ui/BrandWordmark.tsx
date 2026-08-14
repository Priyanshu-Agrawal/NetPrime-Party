/**
 * BrandWordmark — the Bearoom logotype: "Bea·r·oom" with the pivot "r" in honey
 * (the shared letter of "Bea[r]" + "[r]oom" — the bear hiding in the room).
 * Solid honey "r" is used everywhere small (app bar, launcher). A gradient "r"
 * for the large splash logo is a later addition (needs MaskedView).
 */
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";
import { colors, font } from "@/theme/bearoom";

interface Props {
  size?: number;
  showPaw?: boolean;
  style?: TextStyle;
}

export function BrandWordmark({ size = 24, showPaw = true, style }: Props) {
  const base: TextStyle = {
    fontFamily: font.headlineXbold,
    fontSize: size,
    color: colors.text,
    letterSpacing: 0.3,
  };
  return (
    <View style={styles.row}>
      {showPaw ? (
        <Ionicons
          name="paw"
          size={size * 0.82}
          color={colors.honey}
          style={{ marginRight: size * 0.28 }}
        />
      ) : null}
      <Text style={[base, style]}>
        Bea<Text style={{ color: colors.honey }}>r</Text>oom
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
});

export default BrandWordmark;
