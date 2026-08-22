import * as Haptics from "expo-haptics";
import React, { ReactNode } from "react";
import { GestureResponderEvent, Pressable, PressableProps, StyleProp, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

type AnimatedPressableProps = Omit<PressableProps, "style" | "children"> & {
  children: ReactNode | ((state: { pressed: boolean }) => ReactNode);
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  scaleTo?: number;
  haptic?: Haptics.ImpactFeedbackStyle | null;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function BouncyPressable({
  children,
  style,
  scaleTo = 1.03,
  haptic = Haptics.ImpactFeedbackStyle.Light,
  onPressIn,
  onPressOut,
  disabled,
  ...props
}: AnimatedPressableProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = (e: GestureResponderEvent) => {
    if (disabled) return;
    scale.value = withSpring(scaleTo, { damping: 14, stiffness: 200, mass: 0.5 });
    if (haptic) {
      Haptics.impactAsync(haptic).catch(() => {});
    }
    onPressIn?.(e);
  };

  const handlePressOut = (e: GestureResponderEvent) => {
    if (disabled) return;
    scale.value = withSpring(1, { damping: 14, stiffness: 200, mass: 0.5 });
    onPressOut?.(e);
  };

  const resolvedStyle = typeof style === "function" ? style({ pressed: false }) : style;

  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[resolvedStyle, animatedStyle]}
      {...props}
    >
      {children}
    </AnimatedPressable>
  );
}

export default BouncyPressable;
