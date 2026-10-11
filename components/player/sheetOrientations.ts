import type { ModalProps } from "react-native";

/**
 * Sheets over the player present in whatever orientation the player is in. An RN Modal allows only portrait by
 * default, and iOS aborts the app when it is asked to present one over a landscape screen.
 */
export const PLAYER_SHEET_ORIENTATIONS: NonNullable<ModalProps["supportedOrientations"]> = ["portrait", "landscape-left", "landscape-right"];
