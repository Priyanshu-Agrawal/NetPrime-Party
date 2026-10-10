/**
 * The one player contract. Every engine — the WebView hijack today, the native
 * expo-video player in Phase 2 — implements PlayerHandle and emits PlayerEvent,
 * so PlayerControls, the settings sheet and the party sync engine never care
 * which engine is playing. No React Native imports here: this file is shared by
 * native, web and tests.
 */

export type PlayerEventType =
  | "ready"
  | "play"
  | "pause"
  | "seeking"
  | "seeked"
  | "ended"
  | "waiting"
  | "playing"
  | "canplay"
  | "tick"
  | "enterfullscreen"
  | "exitfullscreen"
  | "quality"
  | "audio"
  | "gesture" // first user interaction inside the WebView (play-intent signal)
  | "notFound" // provider "we couldn't find that" wall — no <video> will ever bind
  | "buffering" // v2: raw stall start/end; the party sync engine debounces it
  | "tracks" // v2: the active stream's real tracks
  | "caps" // generic bridge: what the bound <video> supports
  | "subs"; // generic bridge: its subtitle tracks

/** A fatal, main-frame playback failure surfaced to the host for fallback. */
export interface FatalError {
  kind: "http_error" | "render_crash";
  statusCode?: number;
  description?: string;
}

export interface QualityLevel {
  /** Clean label — "1080p"/"Auto" for quality, "Hindi"/"Original" for audio/dub. */
  label: string;
  active: boolean;
}

/** v2: one audio or text track of the active stream. */
/** A subtitle track the generic bridge found on the bound <video> (textTracks). */
export interface SubtitleTrack {
  id: string;
  label: string;
  language: string;
  selected: boolean;
}

export interface MediaTrack {
  id: string;
  /** ISO-639-1 when known, e.g. "hi". Unknown stays undefined — never guessed. */
  language?: string;
  label: string;
  kind: "audio" | "text";
  channels?: number;
  codec?: string;
  selected: boolean;
}

export interface PlayerEvent {
  event: PlayerEventType;
  currentTime: number;
  duration: number;
  paused: boolean;
  /** HTMLMediaElement.readyState. <3 while playing ⇒ the stream stalled/buffering
   *  (segment starvation) — drives the buffering spinner. */
  readyState?: number;
  /** Only on a "quality" event — the provider's available quality levels. */
  qualities?: QualityLevel[];
  /** Only on an "audio" event — the provider's available audio/dub tracks. */
  audios?: QualityLevel[];
  /** v2, on "buffering". */
  buffering?: boolean;
  /** v2, on "tick" when the engine knows it. */
  bufferedAheadSec?: number;
  /** v2, on "tracks". */
  tracks?: MediaTrack[];
  caps?: { quality: boolean; audio: boolean; subtitles: boolean }; // on "caps" (generic bridge)
  subs?: SubtitleTrack[]; // on "subs"
}

/** v2: which engine is playing. UI and sync read capabilities, never this id. */
export type EngineId = "native" | "embedApi" | "embed";

/** v2: what the active engine can do for the active stream on this platform. */
export interface PlayerCapabilities {
  fractionalRate: boolean;
  preciseSeek: boolean;
  audioTracks: boolean;
  qualitySelect: boolean;
  subtitles: boolean;
  partySync: boolean;
}

export interface PlayerHandle {
  play(): void;
  pause(): void;
  /** v2: resolves with the LANDED position in seconds (engines that can't know it
   *  resolve with the requested target). */
  seek(seconds: number): Promise<number>;
  setRate(rate: number): void;
  /** Ask the provider's <video> to enter native HTML5 fullscreen. */
  fullscreen(): void;
  /** Read the provider's quality levels → emits a "quality" PlayerEvent. */
  readQuality(): void;
  /** Switch quality by label (drives videasy's DOM via pointer-dispatch). */
  setQuality(label: string): void;
  /** Read audio/dub tracks → emits an "audio" PlayerEvent. */
  readAudio(): void;
  /** Switch audio/dub by language label (per-device, not synced across the room). */
  setAudio(label: string): void;
  /** Force a fresh load — used to retry the same provider (e.g. re-picked from
   *  the source sheet after it failed), which otherwise wouldn't remount. */
  reload(): void;
  /** v2 */
  getCapabilities(): PlayerCapabilities;
  /** v2 */
  getTracks(): MediaTrack[];
  /** Show a subtitle track by id, or none (`null`). */
  setSubtitle(id: string | null): void;
}
