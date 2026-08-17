/**
 * useCollapsingHeader — scroll-driven auto-hiding sticky header helpers.
 */
import {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

export function useCollapsingHeader(headerHeight: number) {
  const scrollY = useSharedValue(0);
  const lastY = useSharedValue(0);
  const shown = useSharedValue(1);

  const scrollHandler = useAnimatedScrollHandler((e) => {
    const y = e.contentOffset.y;
    const dy = y - lastY.value;
    if (y <= 6) shown.value = 1;
    else if (dy > 6) shown.value = 0;
    else if (dy < -6) shown.value = 1;
    lastY.value = y;
    scrollY.value = y;
  });

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: withTiming(shown.value ? 0 : -headerHeight, { duration: 220 }) }],
    opacity: withTiming(shown.value ? 1 : 0, { duration: 200 }),
  }));

  return { scrollHandler, barStyle, scrollY };
}

export function useFadeInStyle(scrollY: SharedValue<number>, start: number, end: number) {
  return useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [start, end], [0, 1], Extrapolation.CLAMP),
  }));
}
