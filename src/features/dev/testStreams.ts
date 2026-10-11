/**
 * Dev-only public test streams for the native player (spec §6.2.2) — all publisher-hosted test assets, chosen so the
 * Phase 1B gate can exercise audio by language, in-stream and sidecar subtitles, quality ladders, a progressive file,
 * DASH (Android) and the error card. Never shown in a shipped release build (testStreamsGate.ts).
 */
import type { NativeSource, SidecarSubtitle } from "@/components/player/native/NativePlayer";

export interface TestStream {
  id: string;
  title: string;
  note: string;
  source: NativeSource;
  sidecar?: SidecarSubtitle[];
  platforms: { ios: boolean; android: boolean };
}

const BOTH = { ios: true, android: true };
const TOS_SUBS = "https://download.blender.org/demo/movies/ToS/subtitles";

export const TEST_STREAMS: TestStream[] = [
  {
    id: "angel-hls",
    title: "Angel One — 5 audio languages",
    note: "HLS (Google Shaka) · audio en/de/it/fr/es · subtitles en/el/fr/pt-BR · 240p–576p",
    source: { uri: "https://storage.googleapis.com/shaka-demo-assets/angel-one-hls/hls.m3u8", contentType: "hls" },
    platforms: BOTH,
  },
  {
    id: "angel-dash",
    title: "Angel One — DASH",
    note: "DASH (Google Shaka) · same languages · 144p–576p · Android only",
    source: { uri: "https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd", contentType: "dash" },
    platforms: { ios: false, android: true },
  },
  {
    id: "bipbop",
    title: "BipBop — 1080p60 ladder",
    note: "HLS fMP4 (Apple) · 270p–1080p · 60 fps · subtitles",
    source: {
      uri: "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8",
      contentType: "hls",
    },
    platforms: BOTH,
  },
  {
    id: "bbb-muxed",
    title: "Big Buck Bunny — muxed audio",
    note: "HLS TS (Mux) · audio inside the video segments · 184p–1080p",
    source: { uri: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", contentType: "hls" },
    platforms: BOTH,
  },
  {
    id: "tos-24p",
    title: "Tears of Steel — 24 fps film",
    note: "HLS (Mux) · 1920×800 · 24 fps · WebVTT subtitles",
    source: { uri: "https://test-streams.mux.dev/tos_ismc/main.m3u8", contentType: "hls" },
    platforms: BOTH,
  },
  {
    id: "tos-sidecar",
    title: "Tears of Steel — sidecar subtitles",
    note: "Progressive H.264 file (Blender) · SRT subtitles drawn by our overlay",
    source: { uri: "https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov", contentType: "progressive" },
    sidecar: [
      { id: "en", url: `${TOS_SUBS}/TOS-en.srt`, label: "English", language: "en" },
      { id: "de", url: `${TOS_SUBS}/TOS-de.srt`, label: "German", language: "de" },
      { id: "es", url: `${TOS_SUBS}/TOS-es.srt`, label: "Spanish", language: "es" },
      { id: "fr", url: `${TOS_SUBS}/TOS-fr-orig.srt`, label: "French", language: "fr" },
      { id: "it", url: `${TOS_SUBS}/TOS-it.srt`, label: "Italian", language: "it" },
      { id: "ru", url: `${TOS_SUBS}/TOS-ru.srt`, label: "Russian", language: "ru" },
    ],
    platforms: BOTH,
  },
  {
    id: "broken",
    title: "Broken stream — error card",
    note: "A missing file (F4: the error card, never a blank player)",
    source: { uri: "https://storage.googleapis.com/shaka-demo-assets/bearoom-missing/hls.m3u8", contentType: "hls" },
    platforms: BOTH,
  },
];

export function streamsFor(os: "ios" | "android"): TestStream[] {
  return TEST_STREAMS.filter((s) => s.platforms[os]);
}

export function findStream(id?: string): TestStream | undefined {
  return TEST_STREAMS.find((s) => s.id === id);
}
