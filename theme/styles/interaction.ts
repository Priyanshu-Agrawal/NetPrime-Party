import type { ViewStyle } from "react-native";
import { interaction as ix } from "../bearoom";

export const pressedStyle: ViewStyle = {
  opacity: ix.pressedOpacity,
  transform: [{ scale: ix.pressedScale }],
};

export const disabledStyle: ViewStyle = { opacity: ix.disabledOpacity };
