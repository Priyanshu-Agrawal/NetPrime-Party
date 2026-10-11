/**
 * Frost — the old frosted-backdrop API, kept for callers that can't move (BearAlert, which must not be edited).
 * It is a sheet-material Glass that never blurs the screen behind on Android (BearAlert lives in a Modal — a
 * separate window), and gets the system blur on iOS. New code uses <Glass> from ./glass.
 */
import React from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { Glass } from "./glass";

interface Props {
  /** Kept for API compatibility; the material sets the look now. */
  intensity?: number;
  /** Kept for API compatibility; glass is always dark. */
  tint?: "dark" | "light";
  style?: StyleProp<ViewStyle>;
  /** False while the surface is hidden (e.g. an overlay faded to 0 but still mounted). */
  active?: boolean;
}

export function Frost({ style, active = true }: Props) {
  return <Glass material="sheet" backdrop="none" visible={active} style={style} />;
}

export default Frost;
