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
