/** Tap handling for the player surface (spec §6.2.1): tap toggles; double tap left/right seeks ∓10 s, stacking. */
export type Zone = "left" | "center" | "right";

export const DOUBLE_TAP_MS = 300;
export const STREAK_MS = 700;
export const SEEK_STEP_SEC = 10;

export interface TapState {
  at: number;
  zone: Zone | null;
  streak: number;
}

export const NO_TAPS: TapState = { at: -Infinity, zone: null, streak: 0 };

export type TapAction =
  | { kind: "toggle" }
  | { kind: "seek"; zone: "left" | "right"; streak: number; undoToggle: boolean };

export function zoneOf(x: number, width: number): Zone {
  if (width <= 0) return "center";
  const f = x / width;
  return f < 1 / 3 ? "left" : f > 2 / 3 ? "right" : "center";
}

/**
 * A second tap on the same side within DOUBLE_TAP_MS starts a seek streak (and undoes the first tap's toggle); each
 * further tap there within STREAK_MS of the last adds another step. Anything else toggles the controls.
 */
export function onTap(s: TapState, x: number, width: number, now: number, canSeek: boolean): { state: TapState; action: TapAction } {
  const zone = zoneOf(x, width);
  if (canSeek && zone !== "center" && zone === s.zone) {
    const gap = now - s.at;
    if (s.streak > 0 && gap <= STREAK_MS) {
      const streak = s.streak + 1;
      return { state: { at: now, zone, streak }, action: { kind: "seek", zone, streak, undoToggle: false } };
    }
    if (s.streak === 0 && gap <= DOUBLE_TAP_MS) {
      return { state: { at: now, zone, streak: 1 }, action: { kind: "seek", zone, streak: 1, undoToggle: true } };
    }
  }
  return { state: { at: now, zone, streak: 0 }, action: { kind: "toggle" } };
}
