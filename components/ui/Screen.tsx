/**
 * Screen — the edge-to-edge base wrapper. Paints the warm charcoal background
 * full-bleed (behind the system bars on Android 15+ enforced edge-to-edge) and
 * applies safe-area insets on the requested edges. Hero/video screens pass
 * edges without "top" so content runs under the status bar; controls still get
 * the bottom inset.
 */
import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { colors } from "@/theme/bearoom";

interface Props {
  children: React.ReactNode;
  edges?: readonly Edge[];
  style?: ViewStyle;
}

export function Screen({ children, edges = ["top", "bottom"], style }: Props) {
  return (
    <View style={styles.bg}>
      <SafeAreaView edges={edges} style={[styles.safe, style]}>
        {children}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
});

export default Screen;
