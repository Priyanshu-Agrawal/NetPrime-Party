/**
 * Screen — edge-to-edge base wrapper with warm charcoal background + safe area.
 */
import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { surfaces } from "@/theme/styles/surfaces";

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
  bg: surfaces.screen,
  safe: { flex: 1 },
});

export default Screen;
