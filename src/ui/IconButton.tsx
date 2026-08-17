import { colors, ms, radius } from "@/theme/bearoom";
import { layout } from "@/theme/styles/layout";
import { BlurView } from "expo-blur";
import React from "react";
import { Platform, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { pressedStyle } from "@/theme/styles/interaction";

interface Props {
  onPress?: () => void;
  children: React.ReactNode;
  intensity?: number;
  size?: number;
  style?: ViewStyle;
}

export function IconButton({
  onPress,
  children,
  intensity = 55,
  size = layout.iconButton,
  style,
}: Props) {
  const d = ms(size);
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.btn,
        { width: d, height: d },
        pressed && pressedStyle,
        style,
      ]}
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

/** @deprecated Use IconButton */
export const GlassIconButton = IconButton;

const styles = StyleSheet.create({
  btn: {
    borderRadius: radius.pill,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  tint: { backgroundColor: colors.overlay },
});

export default IconButton;
