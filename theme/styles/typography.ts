import type { TextStyle } from "react-native";
import { colors, font, ms, type as typeScale } from "../bearoom";

export type TextVariant = keyof typeof typeScale;

const responsiveType: Record<TextVariant, TextStyle> = {
  display: {
    fontFamily: font.headlineXbold,
    fontSize: ms(32),
    lineHeight: ms(36),
    color: colors.text,
  },
  h1: {
    fontFamily: font.headline,
    fontSize: ms(26),
    lineHeight: ms(30),
    color: colors.text,
  },
  h2: {
    fontFamily: font.headline,
    fontSize: ms(20),
    lineHeight: ms(25),
    color: colors.text,
  },
  h3: {
    fontFamily: font.headlineSemi,
    fontSize: ms(17),
    lineHeight: ms(22),
    color: colors.text,
  },
  body: {
    fontFamily: font.body,
    fontSize: ms(15),
    lineHeight: ms(22),
    color: colors.text,
  },
  bodyDim: {
    fontFamily: font.body,
    fontSize: ms(15),
    lineHeight: ms(22),
    color: colors.textDim,
  },
  label: {
    fontFamily: font.label,
    fontSize: ms(13),
    lineHeight: ms(16),
    color: colors.text,
  },
  caption: {
    fontFamily: font.bodyMed,
    fontSize: ms(12),
    lineHeight: ms(15),
    color: colors.textDim,
  },
  overline: {
    fontFamily: font.label,
    fontSize: ms(11),
    lineHeight: ms(13),
    letterSpacing: 1.2,
    color: colors.textDim,
    textTransform: "uppercase",
  },
};

export function textVariant(variant: TextVariant = "body", dim = false): TextStyle {
  const base = responsiveType[variant];
  if (!dim) return base;
  return { ...base, color: colors.textDim };
}
