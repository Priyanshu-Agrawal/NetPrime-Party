/**
 * expo-video tracks → the shapes the controls, the settings sheet and the sync engine use. The structural types
 * mirror expo-video 57.0.5's AudioTrack / SubtitleTrack / VideoTrack, so its objects pass straight in.
 */
import type { MediaTrack, PlayerCapabilities, QualityLevel, SubtitleTrack } from "../types";
import { normalizeLanguage, trackLabels } from "./languages";

export interface NAudio {
  id?: string;
  language: string;
  label: string;
  name?: string;
}
export type NText = NAudio;
export interface NVideo {
  id: string;
  url: string | null;
  size: { width: number; height: number };
  isSupported: boolean;
}

export const AUTO = "Auto";
/** Standard quality tiers; a video's tier is the smallest whose 16:9 frame contains it. */
export const TIERS = [144, 240, 360, 480, 540, 576, 720, 1080, 1440, 2160] as const;

export function tierOf(width: number, height: number): number {
  for (const t of TIERS) if (height <= t && width <= Math.ceil((t * 16) / 9)) return t;
  return TIERS[TIERS.length - 1];
}

/** Distinct tiers of the playable variants, highest first. */
export function qualityTiers(video: NVideo[]): number[] {
  const tiers = new Set<number>();
  for (const v of video) if (v.isSupported && v.size?.height > 0) tiers.add(tierOf(v.size.width, v.size.height));
  return [...tiers].sort((a, b) => b - a);
}

/** "Auto" then each tier; the active row is the user's cap (none ⇒ Auto). Empty when there is nothing to choose. */
export function qualityLevels(video: NVideo[], capTier: number | null): QualityLevel[] {
  const tiers = qualityTiers(video);
  if (tiers.length < 2) return [];
  return [{ label: AUTO, active: capTier == null }, ...tiers.map((t) => ({ label: `${t}p`, active: t === capTier }))];
}

/** "Auto (576p)" while adaptive, "720p" when capped. */
export function qualitySummary(capTier: number | null, current: NVideo | null): string {
  if (capTier != null) return `${capTier}p`;
  return current?.size?.height ? `${AUTO} (${tierOf(current.size.width, current.size.height)}p)` : AUTO;
}

/** The size cap for a picked label; null = no cap (Auto). */
export function capFor(label: string): { tier: number; maxWidth: number; maxHeight: number } | null {
  const m = /^(\d+)p$/.exec(label);
  if (!m) return null;
  const tier = Number(m[1]);
  return { tier, maxWidth: Math.ceil((tier * 16) / 9), maxHeight: tier };
}

export function sameTrack(a: NAudio | null | undefined, b: NAudio | null | undefined): boolean {
  if (!a || !b) return false;
  if (a.id && b.id) return a.id === b.id;
  return a.language === b.language && a.label === b.label;
}

export function audioLevels(audio: NAudio[], selected: NAudio | null): QualityLevel[] {
  const labels = trackLabels(audio);
  return audio.map((t, i) => ({ label: labels[i], active: sameTrack(t, selected) }));
}

export function mediaTracks(audio: NAudio[], audioSel: NAudio | null, text: NText[], textSel: NText | null): MediaTrack[] {
  const a = trackLabels(audio);
  const s = trackLabels(text);
  return [
    ...audio.map((t, i) => ({
      id: t.id ?? `a${i}`,
      language: normalizeLanguage(t.language),
      label: a[i],
      kind: "audio" as const,
      selected: sameTrack(t, audioSel),
    })),
    ...text.map((t, i) => ({
      id: t.id ?? `s${i}`,
      language: normalizeLanguage(t.language),
      label: s[i],
      kind: "text" as const,
      selected: sameTrack(t, textSel),
    })),
  ];
}

/** In-stream subtitle rows for the settings sheet; ids are `in:<index>` so sidecar ids can't collide. */
export function inStreamSubtitles(text: NText[], selected: NText | null): SubtitleTrack[] {
  const labels = trackLabels(text);
  return text.map((t, i) => ({
    id: `in:${i}`,
    label: labels[i],
    language: normalizeLanguage(t.language) ?? "",
    selected: sameTrack(t, selected),
  }));
}

/** What the native player can switch for THIS stream. Party sync arrives in Phase 3. */
export function nativeCapabilities(
  t: { audio: NAudio[]; text: NText[]; video: NVideo[] },
  sidecars: number,
  qualityCap: boolean,
): PlayerCapabilities {
  return {
    fractionalRate: true,
    preciseSeek: true,
    audioTracks: t.audio.length > 1,
    qualitySelect: qualityCap && qualityTiers(t.video).length > 1,
    subtitles: t.text.length + sidecars > 0,
    partySync: false,
  };
}
