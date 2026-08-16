/**
 * GlassButton — a frosted-glass Pressable for header / chat control buttons that
 * sit over the app background (NOT over the video: a live blur over playing video
 * stutters it — see PlayerControls). Shape/size come from the `style` prop, so it
 * works for round icon buttons AND wider pills; the BlurView is clipped to the
 * rounded shape by overflow:hidden.
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
  // overflow:hidden clips the blur to the rounded shape; the passed style adds size.
  btn: {
    borderRadius: radius.pill,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.7 },
  // Faint dark wash over the blur so light icons/text keep contrast.
  tint: { backgroundColor: "rgba(16,13,10,0.30)" },
});

export default GlassButton;
