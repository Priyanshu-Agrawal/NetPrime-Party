import { useSyncExternalStore } from "react";
import { AccessibilityInfo, Platform } from "react-native";

let reduce = false;
let started = false;
const listeners = new Set<() => void>();
const set = (v: boolean) => {
  reduce = v;
  listeners.forEach((l) => l());
};

/** One OS subscription shared by every glass surface. */
function start() {
  if (started || Platform.OS !== "ios") return;
  started = true;
  AccessibilityInfo.isReduceTransparencyEnabled().then(set, () => {});
  AccessibilityInfo.addEventListener("reduceTransparencyChanged", set);
}

// Module-level, so every glass keeps one stable subscription instead of re-subscribing on each render.
function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const snapshot = () => reduce;

/** iOS "Reduce Transparency": glass draws its solid look while it's on. */
export function useReduceTransparency(): boolean {
  return useSyncExternalStore(subscribe, snapshot);
}
