/**
 * Appear — entrance wrapper. Currently a NO-OP passthrough: it renders a plain
 * `View` with the given `style` and NO animation.
 *
 * WHY DISABLED: on this content-heavy app, animating entrances on mount competed
 * with data fetching + image decode + list rendering for the same frames, so the
 * entrances visibly stuttered in on real devices ("janky"). A dropped frame with
 * no animation is a single invisible hitch; the same dropped frames WITH an
 * entrance are drawn out as visible stutter. Disabling entrances keeps screen
 * mounts and navigation smooth. Layouts are unaffected — `style` (including the
 * hoisted full-width/flex styles some call sites pass) is preserved on the View,
 * so nothing shifts. The app's motion now lives where it's actually smooth:
 * native screen transitions, the tab-bar pill, and press feedback.
 *
 * The `index`/`variant`/`disabled` props are accepted (so no call site needs to
 * change) but ignored. If entrances are ever re-introduced, do it IMPERATIVELY
 * (shared value + withTiming) and re-verify smoothness on a RELEASE build — never
 * via Reanimated `entering=` layout animations, which also crash on the New
 * Architecture (see git history for the PropsRegistry crash).
 */
import React from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { View } from "react-native";

interface Props {
  children: React.ReactNode;
  /** Accepted for call-site compatibility; ignored while entrances are off. */
  index?: number;
  /** Accepted for call-site compatibility; ignored while entrances are off. */
  variant?: "rise" | "drop" | "fade";
  style?: StyleProp<ViewStyle>;
  /** Accepted for call-site compatibility; ignored while entrances are off. */
  disabled?: boolean;
}

export function Appear({ children, style }: Props) {
  return <View style={style}>{children}</View>;
}

export default Appear;
