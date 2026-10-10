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
