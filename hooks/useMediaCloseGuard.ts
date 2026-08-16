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
  /** Guard only while true (e.g. media actually loaded). Defaults to true. */
  enabled?: boolean;
}): { requestClose: () => void } {
  const { title, message, confirmLabel, onConfirm, enabled = true } = opts;
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  const lastShownRef = useRef(0);

  const requestClose = useCallback(() => {
    const now = Date.now();
    if (now - lastShownRef.current < 1200) return; // don't stack on rapid back
    lastShownRef.current = now;
    bearAlert(title, message, [
      { text: "Stay", style: "cancel" },
      { text: confirmLabel, style: "destructive", onPress: () => onConfirmRef.current() },
    ]);
  }, [title, message, confirmLabel]);

  useEffect(() => {
    if (!enabled) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      requestClose();
      return true; // resist: block the default back, show the confirm instead
    });
    return () => sub.remove();
  }, [enabled, requestClose]);

  return { requestClose };
}
