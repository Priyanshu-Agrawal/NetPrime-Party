/**
 * GlassButton — frosted-glass Pressable for controls over the app background.
 */
import { colors, radius } from "@/theme/bearoom";
import { BlurView } from "expo-blur";
import React from "react";
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

interface Props {
  onPress?: () => void;
  children: React.ReactNode;
  intensity?: number;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  hitSlop?: number;
}

export function GlassButton({ onPress, children, intensity = 42, style, disabled, hitSlop = 6 }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      style={({ pressed }) => [styles.btn, style, pressed && styles.pressed]}
    >
      <BlurView
        intensity={intensity}
        tint="dark"
        experimentalBlurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, styles.tint]} />
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: radius.pill,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.7 },
  tint: { backgroundColor: colors.overlay },
});

export default GlassButton;
