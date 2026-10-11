/**
 * Which audio language to start in (spec §5.6 rule 2): the title's own remembered choice, else the user's order —
 * which is the audio language they last picked anywhere (the existing silent-memory pref), then the original audio.
 * Default: Hindi, then original.
 */
import { normalizeLanguage } from "@/components/player/native/languages";
import { universalStorage } from "@/services/storage/universalStorage";
import type { UniversalStorage } from "@/services/storage/universalStorage.types";
import { getPreferredAudio } from "@/utils/prefs";
import { canonLang } from "@/utils/trackMatch";

export const ORIGINAL = "original";
export const DEFAULT_ORDER = ["hi", ORIGINAL];
const TITLE_KEY = "titlelang.v1";
const MAX_TITLES = 300;

type Store = Pick<UniversalStorage, "getString" | "set">;

export function languageOrder(preferredAudioLabel: string | null = getPreferredAudio()): string[] {
  const code = preferredAudioLabel ? canonLang(preferredAudioLabel) : null;
  if (!code) return DEFAULT_ORDER;
  return code === ORIGINAL ? [ORIGINAL] : [code, ORIGINAL];
}

export function resolveOrder(order: string[], originalLanguage?: string, titleChoice?: string | null): string[] {
  const out: string[] = [];
  const add = (code?: string | null) => {
    if (code && !out.includes(code)) out.push(code);
  };
  add(titleChoice);
  for (const l of order) add(l === ORIGINAL ? normalizeLanguage(originalLanguage) : l);
  return out;
}

export function titleKeyOf(type: "movie" | "tv", tmdbId: string): string {
  return `${type}:${tmdbId}`;
}

function readTitles(storage: Store): [string, string][] {
  try {
    const v = JSON.parse(storage.getString(TITLE_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? (v as [string, string][]) : [];
  } catch {
    return [];
  }
}

export function getTitleLanguage(key: string, storage: Store = universalStorage): string | null {
  return readTitles(storage).find(([k]) => k === key)?.[1] ?? null;
}

/** Newest first; re-picking a title moves it to the front; only the 300 most recent are kept. */
export function setTitleLanguage(key: string, code: string, storage: Store = universalStorage): void {
  const next = [[key, code] as [string, string], ...readTitles(storage).filter(([k]) => k !== key)].slice(0, MAX_TITLES);
  storage.set(TITLE_KEY, JSON.stringify(next));
}
