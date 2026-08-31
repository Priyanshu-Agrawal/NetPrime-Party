/**
 * useMediaCloseGuard — resist accidental exit from a media screen (solo player /
 * watch party). Intercepts the Android hardware back AND any in-app back button
 * wired to the returned `requestClose`, showing a themed confirm instead of
 * leaving immediately.
 *
 * - Throttled (1.2s) so a rapid double-back can't stack dialogs.
 * - While enabled, the hardware back is fully blocked (returns true) — the only
 *   way out is confirming, so a stray tap never drops the watch session.
 * - Programmatic leaves (kicked, fatal error) do NOT go through here — they call
 *   router.back() directly, which BackHandler doesn't intercept. That's intended.
 * - `secondary` adds a middle action for screens where leaving the SCREEN and
 *   ending the SESSION are different things: a watch party now outlives its
 *   screen, so "Keep browsing" and "Leave room" are two separate outcomes.
 * - iOS swipe-back is not intercepted (Android-first); revisit with `beforeRemove`
 *   when iOS is stood up.
 */
import { bearAlert } from "@/components/ui/BearAlert";
import { useCallback, useEffect, useRef } from "react";
import { BackHandler } from "react-native";

export function useMediaCloseGuard(opts: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  /** Optional middle action — leave the screen WITHOUT the destructive outcome. */
  secondary?: { label: string; onPress: () => void };
  /** Guard only while true (e.g. media actually loaded). Defaults to true. */
  enabled?: boolean;
  /** Contextual back interceptor for the HARDWARE back only. Return true if the
   *  press was already handled (e.g. exit fullscreen first) — the confirm is then
   *  skipped. Read live on each press; keep it cheap and side-effect-light. */
  beforeClose?: () => boolean;
}): { requestClose: () => void } {
  const { title, message, confirmLabel, onConfirm, secondary, enabled = true, beforeClose } = opts;
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  const secondaryRef = useRef(secondary);
  secondaryRef.current = secondary;
  const beforeCloseRef = useRef(beforeClose);
  beforeCloseRef.current = beforeClose;
  const lastShownRef = useRef(0);

  // Only the LABEL needs to invalidate the callback; the handler is read via ref.
  const secondaryLabel = secondary?.label;
  const requestClose = useCallback(() => {
    const now = Date.now();
    if (now - lastShownRef.current < 1200) return; // don't stack on rapid back
    lastShownRef.current = now;
    const sec = secondaryRef.current;
    bearAlert(title, message, [
      { text: "Stay", style: "cancel" },
      ...(sec ? [{ text: sec.label, onPress: () => secondaryRef.current?.onPress() }] : []),
      { text: confirmLabel, style: "destructive", onPress: () => onConfirmRef.current() },
    ]);
    // BearAlert stacks at >2 buttons, so the three-way reads as a list, not a row.
  }, [title, message, confirmLabel, secondaryLabel]);

  useEffect(() => {
    if (!enabled) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (beforeCloseRef.current?.()) return true; // handled (e.g. exited fullscreen) — no confirm
      requestClose();
      return true; // resist: block the default back, show the confirm instead
    });
    return () => sub.remove();
  }, [enabled, requestClose]);

  return { requestClose };
}
