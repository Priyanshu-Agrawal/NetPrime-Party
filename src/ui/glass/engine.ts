/**
 * Which glass engine draws a surface — one pure decision, so every platform rule lives in one place.
 * Spec: docs/superpowers/specs/2026-10-11-glass-design.md §3 D2.
 */
export type GlassMaterial = "control" | "bar" | "chrome" | "sheet";
export type GlassEngine = "liquid" | "material" | "backdrop" | "crafted";
/** available = a backdrop this glass may blur; none = nothing to blur; inside = the only backdrop is one it sits inside. */
export type BackdropState = "available" | "none" | "inside";

export interface EngineInput {
  os: string;
  /** Android API level (Platform.Version); ignored elsewhere. */
  androidApi: number;
  /** iOS 26+ Liquid Glass API present. */
  liquidAvailable: boolean;
  reduceTransparency: boolean;
  material: GlassMaterial;
  backdrop: BackdropState;
}

/** RenderNode + RenderEffect both exist from Android 12 (API 31). */
export const ANDROID_BLUR_MIN_API = 31;

export function selectGlassEngine(i: EngineInput): GlassEngine {
  if (i.reduceTransparency) return "crafted";
  if (i.os === "ios") {
    const floating = i.material === "control" || i.material === "bar";
    return floating && i.liquidAvailable ? "liquid" : "material";
  }
  // Android blurs live only the floating bars: every live glass re-renders the screen's drawing list each
  // frame, and on the Nothing Phone 1 bars-only scrolled like no blur while bars + header + buttons doubled
  // the janky frames. Headers, buttons and sheets get crafted glass.
  if (
    i.os === "android" &&
    i.androidApi >= ANDROID_BLUR_MIN_API &&
    i.material === "bar" &&
    i.backdrop === "available"
  )
    return "backdrop";
  return "crafted";
}
