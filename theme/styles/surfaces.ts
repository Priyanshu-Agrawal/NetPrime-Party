import { StyleSheet, type ViewStyle } from "react-native";
import { colors, radius } from "../bearoom";

export const surfaces = {
  screen: { flex: 1, backgroundColor: colors.bg } satisfies ViewStyle,
  hairline: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border } satisfies ViewStyle,
  glassBase: {
    borderRadius: radius.xl,
    overflow: "hidden" as const,
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  } satisfies ViewStyle,
  modalBackdrop: { backgroundColor: colors.modalBackdrop } satisfies ViewStyle,
  modalScrim: { backgroundColor: colors.overlayStrong } satisfies ViewStyle,
  player: { flex: 1, backgroundColor: colors.playerBg } satisfies ViewStyle,
} as const;

