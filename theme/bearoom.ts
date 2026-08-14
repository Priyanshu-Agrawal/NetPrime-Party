/**
 * Bearoom design tokens — "cozy cinema-lounge".
 *
 * Single source of truth for the honey-on-warm-charcoal system that mirrors the
 * Stitch design system (project 9821378598804634936). Warm, premium, rounded,
 * frosted glass. Import from here everywhere — never hardcode brand colors.
 */
import { Dimensions, TextStyle, ViewStyle } from "react-native";

/**
 * Responsive sizing. We design against a 390dp baseline (iPhone 14 / a typical
 * "medium" phone) and moderate-scale every hard pixel value so small phones
 * (~360dp) and large phones (~430dp) keep the SAME visual proportions instead of
 * looking cramped or oversized.
 *
 * - `scale(n)`  linear scale by width ratio (use for widths that must track the
 *   screen, e.g. poster columns).
 * - `ms(n, f)`  moderate scale — dampened (default 50%) so type + chrome nudge
 *   with the screen without ballooning. Use this for font sizes, paddings, and
 *   fixed control/avatar dimensions. This is the primary responsive primitive.
 */
const BASE_WIDTH = 390;
const SCREEN_W = Dimensions.get("window").width;
export const scale = (size: number): number =>
  Math.round((SCREEN_W / BASE_WIDTH) * size);
export const ms = (size: number, factor = 0.5): number =>
  Math.round(size + (scale(size) - size) * factor);

export const colors = {
  // warm charcoal backgrounds (never pure cold black)
  bg: "#100D0A",
  bgElevated: "#16120D",
  // frosted surfaces = warm-white tints laid over the charcoal (with BlurView)
  surface: "rgba(246, 239, 227, 0.05)",
  surfaceStrong: "rgba(246, 239, 227, 0.09)",
  border: "rgba(246, 239, 227, 0.10)",
  borderStrong: "rgba(246, 239, 227, 0.16)",

  // honey / amber accent
  honey: "#F0A93C",
  honeyBright: "#FFC661",
  honeyDeep: "#C9822A",
  honeySoft: "rgba(240, 169, 60, 0.16)", // tinted fill / active chip bg
  honeyGlow: "rgba(240, 169, 60, 0.45)",

  // text (warm)
  text: "#F6EFE3",
  textDim: "#A79E90",
  textFaint: "#6E675D",

  // semantics
  live: "#F0A93C",
  danger: "#E5736B", // muted warm red (sign out / destructive)
  onHoney: "#1A1206", // dark warm ink for text/icons ON honey buttons
  scrim: "rgba(16, 13, 10, 0.72)",
  black: "#000000",
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

/**
 * Font family keys as exported by @expo-google-fonts and loaded in _layout.
 * (Outfit for headlines, Inter for body/labels.)
 */
export const font = {
  headlineXbold: "Outfit_800ExtraBold",
  headline: "Outfit_700Bold",
  headlineSemi: "Outfit_600SemiBold",
  body: "Inter_400Regular",
  bodyMed: "Inter_500Medium",
  bodySemi: "Inter_600SemiBold",
  label: "Inter_600SemiBold",
} as const;

export const type = {
  display: { fontFamily: font.headlineXbold, fontSize: 32, lineHeight: 36, color: colors.text },
  h1: { fontFamily: font.headline, fontSize: 26, lineHeight: 30, color: colors.text },
  h2: { fontFamily: font.headline, fontSize: 20, lineHeight: 25, color: colors.text },
  h3: { fontFamily: font.headlineSemi, fontSize: 17, lineHeight: 22, color: colors.text },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 22, color: colors.text },
  bodyDim: { fontFamily: font.body, fontSize: 15, lineHeight: 22, color: colors.textDim },
  label: { fontFamily: font.label, fontSize: 13, lineHeight: 16, color: colors.text },
  caption: { fontFamily: font.bodyMed, fontSize: 12, lineHeight: 15, color: colors.textDim },
  overline: {
    fontFamily: font.label,
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: 1.2,
    color: colors.textDim,
  },
} satisfies Record<string, TextStyle>;

/** Soft glows / shadows. Honey glow for CTAs + live elements. */
export const glow = {
  honey: {
    shadowColor: colors.honey,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  soft: {
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
} satisfies Record<string, ViewStyle>;

/** Default BlurView params for frosted glass surfaces. */
export const glass = { intensity: 24, tint: "dark" } as const;

export const theme = { colors, radius, spacing, font, type, glow, glass };
export default theme;
