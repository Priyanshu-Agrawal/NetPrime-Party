import React, { createContext, type ReactNode } from "react";

/**
 * Whether the surface glass sits in is showing. A container that fades its content (the player controls)
 * provides it, so glass passed in from outside — the party's top-bar buttons — hides with it.
 */
export const GlassVisibleContext = createContext(true);

export function GlassVisible({ value, children }: { value: boolean; children: ReactNode }) {
  return <GlassVisibleContext.Provider value={value}>{children}</GlassVisibleContext.Provider>;
}
