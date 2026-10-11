import { useEffect, useRef } from "react";

/**
 * Calls `advance` every `intervalMs` while `active` — a carousel's autoplay. Pass the
 * screen's focus as `active`: an animated scroll on a screen covered by the player or a
 * party still costs the UI thread frames for nothing.
 */
export function useAutoAdvance(advance: () => void, intervalMs: number, active: boolean): void {
  const latest = useRef(advance);
  useEffect(() => {
    latest.current = advance;
  });
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => latest.current(), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, active]);
}
