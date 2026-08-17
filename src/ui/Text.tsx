import React from "react";
import { Text as RNText, type TextProps, type TextStyle } from "react-native";
import { colors } from "@/theme/bearoom";
import { textVariant, type TextVariant } from "@/theme/styles/typography";

export type { TextVariant };

interface Props extends TextProps {
  variant?: TextVariant;
  dim?: boolean;
  honey?: boolean;
  danger?: boolean;
}

export function Text({
  variant = "body",
  dim,
  honey,
  danger,
  style,
  ...rest
}: Props) {
  const colorOverride: TextStyle = {};
  if (honey) colorOverride.color = colors.honey;
  if (danger) colorOverride.color = colors.danger;
  if (dim && !honey && !danger) colorOverride.color = colors.textDim;

  return (
    <RNText style={[textVariant(variant), colorOverride, style]} {...rest} />
  );
}

export default Text;
