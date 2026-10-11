import { isBindableOn, type OS } from "./capabilities";
import type { Provider } from "./providerRegistry";

/**
 * The provider a title opens on. An explicit pick wins unless it already failed for
 * this title; otherwise the first provider our skin binds on this platform that hasn't
 * failed for this title, then a plain embed that hasn't failed. A bindable provider
 * that just failed isn't retried ahead of a fresh plain embed: each failed bind costs
 * the full bind timeout before move-on. When everything failed, start over at the top
 * of the bindable list (failure memory heals; a blip shouldn't strand the title).
 */
export function pickInitialProvider(
  list: Provider[],
  o: { requestedId?: string; failed: Set<string>; os: OS },
): Provider | undefined {
  const requested = o.requestedId ? list.find((p) => p.id === o.requestedId) : undefined;
  if (requested && !o.failed.has(requested.id)) return requested;
  const bindable = list.filter((p) => isBindableOn(p, o.os));
  const plain = list.filter((p) => !isBindableOn(p, o.os));
  const fresh = (arr: Provider[]) => arr.find((p) => !o.failed.has(p.id));
  return fresh(bindable) ?? fresh(plain) ?? bindable[0] ?? list[0];
}

/** The next provider to try silently after `currentId` failed to bind (solo only). */
export function nextBindableProvider(
  list: Provider[],
  currentId: string,
  tried: Set<string>,
  os: OS,
): Provider | undefined {
  return list.find((p) => p.id !== currentId && !tried.has(p.id) && isBindableOn(p, os));
}

/**
 * Bound, asked to play, but nothing has advanced for `windowMs` — the stream is dead
 * under our controls, so treat it like a failed bind.
 */
export function isStalledStart(
  s: { playIntentAt: number | null; lastProgressAt: number | null; now: number },
  windowMs = 25_000,
): boolean {
  if (s.playIntentAt == null) return false;
  if (s.now - s.playIntentAt < windowMs) return false;
  return s.lastProgressAt == null || s.now - s.lastProgressAt >= windowMs;
}

export type MoveOnReason = "bind" | "stall" | "fatal";
export type MoveOnDecision = { kind: "stay" } | { kind: "next"; provider: Provider } | { kind: "exhausted" };

/**
 * What to do when the current provider didn't bind, never started, or its page failed.
 * Stay put while the player is hidden behind another screen (a party pushed on top), on a
 * plain embed (it can't bind, so its own page is what the user picked), and after a crash
 * once playback had started (retry that source in place rather than restart elsewhere).
 * Otherwise move to the next untried bindable provider, or report that none is left.
 */
export function decideMoveOn(
  list: Provider[],
  current: Provider,
  tried: Set<string>,
  o: { os: OS; reason: MoveOnReason; playbackStarted: boolean; focused: boolean },
): MoveOnDecision {
  if (!o.focused || !isBindableOn(current, o.os)) return { kind: "stay" };
  if (o.reason === "fatal" && o.playbackStarted) return { kind: "stay" };
  const next = nextBindableProvider(list, current.id, new Set([...tried, current.id]), o.os);
  return next ? { kind: "next", provider: next } : { kind: "exhausted" };
}

/**
 * Real playback progress, for the stalled-start rule: a tick of a playing video that
 * advanced by about one tick. A jump while paused (a provider resuming its own saved
 * position, or our resume seek) or a seek-sized jump says nothing about the stream.
 */
export function countsAsProgress(
  prevTime: number,
  e: { event: string; currentTime?: number; paused?: boolean },
): boolean {
  if (e.event !== "tick" || e.paused) return false;
  const d = (Number(e.currentTime) || 0) - prevTime;
  return d > 0.25 && d < 5;
}

/**
 * A rebind to a much longer video means the feature replaced a pre-roll ad, so the ad's
 * progress says nothing about the film and the stalled-start watch starts over.
 */
export function isFeatureAfterAd(prevDuration: number, nextDuration: number): boolean {
  return prevDuration > 0 && nextDuration > prevDuration * 1.5;
}

/** Start playback when the video binds — unless the player is hidden behind another screen. */
export function onBindAction(o: { focused: boolean }): "play" | "pause" {
  return o.focused ? "play" : "pause";
}
