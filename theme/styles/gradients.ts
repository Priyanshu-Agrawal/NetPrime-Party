import { colors } from "../bearoom";

/** Named LinearGradient color-stop arrays — use only these in features. */
export const gradients = {
  heroBottom: ["transparent", "rgba(16,13,10,0.7)", colors.bg] as const,
  heroTop: ["rgba(16,13,10,0.8)", "transparent"] as const,
  headerFade: [colors.bg, "rgba(16,13,10,0.55)", "transparent"] as const,
  onboardingGlow: ["rgba(240,169,60,0.10)", "transparent"] as const,
  joinPartyGlow: ["rgba(240,169,60,0.08)", "transparent"] as const,
  continueWatching: ["transparent", "rgba(16,13,10,0.35)", "rgba(16,13,10,0.92)"] as const,
  clipScrim: ["transparent", "rgba(16,13,10,0.25)"] as const,
  detailsOverlay: ["transparent", "transparent", colors.bg] as const,
  shimmerDark: ["#14100C", "#241B13", "#38291B", "#241B13", "#14100C"] as const,
  shimmerHoney: ["rgba(245,166,35,0.08)", "rgba(245,166,35,0.22)", "rgba(245,166,35,0.08)"] as const,
  playerControls: [
    "rgba(16,13,10,0.28)",
    "rgba(16,13,10,0.05)",
    "rgba(16,13,10,0.30)",
    "rgba(16,13,10,0.72)",
  ] as const,
} as const;

export type GradientName = keyof typeof gradients;
