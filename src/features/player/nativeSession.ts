/**
 * The native lane's choices, kept pure (spec §6.2, §6.3, §7 F6): what to hand the player, which languages to offer,
 * where to go when a stream fails, what to tell the user, and what telemetry may say (spec §5.7, §8 — never a URL,
 * a header or a player error text).
 */
import { languageName, normalizeLanguage } from "@/components/player/native/languages";
import type { NativeSource, SidecarSubtitle } from "@/components/player/native/NativePlayer";
import { stageFor } from "@/components/player/reportFields";
import type { PlaybackCandidate } from "@/services/playback/candidate";
import type { ReportArgs, ReportOutcome } from "@/src/types/worker.types";
import Constants from "expo-constants";
import { Platform } from "react-native";

export function primaryLanguage(c: PlaybackCandidate): string | null {
  return c.languages[0] ?? null;
}

export function toNativeSource(c: PlaybackCandidate): NativeSource {
  const contentType = c.container === "hls" ? "hls" : c.container === "dash" ? "dash" : c.container === "mp4" ? "progressive" : "auto";
  return { uri: c.url, headers: Object.keys(c.headers).length ? c.headers : undefined, contentType };
}

export function sidecarsOf(c: PlaybackCandidate): SidecarSubtitle[] {
  return c.subtitles.map((t) => ({ id: t.id, url: t.url, label: t.label, language: t.language }));
}

export interface LanguageOption {
  /** ISO-639-1, or null for "unknown — this source's original audio". */
  code: string | null;
  label: string;
  active: boolean;
}

export function languageOptions(ranked: PlaybackCandidate[], current: PlaybackCandidate): LanguageOption[] {
  const playing = primaryLanguage(current);
  const seen = new Set<string>();
  const out: LanguageOption[] = [];
  for (const cand of ranked) {
    const code = primaryLanguage(cand);
    const key = code ?? "?";
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ code, label: code ? languageName(code) : "Original audio (this source)", active: code === playing });
  }
  return out;
}

export function bestIn(ranked: PlaybackCandidate[], code: string | null, skip: ReadonlySet<string> = new Set()): PlaybackCandidate | undefined {
  return ranked.find((cand) => !skip.has(cand.key) && primaryLanguage(cand) === code);
}

/** F6 after re-resolving failed: the same language first; else the best remaining, flagged as a language change. */
export function nextAfterFailure(
  ranked: PlaybackCandidate[],
  failed: ReadonlySet<string>,
  language: string | null,
): { candidate: PlaybackCandidate; languageLost: boolean } | null {
  const same = bestIn(ranked, language, failed);
  if (same) return { candidate: same, languageLost: false };
  const other = ranked.find((cand) => !failed.has(cand.key));
  return other ? { candidate: other, languageLost: language != null } : null;
}

/** Spec §6.3: said once when the first wanted language (when it isn't the original anyway) isn't what plays. */
export function preferenceNotice(wanted: string[], originalLanguage: string | undefined, playing: PlaybackCandidate): string | null {
  const first = wanted[0];
  const original = normalizeLanguage(originalLanguage);
  if (!first || first === original || playing.languages.includes(first)) return null;
  const lang = primaryLanguage(playing);
  const what = !lang || lang === original ? "original audio" : languageName(lang);
  return `${languageName(first)} isn't available for this title — playing ${what}`;
}

export function switchNotice(c: PlaybackCandidate, lost: string | null): string {
  return lost ? `Switched to ${c.label} — ${languageName(lost)} isn't on this one.` : `Switched to ${c.label}.`;
}

export function sourceLine(c: PlaybackCandidate): string {
  const lang = primaryLanguage(c);
  return [c.label, lang ? languageName(lang) : null, c.quality?.label].filter(Boolean).join(" · ");
}

/** Native-lane telemetry: the source id and timings only. */
export function nativeReport(
  c: PlaybackCandidate,
  title: { tmdbId: string; type: "movie" | "tv" },
  outcome: ReportOutcome,
  extra: { ttffMs?: number; timeToFailMs?: number } = {},
): ReportArgs {
  return {
    providerId: c.sourceId,
    tmdbId: title.tmdbId,
    mediaType: title.type,
    outcome,
    platform: Platform.OS as ReportArgs["platform"],
    appVersion: Constants.expoConfig?.version,
    lane: "native",
    stage: stageFor(outcome),
    ...(extra.ttffMs != null ? { ttffMs: extra.ttffMs } : {}),
    ...(extra.timeToFailMs != null ? { timeToFailMs: extra.timeToFailMs } : {}),
  };
}
