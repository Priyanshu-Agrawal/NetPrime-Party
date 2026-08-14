/**
 * App preferences (MMKV) — small, synchronous, local. Currently: the
 * first-launch onboarding flag and playback preferences (used by the player +
 * the "Playback & data" settings). Kept separate from watch history / identity.
 */
import { createMMKV } from "react-native-mmkv";

const storage = createMMKV();

const K_ONBOARDED = "app.onboarded";
const K_AUTOPLAY = "pref.autoplayNext";
const K_DATASAVER = "pref.dataSaver";

export function hasOnboarded(): boolean {
  return storage.getBoolean(K_ONBOARDED) ?? false;
}
export function setOnboarded(v = true): void {
  storage.set(K_ONBOARDED, v);
}

/** Autoplay the next episode when one finishes (default on). */
export function getAutoplayNext(): boolean {
  return storage.getBoolean(K_AUTOPLAY) ?? true;
}
export function setAutoplayNext(v: boolean): void {
  storage.set(K_AUTOPLAY, v);
}

/** Data saver — prefer lighter streams / posters (default off). */
export function getDataSaver(): boolean {
  return storage.getBoolean(K_DATASAVER) ?? false;
}
export function setDataSaver(v: boolean): void {
  storage.set(K_DATASAVER, v);
}
