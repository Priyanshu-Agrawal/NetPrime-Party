import { useScreenFocused } from "@/hooks/useScreenFocused";
import { NativeGlassBackdrop } from "@/modules/bearoom-glass";
import React, { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { StyleProp, View, ViewStyle } from "react-native";
import { createBackdropRegistry, nextBackdropId, screenBackdrops, type BackdropRegistry } from "./registry";

/** A GlassLayer's private backdrop slot; null outside any layer. */
export const GlassLayerContext = createContext<BackdropRegistry | null>(null);
/** Ids of the backdrops this subtree sits inside. */
export const GlassInsideContext = createContext<readonly number[]>([]);

/** A private backdrop for its subtree — the player's controls blur the video box, not the screen. */
export function GlassLayer({ children }: { children: ReactNode }) {
  const slot = useMemo(createBackdropRegistry, []);
  return <GlassLayerContext.Provider value={slot}>{children}</GlassLayerContext.Provider>;
}

/**
 * What glass may blur. Inside a GlassLayer it fills that layer's slot; otherwise it is its screen's backdrop
 * while the screen is focused (the tab bar, peek bar and headers blur it).
 */
export function GlassBackdrop({ style, children }: { style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const ref = useRef<View>(null);
  const [id] = useState(nextBackdropId);
  const entry = useMemo(() => ({ id, ref }), [id]);
  const layer = useContext(GlassLayerContext);
  const focused = useScreenFocused();
  const outer = useContext(GlassInsideContext);
  const inside = useMemo(() => [...outer, id], [outer, id]);

  useEffect(() => {
    const registry = layer ?? (focused ? screenBackdrops : null);
    if (!registry) return;
    registry.add(entry);
    return () => registry.remove(entry.id);
  }, [layer, focused, entry]);

  return (
    <GlassInsideContext.Provider value={inside}>
      <NativeGlassBackdrop ref={ref} style={style} collapsable={false}>
        {children}
      </NativeGlassBackdrop>
    </GlassInsideContext.Provider>
  );
}
