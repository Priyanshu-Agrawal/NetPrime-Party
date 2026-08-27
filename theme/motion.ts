/**
 * Bearoom motion system — the single source of truth for how the app moves.
 *
 * One place to tune the whole app's animation feel: durations, easing curves,
 * and spring presets. Import these instead of hardcoding `withTiming(220, ...)`
 * / `.damping(14)` inline, so motion stays consistent and is trivially retunable.
 *
 * Principles: subtle + fast + purposeful (not flashy). Everything honors the OS
 * "Reduce Motion" accessibility setting (`ReduceMotion.System`).
 *
 * NO LAYOUT ANIMATIONS: this file deliberately exposes only timing/easing/spring
 * tokens for IMPERATIVE animation (shared value + withTiming/withSpring). It does
 * NOT ship `entering=`/`exiting=`/`layout=` builders, because on the New
 * Architecture those crash in `reanimated::PropsRegistry::handleNodeRemovals`
 * when an animated node unmounts (e.g. leaving a screen). Entrances go through
 * `src/ui/Appear.tsx`, which animates imperatively. Keep it that way.
 *
 * PERF GUARDRAIL: entrance animations belong on containers/sections that mount
 * ONCE (a rail, a card section, a screen block) — never on the items of a
 * virtualized list (FlatList/FlashList recycle + remount rows on scroll and on
 * refetch, which replays the entrance and looks janky). Animate the rail, not
 * each poster inside it. And never animate the video player's hot path.
 */
import { Easing, ReduceMotion } from "react-native-reanimated";

/** Honor the OS Reduce-Motion setting by default, everywhere. */
export const RM = ReduceMotion.System;

/** Animation lengths (ms). Keep UI motion short — long animations feel sluggish. */
export const duration = {
  instant: 120,
  fast: 180,
  base: 240,
  slow: 340,
} as const;

/** Easing curves. `standard` is the default for most UI moves. */
export const easing = {
  /** Material "standard" — quick to leave, gentle to settle. Default. */
  standard: Easing.bezier(0.2, 0, 0, 1),
  /** For content entering the screen — starts fast, eases to rest. */
  decelerate: Easing.out(Easing.cubic),
  /** For content leaving the screen. */
  accelerate: Easing.in(Easing.cubic),
} as const;

/**
 * Spring presets — pass straight to `withSpring(value, spring.press)`. Each
 * carries `reduceMotion` so the OS setting is honored by imperative springs too
 * (not only by timing animations).
 */
export const spring = {
  /** Tactile press feedback (buttons, cards). Snappy, minimal overshoot. */
  press: { damping: 15, stiffness: 220, mass: 0.5, reduceMotion: RM },
  /** Panels, sheets, larger surfaces. Smooth, settled. */
  gentle: { damping: 18, stiffness: 140, mass: 0.9, reduceMotion: RM },
  /** Playful accents (badges, toggles). A little bounce. */
  bouncy: { damping: 12, stiffness: 180, mass: 0.8, reduceMotion: RM },
} as const;

/** Per-index delay (ms) for staggered list/rail entrances, capped so long lists don't crawl. */
export const STAGGER_STEP = 45;
export const STAGGER_MAX_INDEX = 8;
export function staggerDelay(index: number, step = STAGGER_STEP): number {
  return Math.min(Math.max(index, 0), STAGGER_MAX_INDEX) * step;
}

export const motion = { duration, easing, spring, staggerDelay, RM };
export default motion;
