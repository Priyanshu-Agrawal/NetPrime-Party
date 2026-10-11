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
const BASE_WIDTH = 411; // the "medium" reference device we design against
const SCREEN_W = Dimensions.get("window").width;
// Clamp so tiny/huge screens don't get absurd, but within the phone range
// (~360–430dp) scaling is essentially linear so every phone looks proportional
// to the medium reference (a 360dp small phone renders ~12% more compact).
const RATIO = Math.min(Math.max(SCREEN_W / BASE_WIDTH, 0.82), 1.12);
export const scale = (size: number): number => Math.round(size * RATIO);
/**
 * Responsive size. `factor` 1 (default) = fully proportional to the reference;
 * lower it toward 0 to dampen (rarely needed now that the baseline is the medium
 * device). Primary responsive primitive — wrap font sizes + fixed dimensions.
 */
export const ms = (size: number, factor = 1): number =>
  Math.round(size * (1 - factor + factor * RATIO));

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
  dangerSoft: "rgba(229,115,107,0.16)",
  onHoney: "#1A1206", // dark warm ink for text/icons ON honey buttons
  scrim: "rgba(16, 13, 10, 0.72)",
  /** Frosted pill overlays on hero/posters — readable on busy imagery. */
  glassChipBg: "rgba(16, 13, 10, 0.52)",
  glassChipTint: "rgba(246, 239, 227, 0.10)",
  glassChipBorder: "rgba(246, 239, 227, 0.26)",
  black: "#000000",

  // semantic aliases (derived — do not change visual values)
  overlay: "rgba(16, 13, 10, 0.28)",
  overlayStrong: "rgba(8, 6, 4, 0.72)",
  modalBackdrop: "rgba(8, 6, 4, 0.72)",
  sheetOverlay: "rgba(16,13,10,0.95)",
  infoTint: "rgba(0,123,255,0.15)",
  warnTint: "rgba(224,163,22,0.15)",
  bannerBg: "rgba(224,163,22,0.9)",
  playerChip: "rgba(16,13,10,0.55)",
  playerCenter: "rgba(18,14,10,0.62)",
  episodeActive: "rgba(240,169,60,0.34)",
  hintBg: "#0a0a0a",
  playerBg: "#000000",
  ratingStar: "#F0A93C",
  progressTrack: "rgba(246,239,227,0.2)",
  progressFill: "rgba(246,239,227,0.4)",
  heroDotActive: "rgba(246,239,227,0.4)",
  heroDotInactive: "rgba(246,239,227,0.2)",
  ctaTint: "rgba(57, 33, 0, 0.2)",
  chatBorder: "rgba(240,169,60,0.3)",
  chatBorderStrong: "rgba(240,169,60,0.35)",
  white: "#FFFFFF",
} as const;

/** Per-sender accent colors for party chat (stable, readable). */
export const chat = {
  senderColors: [
    "#F0A93C",
    "#E8759B",
    "#63B3E8",
    "#7FD6A6",
    "#C79BF0",
    "#E8B24B",
    "#5FD2C6",
    "#F0906A",
  ] as const,
};

export const interaction = {
  pressedOpacity: 0.9,
  pressedScale: 0.97,
  disabledOpacity: 0.5,
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

export const layoutTokens = {
  screenPadding: spacing.lg,
  railGap: 10,
  sectionGap: spacing.xl,
  posterAspect: 1.5,
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

/**
 * Glass materials (spec 2026-10-11 D6). blur: Android blur radius in dp · saturation: lift on the blurred
 * backdrop · tint: drawn over real blur · solid: crafted glass (no blur) · iosIntensity: expo-blur intensity ·
 * liquidTint: Liquid Glass tint. Starting values — tuned on the Nothing Phone 1.
 */
export const glassMaterials = {
  control: { blur: 20, saturation: 1.25, tint: "rgba(16,13,10,0.30)", solid: "rgba(16,13,10,0.58)", iosIntensity: 40, liquidTint: "rgba(16,13,10,0.22)" },
  bar: { blur: 24, saturation: 1.25, tint: "rgba(16,13,10,0.42)", solid: "rgba(16,13,10,0.80)", iosIntensity: 50, liquidTint: "rgba(16,13,10,0.30)" },
  chrome: { blur: 24, saturation: 1.2, tint: "rgba(16,13,10,0.45)", solid: "rgba(16,13,10,0.94)", iosIntensity: 45, liquidTint: "rgba(16,13,10,0.30)" },
  sheet: { blur: 28, saturation: 1.1, tint: "rgba(16,13,10,0.70)", solid: "rgba(16,13,10,0.94)", iosIntensity: 60, liquidTint: "rgba(16,13,10,0.50)" },
} as const;
/** Top-edge highlight every non-liquid glass gets. */
export const glassHighlight = "rgba(246,239,227,0.10)";
/** Warm lift so glass still reads over plain charcoal (where the blur has nothing to show). */
export const glassLift = "rgba(246,239,227,0.06)";

export const theme = {
  colors,
  radius,
  spacing,
  font,
  type,
  glow,
  chat,
  interaction,
  layout: layoutTokens,
};
export default theme;
