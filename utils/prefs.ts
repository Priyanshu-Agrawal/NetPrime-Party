/**
 * App preferences (MMKV) — small, synchronous, local. Currently: the
 * first-launch onboarding flag and playback preferences (used by the player +
 * the "Playback & data" settings). Kept separate from watch history / identity.
 */
import { universalStorage as storage } from "@/services/storage/universalStorage";

/** MMKV storage keys for app preferences. */
enum PrefKey {
  Onboarded = "app.onboarded",
  AutoplayNext = "pref.autoplayNext",
  DataSaver = "pref.dataSaver",
  Audio = "pref.audioLang",
  Quality = "pref.quality",
  PersonalRecs = "pref.personalRecs",
}

export function hasOnboarded(): boolean {
  return storage.getBoolean(PrefKey.Onboarded) ?? false;
}
export function setOnboarded(v = true): void {
  storage.set(PrefKey.Onboarded, v);
}

/** Autoplay the next episode when one finishes (default on). */
export function getAutoplayNext(): boolean {
  return storage.getBoolean(PrefKey.AutoplayNext) ?? true;
}
export function setAutoplayNext(v: boolean): void {
  storage.set(PrefKey.AutoplayNext, v);
}

/** Data saver — prefer lighter streams / posters (default off). */
export function getDataSaver(): boolean {
  return storage.getBoolean(PrefKey.DataSaver) ?? false;
}
export function setDataSaver(v: boolean): void {
  storage.set(PrefKey.DataSaver, v);
}

/** Show the personalized "Because you've been watching" home rail (default on). */
export function getPersonalRecs(): boolean {
  return storage.getBoolean(PrefKey.PersonalRecs) ?? true;
}
export function setPersonalRecs(v: boolean): void {
  storage.set(PrefKey.PersonalRecs, v);
}

/**
 * "Silent memory" playback prefs — learned from what the user picks in the
 * player, then auto-applied on future playback (best-effort, per the fuzzy
 * matcher in utils/trackMatch — silently no-ops when a provider lacks it).
 * Stored as the clean bridge label ("Hindi"/"Original", "1080p"/"Auto").
 * null = no preference expressed yet.
 */
export function getPreferredAudio(): string | null {
  return storage.getString(PrefKey.Audio) ?? null;
}
export function setPreferredAudio(label: string): void {
  storage.set(PrefKey.Audio, label);
}

export function getPreferredQuality(): string | null {
  return storage.getString(PrefKey.Quality) ?? null;
}
export function setPreferredQuality(label: string): void {
  storage.set(PrefKey.Quality, label);
}
