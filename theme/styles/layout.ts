import { Dimensions } from "react-native";
import { ms, spacing } from "../bearoom";

const { width: SCREEN_W } = Dimensions.get("window");

export const layout = {
  screenPadding: spacing.lg,
  railGap: ms(10),
  sectionGap: spacing.xl,
  posterAspect: 1.5,
  gridGap: ms(12),
  screenWidth: SCREEN_W,
  headerControl: ms(36),
  iconButton: ms(40),
} as const;

/** Poster grid column width for N columns with screen padding + gaps. */
export function gridColumnWidth(
  cols: number,
  pad: number = layout.screenPadding,
  gap: number = layout.gridGap,
): number {
  return Math.floor((SCREEN_W - pad * 2 - gap * (cols - 1)) / cols);
}

/**
 * `position: absolute` with zero insets, as a plain object — spreadable on every RN
 * version. `StyleSheet.absoluteFillObject` is removed in RN 0.85, and
 * `StyleSheet.absoluteFill` is typed as a registered style (not spreadable) before that.
 */
export const absoluteFill = { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } as const;
