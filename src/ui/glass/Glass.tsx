import { NativeGlassView } from "@/modules/bearoom-glass";
import { colors, glassHighlight, glassLift, glassMaterials } from "@/theme/bearoom";
import { BlurView } from "expo-blur";
import { GlassView } from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";
import React, { useContext, useEffect, useState, useSyncExternalStore } from "react";
import { processColor, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { selectGlassEngine, type GlassMaterial } from "./engine";
import { GlassInsideContext, GlassLayerContext } from "./GlassBackdrop";
import { glassPlatform, nativeTagOf } from "./platform";
import { resolveBackdrop, screenBackdrops } from "./registry";
import { useReduceTransparency } from "./useReduceTransparency";
import { GlassVisibleContext } from "./visibility";

/** Liquid Glass switched on while an ancestor is still at opacity 0 doesn't render (expo issue 41024): wait
 *  until the fade-in has started. */
const LIQUID_ON_DELAY_MS = 50;

/** On only after the surface has been showing for LIQUID_ON_DELAY_MS; off at once. */
function useLiquidOn(show: boolean, enabled: boolean): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => setOn(show), show ? LIQUID_ON_DELAY_MS : 0);
    return () => clearTimeout(t);
  }, [show, enabled]);
  return show && on;
}

export interface GlassProps {
  /** What kind of surface this is (spec D1). */
  material?: GlassMaterial;
  /** "none" = never blur what's behind — surfaces inside a Modal (a separate window on Android). */
  backdrop?: "auto" | "none";
  /** False while the surface is faded out: Liquid Glass must not sit at alpha 0 (expo issue 41024). */
  visible?: boolean;
  /** Corner radius of the glass shape. */
  radius?: number;
  /** Liquid Glass reacts to touches (buttons). */
  interactive?: boolean;
  /** Defaults to filling the parent. */
  style?: StyleProp<ViewStyle>;
}

/**
 * The glass layer behind a glassy surface: real blur where it is smooth and safe (Liquid Glass or the system
 * blur on iOS, a backdrop blur on Android 12+), crafted glass — tint, warm lift, top highlight — elsewhere.
 * Spec: docs/superpowers/specs/2026-10-11-glass-design.md.
 */
export function Glass({ material = "control", backdrop = "auto", visible = true, radius = 0, interactive = false, style }: GlassProps) {
  const layer = useContext(GlassLayerContext);
  const inside = useContext(GlassInsideContext);
  const registry = layer ?? screenBackdrops;
  const current = useSyncExternalStore(registry.subscribe, registry.current);
  const reduceTransparency = useReduceTransparency();
  const resolved = resolveBackdrop(backdrop, current, inside);
  const engine = selectGlassEngine({ ...glassPlatform, reduceTransparency, material, backdrop: resolved.state });
  const parentVisible = useContext(GlassVisibleContext);
  const liquidOn = useLiquidOn(visible && parentVisible, engine === "liquid");
  const m = glassMaterials[material];
  const shape = [style ?? StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden" as const }];

  if (engine === "liquid") {
    return (
      <GlassView
        pointerEvents="none"
        style={shape}
        glassEffectStyle={{ style: liquidOn ? "regular" : "none", animate: true, animationDuration: 0.2 }}
        tintColor={m.liquidTint}
        colorScheme="dark"
        isInteractive={interactive}
      />
    );
  }

  const fill = engine === "crafted" ? m.solid : engine === "material" ? m.tint : null;
  return (
    <View pointerEvents="none" style={shape}>
      {engine === "material" ? <BlurView tint="dark" intensity={m.iosIntensity} style={StyleSheet.absoluteFill} /> : null}
      {engine === "backdrop" && NativeGlassView ? (
        <NativeGlassView
          style={StyleSheet.absoluteFill}
          backdropTag={nativeTagOf(resolved.entry?.ref.current ?? null)}
          blurRadius={m.blur}
          saturation={m.saturation}
          baseColor={processColor(colors.bg) as number}
          overlayColor={processColor(m.tint) as number}
        />
      ) : null}
      {fill ? <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} /> : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: glassLift }]} />
      <LinearGradient colors={[glassHighlight, "transparent"]} locations={[0, 0.55]} style={StyleSheet.absoluteFill} />
    </View>
  );
}

export default Glass;
