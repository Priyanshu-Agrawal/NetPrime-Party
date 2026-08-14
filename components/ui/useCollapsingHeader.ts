/**
 * useCollapsingHeader — a scroll-driven auto-hiding sticky header.
 *
 * Wire `scrollHandler` to an Animated.ScrollView's onScroll (throttle 16), wrap
 * the header in an Animated.View with `barStyle` (it slides up when the user
 * scrolls DOWN and slides back in when they scroll UP or reach the top), and use
 * `scrollY` to cross-fade a solid/blur background + a title as the hero scrolls
 * past. Keeps the header persistent (back button always reachable) without it
 * eating vertical space while reading.
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
    if (y <= 6) shown.value = 1; // always visible at the very top
    else if (dy > 6) shown.value = 0; // scrolling down → hide
    else if (dy < -6) shown.value = 1; // scrolling up → show
    lastY.value = y;
    scrollY.value = y;
  });

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: withTiming(shown.value ? 0 : -headerHeight, { duration: 220 }) }],
    opacity: withTiming(shown.value ? 1 : 0, { duration: 200 }),
  }));

  return { scrollHandler, barStyle, scrollY };
}

/** Fade a value in as the user scrolls through [start, end]. */
export function fadeInStyle(scrollY: SharedValue<number>, start: number, end: number) {
  return useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [start, end], [0, 1], Extrapolation.CLAMP),
  }));
}
