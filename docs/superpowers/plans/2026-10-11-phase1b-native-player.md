# Phase 1B — Native Player + Full Skin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play streams in a native expo-video player under Bearoom's own controls — audio by language, subtitles
(in-stream and sidecar), Auto + manual quality, speed — and move the WebView lane onto the same upgraded controls.

**Architecture:** `NativePlayer` wraps expo-video 57 and implements the existing `PlayerHandle` contract; a pure
`NativeEventMachine` synthesises the `seeked`/`buffering` events expo-video lacks. A small local Expo module
(`modules/bearoom-player`) caps adaptive quality through the player's own track selection. `NativePlayerView` is the
native lane's screen body (loading card → first-frame crossfade, error card, offline pause/resume); Phase 1B opens it
from a dev-only Test streams list. `PlayerControls` and `PlayerSettingsSheet` gain the §6.2.1 features and serve both
lanes and the party.

**Tech Stack:** Expo SDK 57, RN 0.86 (Fabric), expo-video 57.0.5, Kotlin + media3 (Android), Swift + AVFoundation
(iOS), Jest (jest-expo, react-test-renderer), Vitest (worker), Supabase migration.

**Spec:** `docs/superpowers/specs/2026-10-10-playback-languages-party-design.md` (§9 row 1B, §5.2, §6.2, §6.2.1, §6.2.2,
§6.3, §7 F4/F7/F8, §8, §10). Glass rules: `docs/superpowers/specs/2026-10-11-glass-design.md` (D3, D7).

## Global Constraints

- Expo SDK 57 · RN 0.86 · New Architecture · Hermes V1 · **expo-video 57.0.5** (the version SDK 57 bundles).
- Glass rule (glass spec D7): no blur engine that captures the window, ever; never a WebView as a backdrop; live glass
  over video only when the video renders inside the view tree (`TextureView`). No elevation/glow on video screens.
- No Reanimated `entering`/`exiting`/`layout` props. Never touch `src/ui/BearAlert.tsx` or `.codex/`.
- "Test streams (Phase 1B) are dev-only and never shipped in a release build's UI." (spec §8) — gated by `__DEV__` or
  the build-time `EXPO_PUBLIC_TEST_STREAMS=1`, **and** the remote `nativeLane` flag.
- Stream URLs and cookies are never logged, never sent to `/report`, never written to Postgres (spec §8). Test streams
  are never reported at all (they are not providers).
- No scrapers, no anti-bot workarounds: every test stream is a publisher-hosted public test asset.
- Every visual change is checked by a phone screenshot before it is called done (spec §10, memory
  `ui-animation-quality-bar`).
- Perf numbers: release build, `dumpsys thermalservice` status 0 first, alternating A/B in one session (memory
  `perf-measurement-method`).
- Simulators/emulators are busy with the owner's parallel work (2026-10-11): verify on the Nothing Phone
  (`adb -s P2228K000422`); ask the owner before using the Android emulator or the iOS simulator.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Multi-language HLS keeps audio and subtitles in separate renditions: picking a manual quality must not drop the
   chosen audio language or subtitles (NativePlayer test: `setQuality` never reloads, audio track unchanged).
2. Seeks past the end, before the first frame, or superseded by a newer seek must still resolve with a landed position
   and never hang (machine tests: clamp, timeout, supersede; NativePlayer test: seek before ready).
3. Tracks with odd language codes (`und`, ISO-639-2, regional tags, duplicates) must still give distinct, honest labels
   and never a guessed language (languages tests).
4. Losing the network mid-play — and while the error card shows — must pause and resume from the same position (view
   tests for both).
5. A sidecar subtitle file that fails to download or is malformed shows nothing, crashes nothing, and is retried next
   time (overlay tests: failure not cached; parser ignores garbage).

---

## File map

| File | Responsibility |
|---|---|
| `components/player/native/languages.ts` (+test) | Language codes → names; distinct track labels |
| `components/player/native/tracks.ts` (+test) | expo-video tracks → `QualityLevel`/`MediaTrack`/subtitle rows; quality tiers + caps; capabilities |
| `components/player/native/nativeEvents.ts` (+test) | `NativeEventMachine`: expo-video signals → `PlayerEvent`s incl. synthesised `seeked`/`buffering` |
| `modules/bearoom-player/` (+`index.test.ts`) | Native quality cap (`setMaxVideoSize`/`clearMaxVideoSize`) for Android (media3) and iOS (AVPlayerItem) |
| `components/player/subtitles/parse.ts` (+test) | WebVTT + SRT → cues; active text; next change |
| `components/player/subtitles/SubtitleOverlay.tsx` (+test) | Sidecar cue loading (`loadCues`, `useSidecarCues`) and the overlay |
| `components/player/native/__fakes__/expoVideo.tsx` | Test double for `expo-video` |
| `components/player/native/NativePlayer.tsx` (+test) | expo-video `VideoView` + `PlayerHandle` |
| `components/player/native/surface.ts` | Android surface choice (`surfaceView`/`textureView`) and whether glass sits over the video |
| `components/player/doubleTap.ts` (+test) | Tap → toggle / double-tap seek streaks |
| `components/player/PlayerControls.tsx` (+test) | The §6.2.1 controls layer |
| `components/player/PlayerSettingsSheet.tsx` (+test) | Audio · Subtitles · Quality · Speed · Source rows with current values |
| `components/player/PlayerLoadingCard.tsx`, `PlayerErrorCard.tsx` (+test) | Shared branded loading and error cards (both lanes) |
| `components/player/chips.ts`, `nextEpisode.ts`, `reportFields.ts` (+tests) | Pure helpers for the screens |
| `src/features/dev/testStreams.ts`, `testStreamsGate.ts` (+tests) | Test stream list and the dev gate |
| `src/screens/TestStreamsScreen.tsx`, `src/screens/NativePlayerScreen.tsx` | Dev list; route wrapper |
| `src/features/player/NativePlayerView.tsx` (+test) | Native lane screen body |
| `utils/prefs.ts` | Subtitle size preference |
| `worker/src/reportRow.ts` (+test), `worker/src/schemas.ts`, `worker/src/index.ts` | `/report` lane/stage/ttffMs |
| `supabase/migrations/20261011141809_provider_reports_native_fields.sql` | Three nullable columns (owner yes before applying) |

Branch: `phase1b/native-player` from `feat/improvements`; fast-forward back at the end.

---

### Task 1: Language names and track mapping

**Files:**
- Create: `components/player/native/languages.ts`, `components/player/native/languages.test.ts`
- Create: `components/player/native/tracks.ts`, `components/player/native/tracks.test.ts`

**Interfaces:**
- Consumes: `QualityLevel`, `MediaTrack`, `SubtitleTrack`, `PlayerCapabilities` from `components/player/types.ts`;
  `AudioTrack`, `SubtitleTrack`, `VideoTrack` types from `expo-video` (types only — installed in Task 5; until then use
  the local type aliases below).
- Produces: `normalizeLanguage(code?): string | undefined`, `languageName(code): string`, `trackLabels(tracks): string[]`;
  `AUTO`, `TIERS`, `tierOf(w,h)`, `qualityTiers(video)`, `qualityLevels(video, capTier)`, `qualitySummary(capTier, current)`,
  `capFor(label)`, `sameTrack(a,b)`, `audioLevels(audio, sel)`, `mediaTracks(audio, audioSel, text, textSel)`,
  `inStreamSubtitles(text, sel)`, `nativeCapabilities(t, sidecars, qualityCap)`; types `NAudio`, `NText`, `NVideo`.

expo-video is not installed until Task 5, so `tracks.ts` declares structural types that match expo-video 57.0.5
exactly (checked against `build/VideoPlayer.types.d.ts`); the real objects satisfy them.

- [ ] **Step 1: Write the failing tests**

`components/player/native/languages.test.ts`:
```ts
import { languageName, normalizeLanguage, trackLabels } from "./languages";

describe("normalizeLanguage", () => {
  it.each([
    ["en", "en"],
    ["EN", "en"],
    ["eng", "en"],
    ["hin", "hi"],
    ["en_US", "en"],
    ["pt-BR", "pt-br"],
    ["und", undefined],
    ["", undefined],
    [undefined, undefined],
    ["english", undefined],
  ])("%s → %s", (input, out) => {
    expect(normalizeLanguage(input as string | undefined)).toBe(out);
  });
});

describe("languageName", () => {
  it("names known codes and shows unknown ones as an upper-case code", () => {
    expect(languageName("hi")).toBe("Hindi");
    expect(languageName("pt-br")).toBe("Portuguese (Brazil)");
    expect(languageName("xx")).toBe("XX");
  });
});

describe("trackLabels", () => {
  it("names languages and numbers repeats (Angel One has two English mixes)", () => {
    expect(
      trackLabels([
        { language: "en", label: "stream_5" },
        { language: "de" },
        { language: "it" },
        { language: "fr" },
        { language: "es" },
        { language: "en", label: "stream_6" },
      ]),
    ).toEqual(["English", "German", "Italian", "French", "Spanish", "English · 2"]);
  });

  it("falls back to the track's own label, then a number — never a guessed language", () => {
    expect(trackLabels([{ language: "und", label: "Commentary" }, { language: null, name: "" }])).toEqual([
      "Commentary",
      "Track 2",
    ]);
  });
});
```

`components/player/native/tracks.test.ts`:
```ts
import {
  AUTO,
  audioLevels,
  capFor,
  inStreamSubtitles,
  mediaTracks,
  nativeCapabilities,
  qualityLevels,
  qualitySummary,
  tierOf,
  type NVideo,
} from "./tracks";

const v = (width: number, height: number, isSupported = true): NVideo => ({
  id: `${width}x${height}`,
  url: null,
  size: { width, height },
  isSupported,
});

// Apple BipBop advanced (fMP4) ladder, incl. three 1080p bitrates.
const BIPBOP = [v(960, 540), v(1920, 1080), v(1920, 1080), v(1920, 1080), v(1280, 720), v(768, 432), v(640, 360), v(480, 270)];

describe("tierOf", () => {
  it.each([
    [1920, 1080, 1080],
    [1920, 800, 1080], // scope film — labelled like YouTube does
    [1280, 534, 720],
    [960, 540, 540],
    [768, 576, 576],
    [640, 480, 480],
    [640, 360, 360],
    [480, 270, 360],
    [320, 240, 240],
    [224, 100, 144],
  ])("%ix%i → %ip", (w, h, t) => expect(tierOf(w, h)).toBe(t));
});

describe("qualityLevels", () => {
  it("lists Auto then each distinct tier, highest first", () => {
    expect(qualityLevels(BIPBOP, null).map((q) => q.label)).toEqual([AUTO, "1080p", "720p", "540p", "480p", "360p"]);
    expect(qualityLevels(BIPBOP, null)[0].active).toBe(true);
  });

  it("marks the capped tier active", () => {
    const levels = qualityLevels(BIPBOP, 720);
    expect(levels.find((q) => q.active)?.label).toBe("720p");
  });

  it("offers nothing when there is only one tier or unsupported variants", () => {
    expect(qualityLevels([v(1280, 720)], null)).toEqual([]);
    expect(qualityLevels([v(1280, 720), v(1920, 1080, false)], null)).toEqual([]);
  });
});

describe("qualitySummary / capFor", () => {
  it("summarises Auto with the playing tier, or the cap", () => {
    expect(qualitySummary(null, v(768, 576))).toBe("Auto (576p)");
    expect(qualitySummary(null, null)).toBe(AUTO);
    expect(qualitySummary(720, v(1920, 1080))).toBe("720p");
  });

  it("turns a label into a 16:9 size cap; Auto is no cap", () => {
    expect(capFor("720p")).toEqual({ tier: 720, maxWidth: 1280, maxHeight: 720 });
    expect(capFor("576p")).toEqual({ tier: 576, maxWidth: 1024, maxHeight: 576 });
    expect(capFor(AUTO)).toBeNull();
  });
});

const EN = { id: "a0", language: "en", label: "stream_5" };
const DE = { id: "a1", language: "de", label: "stream_4" };
const SUB_EN = { id: "s0", language: "en", label: "stream_0" };
const SUB_FR = { id: "s1", language: "fr", label: "stream_2" };

describe("track rows", () => {
  it("audio levels carry language names and the active one", () => {
    expect(audioLevels([EN, DE], DE)).toEqual([
      { label: "English", active: false },
      { label: "German", active: true },
    ]);
  });

  it("media tracks list audio then text with ISO-639-1 languages", () => {
    expect(mediaTracks([EN], EN, [SUB_FR], null)).toEqual([
      { id: "a0", language: "en", label: "English", kind: "audio", selected: true },
      { id: "s1", language: "fr", label: "French", kind: "text", selected: false },
    ]);
  });

  it("in-stream subtitle rows get index ids prefixed with in:", () => {
    expect(inStreamSubtitles([SUB_EN, SUB_FR], SUB_FR)).toEqual([
      { id: "in:0", label: "English", language: "en", selected: false },
      { id: "in:1", label: "French", language: "fr", selected: true },
    ]);
  });
});

describe("nativeCapabilities", () => {
  it("reports what this stream can switch", () => {
    const caps = nativeCapabilities({ audio: [EN, DE], text: [], video: BIPBOP }, 0, true);
    expect(caps).toEqual({
      fractionalRate: true,
      preciseSeek: true,
      audioTracks: true,
      qualitySelect: true,
      subtitles: false,
      partySync: false,
    });
  });

  it("hides manual quality without the native cap, and counts sidecar subtitles", () => {
    const caps = nativeCapabilities({ audio: [EN], text: [], video: BIPBOP }, 2, false);
    expect(caps.qualitySelect).toBe(false);
    expect(caps.audioTracks).toBe(false);
    expect(caps.subtitles).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest components/player/native`
Expected: FAIL — `Cannot find module './languages'` / `'./tracks'`.

- [ ] **Step 3: Write the implementation**

`components/player/native/languages.ts`:
```ts
/**
 * Language codes → names for track labels. Players report ISO-639-1 ("en"), ISO-639-2 ("eng") or a regional tag
 * ("pt-BR"); the UI shows one plain name per language and never guesses a missing one (spec §5.3).
 */
const NAMES: Record<string, string> = {
  ar: "Arabic", bn: "Bengali", cs: "Czech", da: "Danish", de: "German", el: "Greek", en: "English", es: "Spanish",
  fa: "Persian", fr: "French", gu: "Gujarati", he: "Hebrew", hi: "Hindi", hr: "Croatian", hu: "Hungarian",
  id: "Indonesian", it: "Italian", ja: "Japanese", kn: "Kannada", ko: "Korean", ml: "Malayalam", mr: "Marathi",
  nl: "Dutch", no: "Norwegian", pa: "Punjabi", pl: "Polish", pt: "Portuguese", "pt-br": "Portuguese (Brazil)",
  ru: "Russian", sv: "Swedish", ta: "Tamil", te: "Telugu", th: "Thai", tr: "Turkish", uk: "Ukrainian", ur: "Urdu",
  vi: "Vietnamese", zh: "Chinese",
};

const ISO_639_2: Record<string, string> = {
  ara: "ar", ben: "bn", chi: "zh", zho: "zh", ces: "cs", cze: "cs", dan: "da", deu: "de", ger: "de", ell: "el",
  gre: "el", eng: "en", spa: "es", fas: "fa", per: "fa", fra: "fr", fre: "fr", guj: "gu", heb: "he", hin: "hi",
  hrv: "hr", hun: "hu", ind: "id", ita: "it", jpn: "ja", kan: "kn", kor: "ko", mal: "ml", mar: "mr", nld: "nl",
  dut: "nl", nor: "no", pan: "pa", pol: "pl", por: "pt", rus: "ru", swe: "sv", tam: "ta", tel: "te", tha: "th",
  tur: "tr", ukr: "uk", urd: "ur", vie: "vi",
};

/** "eng" / "EN" / "en_US" → "en"; "pt-BR" → "pt-br"; unknown or "und" → undefined. */
export function normalizeLanguage(code?: string | null): string | undefined {
  if (!code) return undefined;
  const [raw, region] = code.trim().toLowerCase().replace(/_/g, "-").split("-");
  const base = ISO_639_2[raw] ?? raw;
  if (!/^[a-z]{2}$/.test(base)) return undefined;
  const regional = region ? `${base}-${region}` : undefined;
  return regional && NAMES[regional] ? regional : base;
}

/** "hi" → "Hindi"; codes we have no name for show as "XX". */
export function languageName(code: string): string {
  return NAMES[code] ?? NAMES[code.split("-")[0]] ?? code.toUpperCase();
}

export interface LabelSource {
  language?: string | null;
  label?: string | null;
  name?: string | null;
}

/**
 * One display label per track, in order: the language's name when known, else the track's own label or name, else
 * "Track N". Repeats get " · 2", " · 3" so every row stays distinct.
 */
export function trackLabels(tracks: LabelSource[]): string[] {
  const base = tracks.map((t, i) => {
    const lang = normalizeLanguage(t.language);
    if (lang) return languageName(lang);
    const own = (t.label || t.name || "").trim();
    return own || `Track ${i + 1}`;
  });
  const seen = new Map<string, number>();
  return base.map((b) => {
    const n = (seen.get(b) ?? 0) + 1;
    seen.set(b, n);
    return n === 1 ? b : `${b} · ${n}`;
  });
}
```

`components/player/native/tracks.ts`:
```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest components/player/native`
Expected: PASS (all language and track tests).

- [ ] **Step 5: Commit**

```bash
git add components/player/native/languages.ts components/player/native/languages.test.ts components/player/native/tracks.ts components/player/native/tracks.test.ts
git commit -m "feat(player): language names and expo-video track mapping for the native lane"
```

---

### Task 2: NativeEventMachine — synthesised `seeked` and `buffering`

**Files:**
- Create: `components/player/native/nativeEvents.ts`, `components/player/native/nativeEvents.test.ts`

**Interfaces:**
- Consumes: `PlayerEvent`, `PlayerEventType` from `components/player/types.ts`.
- Produces: `NativeEventMachine` with `setIntent(play)`, `onStatus(status, duration?)`, `onDuration(d)`,
  `onPlaying(isPlaying)`, `onTime(currentTime, bufferedPosition)`, `onEnded()`, `beginSeek(target): Promise<number>`,
  `expireSeek()`, getters `position`, `paused`, `isBuffering`; constants `LAND_TOLERANCE_SEC = 0.25`,
  `SEEK_TIMEOUT_MS = 8000`; type `NativeStatus`.

- [ ] **Step 1: Write the failing test**

`components/player/native/nativeEvents.test.ts`:
```ts
import type { PlayerEvent } from "../types";
import { NativeEventMachine, SEEK_TIMEOUT_MS } from "./nativeEvents";

function setup() {
  const events: PlayerEvent[] = [];
  let now = 1000;
  const m = new NativeEventMachine((e) => events.push(e), () => now);
  const names = () => events.map((e) => e.event);
  return { m, events, names, advance: (ms: number) => (now += ms) };
}

describe("NativeEventMachine", () => {
  it("emits ready once, with the duration", () => {
    const { m, events } = setup();
    m.onStatus("loading");
    m.onStatus("readyToPlay", 600);
    m.onStatus("readyToPlay", 600);
    const ready = events.filter((e) => e.event === "ready");
    expect(ready).toHaveLength(1);
    expect(ready[0].duration).toBe(600);
  });

  it("reports paused from the user's intent, not from isPlaying (which is also false while buffering)", () => {
    const { m, events } = setup();
    m.onStatus("readyToPlay", 600);
    m.setIntent(true);
    m.onPlaying(false);
    expect(events[events.length - 1]).toMatchObject({ event: "play", paused: false });
    expect(events.some((e) => e.event === "pause")).toBe(false);
  });

  it("flags a stall only after the first ready and only while meant to play", () => {
    const { m, events } = setup();
    m.setIntent(true);
    m.onStatus("loading"); // initial load: not a stall
    expect(events.some((e) => e.event === "buffering")).toBe(false);
    m.onStatus("readyToPlay", 600);
    m.onStatus("loading");
    expect(events[events.length - 1]).toMatchObject({ event: "buffering", buffering: true, readyState: 2 });
    m.setIntent(false);
    expect(events.filter((e) => e.event === "buffering").pop()).toMatchObject({ buffering: false });
  });

  it("resolves a seek with the landed position once time reaches the target", async () => {
    const { m, names } = setup();
    m.onStatus("readyToPlay", 600);
    const landed = m.beginSeek(120);
    m.onTime(119.9, 130);
    await expect(landed).resolves.toBe(119.9);
    expect(names()).toContain("seeked");
  });

  it("resolves a keyframe landing after loading → ready, wherever playback landed", async () => {
    const { m } = setup();
    m.onStatus("readyToPlay", 600);
    const landed = m.beginSeek(120);
    m.onStatus("loading");
    m.onTime(117.6, 117.6);
    m.onStatus("readyToPlay");
    await expect(landed).resolves.toBe(117.6);
  });

  it("never hangs: a seek with no landing resolves after the timeout", async () => {
    const { m, advance } = setup();
    m.onStatus("readyToPlay", 600);
    const landed = m.beginSeek(50);
    advance(SEEK_TIMEOUT_MS);
    m.expireSeek();
    await expect(landed).resolves.toBe(0);
  });

  it("clamps the target to the duration", async () => {
    const { m } = setup();
    m.onStatus("readyToPlay", 100);
    const landed = m.beginSeek(500);
    m.onTime(100, 100);
    await expect(landed).resolves.toBe(100);
  });

  it("a newer seek supersedes an older one", async () => {
    const { m } = setup();
    m.onStatus("readyToPlay", 600);
    m.onTime(5, 5);
    const first = m.beginSeek(10);
    const second = m.beginSeek(20);
    await expect(first).resolves.toBe(5);
    m.onTime(20, 30);
    await expect(second).resolves.toBe(20);
  });

  it("ticks with the buffered lead", () => {
    const { m, events } = setup();
    m.onStatus("readyToPlay", 600);
    m.onTime(10, 34);
    expect(events[events.length - 1]).toMatchObject({ event: "tick", currentTime: 10, bufferedAheadSec: 24 });
  });

  it("ends paused", () => {
    const { m, events } = setup();
    m.setIntent(true);
    m.onEnded();
    expect(events[events.length - 1]).toMatchObject({ event: "ended", paused: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest components/player/native/nativeEvents.test.ts`
Expected: FAIL — `Cannot find module './nativeEvents'`.

- [ ] **Step 3: Write the implementation**

`components/player/native/nativeEvents.ts`:
```ts
import type { PlayerEvent, PlayerEventType } from "../types";

export type NativeStatus = "idle" | "loading" | "readyToPlay" | "error";

/** A seek lands when the player reports a position this close to the target (spec §1.1 gate: ≤ 0.25 s). */
export const LAND_TOLERANCE_SEC = 0.25;
/** A seek that never reports landing resolves anyway after this long, with wherever playback is. */
export const SEEK_TIMEOUT_MS = 8000;

interface PendingSeek {
  target: number;
  startedAt: number;
  sawLoading: boolean;
  resolve: (landed: number) => void;
}

/**
 * Turns expo-video's raw signals into the PlayerEvents every engine emits. expo-video has no seek event and shows a
 * stall only as status "loading", so `seeked` and `buffering` are synthesised here (spec §6.2). `paused` follows the
 * user's intent, not `isPlaying` — which is also false while buffering.
 */
export class NativeEventMachine {
  private wantPlaying = false;
  private status: NativeStatus = "idle";
  private time = 0;
  private duration = 0;
  private buffered = 0;
  private ready = false;
  private stalled = false;
  private seek: PendingSeek | null = null;

  constructor(
    private readonly emit: (e: PlayerEvent) => void,
    private readonly now: () => number = Date.now,
  ) {}

  get position(): number {
    return this.time;
  }
  get paused(): boolean {
    return !this.wantPlaying;
  }
  get isBuffering(): boolean {
    return this.stalled;
  }

  setIntent(play: boolean): void {
    if (play === this.wantPlaying) return;
    this.wantPlaying = play;
    this.out(play ? "play" : "pause");
    this.updateStall();
  }

  onStatus(status: NativeStatus, duration?: number): void {
    const prev = this.status;
    this.status = status;
    if (duration != null) this.onDuration(duration);
    if (status === "loading" && this.seek) this.seek.sawLoading = true;
    if (status === "readyToPlay" && !this.ready) {
      this.ready = true;
      this.out("ready");
    }
    if (status === "readyToPlay" && prev === "loading" && this.seek?.sawLoading) this.land();
    this.updateStall();
  }

  onDuration(duration: number): void {
    if (Number.isFinite(duration) && duration > 0) this.duration = duration;
  }

  onPlaying(isPlaying: boolean): void {
    if (isPlaying) this.out("playing");
  }

  onTime(currentTime: number, bufferedPosition: number): void {
    if (Number.isFinite(currentTime)) this.time = currentTime;
    if (Number.isFinite(bufferedPosition)) this.buffered = bufferedPosition;
    if (this.seek && Math.abs(this.time - this.seek.target) <= LAND_TOLERANCE_SEC) this.land();
    else this.expireSeek();
    this.out("tick", { bufferedAheadSec: Math.max(0, this.buffered - this.time) });
  }

  onEnded(): void {
    this.wantPlaying = false;
    this.updateStall();
    this.out("ended");
  }

  /** Starts a seek; resolves with the LANDED position. A newer seek resolves an older one where playback is. */
  beginSeek(target: number): Promise<number> {
    const t = Math.max(0, this.duration > 0 ? Math.min(target, this.duration) : target);
    this.seek?.resolve(this.time);
    this.out("seeking", undefined, t);
    return new Promise((resolve) => {
      this.seek = { target: t, startedAt: this.now(), sawLoading: false, resolve };
    });
  }

  /** Resolves a seek that never reported landing (called by the player's timer and on every tick). */
  expireSeek(): void {
    if (this.seek && this.now() - this.seek.startedAt >= SEEK_TIMEOUT_MS) this.land();
  }

  private land(): void {
    const s = this.seek;
    if (!s) return;
    this.seek = null;
    s.resolve(this.time);
    this.out("seeked");
  }

  private updateStall(): void {
    const stalled = this.ready && this.wantPlaying && this.status === "loading";
    if (stalled === this.stalled) return;
    this.stalled = stalled;
    this.out("buffering", { buffering: stalled });
  }

  private out(event: PlayerEventType, extra?: Partial<PlayerEvent>, currentTime = this.time): void {
    this.emit({
      event,
      currentTime,
      duration: this.duration,
      paused: !this.wantPlaying,
      readyState: this.stalled ? 2 : 4,
      ...extra,
    });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest components/player/native/nativeEvents.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add components/player/native/nativeEvents.ts components/player/native/nativeEvents.test.ts
git commit -m "feat(player): synthesise seeked and buffering for the native player"
```

---

### Task 3: Native quality cap module (`modules/bearoom-player`)

**Files:**
- Create: `modules/bearoom-player/expo-module.config.json`, `modules/bearoom-player/index.ts`,
  `modules/bearoom-player/index.test.ts`
- Create: `modules/bearoom-player/android/build.gradle`,
  `modules/bearoom-player/android/src/main/java/expo/modules/bearoomplayer/BearoomPlayerModule.kt`
- Create: `modules/bearoom-player/ios/BearoomPlayer.podspec`, `modules/bearoom-player/ios/BearoomPlayerModule.swift`

**Interfaces:**
- Consumes: expo-video's `VideoPlayer` shared object (Android class `expo.modules.video.player.VideoPlayer`, public `val
  player: ExoPlayer`; iOS `SharedRef<AVPlayer>`).
- Produces (JS): `setQualityCap(player, cap: { maxWidth: number; maxHeight: number } | null): boolean` and
  `qualityCapAvailable: boolean`.

**Ruling (record in the ledger):** manual quality caps adaptive selection (Android `TrackSelectionParameters`
max video size; iOS `AVPlayerItem.preferredMaximumResolution`) instead of the spec's "load the variant's media playlist +
seek" (§6.2). Multi-language HLS keeps audio and subtitles in separate renditions (Angel One, Apple BipBop); a single
variant playlist carries neither, so the spec's approach would silence the chosen language. Cost if wrong: the module
depends on expo-video internals, re-checked at each SDK bump.

- [ ] **Step 1: Write the failing test**

`modules/bearoom-player/index.test.ts`:
```ts
describe("setQualityCap", () => {
  afterEach(() => jest.resetModules());

  it("caps through the native module, and lifts the cap for Auto", () => {
    const native = { setMaxVideoSize: jest.fn(), clearMaxVideoSize: jest.fn() };
    jest.doMock("expo-modules-core", () => ({ requireOptionalNativeModule: () => native }));
    jest.isolateModules(() => {
      const { setQualityCap, qualityCapAvailable } = require("./index");
      const player = {};
      expect(qualityCapAvailable).toBe(true);
      expect(setQualityCap(player, { maxWidth: 1280, maxHeight: 720 })).toBe(true);
      expect(native.setMaxVideoSize).toHaveBeenCalledWith(player, 1280, 720);
      setQualityCap(player, null);
      expect(native.clearMaxVideoSize).toHaveBeenCalledWith(player);
    });
  });

  it("is a no-op where the module is missing (web, old binary)", () => {
    jest.doMock("expo-modules-core", () => ({ requireOptionalNativeModule: () => null }));
    jest.isolateModules(() => {
      const { setQualityCap, qualityCapAvailable } = require("./index");
      expect(qualityCapAvailable).toBe(false);
      expect(setQualityCap({}, { maxWidth: 1, maxHeight: 1 })).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest modules/bearoom-player`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Write the JS wrapper and module config**

`modules/bearoom-player/index.ts`:
```ts
import { requireOptionalNativeModule } from "expo-modules-core";

interface NativeBearoomPlayer {
  setMaxVideoSize(player: object, maxWidth: number, maxHeight: number): void;
  clearMaxVideoSize(player: object): void;
}

const native = requireOptionalNativeModule<NativeBearoomPlayer>("BearoomPlayer");

/** True when this binary carries the module (manual quality is offered only then). */
export const qualityCapAvailable = !!native;

/**
 * Manual quality for expo-video: caps adaptive selection at a size; `null` lifts the cap (Auto). Audio and subtitle
 * renditions keep playing — nothing reloads. Returns false where the module is missing.
 */
export function setQualityCap(player: object, cap: { maxWidth: number; maxHeight: number } | null): boolean {
  if (!native) return false;
  if (cap) native.setMaxVideoSize(player, cap.maxWidth, cap.maxHeight);
  else native.clearMaxVideoSize(player);
  return true;
}
```

`modules/bearoom-player/expo-module.config.json`:
```json
{
  "platforms": ["apple", "android"],
  "apple": {
    "modules": ["BearoomPlayerModule"]
  },
  "android": {
    "modules": ["expo.modules.bearoomplayer.BearoomPlayerModule"]
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest modules/bearoom-player`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the Android module**

`modules/bearoom-player/android/build.gradle`:
```gradle
plugins {
  id 'com.android.library'
  id 'expo-module-gradle-plugin'
}

group = 'expo.modules.bearoomplayer'
version = '1.0.0'

android {
  namespace "expo.modules.bearoomplayer"
  defaultConfig {
    versionCode 1
    versionName "1.0.0"
  }
}

dependencies {
  // expo-video's player class and the ExoPlayer it wraps; both ship in the app already.
  compileOnly project(':expo-video')
  compileOnly "androidx.media3:media3-exoplayer:${androidxMedia3Version}"
}
```

`modules/bearoom-player/android/src/main/java/expo/modules/bearoomplayer/BearoomPlayerModule.kt`:
```kotlin
package expo.modules.bearoomplayer

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.video.player.VideoPlayer
import kotlinx.coroutines.launch

/**
 * Manual quality for expo-video: caps adaptive track selection at a size instead of reloading one variant, so
 * demuxed audio and subtitle renditions keep playing. ExoPlayer is touched on the main thread only (as expo-video does).
 */
class BearoomPlayerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BearoomPlayer")

    Function("setMaxVideoSize") { ref: VideoPlayer, maxWidth: Int, maxHeight: Int ->
      appContext.mainQueue.launch {
        val exo = ref.player
        exo.trackSelectionParameters = exo.trackSelectionParameters.buildUpon()
          .setMaxVideoSize(maxWidth, maxHeight)
          .build()
      }
    }

    Function("clearMaxVideoSize") { ref: VideoPlayer ->
      appContext.mainQueue.launch {
        val exo = ref.player
        exo.trackSelectionParameters = exo.trackSelectionParameters.buildUpon()
          .clearVideoSizeConstraints()
          .build()
      }
    }
  }
}
```

- [ ] **Step 6: Write the iOS module**

`modules/bearoom-player/ios/BearoomPlayer.podspec` (shape copied from `node_modules/expo-video/ios/ExpoVideo.podspec`;
compare the `platforms`/`swift_version` lines against that file and match them):
```ruby
Pod::Spec.new do |s|
  s.name           = 'BearoomPlayer'
  s.version        = '1.0.0'
  s.summary        = 'Bearoom helpers for expo-video (quality cap)'
  s.description    = 'Caps adaptive quality on the expo-video player.'
  s.author         = 'Bearoom'
  s.homepage       = 'https://github.com/'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,swift}'
end
```

`modules/bearoom-player/ios/BearoomPlayerModule.swift`:
```swift
import AVFoundation
import ExpoModulesCore

/// Manual quality for expo-video: caps adaptive selection at a size (AVPlayerItem.preferredMaximumResolution)
/// instead of reloading one variant, so audio and subtitle renditions keep playing. expo-video's player is a
/// SharedRef<AVPlayer>; its class is internal, so the module takes the shared reference.
public class BearoomPlayerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BearoomPlayer")

    Function("setMaxVideoSize") { (player: SharedRef<AVPlayer>, maxWidth: Double, maxHeight: Double) in
      DispatchQueue.main.async {
        player.ref.currentItem?.preferredMaximumResolution = CGSize(width: maxWidth, height: maxHeight)
      }
    }

    Function("clearMaxVideoSize") { (player: SharedRef<AVPlayer>) in
      DispatchQueue.main.async {
        player.ref.currentItem?.preferredMaximumResolution = .zero
      }
    }
  }
}
```

The native code is compiled in Task 5 (Android, after expo-video is installed) and in the iOS gate leg (Task 14,
simulator time is the owner's call).

- [ ] **Step 7: Commit**

```bash
git add modules/bearoom-player
git commit -m "feat(player): native quality cap for expo-video (Android + iOS)"
```

---

### Task 4: Subtitles — parser and overlay

**Files:**
- Create: `components/player/subtitles/parse.ts`, `components/player/subtitles/parse.test.ts`
- Create: `components/player/subtitles/SubtitleOverlay.tsx`, `components/player/subtitles/SubtitleOverlay.test.tsx`

**Interfaces:**
- Produces: `Cue { start; end; text }`, `parseSubtitles(raw): Cue[]`, `activeText(cues, t): string | null`,
  `nextChange(cues, t): number | null`; `SubtitleSize = "s" | "m" | "l"`, `SUBTITLE_FONT`, `PlaybackClock { time; at;
  playing; rate }`, `clockNow(clock, now)`, `loadCues(url, headers?, fetcher?)`, `useSidecarCues(track?)`,
  `SubtitleOverlay({ cues, clock, offsetSec?, size?, lifted? })`.

- [ ] **Step 1: Write the failing tests**

`components/player/subtitles/parse.test.ts`:
```ts
import { activeText, nextChange, parseSubtitles } from "./parse";

// First cues of Blender's Tears of Steel English subtitles (TOS-en.srt).
const SRT = "﻿1\r\n00:00:23,000 --> 00:00:24,500\r\nYou're a jerk, Thom.\r\n\r\n2\r\n00:00:25,000 --> 00:00:27,000\r\nLook Celia, we have to follow our passions;\r\n";

const VTT = `WEBVTT

NOTE a comment

STYLE
::cue { color: yellow }

intro
00:01.000 --> 00:02.500 align:start position:10%
<i>Hello</i> &amp; welcome

01:02:03.5 --> 01:02:04.000
Line one
Line two
`;

describe("parseSubtitles", () => {
  it("parses SRT (BOM, CRLF, comma milliseconds)", () => {
    expect(parseSubtitles(SRT)).toEqual([
      { start: 23, end: 24.5, text: "You're a jerk, Thom." },
      { start: 25, end: 27, text: "Look Celia, we have to follow our passions;" },
    ]);
  });

  it("parses WebVTT: skips NOTE/STYLE, drops cue settings and tags, decodes entities, keeps line breaks", () => {
    expect(parseSubtitles(VTT)).toEqual([
      { start: 1, end: 2.5, text: "Hello & welcome" },
      { start: 3723.5, end: 3724, text: "Line one\nLine two" },
    ]);
  });

  it("ignores garbage instead of throwing", () => {
    expect(parseSubtitles("<html>404 Not Found</html>")).toEqual([]);
    expect(parseSubtitles("1\n00:00:05,000 --> 00:00:04,000\nbackwards\n")).toEqual([]);
  });
});

describe("activeText / nextChange", () => {
  const cues = [
    { start: 1, end: 3, text: "a" },
    { start: 2, end: 4, text: "b" },
    { start: 6, end: 7, text: "c" },
  ];

  it("shows every cue on screen at t (start inclusive, end exclusive)", () => {
    expect(activeText(cues, 0.9)).toBeNull();
    expect(activeText(cues, 1)).toBe("a");
    expect(activeText(cues, 2.5)).toBe("a\nb");
    expect(activeText(cues, 3)).toBe("b");
    expect(activeText(cues, 4)).toBeNull();
  });

  it("finds the next moment the text can change", () => {
    expect(nextChange(cues, 0)).toBe(1);
    expect(nextChange(cues, 2.5)).toBe(3);
    expect(nextChange(cues, 4.5)).toBe(6);
    expect(nextChange(cues, 7)).toBeNull();
  });
});
```

`components/player/subtitles/SubtitleOverlay.test.tsx`:
```tsx
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { loadCues, SubtitleOverlay, type PlaybackClock } from "./SubtitleOverlay";

const cues = [
  { start: 23, end: 24.5, text: "You're a jerk, Thom." },
  { start: 25, end: 27, text: "Look Celia" },
];
const texts = (r: ReactTestRenderer) =>
  r.root.findAll((n) => typeof n.props.children === "string").map((n) => n.props.children as string);

describe("SubtitleOverlay", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("shows each cue at its time, scheduling to the next change instead of polling", () => {
    const clock: PlaybackClock = { time: 22.9, at: Date.now(), playing: true, rate: 1 };
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<SubtitleOverlay cues={cues} clock={clock} />);
    });
    expect(texts(r)).toEqual([]);
    act(() => jest.advanceTimersByTime(150));
    expect(texts(r)).toEqual(["You're a jerk, Thom."]);
    act(() => jest.advanceTimersByTime(1500));
    expect(texts(r)).toEqual([]);
  });

  it("applies the offset (positive = later)", () => {
    const clock: PlaybackClock = { time: 23.2, at: Date.now(), playing: false, rate: 1 };
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<SubtitleOverlay cues={cues} clock={clock} offsetSec={0.5} />);
    });
    expect(texts(r)).toEqual([]);
    act(() => r.update(<SubtitleOverlay cues={cues} clock={clock} offsetSec={-0.5} />));
    expect(texts(r)).toEqual(["You're a jerk, Thom."]);
  });
});

describe("loadCues", () => {
  it("downloads a file once and parses it", async () => {
    const fetcher = jest.fn(async () => ({ ok: true, text: async () => "1\n00:00:01,000 --> 00:00:02,000\nHi\n" }));
    const url = "https://example.test/a.srt";
    await expect(loadCues(url, undefined, fetcher as unknown as typeof fetch)).resolves.toEqual([
      { start: 1, end: 2, text: "Hi" },
    ]);
    await loadCues(url, undefined, fetcher as unknown as typeof fetch);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failure", async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "" })
      .mockResolvedValueOnce({ ok: true, text: async () => "1\n00:00:01,000 --> 00:00:02,000\nBack\n" });
    const url = "https://example.test/b.vtt";
    await expect(loadCues(url, undefined, fetcher as unknown as typeof fetch)).rejects.toThrow("HTTP 503");
    await expect(loadCues(url, undefined, fetcher as unknown as typeof fetch)).resolves.toEqual([
      { start: 1, end: 2, text: "Back" },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest components/player/subtitles`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementation**

`components/player/subtitles/parse.ts`:
```ts
export interface Cue {
  start: number;
  end: number;
  text: string;
}

const TIMESTAMP = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;

function seconds(s: string): number | null {
  const m = TIMESTAMP.exec(s);
  if (!m) return null;
  const [, h, mm, ss, frac] = m;
  return Number(h ?? 0) * 3600 + Number(mm) * 60 + Number(ss) + Number(frac.padEnd(3, "0")) / 1000;
}

const decode = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

/**
 * Parses WebVTT or SRT into cues sorted by start. Header, NOTE, STYLE and REGION blocks, cue settings, tags and
 * broken cues are dropped; anything that isn't subtitles yields no cues rather than an error.
 */
export function parseSubtitles(raw: string): Cue[] {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const cues: Cue[] = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split("\n");
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const [a, b = ""] = lines[i].split("-->");
    const start = seconds(a);
    const end = seconds(b);
    if (start == null || end == null || end <= start) continue;
    const body = lines
      .slice(i + 1)
      .map((l) => l.replace(/<[^>]+>/g, "").replace(/\{\\[^}]*\}/g, "").trim())
      .filter(Boolean)
      .join("\n");
    if (body) cues.push({ start, end, text: decode(body) });
  }
  return cues.sort((x, y) => x.start - y.start);
}

/** Text of every cue on screen at `t` (overlapping cues stack), or null. Cues must be sorted by start. */
export function activeText(cues: Cue[], t: number): string | null {
  const on: string[] = [];
  for (const c of cues) {
    if (c.start > t) break;
    if (t < c.end) on.push(c.text);
  }
  return on.length ? on.join("\n") : null;
}

/** The next time after `t` at which the shown text can change, or null after the last cue. */
export function nextChange(cues: Cue[], t: number): number | null {
  let next: number | null = null;
  for (const c of cues) {
    if (c.start > t) {
      next = next == null ? c.start : Math.min(next, c.start);
      break;
    }
    if (c.end > t) next = next == null ? c.end : Math.min(next, c.end);
  }
  return next;
}
```

`components/player/subtitles/SubtitleOverlay.tsx`:
```tsx
/**
 * Our own subtitle layer for sidecar files (WebVTT / SRT), because expo-video's source has no sidecar field
 * (spec §6.2). Instead of polling, it schedules one timer to the next moment the text can change.
 */
import { font, ms } from "@/theme/bearoom";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { activeText, nextChange, parseSubtitles, type Cue } from "./parse";

export type SubtitleSize = "s" | "m" | "l";
export const SUBTITLE_FONT: Record<SubtitleSize, number> = { s: ms(14), m: ms(17), l: ms(21) };

/** The last reported playback position and when it was reported. */
export interface PlaybackClock {
  time: number;
  at: number;
  playing: boolean;
  rate: number;
}

/** Where playback is now, extrapolated from the last report. */
export function clockNow(c: PlaybackClock, now: number): number {
  return c.playing ? c.time + ((now - c.at) / 1000) * c.rate : c.time;
}

const cache = new Map<string, Promise<Cue[]>>();

/** Downloads and parses a sidecar file once per URL. Failures are not cached, so the next pick retries. */
export function loadCues(url: string, headers?: Record<string, string>, fetcher: typeof fetch = fetch): Promise<Cue[]> {
  let pending = cache.get(url);
  if (!pending) {
    pending = fetcher(url, { headers })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(parseSubtitles);
    pending.catch(() => cache.delete(url));
    cache.set(url, pending);
  }
  return pending;
}

/** Cues for the chosen sidecar track; [] while loading, after a failure, or with none chosen. */
export function useSidecarCues(track?: { url: string; headers?: Record<string, string> }): Cue[] {
  const [cues, setCues] = useState<Cue[]>([]);
  const url = track?.url;
  const headers = track?.headers;
  useEffect(() => {
    setCues([]);
    if (!url) return;
    let live = true;
    loadCues(url, headers).then(
      (c) => live && setCues(c),
      () => live && setCues([]),
    );
    return () => {
      live = false;
    };
  }, [url, headers]);
  return cues;
}

interface Props {
  cues: Cue[];
  clock: PlaybackClock;
  /** Positive shows subtitles later, negative earlier. */
  offsetSec?: number;
  size?: SubtitleSize;
  /** Raise above the control bar while it shows. */
  lifted?: boolean;
}

export function SubtitleOverlay({ cues, clock, offsetSec = 0, size = "m", lifted = false }: Props) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const step = () => {
      const t = clockNow(clock, Date.now()) - offsetSec;
      setText(activeText(cues, t));
      if (!clock.playing) return;
      const next = nextChange(cues, t);
      if (next == null) return;
      const wait = ((next - t) / Math.max(clock.rate, 0.1)) * 1000 + 15;
      timer = setTimeout(step, Math.min(wait, 60_000));
    };
    step();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [cues, clock, offsetSec]);

  if (!text) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, lifted && styles.lifted]}>
      <Text style={[styles.text, { fontSize: SUBTITLE_FONT[size] }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: ms(24), right: ms(24), bottom: ms(22), alignItems: "center" },
  lifted: { bottom: ms(104) },
  text: {
    color: "#FFFFFF",
    fontFamily: font.bodySemi,
    textAlign: "center",
    backgroundColor: "rgba(0,0,0,0.62)",
    paddingHorizontal: ms(8),
    paddingVertical: ms(3),
    borderRadius: ms(6),
    overflow: "hidden",
  },
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest components/player/subtitles`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/player/subtitles
git commit -m "feat(player): sidecar subtitles — WebVTT/SRT parser and a timer-driven overlay"
```

---

### Task 5: NativePlayer (expo-video behind PlayerHandle)

**Files:**
- Modify: `package.json`, `package-lock.json`, `ios/Podfile.lock` (via `npx expo install expo-video` + `pod install`)
- Create: `components/player/native/__fakes__/expoVideo.tsx`
- Create: `components/player/native/NativePlayer.tsx`, `components/player/native/NativePlayer.test.tsx`
- Create: `components/player/native/surface.ts`

**Interfaces:**
- Consumes: Tasks 1–4; `setQualityCap`, `qualityCapAvailable` from `@/modules/bearoom-player`.
- Produces: `NativePlayer` (forwardRef `PlayerHandle`) with props `NativePlayerProps { source: NativeSource;
  sidecarSubtitles?; autoPlay?; tickInterval?; surfaceType?; subtitleOffsetSec?; subtitleSize?; subtitlesLifted?;
  onPlayerEvent; onFirstFrame?; onFatalError?(message); onQualitySummary?(summary); style? }`; types `NativeSource {
  uri; headers?; contentType? }`, `SidecarSubtitle { id; url; label; language?; headers? }`; subtitle ids `in:<i>` and
  `side:<id>`; `VIDEO_SURFACE`, `GLASS_OVER_VIDEO` from `surface.ts`.

- [ ] **Step 1: Install expo-video and check the native builds still link**

```bash
npx expo install expo-video
cd ios && pod install && cd ..
grep -n '"expo-video"' package.json
```
Expected: `"expo-video": "~57.0.5"` in `package.json`; `pod install` lists `ExpoVideo` and `BearoomPlayer`.

Then confirm Gradle sees both modules (no simulator or emulator involved):
```bash
cd android && JAVA_TOOL_OPTIONS=-Djava.net.preferIPv4Stack=true ./gradlew projects 2>/dev/null | grep -E "expo-video|bearoom-player"; cd ..
```
Expected: both `:expo-video` and `:bearoom-player` listed. If `:expo-video` is missing (consumed as a prebuilt
artifact), replace `compileOnly project(':expo-video')` in `modules/bearoom-player/android/build.gradle` with
`compileOnly "host.exp.exponent:expo.modules.video:57.0.5"` and ledger it as a ruling.

- [ ] **Step 2: Write the expo-video test double**

`components/player/native/__fakes__/expoVideo.tsx`:
```tsx
/** Test double for expo-video: a player whose events tests fire by hand, and a VideoView that renders a View. */
import React from "react";
import { View } from "react-native";

type Listener = (payload?: any) => void;

export class FakeVideoPlayer {
  static last: FakeVideoPlayer | null = null;
  source: unknown;
  playing = false;
  currentTime = 0;
  duration = 0;
  playbackRate = 1;
  preservesPitch = false;
  timeUpdateEventInterval = 0;
  keepScreenOnWhilePlaying = false;
  audioTrack: any = null;
  subtitleTrack: any = null;
  videoTrack: any = null;
  play = jest.fn(() => {
    this.playing = true;
  });
  pause = jest.fn(() => {
    this.playing = false;
  });
  replaceAsync = jest.fn(async (source: unknown) => {
    this.source = source;
  });
  private listeners = new Map<string, Set<Listener>>();

  constructor(source: unknown) {
    this.source = source;
    FakeVideoPlayer.last = this;
  }

  addListener(name: string, l: Listener) {
    const set = this.listeners.get(name) ?? new Set<Listener>();
    set.add(l);
    this.listeners.set(name, set);
    return { remove: () => set.delete(l) };
  }

  emit(name: string, payload?: any) {
    this.listeners.get(name)?.forEach((l) => l(payload));
  }
}

export function useVideoPlayer(source: unknown, setup?: (p: FakeVideoPlayer) => void): FakeVideoPlayer {
  const ref = React.useRef<FakeVideoPlayer | null>(null);
  if (!ref.current) {
    ref.current = new FakeVideoPlayer(source);
    setup?.(ref.current);
  }
  return ref.current;
}

export function VideoView(props: Record<string, unknown>) {
  return <View testID="video-view" {...props} />;
}
```

- [ ] **Step 3: Write the failing test**

`components/player/native/NativePlayer.test.tsx`:
```tsx
import React, { createRef } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { PlayerEvent, PlayerHandle } from "../types";
import { FakeVideoPlayer } from "./__fakes__/expoVideo";
import { NativePlayer } from "./NativePlayer";

jest.mock("expo-video", () => require("./__fakes__/expoVideo"));
const mockCap = jest.fn(() => true);
jest.mock("@/modules/bearoom-player", () => ({
  qualityCapAvailable: true,
  setQualityCap: (...a: unknown[]) => mockCap(...a),
}));

const EN = { id: "a0", language: "en", label: "stream_5" };
const DE = { id: "a1", language: "de", label: "stream_4" };
const SUB_EN = { id: "s0", language: "en", label: "stream_0" };
const v = (w: number, h: number) => ({ id: `${w}x${h}`, url: null, size: { width: w, height: h }, isSupported: true });
const LOAD = {
  videoSource: null,
  duration: 600,
  availableAudioTracks: [EN, DE],
  availableSubtitleTracks: [SUB_EN],
  availableVideoTracks: [v(768, 576), v(640, 480), v(480, 360)],
};

function setup(extra: Partial<React.ComponentProps<typeof NativePlayer>> = {}) {
  const events: PlayerEvent[] = [];
  const ref = createRef<PlayerHandle>();
  const onFatalError = jest.fn();
  const onFirstFrame = jest.fn();
  let r!: ReactTestRenderer;
  act(() => {
    r = create(
      <NativePlayer
        ref={ref}
        source={{ uri: "https://example.test/master.m3u8", contentType: "hls" }}
        onPlayerEvent={(e) => events.push(e)}
        onFatalError={onFatalError}
        onFirstFrame={onFirstFrame}
        {...extra}
      />,
    );
  });
  const player = FakeVideoPlayer.last!;
  const fire = (name: string, payload?: unknown) => act(() => player.emit(name, payload));
  return { r, ref, player, events, fire, onFatalError, onFirstFrame };
}

beforeEach(() => mockCap.mockClear());
// Sidecar picks download their file; keep tests off the network.
beforeAll(() => {
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => "" })) as unknown as typeof fetch;
});

describe("NativePlayer", () => {
  it("starts playing on mount and says so", () => {
    const { player, events } = setup();
    expect(player.play).toHaveBeenCalled();
    expect(player.preservesPitch).toBe(true);
    expect(player.timeUpdateEventInterval).toBe(0.5);
    expect(events.some((e) => e.event === "play" && !e.paused)).toBe(true);
  });

  it("emits ready with the duration", () => {
    const { player, fire, events } = setup();
    player.duration = 600;
    fire("statusChange", { status: "readyToPlay" });
    expect(events.find((e) => e.event === "ready")?.duration).toBe(600);
  });

  it("seek sets the position and resolves with where playback landed", async () => {
    const { ref, player, fire } = setup();
    fire("statusChange", { status: "readyToPlay" });
    let landed: Promise<number> | undefined;
    act(() => {
      landed = ref.current!.seek(120);
    });
    expect(player.currentTime).toBe(120);
    fire("timeUpdate", { currentTime: 119.95, bufferedPosition: 140, currentLiveTimestamp: null, currentOffsetFromLive: null });
    await expect(landed).resolves.toBe(119.95);
  });

  it("a seek before the first frame still resolves (lands on the first tick near the target)", async () => {
    const { ref, fire } = setup();
    let landed: Promise<number> | undefined;
    act(() => {
      landed = ref.current!.seek(30);
    });
    fire("statusChange", { status: "readyToPlay" });
    fire("timeUpdate", { currentTime: 30, bufferedPosition: 40, currentLiveTimestamp: null, currentOffsetFromLive: null });
    await expect(landed).resolves.toBe(30);
  });

  it("lists audio by language and switches by label", () => {
    const { ref, player, fire, events } = setup();
    player.audioTrack = EN;
    fire("sourceLoad", LOAD);
    expect(events.filter((e) => e.event === "audio").pop()?.audios).toEqual([
      { label: "English", active: true },
      { label: "German", active: false },
    ]);
    act(() => ref.current!.setAudio("German"));
    expect(player.audioTrack).toBe(DE);
  });

  it("manual quality caps the player without reloading or touching the audio track", () => {
    const { ref, player, fire, events } = setup();
    player.audioTrack = DE;
    fire("sourceLoad", LOAD);
    act(() => ref.current!.setQuality("480p"));
    expect(mockCap).toHaveBeenCalledWith(player, { maxWidth: 854, maxHeight: 480 });
    expect(player.replaceAsync).not.toHaveBeenCalled();
    expect(player.audioTrack).toBe(DE);
    expect(events.filter((e) => e.event === "quality").pop()?.qualities?.find((q) => q.active)?.label).toBe("480p");
    act(() => ref.current!.setQuality("Auto"));
    expect(mockCap).toHaveBeenLastCalledWith(player, null);
  });

  it("lists in-stream and sidecar subtitles together and switches between them", () => {
    const { ref, player, fire, events, r } = setup({
      sidecarSubtitles: [{ id: "de", url: "https://example.test/de.srt", label: "German" }],
    });
    fire("sourceLoad", LOAD);
    const subs = () => events.filter((e) => e.event === "subs").pop()?.subs ?? [];
    expect(subs().map((s) => s.id)).toEqual(["in:0", "side:de"]);
    act(() => ref.current!.setSubtitle("in:0"));
    expect(player.subtitleTrack).toBe(SUB_EN);
    act(() => ref.current!.setSubtitle("side:de"));
    expect(player.subtitleTrack).toBeNull();
    expect(subs().find((s) => s.selected)?.id).toBe("side:de");
    expect(r.root.findAll((n) => n.props?.testID === "subtitle-overlay-host")).toHaveLength(1);
    act(() => ref.current!.setSubtitle(null));
    expect(subs().some((s) => s.selected)).toBe(false);
  });

  it("reports a fatal error", () => {
    const { fire, onFatalError } = setup();
    fire("statusChange", { status: "error", error: { message: "HTTP 404" } });
    expect(onFatalError).toHaveBeenCalledWith("HTTP 404");
  });

  it("reload resumes from the same position once the new item is ready", async () => {
    const { ref, player, fire } = setup();
    fire("statusChange", { status: "readyToPlay" });
    fire("timeUpdate", { currentTime: 42, bufferedPosition: 50, currentLiveTimestamp: null, currentOffsetFromLive: null });
    player.play.mockClear();
    await act(async () => ref.current!.reload());
    expect(player.replaceAsync).toHaveBeenCalled();
    fire("statusChange", { status: "loading" });
    fire("statusChange", { status: "readyToPlay" });
    expect(player.currentTime).toBe(42);
    expect(player.play).toHaveBeenCalled();
  });

  it("forwards the first frame", () => {
    const { r, onFirstFrame } = setup();
    act(() => r.root.find((n) => n.props?.testID === "video-view").props.onFirstFrameRender());
    expect(onFirstFrame).toHaveBeenCalled();
  });

  it("reports honest capabilities", () => {
    const { ref, player, fire } = setup();
    player.audioTrack = EN;
    fire("sourceLoad", LOAD);
    expect(ref.current!.getCapabilities()).toMatchObject({ audioTracks: true, qualitySelect: true, subtitles: true });
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx jest components/player/native/NativePlayer.test.tsx`
Expected: FAIL — `Cannot find module './NativePlayer'`.

- [ ] **Step 5: Write the implementation**

`components/player/native/surface.ts`:
```ts
/**
 * Android video surface for the native lane. `surfaceView` is composited by the system (no app frame per video
 * frame); `textureView` draws inside the view tree, which live glass over the video needs. Set by the Phase 1B
 * A/B on the phone (docs/project-board.md, "Phase 1B").
 */
export const VIDEO_SURFACE: "surfaceView" | "textureView" = "surfaceView";

/** Live glass over the video needs its frames inside the view tree. */
export const GLASS_OVER_VIDEO = VIDEO_SURFACE === "textureView";
```

`components/player/native/NativePlayer.tsx`:
```tsx
/**
 * NativePlayer — expo-video behind the PlayerHandle contract (spec §5.2, §6.2). Emits the same PlayerEvents as the
 * WebView bridge; `seeked` and `buffering` are synthesised by NativeEventMachine. Manual quality caps the adaptive
 * selection (modules/bearoom-player), so demuxed audio and subtitles keep playing. Sidecar subtitles are drawn by
 * our own overlay, because expo-video sources have no sidecar field.
 */
import { qualityCapAvailable, setQualityCap } from "@/modules/bearoom-player";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { SubtitleOverlay, useSidecarCues, type PlaybackClock, type SubtitleSize } from "../subtitles/SubtitleOverlay";
import type { PlayerEvent, PlayerHandle, SubtitleTrack } from "../types";
import { trackLabels } from "./languages";
import { NativeEventMachine, SEEK_TIMEOUT_MS, type NativeStatus } from "./nativeEvents";
import {
  AUTO,
  audioLevels,
  capFor,
  inStreamSubtitles,
  mediaTracks,
  nativeCapabilities,
  qualityLevels,
  qualitySummary,
  type NAudio,
  type NText,
  type NVideo,
} from "./tracks";

export interface NativeSource {
  uri: string;
  headers?: Record<string, string>;
  contentType?: "auto" | "hls" | "dash" | "progressive";
}

export interface SidecarSubtitle {
  id: string;
  url: string;
  label: string;
  language?: string;
  headers?: Record<string, string>;
}

export interface NativePlayerProps {
  source: NativeSource;
  sidecarSubtitles?: SidecarSubtitle[];
  autoPlay?: boolean;
  /** Seconds between ticks: 0.5 solo; the party will use 0.25 (spec §6.2). */
  tickInterval?: number;
  surfaceType?: "surfaceView" | "textureView";
  subtitleOffsetSec?: number;
  subtitleSize?: SubtitleSize;
  /** Raise sidecar subtitles above the control bar while it shows. */
  subtitlesLifted?: boolean;
  onPlayerEvent: (e: PlayerEvent) => void;
  onFirstFrame?: () => void;
  onFatalError?: (message: string) => void;
  /** "Auto (576p)" / "720p" — the value shown on the quality chip and row. */
  onQualitySummary?: (summary: string) => void;
  style?: StyleProp<ViewStyle>;
}

const SIDECAR = "side:";
const IN_STREAM = "in:";

interface Tracks {
  audio: NAudio[];
  audioSel: NAudio | null;
  text: NText[];
  textSel: NText | null;
  video: NVideo[];
  videoSel: NVideo | null;
}

export const NativePlayer = forwardRef<PlayerHandle, NativePlayerProps>(function NativePlayer(props, ref) {
  const {
    source,
    sidecarSubtitles = [],
    autoPlay = true,
    tickInterval = 0.5,
    surfaceType = "surfaceView",
    subtitleOffsetSec = 0,
    subtitleSize = "m",
    subtitlesLifted = false,
    onFirstFrame,
    style,
  } = props;
  const latest = useRef(props);
  latest.current = props;
  const emit = useCallback((e: PlayerEvent) => latest.current.onPlayerEvent(e), []);
  const machine = useMemo(() => new NativeEventMachine(emit), [emit]);

  const videoSource = useMemo(
    () => ({ uri: source.uri, headers: source.headers, contentType: source.contentType ?? "auto" }),
    [source.uri, source.headers, source.contentType],
  );
  const player = useVideoPlayer(videoSource, (p) => {
    p.timeUpdateEventInterval = tickInterval;
    p.preservesPitch = true;
    p.keepScreenOnWhilePlaying = true;
  });

  const tracks = useRef<Tracks>({ audio: [], audioSel: null, text: [], textSel: null, video: [], videoSel: null });
  const cap = useRef<ReturnType<typeof capFor>>(null);
  const rate = useRef(1);
  const resume = useRef<{ at: number; play: boolean } | null>(null);
  const [sidecarId, setSidecarId] = useState<string | null>(null);
  const sidecarRef = useRef<string | null>(null);
  sidecarRef.current = sidecarId;
  const [clock, setClock] = useState<PlaybackClock>({ time: 0, at: Date.now(), playing: false, rate: 1 });

  const subtitleRows = useCallback(
    (): SubtitleTrack[] => [
      ...inStreamSubtitles(tracks.current.text, sidecarRef.current ? null : tracks.current.textSel),
      ...sidecarSubtitles.map((s) => ({
        id: SIDECAR + s.id,
        label: s.label,
        language: s.language ?? "",
        selected: sidecarRef.current === s.id,
      })),
    ],
    [sidecarSubtitles],
  );

  const publishTracks = useCallback(() => {
    const t = tracks.current;
    const base = { currentTime: machine.position, duration: player.duration || 0, paused: machine.paused };
    emit({ ...base, event: "tracks", tracks: mediaTracks(t.audio, t.audioSel, t.text, t.textSel) });
    emit({ ...base, event: "audio", audios: audioLevels(t.audio, t.audioSel) });
    emit({ ...base, event: "quality", qualities: qualityCapAvailable ? qualityLevels(t.video, cap.current?.tier ?? null) : [] });
    emit({ ...base, event: "subs", subs: subtitleRows() });
    latest.current.onQualitySummary?.(qualitySummary(cap.current?.tier ?? null, t.videoSel));
  }, [emit, machine, player, subtitleRows]);

  const tickClock = useCallback(
    (time: number) => {
      if (sidecarRef.current) setClock({ time, at: Date.now(), playing: player.playing, rate: rate.current });
    },
    [player],
  );

  useEffect(() => {
    const subs = [
      player.addListener("statusChange", ({ status, error }) => {
        machine.onStatus(status as NativeStatus, player.duration);
        if (status === "error") latest.current.onFatalError?.(error?.message ?? "Playback failed");
        const r = resume.current;
        if (status === "readyToPlay" && r) {
          resume.current = null;
          if (r.at > 1) player.currentTime = r.at;
          if (r.play) player.play();
        }
      }),
      player.addListener("playingChange", ({ isPlaying }) => {
        machine.onPlaying(isPlaying);
        tickClock(machine.position);
      }),
      player.addListener("timeUpdate", ({ currentTime, bufferedPosition }) => {
        machine.onTime(currentTime, bufferedPosition);
        tickClock(currentTime);
      }),
      player.addListener("playToEnd", () => machine.onEnded()),
      player.addListener("sourceLoad", (e) => {
        machine.onDuration(e.duration);
        tracks.current = {
          audio: e.availableAudioTracks,
          text: e.availableSubtitleTracks,
          video: e.availableVideoTracks,
          audioSel: player.audioTrack,
          textSel: player.subtitleTrack,
          videoSel: player.videoTrack,
        };
        // A reload makes a new item, which drops the iOS cap.
        if (cap.current) setQualityCap(player, cap.current);
        publishTracks();
      }),
      player.addListener("availableAudioTracksChange", ({ availableAudioTracks }) => {
        tracks.current.audio = availableAudioTracks;
        publishTracks();
      }),
      player.addListener("audioTrackChange", ({ audioTrack }) => {
        tracks.current.audioSel = audioTrack;
        publishTracks();
      }),
      player.addListener("availableSubtitleTracksChange", ({ availableSubtitleTracks }) => {
        tracks.current.text = availableSubtitleTracks;
        publishTracks();
      }),
      player.addListener("subtitleTrackChange", ({ subtitleTrack }) => {
        tracks.current.textSel = subtitleTrack;
        publishTracks();
      }),
      player.addListener("videoTrackChange", ({ videoTrack }) => {
        tracks.current.videoSel = videoTrack;
        publishTracks();
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [player, machine, publishTracks, tickClock]);

  useEffect(() => {
    if (!autoPlay) return;
    machine.setIntent(true);
    player.play();
  }, [autoPlay, machine, player]);

  // A sidecar pick changes the subtitle rows and starts the overlay's clock.
  useEffect(() => {
    publishTracks();
    if (sidecarId) setClock({ time: machine.position, at: Date.now(), playing: player.playing, rate: rate.current });
  }, [sidecarId, publishTracks, machine, player]);

  useImperativeHandle(
    ref,
    (): PlayerHandle => ({
      play: () => {
        machine.setIntent(true);
        player.play();
      },
      pause: () => {
        machine.setIntent(false);
        player.pause();
      },
      seek: (seconds) => {
        const landed = machine.beginSeek(seconds);
        player.currentTime = Math.max(0, seconds);
        const timer = setTimeout(() => machine.expireSeek(), SEEK_TIMEOUT_MS + 50);
        return landed.finally(() => clearTimeout(timer));
      },
      setRate: (r) => {
        rate.current = r;
        player.playbackRate = r;
        tickClock(machine.position);
      },
      fullscreen: () => {},
      readQuality: publishTracks,
      readAudio: publishTracks,
      setQuality: (label) => {
        cap.current = label === AUTO ? null : capFor(label);
        setQualityCap(player, cap.current ? { maxWidth: cap.current.maxWidth, maxHeight: cap.current.maxHeight } : null);
        publishTracks();
      },
      setAudio: (label) => {
        const i = trackLabels(tracks.current.audio).indexOf(label);
        if (i >= 0) player.audioTrack = tracks.current.audio[i];
      },
      setSubtitle: (id) => {
        if (id?.startsWith(SIDECAR)) {
          player.subtitleTrack = null;
          setSidecarId(id.slice(SIDECAR.length));
          return;
        }
        setSidecarId(null);
        const i = id?.startsWith(IN_STREAM) ? Number(id.slice(IN_STREAM.length)) : -1;
        player.subtitleTrack = i >= 0 ? tracks.current.text[i] ?? null : null;
      },
      reload: () => {
        resume.current = { at: machine.position, play: !machine.paused };
        void player.replaceAsync(videoSource);
      },
      getCapabilities: () => nativeCapabilities(tracks.current, sidecarSubtitles.length, qualityCapAvailable),
      getTracks: () => {
        const t = tracks.current;
        return mediaTracks(t.audio, t.audioSel, t.text, t.textSel);
      },
    }),
    [machine, player, publishTracks, sidecarSubtitles.length, tickClock, videoSource],
  );

  const cues = useSidecarCues(sidecarSubtitles.find((s) => s.id === sidecarId));

  return (
    <View style={[styles.root, style]}>
      <VideoView
        player={player}
        nativeControls={false}
        contentFit="contain"
        surfaceType={surfaceType}
        allowsPictureInPicture={false}
        onFirstFrameRender={onFirstFrame}
        style={StyleSheet.absoluteFill}
      />
      {sidecarId ? (
        <View testID="subtitle-overlay-host" pointerEvents="none" style={StyleSheet.absoluteFill}>
          <SubtitleOverlay cues={cues} clock={clock} offsetSec={subtitleOffsetSec} size={subtitleSize} lifted={subtitlesLifted} />
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
});
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx jest components/player/native`
Expected: PASS (Tasks 1, 2 and the 11 NativePlayer tests). If the reload test fails because `replaceAsync`
resolves after the status events, fire the status events after `await act(...)` as written — do not weaken the
assertion.

- [ ] **Step 7: Type-check and build the Android binary**

```bash
npx tsc --noEmit
cd android && JAVA_TOOL_OPTIONS=-Djava.net.preferIPv4Stack=true ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a > $SP/release-1b-t5.log 2>&1; echo "exit $?"; cd ..
```
(`$SP` = the session scratchpad.) Expected: `tsc` clean; Gradle `exit 0` — this compiles `BearoomPlayerModule.kt`
against expo-video and media3.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json ios/Podfile.lock components/player/native
git commit -m "feat(player): NativePlayer — expo-video behind PlayerHandle with tracks, quality cap and sidecar subtitles"
```

---

### Task 6: Shared loading and error cards

**Files:**
- Create: `components/player/PlayerLoadingCard.tsx`, `components/player/PlayerErrorCard.tsx`,
  `components/player/PlayerCards.test.tsx`
- Modify: `components/player/HijackPlayer.tsx` (the cover at ~L664–715, the not-found overlay ~L727–746, the fatal
  overlay ~L749–772, and the now-unused styles/imports)

**Interfaces:**
- Produces: `PlayerLoadingCard({ posterUrl?: string; status: string })` (absolute-fill, pointer-through);
  `PlayerErrorCard({ icon?: IoniconName; title: string; message: string; actions: CardAction[] })` with
  `CardAction { label: string; icon?: IoniconName; kind: "primary" | "ghost"; onPress: () => void }` — each action's
  `accessibilityLabel` is its label.

- [ ] **Step 1: Write the failing test**

`components/player/PlayerCards.test.tsx`:
```tsx
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { PlayerErrorCard } from "./PlayerErrorCard";
import { PlayerLoadingCard } from "./PlayerLoadingCard";

jest.mock("expo-image", () => {
  const { View } = jest.requireActual("react-native");
  return { Image: (p: object) => <View testID="image" {...p} /> };
});

const texts = (r: ReactTestRenderer) =>
  r.root.findAll((n) => typeof n.props.children === "string").map((n) => n.props.children as string);
function render(el: React.ReactElement) {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(el);
  });
  return r;
}

describe("PlayerLoadingCard", () => {
  it("shows the status over the blurred poster and the poster card, and lets touches through", () => {
    const r = render(<PlayerLoadingCard posterUrl="https://image.test/p.jpg" status="Starting…" />);
    expect(texts(r)).toContain("Starting…");
    expect(r.root.findAll((n) => n.props?.testID === "image" && n.props.blurRadius === 25)).toHaveLength(1);
    expect(r.root.findAll((n) => n.props?.pointerEvents === "none").length).toBeGreaterThan(0);
  });

  it("falls back to the brand mark without a poster", () => {
    const r = render(<PlayerLoadingCard status="Getting your stream ready…" />);
    expect(r.root.findAll((n) => n.props?.testID === "image" && n.props.blurRadius === 25)).toHaveLength(0);
    expect(texts(r)).toContain("Getting your stream ready…");
  });
});

describe("PlayerErrorCard", () => {
  it("shows the title, message and every action", () => {
    const retry = jest.fn();
    const other = jest.fn();
    const r = render(
      <PlayerErrorCard
        title="Couldn’t play this stream"
        message="Check your connection and try again."
        actions={[
          { label: "Retry", icon: "refresh", kind: "primary", onPress: retry },
          { label: "Try another source", kind: "ghost", onPress: other },
        ]}
      />,
    );
    expect(texts(r)).toEqual(expect.arrayContaining(["Couldn’t play this stream", "Check your connection and try again."]));
    act(() => r.root.find((n) => n.props?.accessibilityLabel === "Retry" && n.props.onPress).props.onPress());
    act(() => r.root.find((n) => n.props?.accessibilityLabel === "Try another source" && n.props.onPress).props.onPress());
    expect(retry).toHaveBeenCalled();
    expect(other).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest components/player/PlayerCards.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the cards (styles moved verbatim from HijackPlayer)**

`components/player/PlayerLoadingCard.tsx`:
```tsx
/**
 * The branded loading card both lanes show until the video can be seen: blurred poster (expo-image's STATIC
 * blurRadius — not a live capture, so it is safe on a video screen), a clean poster card, and a status row.
 * Pointer-through, so a gesture-gated provider page under it still gets the tap that starts playback.
 */
import { colors, font, ms } from "@/theme/bearoom";
import { absoluteFill } from "@/theme/styles/layout";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

// Vertical scrim over the blurred poster — lighter at the top, deepening toward the bottom (warm charcoal).
const LOADING_SCRIM = ["rgba(16,13,10,0.62)", "rgba(16,13,10,0.94)"] as const;

export function PlayerLoadingCard({ posterUrl, status }: { posterUrl?: string; status: string }) {
  return (
    <View style={styles.loading} pointerEvents="none">
      {posterUrl ? (
        <>
          <Image
            source={{ uri: posterUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            blurRadius={25}
            transition={250}
            cachePolicy="memory-disk"
          />
          <LinearGradient colors={LOADING_SCRIM} style={StyleSheet.absoluteFill} />
        </>
      ) : null}
      <View style={styles.loadingContent}>
        {posterUrl ? (
          <View style={styles.loadingThumbWrap}>
            <Image source={{ uri: posterUrl }} style={styles.loadingThumb} contentFit="cover" transition={250} cachePolicy="memory-disk" />
          </View>
        ) : (
          <View style={styles.loadingBadge}>
            <Image source={require("@/assets/images/brandmark.png")} style={styles.loadingBrandMark} contentFit="contain" />
          </View>
        )}
        <View style={styles.loadingStatusRow}>
          <ActivityIndicator size="small" color={colors.honey} />
          <Text style={styles.loadingSub}>{status}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { ...absoluteFill, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  loadingContent: { alignItems: "center", gap: ms(20), paddingHorizontal: 32 },
  loadingThumbWrap: {
    width: ms(112),
    height: ms(168),
    borderRadius: ms(14),
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)",
  },
  loadingThumb: { width: "100%", height: "100%" },
  loadingBadge: {
    width: ms(76),
    height: ms(76),
    borderRadius: ms(22),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.honeySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.honeyGlow,
  },
  loadingBrandMark: { width: ms(38), height: ms(38) },
  loadingStatusRow: { flexDirection: "row", alignItems: "center", gap: ms(8) },
  loadingSub: { color: colors.textFaint, fontFamily: font.body, fontSize: ms(13), letterSpacing: 0.2 },
});
```

`components/player/PlayerErrorCard.tsx`:
```tsx
/** The §7 error card both lanes show over the player: opaque, no blur or elevation (video screen). */
import { colors } from "@/theme/bearoom";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

export interface CardAction {
  label: string;
  icon?: IoniconName;
  kind: "primary" | "ghost";
  onPress: () => void;
}

export function PlayerErrorCard({
  icon = "cloud-offline-outline",
  title,
  message,
  actions,
}: {
  icon?: IoniconName;
  title: string;
  message: string;
  actions: CardAction[];
}) {
  return (
    <View style={styles.errorOverlay}>
      <Ionicons name={icon} size={46} color={colors.textDim} />
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.errorSub} numberOfLines={2}>
        {message}
      </Text>
      <View style={styles.errorBtns}>
        {actions.map((a) => (
          <TouchableOpacity
            key={a.label}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            onPress={a.onPress}
            style={a.kind === "primary" ? styles.errorPrimary : styles.errorGhost}
            hitSlop={8}
          >
            {a.icon ? <Ionicons name={a.icon} size={16} color={a.kind === "primary" ? colors.onHoney : colors.text} /> : null}
            <Text style={a.kind === "primary" ? styles.errorPrimaryText : styles.errorGhostText}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  errorOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 28,
    backgroundColor: colors.playerBg,
  },
  errorTitle: { color: colors.text, fontSize: 16, fontWeight: "700", textAlign: "center" },
  errorSub: { color: colors.textDim, fontSize: 13, textAlign: "center", lineHeight: 18 },
  errorBtns: { flexDirection: "row", gap: 10, marginTop: 10 },
  errorPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.honey,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
  },
  errorPrimaryText: { color: colors.onHoney, fontSize: 14, fontWeight: "700" },
  errorGhost: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  errorGhostText: { color: colors.text, fontSize: 14, fontWeight: "600" },
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest components/player/PlayerCards.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Use the cards in HijackPlayer (behaviour unchanged)**

In `components/player/HijackPlayer.tsx`, replace the cover's inner `<View style={styles.loading} pointerEvents="none">…</View>`
with `<PlayerLoadingCard posterUrl={posterUrl} status="Getting your stream ready…" />` (keep the surrounding
`loadingCoverVisible(...) &&` condition and its comments). Replace the not-found overlay with:
```tsx
<PlayerErrorCard
  icon="film-outline"
  title="No stream found"
  message={`${provider.name} couldn’t find this title. Try a different source.`}
  actions={[
    ...(onSwitchSource
      ? [{ label: "Try another source", icon: "swap-horizontal" as const, kind: "primary" as const, onPress: switchSource }]
      : []),
    { label: "Retry", kind: "ghost" as const, onPress: manualRetry },
  ]}
/>
```
and the fatal overlay with:
```tsx
<PlayerErrorCard
  title={`Couldn’t load ${provider.name}`}
  message={
    fatalError.kind === "render_crash"
      ? "The player crashed unexpectedly."
      : fatalError.statusCode
        ? `The source returned an error (${fatalError.statusCode}).`
        : "Check your connection — we’ll keep retrying."
  }
  actions={[
    { label: "Retry", icon: "refresh", kind: "primary", onPress: manualRetry },
    ...(onSwitchSource ? [{ label: "Try another source", kind: "ghost" as const, onPress: switchSource }] : []),
  ]}
/>
```
Delete the styles now unused in HijackPlayer (`loading*`, `error*`, `LOADING_SCRIM`) and any import left unused
(`Image`, `LinearGradient`, `ActivityIndicator`, `Ionicons` — keep whichever other code still uses).

- [ ] **Step 6: Verify nothing else changed**

Run: `npx tsc --noEmit && npx eslint components/player/HijackPlayer.tsx components/player/PlayerLoadingCard.tsx components/player/PlayerErrorCard.tsx && npx jest components/player`
Expected: clean, PASS. (Visual parity is checked on the phone in Task 14: loading cover and error card screenshots.)

- [ ] **Step 7: Commit**

```bash
git add components/player/PlayerLoadingCard.tsx components/player/PlayerErrorCard.tsx components/player/PlayerCards.test.tsx components/player/HijackPlayer.tsx
git commit -m "refactor(player): shared loading and error cards for both lanes"
```

---

### Task 7: Controls layer — gestures, lock, scrub, chips, next episode

**Files:**
- Create: `components/player/doubleTap.ts`, `components/player/doubleTap.test.ts`
- Modify: `components/player/PlayerControls.tsx` (full replacement below), `components/player/PlayerControls.test.tsx`

**Interfaces:**
- Produces: `zoneOf`, `onTap`, `NO_TAPS`, `DOUBLE_TAP_MS = 300`, `STREAK_MS = 700`, `SEEK_STEP_SEC = 10`, types
  `TapState`, `TapAction`, `Zone`; `PlaybackState` gains `bufferedTime?: number`; `PlayerControlsProps` gains
  `chips?: ControlChips` and `onNextEpisode?: () => void`; exports `ControlChips { audio?; subtitles?: string | null;
  quality? }`, `chipText(chips)`, `fmt(sec)`, `AUTO_HIDE_MS = 3000`, `SPINNER_DELAY_MS = 300`.
- Accessibility labels (tests and uiautomator use them): `Player surface`, `Lock controls`, `Unlock controls`,
  `Next episode`, `Episodes`, `Player settings`, `Fullscreen` / `Exit fullscreen`, `Toggle remaining time`,
  `Playback options: <chip text>`.

- [ ] **Step 1: Write the failing double-tap tests**

`components/player/doubleTap.test.ts`:
```ts
import { DOUBLE_TAP_MS, NO_TAPS, onTap, STREAK_MS, zoneOf, type TapState } from "./doubleTap";

const W = 300;
function run(taps: [x: number, t: number][], canSeek = true) {
  let s: TapState = NO_TAPS;
  return taps.map(([x, t]) => {
    const r = onTap(s, x, W, t, canSeek);
    s = r.state;
    return r.action;
  });
}

describe("zoneOf", () => {
  it("splits the width in thirds; no width means centre", () => {
    expect(zoneOf(10, W)).toBe("left");
    expect(zoneOf(150, W)).toBe("center");
    expect(zoneOf(290, W)).toBe("right");
    expect(zoneOf(10, 0)).toBe("center");
  });
});

describe("onTap", () => {
  it("a single tap toggles the controls", () => {
    expect(run([[280, 0]])).toEqual([{ kind: "toggle" }]);
  });

  it("a double tap on the right seeks forward and undoes the first tap's toggle", () => {
    expect(run([[280, 0], [280, DOUBLE_TAP_MS - 1]])[1]).toEqual({ kind: "seek", zone: "right", streak: 1, undoToggle: true });
  });

  it("each further tap on the same side within the streak window adds 10 s", () => {
    const a = run([[20, 0], [20, 200], [20, 200 + STREAK_MS - 1], [20, 200 + 2 * STREAK_MS - 2]]);
    expect(a.slice(1).map((x) => (x.kind === "seek" ? x.streak : 0))).toEqual([1, 2, 3]);
  });

  it("taps too far apart, in the centre, on different sides, or by a guest only toggle", () => {
    expect(run([[280, 0], [280, DOUBLE_TAP_MS + 50]])[1]).toEqual({ kind: "toggle" });
    expect(run([[150, 0], [150, 100]])[1]).toEqual({ kind: "toggle" });
    expect(run([[20, 0], [280, 100]])[1]).toEqual({ kind: "toggle" });
    expect(run([[280, 0], [280, 100]], false)[1]).toEqual({ kind: "toggle" });
  });

  it("a streak ends after the window; the next tap toggles", () => {
    expect(run([[280, 0], [280, 100], [280, 100 + STREAK_MS + 1]])[2]).toEqual({ kind: "toggle" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest components/player/doubleTap.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `doubleTap.ts`**

```ts
/** Tap handling for the player surface (spec §6.2.1): tap toggles; double tap left/right seeks ∓10 s, stacking. */
export type Zone = "left" | "center" | "right";

export const DOUBLE_TAP_MS = 300;
export const STREAK_MS = 700;
export const SEEK_STEP_SEC = 10;

export interface TapState {
  at: number;
  zone: Zone | null;
  streak: number;
}

export const NO_TAPS: TapState = { at: -Infinity, zone: null, streak: 0 };

export type TapAction =
  | { kind: "toggle" }
  | { kind: "seek"; zone: "left" | "right"; streak: number; undoToggle: boolean };

export function zoneOf(x: number, width: number): Zone {
  if (width <= 0) return "center";
  const f = x / width;
  return f < 1 / 3 ? "left" : f > 2 / 3 ? "right" : "center";
}

/**
 * A second tap on the same side within DOUBLE_TAP_MS starts a seek streak (and undoes the first tap's toggle); each
 * further tap there within STREAK_MS of the last adds another step. Anything else toggles the controls.
 */
export function onTap(s: TapState, x: number, width: number, now: number, canSeek: boolean): { state: TapState; action: TapAction } {
  const zone = zoneOf(x, width);
  if (canSeek && zone !== "center" && zone === s.zone) {
    const gap = now - s.at;
    if (s.streak > 0 && gap <= STREAK_MS) {
      const streak = s.streak + 1;
      return { state: { at: now, zone, streak }, action: { kind: "seek", zone, streak, undoToggle: false } };
    }
    if (s.streak === 0 && gap <= DOUBLE_TAP_MS) {
      return { state: { at: now, zone, streak: 1 }, action: { kind: "seek", zone, streak: 1, undoToggle: true } };
    }
  }
  return { state: { at: now, zone, streak: 0 }, action: { kind: "toggle" } };
}
```

Run: `npx jest components/player/doubleTap.test.ts` → Expected: PASS.

- [ ] **Step 4: Add the failing controls tests**

Append to `components/player/PlayerControls.test.tsx` (keep the existing tests; they must still pass):
```tsx
import { type PlayerControlsHandle } from "./PlayerControls";

const glassShown = (r: ReactTestRenderer) =>
  r.root.findAll((n) => n.props?.testID === "glass").every((g) => g.props.visible === true);
const surface = (r: ReactTestRenderer) =>
  r.root.find((n) => n.props?.accessibilityLabel === "Player surface" && typeof n.props.onPress === "function");
const byLabel = (r: ReactTestRenderer, label: string) =>
  r.root.find((n) => n.props?.accessibilityLabel === label && typeof n.props.onPress === "function");
const hasLabel = (r: ReactTestRenderer, label: string) =>
  r.root.findAll((n) => n.props?.accessibilityLabel === label).length > 0;
function sized(r: ReactTestRenderer) {
  act(() => surface(r).props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 200 } } }));
}

describe("PlayerControls gestures", () => {
  afterEach(() => jest.restoreAllMocks());

  it("double-tapping the right third seeks +10 s per tap and leaves the controls as they were", () => {
    const onSeekBy = jest.fn();
    const now = jest.spyOn(Date, "now");
    const r = render(<PlayerControls {...base} onSeekBy={onSeekBy} onBack={() => {}} />);
    sized(r);
    now.mockReturnValue(1000);
    act(() => surface(r).props.onPress({ nativeEvent: { locationX: 280 } }));
    now.mockReturnValue(1200);
    act(() => surface(r).props.onPress({ nativeEvent: { locationX: 280 } }));
    expect(onSeekBy).toHaveBeenCalledTimes(1);
    expect(onSeekBy).toHaveBeenLastCalledWith(10);
    expect(glassShown(r)).toBe(true);
    now.mockReturnValue(1600);
    act(() => surface(r).props.onPress({ nativeEvent: { locationX: 280 } }));
    expect(onSeekBy).toHaveBeenCalledTimes(2);
    expect(texts(r)).toContain("20 s");
  });

  it("double-tapping the left third seeks back", () => {
    const onSeekBy = jest.fn();
    const now = jest.spyOn(Date, "now");
    const r = render(<PlayerControls {...base} onSeekBy={onSeekBy} />);
    sized(r);
    now.mockReturnValue(1000);
    act(() => surface(r).props.onPress({ nativeEvent: { locationX: 20 } }));
    now.mockReturnValue(1100);
    act(() => surface(r).props.onPress({ nativeEvent: { locationX: 20 } }));
    expect(onSeekBy).toHaveBeenCalledWith(-10);
  });

  it("a guest's double tap only toggles", () => {
    const onSeekBy = jest.fn();
    const now = jest.spyOn(Date, "now");
    const r = render(<PlayerControls {...base} canControl={false} onSeekBy={onSeekBy} />);
    sized(r);
    now.mockReturnValue(1000);
    act(() => surface(r).props.onPress({ nativeEvent: { locationX: 280 } }));
    now.mockReturnValue(1100);
    act(() => surface(r).props.onPress({ nativeEvent: { locationX: 280 } }));
    expect(onSeekBy).not.toHaveBeenCalled();
  });

  it("lock hides the controls; a tap shows only the unlock pill, which brings them back", () => {
    const r = render(<PlayerControls {...base} onBack={() => {}} />);
    act(() => byLabel(r, "Lock controls").props.onPress());
    expect(glassShown(r)).toBe(false);
    act(() => surface(r).props.onPress({ nativeEvent: { locationX: 150 } }));
    expect(glassShown(r)).toBe(false);
    act(() => byLabel(r, "Unlock controls").props.onPress());
    expect(glassShown(r)).toBe(true);
    expect(hasLabel(r, "Unlock controls")).toBe(false);
  });
});

describe("PlayerControls timing", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("hides itself 3 s after playback starts", () => {
    const ref = React.createRef<PlayerControlsHandle>();
    const r = render(<PlayerControls ref={ref} {...base} onBack={() => {}} />);
    act(() => ref.current!.setPlayback({ currentTime: 1, duration: 100, paused: false }));
    act(() => jest.advanceTimersByTime(2900));
    expect(glassShown(r)).toBe(true);
    act(() => jest.advanceTimersByTime(200));
    expect(glassShown(r)).toBe(false);
  });

  it("shows the buffering spinner only after a 300 ms stall, and drops it at once", () => {
    const ref = React.createRef<PlayerControlsHandle>();
    const r = render(<PlayerControls ref={ref} {...base} />);
    const spinner = () => r.root.findAll((n) => n.props?.accessibilityLabel === "Buffering").length > 0;
    act(() => ref.current!.setPlayback({ currentTime: 5, duration: 100, paused: false, readyState: 2 }));
    act(() => jest.advanceTimersByTime(250));
    expect(spinner()).toBe(false);
    act(() => jest.advanceTimersByTime(100));
    expect(spinner()).toBe(true);
    act(() => ref.current!.setPlayback({ currentTime: 5, duration: 100, paused: false, readyState: 4 }));
    expect(spinner()).toBe(false);
  });
});

describe("PlayerControls bar", () => {
  it("shows the remaining time and toggles to the total", () => {
    const ref = React.createRef<PlayerControlsHandle>();
    const r = render(<PlayerControls ref={ref} {...base} />);
    act(() => ref.current!.setPlayback({ currentTime: 100, duration: 600, paused: true }));
    expect(texts(r)).toContain("−8:20");
    act(() => byLabel(r, "Toggle remaining time").props.onPress());
    expect(texts(r)).toContain("10:00");
  });

  it("draws the buffered range", () => {
    const ref = React.createRef<PlayerControlsHandle>();
    const r = render(<PlayerControls ref={ref} {...base} />);
    act(() => ref.current!.setPlayback({ currentTime: 100, duration: 600, paused: true, bufferedTime: 300 }));
    const buffered = r.root.find((n) => n.props?.testID === "buffered");
    expect(StyleSheet.flatten(buffered.props.style).width).toBe("50%");
  });

  it("shows one quick chip with the current audio, CC and quality, which opens the settings", () => {
    const onOpenSettings = jest.fn();
    const r = render(
      <PlayerControls {...base} onOpenSettings={onOpenSettings} chips={{ audio: "Hindi", subtitles: "English", quality: "1080p" }} />,
    );
    act(() => byLabel(r, "Playback options: Hindi · CC · 1080p").props.onPress());
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it("offers Next episode to whoever controls playback", () => {
    const onNextEpisode = jest.fn();
    const host = render(<PlayerControls {...base} onNextEpisode={onNextEpisode} />);
    act(() => byLabel(host, "Next episode").props.onPress());
    expect(onNextEpisode).toHaveBeenCalled();
    const guest = render(<PlayerControls {...base} canControl={false} onNextEpisode={onNextEpisode} />);
    expect(hasLabel(guest, "Next episode")).toBe(false);
  });
});
```

- [ ] **Step 5: Run to verify they fail**

Run: `npx jest components/player/PlayerControls.test.tsx`
Expected: FAIL — `Player surface` / `Lock controls` / `Toggle remaining time` / `buffered` not found; the existing
header/glass tests still pass.

- [ ] **Step 6: Replace `components/player/PlayerControls.tsx`**

```tsx
/**
 * PlayerControls — the one Bearoom control layer, for every engine (native expo-video and the WebView bridge) and
 * for solo and party (spec §6.2.1).
 *
 * Presentational and stateless about transport: the callbacks route through the room authority in a party, so a
 * press stays in sync. Playback state arrives imperatively (`setPlayback`) so the parent doesn't re-render its chat
 * list on every tick.
 *
 * Gestures: a tap toggles the controls; for anyone who may drive playback a double tap on the left/right third seeks
 * ∓10 s and every further tap there adds 10 s; the lock ignores every touch except the unlock pill.
 */
import GlassCard from "@/components/ui/GlassCard";
import { Glass, GlassVisible } from "@/src/ui/glass";
import { colors, font, ms, radius } from "@/theme/bearoom";
import { absoluteFill } from "@/theme/styles/layout";
import { gradients } from "@/theme/styles/gradients";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NO_TAPS, onTap, SEEK_STEP_SEC, STREAK_MS, type TapState } from "./doubleTap";

export interface PlaybackState {
  currentTime: number;
  duration: number;
  paused: boolean;
  /** HTMLMediaElement.readyState; <3 while playing ⇒ the stream stalled → spinner. */
  readyState?: number;
  /** Media time buffered up to, in seconds, when the engine knows it. */
  bufferedTime?: number;
}

export interface PlayerControlsHandle {
  setPlayback: (s: PlaybackState) => void;
}

/** Current audio / subtitles / quality, shown as one quick chip. */
export interface ControlChips {
  audio?: string;
  subtitles?: string | null;
  quality?: string;
}

export interface PlayerControlsProps {
  /** May this user drive playback? (party host / permitted guest) */
  canControl: boolean;
  /** Room's authoritative status is "playing" — drives the guest sync affordance. */
  roomPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  /** Absolute seek, seconds. */
  onSeekTo: (sec: number) => void;
  /** Relative seek, seconds (±10). */
  onSeekBy: (deltaSec: number) => void;
  /** Toggle fullscreen / landscape. */
  onToggleFullscreen?: () => void;
  /** Guest tap-to-sync (jump to live) when out of sync. */
  onTapSync?: () => void;
  /** Open the player settings sheet. */
  onOpenSettings?: () => void;
  /** Open the episode picker — provided only for TV shows. */
  onEpisodes?: () => void;
  /** Play the next episode (solo, or the host in a party). */
  onNextEpisode?: () => void;
  /** Back button callback (e.g. exit fullscreen). */
  onBack?: () => void;
  /** Title shown in the top overlay header. */
  title?: string;
  /** Subtitle (e.g. "S1 · E1") shown under the title. */
  subtitle?: string;
  /** Whether the player is fullscreen/immersive. */
  fullscreen?: boolean;
  /** The player sits below the screen's own header, so the overlay header hugs the video's top edge. */
  embedded?: boolean;
  /** Custom top-bar node for the overlay (the party fills this). */
  topBar?: React.ReactNode;
  /** Extra overlay children (badges, reaction pills) that fade with the controls. */
  overlayChildren?: React.ReactNode;
  /** Current audio / subtitles / quality for the quick chip (needs onOpenSettings). */
  chips?: ControlChips;
  /** Notified when the auto-hide visibility flips. */
  onVisibilityChange?: (visible: boolean) => void;
}

export const AUTO_HIDE_MS = 3000;
export const SPINNER_DELAY_MS = 300;
const UNLOCK_PILL_MS = 2500;

export function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(ss).padStart(2, "0")}`;
}

/** "Hindi · CC · 1080p"; empty while nothing is known. */
export function chipText(c?: ControlChips): string {
  if (!c) return "";
  return [c.audio, c.subtitles ? "CC" : null, c.quality].filter(Boolean).join(" · ");
}

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

function BarButton({ label, icon, size = ms(17), onPress }: { label: string; icon: IoniconName; size?: number; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.barBtn, pressed && styles.pressedFlat]}
      onPress={onPress}
      hitSlop={8}
    >
      <Ionicons name={icon} size={size} color={colors.text} />
    </Pressable>
  );
}

export const PlayerControls = forwardRef<PlayerControlsHandle, PlayerControlsProps>(
  (
    {
      canControl,
      roomPlaying,
      onPlay,
      onPause,
      onSeekTo,
      onSeekBy,
      onToggleFullscreen,
      onTapSync,
      onOpenSettings,
      onEpisodes,
      onNextEpisode,
      onBack,
      title,
      subtitle,
      fullscreen,
      embedded,
      topBar,
      overlayChildren,
      chips,
      onVisibilityChange,
    },
    ref,
  ) => {
    const insets = useSafeAreaInsets();
    const headerTop = fullscreen || embedded ? ms(10) : Math.max(insets.top, ms(10));
    const [paused, setPaused] = useState(true);
    // Progress is stepwise (one setState per tick), not a 60 fps animation: a JS-driven glide restarts every tick
    // and congests the UI thread the video draws on.
    const [displayTime, setDisplayTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [bufferedTime, setBufferedTime] = useState(0);
    const [visible, setVisible] = useState(true);
    const visibleRef = useRef(true);
    const [locked, setLocked] = useState(false);
    const lockedRef = useRef(false);
    const [unlockPill, setUnlockPill] = useState(false);
    const unlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [barWidth, setBarWidth] = useState(0);
    const [scrubbing, setScrubbing] = useState(false);
    const [showRemaining, setShowRemaining] = useState(true);
    const [buffering, setBuffering] = useState(false);
    const bufferingRef = useRef(false);
    const bufferTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scrubbingRef = useRef(false);
    // Commit-hold: after release, keep the thumb at the dropped spot until the video reaches it.
    const seekTargetRef = useRef<number | null>(null);
    const fade = useRef(new Animated.Value(1)).current;
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const surfaceWidth = useRef(0);
    const taps = useRef<TapState>(NO_TAPS);
    const visibleBeforeTap = useRef(true);
    const [ripple, setRipple] = useState<{ zone: "left" | "right"; sec: number } | null>(null);
    const rippleFade = useRef(new Animated.Value(0)).current;
    const shown = visible && !locked;

    useEffect(() => {
      visibleRef.current = visible;
    }, [visible]);
    useEffect(() => {
      lockedRef.current = locked;
    }, [locked]);

    useImperativeHandle(
      ref,
      () => ({
        setPlayback: (s) => {
          setPaused(s.paused);
          if (Number.isFinite(s.duration)) setDuration(s.duration);
          if (typeof s.bufferedTime === "number" && Number.isFinite(s.bufferedTime)) setBufferedTime(s.bufferedTime);
          // A stall while meant to be playing shows the spinner after a short delay, so a brief dip (just after a
          // seek) doesn't flash it.
          const stalled = !s.paused && typeof s.readyState === "number" && s.readyState < 3;
          if (stalled && !bufferingRef.current) {
            if (bufferTimer.current == null) {
              bufferTimer.current = setTimeout(() => {
                bufferTimer.current = null;
                bufferingRef.current = true;
                setBuffering(true);
              }, SPINNER_DELAY_MS);
            }
          } else if (!stalled) {
            if (bufferTimer.current != null) {
              clearTimeout(bufferTimer.current);
              bufferTimer.current = null;
            }
            if (bufferingRef.current) {
              bufferingRef.current = false;
              setBuffering(false);
            }
          }
          if (seekTargetRef.current != null && Math.abs(s.currentTime - seekTargetRef.current) < 1.5) {
            seekTargetRef.current = null;
          }
          if (scrubbingRef.current || seekTargetRef.current != null || !Number.isFinite(s.currentTime)) return;
          setDisplayTime(s.currentTime);
        },
      }),
      [],
    );

    const clearHide = useCallback(() => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
    }, []);

    const armHide = useCallback(() => {
      clearHide();
      if (paused || scrubbing) return; // stay up while paused / scrubbing
      hideTimer.current = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
    }, [paused, scrubbing, clearHide]);

    useEffect(() => {
      Animated.timing(fade, { toValue: shown ? 1 : 0, duration: 190, useNativeDriver: true }).start();
      onVisibilityChange?.(shown);
      if (shown) armHide();
      return clearHide;
    }, [shown, armHide, clearHide, fade, onVisibilityChange]);

    // Surface the controls whenever playback flips (e.g. host paused remotely) — unless locked.
    useEffect(() => {
      if (!lockedRef.current) setVisible(true);
    }, [paused]);

    useEffect(
      () => () => {
        if (bufferTimer.current) clearTimeout(bufferTimer.current);
        if (unlockTimer.current) clearTimeout(unlockTimer.current);
      },
      [],
    );

    const show = useCallback(() => {
      setVisible(true);
      armHide();
    }, [armHide]);

    const revealUnlock = useCallback(() => {
      setUnlockPill(true);
      if (unlockTimer.current) clearTimeout(unlockTimer.current);
      unlockTimer.current = setTimeout(() => setUnlockPill(false), UNLOCK_PILL_MS);
    }, []);

    const lock = useCallback(() => {
      clearHide();
      setLocked(true);
      setVisible(false);
    }, [clearHide]);

    const unlock = useCallback(() => {
      if (unlockTimer.current) clearTimeout(unlockTimer.current);
      setUnlockPill(false);
      setLocked(false);
      setVisible(true);
    }, []);

    const onSurfacePress = useCallback(
      (e?: GestureResponderEvent) => {
        if (lockedRef.current) {
          revealUnlock();
          return;
        }
        const x = e?.nativeEvent?.locationX ?? 0;
        const { state, action } = onTap(taps.current, x, surfaceWidth.current, Date.now(), canControl);
        taps.current = state;
        if (action.kind === "toggle") {
          visibleBeforeTap.current = visibleRef.current;
          setVisible(!visibleRef.current);
          return;
        }
        if (action.undoToggle) setVisible(visibleBeforeTap.current);
        onSeekBy(action.zone === "left" ? -SEEK_STEP_SEC : SEEK_STEP_SEC);
        setRipple({ zone: action.zone, sec: action.streak * SEEK_STEP_SEC });
        rippleFade.stopAnimation();
        rippleFade.setValue(1);
        Animated.timing(rippleFade, { toValue: 0, duration: 250, delay: STREAK_MS, useNativeDriver: true }).start();
      },
      [canControl, onSeekBy, revealUnlock, rippleFade],
    );

    const secForX = useCallback(
      (x: number) => {
        if (barWidth <= 0 || duration <= 0) return 0;
        return (Math.max(0, Math.min(barWidth, x)) / barWidth) * duration;
      },
      [barWidth, duration],
    );

    const pan = useMemo(
      () =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => canControl && duration > 0,
          onMoveShouldSetPanResponder: () => canControl && duration > 0,
          onPanResponderGrant: (e) => {
            clearHide();
            seekTargetRef.current = null;
            scrubbingRef.current = true;
            setScrubbing(true);
            setDisplayTime(secForX(e.nativeEvent.locationX));
          },
          onPanResponderMove: (e) => setDisplayTime(secForX(e.nativeEvent.locationX)),
          onPanResponderRelease: (e) => {
            const sec = secForX(e.nativeEvent.locationX);
            scrubbingRef.current = false;
            setScrubbing(false);
            seekTargetRef.current = sec;
            setDisplayTime(sec);
            onSeekTo(sec);
            armHide();
          },
          onPanResponderTerminate: () => {
            scrubbingRef.current = false;
            setScrubbing(false);
            armHide();
          },
        }),
      [canControl, duration, secForX, onSeekTo, clearHide, armHide],
    );

    const outOfSync = !canControl && paused && roomPlaying;
    const progress = duration > 0 ? Math.min(1, Math.max(0, displayTime / duration)) : 0;
    const bufferedProgress = duration > 0 ? Math.min(1, Math.max(0, bufferedTime / duration)) : 0;
    const chip = chipText(chips);

    return (
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onSurfacePress}
        onLayout={(e: LayoutChangeEvent) => {
          surfaceWidth.current = e.nativeEvent.layout.width;
        }}
        accessibilityLabel="Player surface"
      >
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]} pointerEvents={shown ? "auto" : "none"}>
          <GlassVisible value={shown}>
            <LinearGradient
              colors={[...gradients.playerControls]}
              locations={[0, 0.4, 0.72, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />

            {topBar ? (
              <View style={[styles.topBarCustom, { top: headerTop }]} pointerEvents="box-none">
                {topBar}
              </View>
            ) : onBack || title ? (
              <View style={[styles.topRow, { top: headerTop }]} pointerEvents="box-none">
                {onBack ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Back"
                    style={({ pressed }) => [styles.topBackBtn, pressed && styles.pressed]}
                    onPress={() => {
                      onBack();
                      show();
                    }}
                    hitSlop={10}
                  >
                    <Glass material="control" radius={radius.pill} visible={shown} />
                    <Ionicons name="chevron-back" size={ms(22)} color={colors.text} />
                  </Pressable>
                ) : (
                  <View style={styles.topSpacer} />
                )}
                {title ? (
                  <View style={styles.topTitleCard} pointerEvents="none">
                    <Text style={styles.topTitle} numberOfLines={1}>
                      {title}
                    </Text>
                    {subtitle ? (
                      <Text style={styles.topSubtitle} numberOfLines={1}>
                        {subtitle}
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <View style={{ flex: 1 }} />
                )}
                <View style={styles.topSpacer} />
              </View>
            ) : null}

            {overlayChildren}

            <View style={styles.center} pointerEvents="box-none">
              {canControl ? (
                <View style={styles.centerRow} pointerEvents="box-none">
                  <Pressable
                    accessibilityLabel="Back 10 seconds"
                    style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
                    onPress={() => {
                      onSeekBy(-SEEK_STEP_SEC);
                      show();
                    }}
                    hitSlop={8}
                  >
                    <Glass material="control" radius={radius.pill} visible={shown} />
                    <MaterialIcons name="replay-10" size={ms(29)} color={colors.text} />
                  </Pressable>
                  <Pressable
                    accessibilityLabel={paused ? "Play" : "Pause"}
                    style={({ pressed }) => [styles.playBtn, pressed && styles.pressed]}
                    onPress={() => {
                      if (paused) onPlay();
                      else onPause();
                      // Flip at once; the next playback event confirms or corrects it.
                      setPaused((p) => !p);
                      show();
                    }}
                    hitSlop={10}
                  >
                    <Ionicons
                      name={paused ? "play" : "pause"}
                      size={ms(32)}
                      color={colors.onHoney}
                      style={paused ? { marginLeft: ms(3) } : undefined}
                    />
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Forward 10 seconds"
                    style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
                    onPress={() => {
                      onSeekBy(SEEK_STEP_SEC);
                      show();
                    }}
                    hitSlop={8}
                  >
                    <Glass material="control" radius={radius.pill} visible={shown} />
                    <MaterialIcons name="forward-10" size={ms(29)} color={colors.text} />
                  </Pressable>
                </View>
              ) : outOfSync ? (
                <Pressable
                  style={({ pressed }) => [styles.syncBtn, pressed && styles.pressed]}
                  onPress={() => {
                    onTapSync?.();
                    show();
                  }}
                  hitSlop={10}
                >
                  <Ionicons name="flash" size={ms(16)} color={colors.onHoney} />
                  <Text style={styles.syncText}>Tap to sync</Text>
                </Pressable>
              ) : paused ? (
                <View style={styles.indicator} pointerEvents="none">
                  <Ionicons name="play" size={ms(28)} color={colors.honeyBright} style={{ marginLeft: ms(3) }} />
                </View>
              ) : null}
            </View>

            {/* Glass bottom bar — crafted glass over the video on Android unless the native lane renders into a
                TextureView inside a GlassBackdrop; Liquid Glass on iOS (docs/superpowers/specs/2026-10-11-glass-design.md). */}
            <GlassCard material="bar" visible={shown} rounded={radius.lg} style={styles.bottomBar} pointerEvents="box-none">
              <View style={styles.actionsRow} pointerEvents="box-none">
                {chip && onOpenSettings ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Playback options: ${chip}`}
                    style={({ pressed }) => [styles.quickChip, pressed && styles.pressedFlat]}
                    onPress={() => {
                      onOpenSettings();
                      show();
                    }}
                    hitSlop={6}
                  >
                    <Text style={styles.quickChipText} numberOfLines={1}>
                      {chip}
                    </Text>
                    <Ionicons name="chevron-up" size={ms(12)} color={colors.textDim} />
                  </Pressable>
                ) : (
                  <View style={styles.flex} />
                )}
                <View style={styles.actionsRight} pointerEvents="box-none">
                  {canControl && onNextEpisode ? (
                    <BarButton label="Next episode" icon="play-skip-forward" onPress={() => { onNextEpisode(); show(); }} />
                  ) : null}
                  {onEpisodes ? <BarButton label="Episodes" icon="list" size={ms(18)} onPress={() => { onEpisodes(); show(); }} /> : null}
                  <BarButton label="Lock controls" icon="lock-closed-outline" size={ms(16)} onPress={lock} />
                  {onOpenSettings ? (
                    <BarButton label="Player settings" icon="settings-outline" size={ms(16)} onPress={() => { onOpenSettings(); show(); }} />
                  ) : null}
                  {onToggleFullscreen ? (
                    <BarButton label={fullscreen ? "Exit fullscreen" : "Fullscreen"} icon={fullscreen ? "contract" : "expand"} onPress={onToggleFullscreen} />
                  ) : null}
                </View>
              </View>
              <View style={styles.bottomRow} pointerEvents="box-none">
                <Text style={styles.time}>{fmt(displayTime)}</Text>
                <View
                  style={styles.trackHit}
                  onLayout={(e: LayoutChangeEvent) => setBarWidth(e.nativeEvent.layout.width)}
                  {...(canControl ? pan.panHandlers : {})}
                >
                  <View style={styles.track}>
                    <View testID="buffered" style={[styles.buffered, { width: `${bufferedProgress * 100}%` }]} />
                    <View style={[styles.fill, { width: `${progress * 100}%` }]} />
                    {canControl ? (
                      <View style={[styles.thumb, scrubbing && styles.thumbActive, { left: `${progress * 100}%` }]} />
                    ) : null}
                  </View>
                  {scrubbing ? (
                    <View pointerEvents="none" style={[styles.bubble, { left: `${progress * 100}%` }]}>
                      <Text style={styles.bubbleText}>{fmt(displayTime)}</Text>
                    </View>
                  ) : null}
                </View>
                <Pressable
                  accessibilityLabel="Toggle remaining time"
                  onPress={() => {
                    setShowRemaining((r) => !r);
                    show();
                  }}
                  hitSlop={6}
                >
                  <Text style={styles.time}>
                    {duration > 0 ? (showRemaining ? `−${fmt(duration - displayTime)}` : fmt(duration)) : "--:--"}
                  </Text>
                </Pressable>
              </View>
            </GlassCard>
          </GlassVisible>
        </Animated.View>

        {ripple ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.ripple, ripple.zone === "left" ? styles.rippleLeft : styles.rippleRight, { opacity: rippleFade }]}
          >
            <MaterialIcons name={ripple.zone === "left" ? "fast-rewind" : "fast-forward"} size={ms(26)} color={colors.text} />
            <Text style={styles.rippleText}>{`${ripple.sec} s`}</Text>
          </Animated.View>
        ) : null}

        {locked && unlockPill ? (
          <View style={styles.unlockLayer} pointerEvents="box-none">
            <Pressable accessibilityRole="button" accessibilityLabel="Unlock controls" style={styles.unlockPill} onPress={unlock}>
              <Ionicons name="lock-open-outline" size={ms(16)} color={colors.onHoney} />
              <Text style={styles.unlockText}>Tap to unlock</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Buffering spinner — outside the fade, so a stall shows even with the controls hidden. */}
        {buffering ? (
          <View style={styles.bufferLayer} pointerEvents="none">
            <View style={styles.bufferBadge} accessibilityLabel="Buffering">
              <ActivityIndicator color={colors.honeyBright} size="large" />
            </View>
          </View>
        ) : null}
      </Pressable>
    );
  },
);

PlayerControls.displayName = "PlayerControls";

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { ...absoluteFill, alignItems: "center", justifyContent: "center" },
  bufferLayer: { ...absoluteFill, alignItems: "center", justifyContent: "center" },
  bufferBadge: {
    width: ms(78),
    height: ms(78),
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.playerChip,
  },
  centerRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(26) },
  pressed: { opacity: 0.5, transform: [{ scale: 0.92 }] },
  pressedFlat: { opacity: 0.45 },
  chip: {
    width: ms(52),
    height: ms(52),
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  playBtn: {
    width: ms(66),
    height: ms(66),
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.honey,
  },
  indicator: {
    width: ms(60),
    height: ms(60),
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.honeySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.honey,
  },
  syncBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(8),
    backgroundColor: colors.honey,
    paddingHorizontal: ms(18),
    paddingVertical: ms(11),
    borderRadius: radius.pill,
  },
  syncText: { color: colors.onHoney, fontFamily: font.headlineSemi, fontSize: ms(13) },
  bottomBar: { position: "absolute", left: ms(10), right: ms(10), bottom: ms(10) },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(6),
    paddingHorizontal: ms(10),
    paddingTop: ms(6),
  },
  actionsRight: { flexDirection: "row", alignItems: "center", gap: ms(2) },
  quickChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: ms(4),
    alignSelf: "flex-start",
    paddingHorizontal: ms(10),
    paddingVertical: ms(5),
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceStrong,
  },
  quickChipText: { flexShrink: 1, color: colors.text, fontFamily: font.bodySemi, fontSize: ms(11) },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(9),
    paddingHorizontal: ms(13),
    paddingBottom: ms(6),
  },
  time: { color: colors.textDim, fontFamily: font.label, fontSize: ms(11), minWidth: ms(44), textAlign: "center" },
  trackHit: { flex: 1, height: ms(30), justifyContent: "center" },
  track: { height: ms(4), borderRadius: ms(2), backgroundColor: colors.surfaceStrong, overflow: "visible" },
  buffered: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: ms(2), backgroundColor: "rgba(246,239,227,0.28)" },
  fill: { height: "100%", borderRadius: ms(2), backgroundColor: colors.honey },
  thumb: {
    position: "absolute",
    top: "50%",
    width: ms(14),
    height: ms(14),
    borderRadius: ms(7),
    marginLeft: -ms(7),
    marginTop: -ms(7),
    backgroundColor: colors.honeyBright,
    borderWidth: ms(2),
    borderColor: colors.onHoney,
  },
  thumbActive: { transform: [{ scale: 1.35 }] },
  bubble: {
    position: "absolute",
    bottom: ms(26),
    width: ms(56),
    marginLeft: -ms(28),
    alignItems: "center",
    paddingVertical: ms(3),
    borderRadius: radius.pill,
    backgroundColor: colors.bgElevated,
  },
  bubbleText: { color: colors.text, fontFamily: font.label, fontSize: ms(11) },
  barBtn: { width: ms(32), height: ms(32), alignItems: "center", justifyContent: "center" },
  ripple: {
    position: "absolute",
    top: "50%",
    width: ms(78),
    height: ms(78),
    marginTop: -ms(39),
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.playerChip,
  },
  rippleLeft: { left: ms(28) },
  rippleRight: { right: ms(28) },
  rippleText: { color: colors.text, fontFamily: font.label, fontSize: ms(12), marginTop: ms(2) },
  unlockLayer: { ...absoluteFill, alignItems: "center", justifyContent: "flex-end", paddingBottom: ms(40) },
  unlockPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(8),
    paddingHorizontal: ms(18),
    paddingVertical: ms(10),
    borderRadius: radius.pill,
    backgroundColor: colors.honey,
  },
  unlockText: { color: colors.onHoney, fontFamily: font.headlineSemi, fontSize: ms(13) },
  topBarCustom: { position: "absolute", left: 0, right: 0, zIndex: 10 },
  topRow: {
    position: "absolute",
    left: ms(16),
    right: ms(16),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: ms(10),
  },
  topBackBtn: {
    width: ms(40),
    height: ms(40),
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  topTitleCard: { flex: 1, alignItems: "center", justifyContent: "center" },
  topTitle: { color: colors.text, fontFamily: font.headlineSemi, fontSize: ms(16), textAlign: "center" },
  topSubtitle: { color: colors.honey, fontFamily: font.bodySemi, fontSize: ms(11), textAlign: "center", marginTop: ms(1) },
  topSpacer: { width: ms(40) },
});

export default PlayerControls;
```

- [ ] **Step 7: Run the controls tests**

Run: `npx jest components/player/PlayerControls.test.tsx components/player/doubleTap.test.ts`
Expected: PASS — the new tests and the existing header/glass/top-bar tests. (The scrub bubble and thumb scale need a
PanResponder touch history, so they are checked by phone screenshot in Task 14.)

- [ ] **Step 8: Commit**

```bash
git add components/player/doubleTap.ts components/player/doubleTap.test.ts components/player/PlayerControls.tsx components/player/PlayerControls.test.tsx
git commit -m "feat(player): controls layer — double-tap seek, lock, buffered range, remaining time, quick chip, next episode"
```

---

### Task 8: Settings sheet — every row shows its value; subtitle offset and size; Source

**Files:**
- Modify: `components/player/PlayerSettingsSheet.tsx`, `components/player/PlayerSettingsSheet.test.tsx`
- Modify: `utils/prefs.ts` (subtitle size preference)

**Interfaces:**
- Consumes: `SubtitleSize` from `components/player/subtitles/SubtitleOverlay`.
- Produces: new optional props `qualitySummary?: string`, `subtitleAdjust?: SubtitleAdjust`, `source?: { label: string;
  onOpen: () => void }`; `SubtitleAdjust { offsetSec; size; onOffset(sec); onSize(size) }`; `offsetLabel(sec)`;
  prefs `getSubtitleSize(): SubtitleSize`, `setSubtitleSize(size)`.
- Accessibility labels: `Subtitles earlier`, `Subtitles later`, `Subtitle size Small|Medium|Large`, `Change source`.

- [ ] **Step 1: Write the failing tests**

Append to `components/player/PlayerSettingsSheet.test.tsx`:
```tsx
describe("PlayerSettingsSheet values", () => {
  it("shows each row's current value", () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <PlayerSettingsSheet
          {...base}
          rate={1.5}
          audios={[{ label: "English", active: false }, { label: "Hindi", active: true }]}
          qualities={[{ label: "Auto", active: true }, { label: "720p", active: false }]}
          qualitySummary="Auto (576p)"
          subtitles={[{ id: "in:0", label: "English", language: "en", selected: false }]}
        />,
      );
    });
    expect(texts(r)).toEqual(expect.arrayContaining(["AUDIO", "QUALITY", "Auto (576p)", "SUBTITLES", "Off", "SPEED", "1.5×"]));
    expect(texts(r).filter((t) => t === "Hindi").length).toBeGreaterThanOrEqual(2); // row value + chip
  });

  it("offers offset and size for subtitles we draw ourselves", () => {
    const onOffset = jest.fn();
    const onSize = jest.fn();
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <PlayerSettingsSheet
          {...base}
          subtitles={[{ id: "side:de", label: "German", language: "de", selected: true }]}
          subtitleAdjust={{ offsetSec: 0.5, size: "m", onOffset, onSize }}
        />,
      );
    });
    expect(texts(r)).toContain("+0.5 s");
    act(() => r.root.find((n) => n.props.accessibilityLabel === "Subtitles earlier").props.onPress());
    expect(onOffset).toHaveBeenCalledWith(0);
    act(() => r.root.find((n) => n.props.accessibilityLabel === "Subtitle size Large").props.onPress());
    expect(onSize).toHaveBeenCalledWith("l");
  });

  it("names the source and opens the picker", () => {
    const onOpen = jest.fn();
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<PlayerSettingsSheet {...base} source={{ label: "Angel One", onOpen }} />);
    });
    expect(texts(r)).toEqual(expect.arrayContaining(["SOURCE", "Angel One"]));
    act(() => r.root.find((n) => n.props.accessibilityLabel === "Change source").props.onPress());
    expect(onOpen).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest components/player/PlayerSettingsSheet.test.tsx`
Expected: FAIL on the three new tests (values, adjust, source); the three existing tests still pass.

- [ ] **Step 3: Add the prefs**

In `utils/prefs.ts`, add `SubtitleSize = "pref.subtitleSize",` to `PrefKey` and append:
```ts
/** Size of the subtitles we draw ourselves (sidecar files): s / m / l (default m). */
export function getSubtitleSize(): "s" | "m" | "l" {
  const v = storage.getString(PrefKey.SubtitleSize);
  return v === "s" || v === "l" ? v : "m";
}
export function setSubtitleSize(v: "s" | "m" | "l"): void {
  storage.set(PrefKey.SubtitleSize, v);
}
```

- [ ] **Step 4: Update the sheet**

In `components/player/PlayerSettingsSheet.tsx`:

1. Header comment → `PlayerSettingsSheet — the player's settings: Audio · Subtitles · Quality · Speed · Source (spec
   §6.2.1). A row renders only when the source can back it, and every row header shows its current value. Speed routes
   through the room authority (host only); audio, subtitles and quality are per device.`
2. Imports: `import type { QualityLevel, SubtitleTrack } from "@/components/player/types";` (instead of importing
   `QualityLevel` from HijackPlayer) and `import type { SubtitleSize } from "@/components/player/subtitles/SubtitleOverlay";`.
3. Add to the props interface:
```ts
  /** Overrides the derived quality value, e.g. "Auto (576p)". */
  qualitySummary?: string;
  /** Offset + size for subtitles we draw ourselves (sidecar files). */
  subtitleAdjust?: SubtitleAdjust;
  /** The source in use, with a way to pick another. */
  source?: { label: string; onOpen: () => void };
```
and above it:
```ts
export interface SubtitleAdjust {
  offsetSec: number;
  size: SubtitleSize;
  onOffset: (sec: number) => void;
  onSize: (size: SubtitleSize) => void;
}

const SIZES: { key: SubtitleSize; label: string }[] = [
  { key: "s", label: "Small" },
  { key: "m", label: "Medium" },
  { key: "l", label: "Large" },
];
const OFFSET_STEP = 0.5;

export function offsetLabel(sec: number): string {
  const s = Math.round(sec * 10) / 10;
  return `${s > 0 ? "+" : s < 0 ? "−" : "±"}${Math.abs(s).toFixed(1)} s`;
}

function Section({ title, value }: { title: string; value?: string }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.section}>{title}</Text>
      {value ? (
        <Text style={styles.sectionValue} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
    </View>
  );
}
```
4. Reorder the body to Audio → Subtitles → Quality → Speed → Source → Playback, replacing each
   `<Text style={styles.section}>X</Text>` with `<Section title="X" value={…} />`:
   - Audio: `value={audios.find((a) => a.active)?.label}`
   - Subtitles: `value={subtitles.find((t) => t.selected)?.label ?? "Off"}`; after the track chips, when
     `subtitleAdjust && subtitles.some((t) => t.selected && t.id.startsWith("side:"))`, render:
```tsx
<View style={styles.row}>
  <Pressable
    accessibilityLabel="Subtitles earlier"
    style={styles.chip}
    onPress={() => subtitleAdjust.onOffset(subtitleAdjust.offsetSec - OFFSET_STEP)}
  >
    <Text style={styles.chipText}>−0.5 s</Text>
  </Pressable>
  <Text style={styles.offsetValue}>{offsetLabel(subtitleAdjust.offsetSec)}</Text>
  <Pressable
    accessibilityLabel="Subtitles later"
    style={styles.chip}
    onPress={() => subtitleAdjust.onOffset(subtitleAdjust.offsetSec + OFFSET_STEP)}
  >
    <Text style={styles.chipText}>+0.5 s</Text>
  </Pressable>
</View>
<View style={[styles.row, styles.rowGap]}>
  {SIZES.map((s) => {
    const on = s.key === subtitleAdjust.size;
    return (
      <Pressable
        key={s.key}
        accessibilityLabel={`Subtitle size ${s.label}`}
        style={[styles.chip, on && styles.chipOn]}
        onPress={() => subtitleAdjust.onSize(s.key)}
      >
        <Text style={[styles.chipText, on && styles.chipTextOn]}>{s.label}</Text>
      </Pressable>
    );
  })}
</View>
```
   - Quality: `value={qualitySummary ?? qualities.find((q) => q.active)?.label}`
   - Speed (unchanged condition `canControl`): `value={`${rate}×`}`
   - Source, new, when `source`:
```tsx
<>
  <Section title="SOURCE" value={source.label} />
  <View style={styles.row}>
    <Pressable accessibilityLabel="Change source" style={styles.chip} onPress={source.onOpen}>
      <Text style={styles.chipText}>Change source</Text>
    </Pressable>
  </View>
</>
```
5. Styles: add
```ts
  sectionRow: { flexDirection: "row", alignItems: "baseline", gap: ms(8), marginTop: ms(16), marginBottom: ms(9) },
  sectionValue: { flexShrink: 1, color: colors.honey, fontFamily: font.bodySemi, fontSize: ms(12) },
  offsetValue: { color: colors.text, fontFamily: font.label, fontSize: ms(13), alignSelf: "center", minWidth: ms(56), textAlign: "center" },
  rowGap: { marginTop: ms(8) },
```
   and change `section` to drop its own `marginTop`/`marginBottom` (the row carries them now).

- [ ] **Step 5: Run the sheet tests**

Run: `npx jest components/player/PlayerSettingsSheet.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add components/player/PlayerSettingsSheet.tsx components/player/PlayerSettingsSheet.test.tsx utils/prefs.ts
git commit -m "feat(player): settings rows show their value; subtitle offset and size; Source row"
```

---

### Task 9: Test streams — list, gate, screen, route, entry

**Files:**
- Create: `src/features/dev/testStreams.ts`, `src/features/dev/testStreams.test.ts`
- Create: `src/features/dev/testStreamsGate.ts`
- Create: `src/screens/TestStreamsScreen.tsx`
- Modify: `src/navigation/types.ts`, `src/navigation/RootNavigator.tsx`, `src/navigation/actions.ts`,
  `src/features/profile/ProfileView.tsx`

**Interfaces:**
- Consumes: `NativeSource`, `SidecarSubtitle` (Task 5); `useFeatureFlags` (`src/store/features/providers/hooks.ts`).
- Produces: `TestStream { id; title; note; source; sidecar?; platforms: { ios; android } }`, `TEST_STREAMS`,
  `streamsFor(os)`, `findStream(id?)`; `testStreamsEnabled(flags, dev?, build?)`, `useTestStreamsEnabled()`; routes
  `RootStack.TestStreams: undefined`, `PlayerStack.NativePlayer: { streamId: string; startedAt?: number }`; actions
  `openTestStreams()`, `openNativePlayer(params)`.

The streams below were fetched and checked on 2026-10-11 (manifest contents noted per entry). Reachability from the
phone's network is re-checked in Task 14.

- [ ] **Step 1: Write the failing tests**

`src/features/dev/testStreams.test.ts`:
```ts
import { findStream, streamsFor, TEST_STREAMS } from "./testStreams";
import { testStreamsEnabled } from "./testStreamsGate";

describe("test streams", () => {
  it("are all https and have unique ids", () => {
    expect(new Set(TEST_STREAMS.map((s) => s.id)).size).toBe(TEST_STREAMS.length);
    for (const s of TEST_STREAMS) {
      expect(s.source.uri.startsWith("https://")).toBe(true);
      for (const t of s.sidecar ?? []) expect(t.url.startsWith("https://")).toBe(true);
    }
  });

  it("hide DASH on iOS (AVPlayer has no DASH)", () => {
    expect(streamsFor("ios").some((s) => s.source.contentType === "dash")).toBe(false);
    expect(streamsFor("android").some((s) => s.source.contentType === "dash")).toBe(true);
  });

  it("cover what the gate needs: languages, ladders, sidecar subtitles, a broken one", () => {
    expect(findStream("angel-hls")?.note).toMatch(/audio en\/de\/it\/fr\/es/);
    expect(findStream("tos-sidecar")?.sidecar?.length).toBeGreaterThanOrEqual(5);
    expect(findStream("broken")).toBeDefined();
    expect(findStream("nope")).toBeUndefined();
  });
});

describe("testStreamsEnabled", () => {
  it.each([
    [{ nativeLane: true }, true, false, true],
    [{ nativeLane: true }, false, true, true],
    [{ nativeLane: true }, false, false, false], // a shipped release build never shows them
    [{ nativeLane: false }, true, true, false], // the remote switch wins
  ])("%o dev=%s build=%s → %s", (flags, dev, build, out) => {
    expect(testStreamsEnabled(flags, dev, build)).toBe(out);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/features/dev`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the list and the gate**

`src/features/dev/testStreams.ts`:
```ts
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
```

`src/features/dev/testStreamsGate.ts`:
```ts
import { useFeatureFlags } from "@/src/store/features/providers/hooks";
import type { FeatureFlags } from "@/src/types/worker.types";

/** Baked in at bundle time; set only for local measurement builds (`EXPO_PUBLIC_TEST_STREAMS=1`), never for a shipped one. */
const BUILD_FLAG = process.env.EXPO_PUBLIC_TEST_STREAMS === "1";

/** Test streams show in dev builds or flagged local builds, and only while the remote `nativeLane` switch is on. */
export function testStreamsEnabled(flags: Pick<FeatureFlags, "nativeLane">, dev: boolean = __DEV__, build: boolean = BUILD_FLAG): boolean {
  return flags.nativeLane && (dev || build);
}

export function useTestStreamsEnabled(): boolean {
  return testStreamsEnabled(useFeatureFlags());
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/features/dev`
Expected: PASS.

- [ ] **Step 5: Routes, actions, screen and the entry row**

`src/navigation/types.ts` — add to `PlayerStackParamList`:
```ts
  /** Native lane (expo-video). Phase 1B: dev test streams only. */
  NativePlayer: { streamId: string; startedAt?: number };
```
and to `RootStackParamList`: `TestStreams: undefined;`.

`src/navigation/actions.ts` — add:
```ts
export function openTestStreams() {
  navigate("TestStreams");
}

export function openNativePlayer(params: PlayerStackParamList["NativePlayer"]) {
  navigate("PlayerStack", { screen: "NativePlayer", params });
}
```

`src/navigation/RootNavigator.tsx` — import `TestStreamsScreen from "../screens/TestStreamsScreen"` and add
`<RootStack.Screen name="TestStreams" component={TestStreamsScreen} />` next to `HomePrefs`.

`src/screens/TestStreamsScreen.tsx`:
```tsx
/** Dev-only list of public test streams that open in the native player (spec §6.2.2). */
import { streamsFor } from "@/src/features/dev/testStreams";
import { useTestStreamsEnabled } from "@/src/features/dev/testStreamsGate";
import { openNativePlayer } from "@/src/navigation/actions";
import { IconButton } from "@/src/ui";
import { colors, font, ms, radius, spacing } from "@/theme/bearoom";
import { pressedStyle } from "@/theme/styles/interaction";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TestStreamsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const enabled = useTestStreamsEnabled();
  const streams = streamsFor(Platform.OS === "ios" ? "ios" : "android");

  return (
    <View style={[styles.root, { paddingTop: insets.top + ms(8) }]}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <IconButton accessibilityLabel="Go back" onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={ms(22)} color={colors.text} />
        </IconButton>
        <Text style={styles.title}>Test streams</Text>
      </View>
      {enabled ? (
        <FlatList
          data={streams}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: insets.bottom + spacing.lg }}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Play ${item.title}`}
              style={({ pressed }) => [styles.row, pressed && pressedStyle]}
              onPress={() => openNativePlayer({ streamId: item.id, startedAt: Date.now() })}
            >
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowNote}>{item.note}</Text>
            </Pressable>
          )}
        />
      ) : (
        <Text style={styles.off}>Test streams are switched off.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", gap: ms(12), paddingHorizontal: spacing.lg },
  title: { color: colors.text, fontFamily: font.headline, fontSize: ms(20) },
  row: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    gap: ms(4),
  },
  rowTitle: { color: colors.text, fontFamily: font.headlineSemi, fontSize: ms(15) },
  rowNote: { color: colors.textDim, fontFamily: font.body, fontSize: ms(12) },
  off: { color: colors.textDim, fontFamily: font.body, fontSize: ms(14), padding: spacing.lg },
});
```

`src/features/profile/ProfileView.tsx` — in the "Maintenance / about" card, before `Help & about`, add
`{testStreams ? <Row icon="flask-outline" label="Test streams (dev)" onPress={openTestStreams} /> : null}` with
`const testStreams = useTestStreamsEnabled();` at the top of the component and the two imports.

- [ ] **Step 6: Type-check, lint, test**

Run: `npx tsc --noEmit && npx eslint src/features/dev src/screens/TestStreamsScreen.tsx src/navigation src/features/profile/ProfileView.tsx && npx jest src/features/dev`
Expected: clean, PASS. (`NativePlayer` route's screen is added in Task 10; tsc passes because the stack only lists
screens that exist — register it in Task 10.)

- [ ] **Step 7: Commit**

```bash
git add src/features/dev src/screens/TestStreamsScreen.tsx src/navigation src/features/profile/ProfileView.tsx
git commit -m "feat(dev): test streams list behind the nativeLane flag (dev builds only)"
```

---

### Task 10: NativePlayerView + NativePlayerScreen

**Files:**
- Create: `components/player/chips.ts`, `components/player/chips.test.ts`
- Create: `src/features/player/NativePlayerView.tsx`, `src/features/player/NativePlayerView.test.tsx`
- Create: `src/screens/NativePlayerScreen.tsx`
- Modify: `src/navigation/PlayerNavigator.tsx`

**Interfaces:**
- Consumes: Tasks 5–9; `useConnectivity`, `useMediaCloseGuard`, `useResponsive`; `GlassLayer`, `GlassBackdrop`;
  `VIDEO_SURFACE`, `GLASS_OVER_VIDEO`.
- Produces: `controlChips(audios, qualities, subtitles, qualityOverride?): ControlChips`;
  `NativePlayerView(props: NativePlayerViewProps)`; `hudText(hud, chips, surface): string`.

- [ ] **Step 1: Write the failing chips test**

`components/player/chips.test.ts`:
```ts
import { controlChips } from "./chips";

describe("controlChips", () => {
  it("picks the active audio and quality and the selected subtitles", () => {
    expect(
      controlChips(
        [{ label: "English", active: false }, { label: "Hindi", active: true }],
        [{ label: "Auto", active: false }, { label: "720p", active: true }],
        [{ id: "in:0", label: "English", language: "en", selected: true }],
      ),
    ).toEqual({ audio: "Hindi", quality: "720p", subtitles: "English" });
  });

  it("uses the quality summary when given, and no subtitles when none is selected", () => {
    expect(controlChips([], [], [], "Auto (576p)")).toEqual({ audio: undefined, quality: "Auto (576p)", subtitles: null });
  });
});
```

`components/player/chips.ts`:
```ts
import type { ControlChips } from "./PlayerControls";
import type { QualityLevel, SubtitleTrack } from "./types";

/** The controls' quick chip from the current track lists. */
export function controlChips(
  audios: QualityLevel[],
  qualities: QualityLevel[],
  subtitles: SubtitleTrack[],
  qualityOverride?: string,
): ControlChips {
  return {
    audio: audios.find((a) => a.active)?.label,
    quality: qualityOverride ?? qualities.find((q) => q.active)?.label,
    subtitles: subtitles.find((s) => s.selected)?.label ?? null,
  };
}
```

Run: `npx jest components/player/chips.test.ts` — write the test first, see it fail (module missing), add `chips.ts`,
see it pass.

- [ ] **Step 2: Write the failing view test**

`src/features/player/NativePlayerView.test.tsx`:
```tsx
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { NativePlayerView } from "./NativePlayerView";

let mockOffline = false;
const mockHandle = {
  play: jest.fn(),
  pause: jest.fn(),
  seek: jest.fn(async (s: number) => s - 0.05),
  setRate: jest.fn(),
  fullscreen: jest.fn(),
  readQuality: jest.fn(),
  setQuality: jest.fn(),
  readAudio: jest.fn(),
  setAudio: jest.fn(),
  reload: jest.fn(),
  getCapabilities: jest.fn(),
  getTracks: jest.fn(() => []),
  setSubtitle: jest.fn(),
};
let mockPlayerProps: any = null;

jest.mock("@/components/player/native/NativePlayer", () => {
  const R = jest.requireActual("react");
  return {
    NativePlayer: R.forwardRef((props: any, ref: any) => {
      mockPlayerProps = props;
      R.useImperativeHandle(ref, () => mockHandle);
      return null;
    }),
  };
});
jest.mock("@/components/player/PlayerControls", () => {
  const R = jest.requireActual("react");
  return {
    PlayerControls: R.forwardRef((_p: any, ref: any) => {
      R.useImperativeHandle(ref, () => ({ setPlayback: jest.fn() }));
      return null;
    }),
  };
});
jest.mock("@/components/player/PlayerSettingsSheet", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/player/PlayerLoadingCard", () => {
  const { Text } = jest.requireActual("react-native");
  return { PlayerLoadingCard: ({ status }: { status: string }) => <Text>{status}</Text> };
});
jest.mock("@/hooks/useConnectivity", () => ({ useConnectivity: () => mockOffline }));
jest.mock("@/hooks/useMediaCloseGuard", () => ({ useMediaCloseGuard: () => ({ requestClose: jest.fn() }) }));
jest.mock("@/hooks/useResponsive", () => ({ useResponsive: () => ({ isLandscapeMobile: false }) }));
jest.mock("@/utils/prefs", () => ({ getSubtitleSize: () => "m", setSubtitleSize: jest.fn() }));
const mockUnlock = jest.fn(async () => {});
jest.mock("expo-screen-orientation", () => ({
  lockAsync: jest.fn(async () => {}),
  unlockAsync: () => mockUnlock(),
  OrientationLock: { LANDSCAPE: 1 },
}));
jest.mock("@/src/ui/glass", () => {
  const { View } = jest.requireActual("react-native");
  return { GlassLayer: ({ children }: any) => <View>{children}</View>, GlassBackdrop: ({ children }: any) => <View>{children}</View> };
});
jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual("react-native");
  return { SafeAreaView: ({ children }: any) => <View>{children}</View>, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

const texts = (r: ReactTestRenderer) =>
  r.root.findAll((n) => typeof n.props.children === "string").map((n) => n.props.children as string);

function view(extra: Partial<React.ComponentProps<typeof NativePlayerView>> = {}) {
  return (
    <NativePlayerView
      title="Angel One"
      source={{ uri: "https://example.test/master.m3u8" }}
      sourceLabel="Angel One"
      onClose={jest.fn()}
      onOpenSource={jest.fn()}
      {...extra}
    />
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  mockOffline = false;
  Object.values(mockHandle).forEach((f) => (f as jest.Mock).mockClear?.());
});
afterEach(() => jest.useRealTimers());

describe("NativePlayerView", () => {
  it("shows the loading card until the first frame, then fades it out", () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(view());
    });
    expect(texts(r)).toContain("Starting…");
    act(() => mockPlayerProps.onFirstFrame());
    act(() => jest.advanceTimersByTime(400));
    expect(texts(r)).not.toContain("Starting…");
  });

  it("shows the error card on a fatal error; Retry reloads and plays", () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(view());
    });
    act(() => mockPlayerProps.onFatalError("HTTP 404"));
    expect(texts(r)).toContain("Couldn’t play this stream");
    act(() => r.root.find((n) => n.props?.accessibilityLabel === "Retry" && n.props.onPress).props.onPress());
    expect(mockHandle.reload).toHaveBeenCalled();
    expect(mockHandle.play).toHaveBeenCalled();
    expect(texts(r)).not.toContain("Couldn’t play this stream");
  });

  it("pauses when the network drops and resumes playing when it returns", () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(view());
    });
    act(() => mockPlayerProps.onPlayerEvent({ event: "tick", currentTime: 42, duration: 600, paused: false }));
    mockOffline = true;
    act(() => r.update(view()));
    expect(mockHandle.pause).toHaveBeenCalled();
    mockOffline = false;
    act(() => r.update(view()));
    expect(mockHandle.play).toHaveBeenCalled();
    expect(mockHandle.reload).not.toHaveBeenCalled();
  });

  it("reloads on reconnect when the stream failed while offline", () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(view());
    });
    act(() => mockPlayerProps.onPlayerEvent({ event: "tick", currentTime: 42, duration: 600, paused: false }));
    mockOffline = true;
    act(() => r.update(view()));
    act(() => mockPlayerProps.onFatalError("Network request failed"));
    mockOffline = false;
    act(() => r.update(view()));
    expect(mockHandle.reload).toHaveBeenCalled();
    expect(texts(r)).not.toContain("Couldn’t play this stream");
  });

  it("shows TTFF from the Play press in the dev HUD", () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(view({ devHud: true, startedAt: Date.now() - 1500 }));
    });
    act(() => mockPlayerProps.onFirstFrame());
    expect(texts(r).some((t) => /^TTFF 1\.5\d s/.test(t))).toBe(true);
  });

  it("unlocks the orientation when it closes", () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(view());
    });
    act(() => r.unmount());
    expect(mockUnlock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx jest src/features/player`
Expected: FAIL — `Cannot find module './NativePlayerView'`.

- [ ] **Step 4: Write the view**

`src/features/player/NativePlayerView.tsx`:
```tsx
/**
 * NativePlayerView — the native lane's player screen body (spec §6.2.1): expo-video under the shared controls, the
 * branded loading card crossfading into the first frame, honest settings rows, the §7 error card, and an offline pause
 * that resumes where it stopped (F8). Phase 1B opens it from the dev-only Test streams list; Phase 2's resolver will
 * open it for real titles.
 */
import { controlChips } from "@/components/player/chips";
import { NativePlayer, type NativeSource, type SidecarSubtitle } from "@/components/player/native/NativePlayer";
import { PlayerControls, type ControlChips, type PlayerControlsHandle } from "@/components/player/PlayerControls";
import { PlayerErrorCard } from "@/components/player/PlayerErrorCard";
import { PlayerLoadingCard } from "@/components/player/PlayerLoadingCard";
import PlayerSettingsSheet from "@/components/player/PlayerSettingsSheet";
import type { SubtitleSize } from "@/components/player/subtitles/SubtitleOverlay";
import type { PlayerEvent, PlayerHandle, QualityLevel, SubtitleTrack } from "@/components/player/types";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useMediaCloseGuard } from "@/hooks/useMediaCloseGuard";
import { useResponsive } from "@/hooks/useResponsive";
import { GlassBackdrop, GlassLayer } from "@/src/ui/glass";
import { colors, font, ms } from "@/theme/bearoom";
import { getSubtitleSize, setSubtitleSize } from "@/utils/prefs";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export interface NativePlayerViewProps {
  title: string;
  source: NativeSource;
  sidecarSubtitles?: SidecarSubtitle[];
  posterUrl?: string;
  /** Shown in the settings sheet's Source row. */
  sourceLabel: string;
  /** When Play was pressed (epoch ms) — the TTFF baseline; defaults to mount. */
  startedAt?: number;
  surfaceType?: "surfaceView" | "textureView";
  /** Put the video in a glass backdrop so the control bar blurs it (TextureView only). */
  glassOverVideo?: boolean;
  /** Dev HUD: TTFF, the last seek's landing error and the active tracks (test streams only). */
  devHud?: boolean;
  onClose: () => void;
  onOpenSource: () => void;
}

interface Hud {
  ttffMs?: number;
  seekErrSec?: number;
}

export function hudText(hud: Hud, chips: ControlChips, surface: string): string {
  const ttff = hud.ttffMs != null ? `TTFF ${(hud.ttffMs / 1000).toFixed(2)} s` : "TTFF –";
  const seek = hud.seekErrSec != null ? `seek Δ ${hud.seekErrSec.toFixed(2)} s` : "seek Δ –";
  return [ttff, seek, chips.audio ?? "–", chips.subtitles ?? "no subs", chips.quality ?? "–", surface].join(" · ");
}

export function NativePlayerView({
  title,
  source,
  sidecarSubtitles,
  posterUrl,
  sourceLabel,
  startedAt,
  surfaceType = "surfaceView",
  glassOverVideo = false,
  devHud = false,
  onClose,
  onOpenSource,
}: NativePlayerViewProps) {
  const playerRef = useRef<PlayerHandle>(null);
  const controlsRef = useRef<PlayerControlsHandle>(null);
  const t0 = useRef(startedAt ?? Date.now());
  const firstFrameSeen = useRef(false);
  const coverOpacity = useRef(new Animated.Value(1)).current;
  const [coverGone, setCoverGone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<string | null>(null);
  errorRef.current = error;
  const [audios, setAudios] = useState<QualityLevel[]>([]);
  const [qualities, setQualities] = useState<QualityLevel[]>([]);
  const [qualityNow, setQualityNow] = useState<string | undefined>(undefined);
  const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);
  const [rate, setRate] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [subOffset, setSubOffset] = useState(0);
  const [subSize, setSubSize] = useState<SubtitleSize>(getSubtitleSize);
  const [controlsShown, setControlsShown] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [hud, setHud] = useState<Hud>({});
  const pos = useRef(0);
  const paused = useRef(true);
  const resumeWhenOnline = useRef<{ play: boolean } | null>(null);
  const offline = useConnectivity();
  const { isLandscapeMobile } = useResponsive();
  const immersive = fullscreen || isLandscapeMobile;

  const onEvent = useCallback((e: PlayerEvent) => {
    if (e.event === "audio") {
      setAudios(e.audios ?? []);
    } else if (e.event === "quality") {
      setQualities(e.qualities ?? []);
    } else if (e.event === "subs") {
      setSubtitles(e.subs ?? []);
    } else if (e.event !== "tracks") {
      if (Number.isFinite(e.currentTime)) pos.current = e.currentTime;
      paused.current = e.paused;
      controlsRef.current?.setPlayback({
        currentTime: e.currentTime,
        duration: e.duration,
        paused: e.paused,
        readyState: e.readyState,
        bufferedTime: e.bufferedAheadSec != null ? e.currentTime + e.bufferedAheadSec : undefined,
      });
    }
  }, []);

  // F8: losing the network pauses (the app-wide banner explains why); getting it back resumes from the same
  // position — reloading first if the stream failed while offline.
  useEffect(() => {
    if (offline) {
      if (!resumeWhenOnline.current) resumeWhenOnline.current = { play: !paused.current };
      playerRef.current?.pause();
      return;
    }
    const r = resumeWhenOnline.current;
    if (!r) return;
    resumeWhenOnline.current = null;
    if (errorRef.current) {
      setError(null);
      playerRef.current?.reload();
    }
    if (r.play) playerRef.current?.play();
  }, [offline]);

  const onFirstFrame = useCallback(() => {
    if (firstFrameSeen.current) return;
    firstFrameSeen.current = true;
    setHud((h) => ({ ...h, ttffMs: Date.now() - t0.current }));
    Animated.timing(coverOpacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setCoverGone(true);
    });
  }, [coverOpacity]);

  const retry = useCallback(() => {
    setError(null);
    playerRef.current?.reload();
    playerRef.current?.play();
  }, []);

  const seekTo = useCallback(
    (sec: number) => {
      void playerRef.current?.seek(sec).then((landed) => {
        if (devHud) setHud((h) => ({ ...h, seekErrSec: Math.abs(landed - sec) }));
      });
    },
    [devHud],
  );

  const toggleFullscreen = useCallback(() => {
    const next = !fullscreen;
    setFullscreen(next);
    (next ? ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE) : ScreenOrientation.unlockAsync()).catch(
      () => {},
    );
  }, [fullscreen]);
  useEffect(
    () => () => {
      ScreenOrientation.unlockAsync().catch(() => {});
    },
    [],
  );

  // Hardware back leaves fullscreen first, then asks before closing.
  const beforeClose = useRef<() => boolean>(() => false);
  beforeClose.current = () => {
    if (!fullscreen) return false;
    toggleFullscreen();
    return true;
  };
  const { requestClose } = useMediaCloseGuard({
    title: "Stop watching?",
    message: "This will close the player.",
    confirmLabel: "Close",
    onConfirm: onClose,
    beforeClose: () => beforeClose.current(),
  });

  const chips = controlChips(audios, qualities, subtitles, qualityNow);
  const sidecarSelected = subtitles.some((s) => s.selected && s.id.startsWith("side:"));

  const video = (
    <NativePlayer
      ref={playerRef}
      source={source}
      sidecarSubtitles={sidecarSubtitles}
      surfaceType={surfaceType}
      subtitleOffsetSec={subOffset}
      subtitleSize={subSize}
      subtitlesLifted={controlsShown}
      onPlayerEvent={onEvent}
      onFirstFrame={onFirstFrame}
      onFatalError={setError}
      onQualitySummary={setQualityNow}
      style={StyleSheet.absoluteFill}
    />
  );

  return (
    <>
      <StatusBar style="light" hidden={immersive} />
      <SafeAreaView style={styles.root} edges={immersive ? [] : ["top", "bottom", "left", "right"]}>
        <View style={immersive ? styles.playerFull : styles.player}>
          <GlassLayer>
            {glassOverVideo ? <GlassBackdrop style={StyleSheet.absoluteFill}>{video}</GlassBackdrop> : video}
            {!error ? (
              <PlayerControls
                ref={controlsRef}
                canControl
                roomPlaying={false}
                onPlay={() => playerRef.current?.play()}
                onPause={() => playerRef.current?.pause()}
                onSeekTo={seekTo}
                onSeekBy={(d) => seekTo(Math.max(0, pos.current + d))}
                onToggleFullscreen={isLandscapeMobile && !fullscreen ? undefined : toggleFullscreen}
                fullscreen={immersive}
                embedded={!immersive}
                title={title}
                onBack={() => (fullscreen ? toggleFullscreen() : requestClose())}
                onOpenSettings={() => setSettingsOpen(true)}
                chips={chips}
                onVisibilityChange={setControlsShown}
              />
            ) : null}
            {!coverGone ? (
              <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: coverOpacity }]}>
                <PlayerLoadingCard posterUrl={posterUrl} status="Starting…" />
              </Animated.View>
            ) : null}
            {error ? (
              <PlayerErrorCard
                title="Couldn’t play this stream"
                message={devHud ? error : "Check your connection and try again."}
                actions={[
                  { label: "Retry", icon: "refresh", kind: "primary", onPress: retry },
                  { label: "Try another source", kind: "ghost", onPress: onOpenSource },
                ]}
              />
            ) : null}
          </GlassLayer>
        </View>
        {!immersive ? (
          <View style={styles.info}>
            <Text style={styles.infoTitle} numberOfLines={2}>
              {title}
            </Text>
            <Text style={styles.infoSub}>{sourceLabel}</Text>
          </View>
        ) : null}
        {devHud ? (
          <Text accessibilityLabel="dev-hud" pointerEvents="none" style={styles.hud}>
            {hudText(hud, chips, surfaceType)}
          </Text>
        ) : null}
      </SafeAreaView>

      <PlayerSettingsSheet
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        canControl
        rate={rate}
        onSetRate={(r) => {
          setRate(r);
          playerRef.current?.setRate(r);
        }}
        qualities={qualities}
        onSetQuality={(label) => playerRef.current?.setQuality(label)}
        qualitySummary={qualityNow}
        audios={audios}
        onSetAudio={(label) => playerRef.current?.setAudio(label)}
        showAudio={audios.length > 1}
        showQuality={qualities.length > 1}
        subtitles={subtitles}
        onSetSubtitle={(id) => playerRef.current?.setSubtitle(id)}
        subtitleAdjust={
          sidecarSelected
            ? {
                offsetSec: subOffset,
                size: subSize,
                onOffset: setSubOffset,
                onSize: (s) => {
                  setSubSize(s);
                  setSubtitleSize(s);
                },
              }
            : undefined
        }
        source={{ label: sourceLabel, onOpen: onOpenSource }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  player: { width: "100%", aspectRatio: 16 / 9, backgroundColor: colors.playerBg },
  playerFull: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.playerBg },
  info: { padding: ms(16), gap: ms(4) },
  infoTitle: { color: colors.text, fontFamily: font.headline, fontSize: ms(18) },
  infoSub: { color: colors.textDim, fontFamily: font.body, fontSize: ms(13) },
  hud: {
    position: "absolute",
    left: ms(8),
    right: ms(8),
    bottom: ms(8),
    color: colors.honey,
    fontFamily: font.label,
    fontSize: ms(10),
  },
});
```

- [ ] **Step 5: Run the view tests**

Run: `npx jest src/features/player components/player/chips.test.ts`
Expected: PASS (6 view tests + 2 chips tests).

- [ ] **Step 6: The route screen**

`src/screens/NativePlayerScreen.tsx`:
```tsx
/** Route wrapper for the native lane. Phase 1B: opens a dev test stream; anything else goes back. */
import { GLASS_OVER_VIDEO, VIDEO_SURFACE } from "@/components/player/native/surface";
import { findStream } from "@/src/features/dev/testStreams";
import { useTestStreamsEnabled } from "@/src/features/dev/testStreamsGate";
import { NativePlayerView } from "@/src/features/player/NativePlayerView";
import type { PlayerStackParamList } from "@/src/navigation/types";
import { colors, font, ms } from "@/theme/bearoom";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function NativePlayerScreen() {
  const route = useRoute<RouteProp<PlayerStackParamList, "NativePlayer">>();
  const navigation = useNavigation();
  const enabled = useTestStreamsEnabled();
  const stream = enabled ? findStream(route.params?.streamId) : undefined;

  if (!stream) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>This stream isn’t available.</Text>
        <Pressable accessibilityRole="button" onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={styles.back}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <NativePlayerView
      key={stream.id}
      title={stream.title}
      source={stream.source}
      sidecarSubtitles={stream.sidecar}
      sourceLabel={stream.title}
      startedAt={route.params?.startedAt}
      surfaceType={VIDEO_SURFACE}
      glassOverVideo={GLASS_OVER_VIDEO}
      devHud
      onClose={() => navigation.goBack()}
      onOpenSource={() => navigation.goBack()}
    />
  );
}

const styles = StyleSheet.create({
  missing: { flex: 1, alignItems: "center", justifyContent: "center", gap: ms(12), backgroundColor: colors.bg },
  missingText: { color: colors.text, fontFamily: font.body, fontSize: ms(15) },
  back: { color: colors.honey, fontFamily: font.headlineSemi, fontSize: ms(15) },
});
```

`src/navigation/PlayerNavigator.tsx` — import it and register next to `Player`:
```tsx
<PlayerStack.Screen
  name="NativePlayer"
  component={NativePlayerScreen}
  options={{ animation: "fade", gestureEnabled: false }}
/>
```

- [ ] **Step 7: Type-check, lint, full suite**

Run: `npx tsc --noEmit && npx eslint src/features/player src/screens/NativePlayerScreen.tsx src/navigation components/player && npx jest`
Expected: clean; whole suite PASS.

- [ ] **Step 8: Commit**

```bash
git add components/player/chips.ts components/player/chips.test.ts src/features/player src/screens/NativePlayerScreen.tsx src/navigation/PlayerNavigator.tsx
git commit -m "feat(player): native player screen — loading crossfade, error card, offline resume, dev HUD"
```

---

### Task 11: The WebView lane adopts the new layer

**Files:**
- Create: `components/player/nextEpisode.ts`, `components/player/nextEpisode.test.ts`
- Modify: `src/screens/PlayerScreen.tsx`, `src/screens/PartyScreen.tsx`

**Interfaces:**
- Consumes: `controlChips` (Task 10); `useDetailsQuery` (tmdbApi `details` endpoint, already used by `EpisodeSheet`).
- Produces: `nextEpisode(seasons, season, ep): { season: number; ep: number } | null`.

**Ruling (ledger):** the party gets the quick chip and double-tap (host only, via `canControl`) but no Next-episode
button — the room's next title belongs to the queue (Program 1), not to a controls shortcut. Cost if wrong: one prop.

- [ ] **Step 1: Write the failing test**

`components/player/nextEpisode.test.ts`:
```ts
import { nextEpisode } from "./nextEpisode";

const SEASONS = [
  { season_number: 0, episode_count: 3 }, // specials
  { season_number: 1, episode_count: 8 },
  { season_number: 2, episode_count: 9 },
];

describe("nextEpisode", () => {
  it("is the next episode in the season", () => expect(nextEpisode(SEASONS, 1, 3)).toEqual({ season: 1, ep: 4 }));
  it("rolls into the next season after the last episode", () => expect(nextEpisode(SEASONS, 1, 8)).toEqual({ season: 2, ep: 1 }));
  it("is nothing after the finale, or without season data", () => {
    expect(nextEpisode(SEASONS, 2, 9)).toBeNull();
    expect(nextEpisode(undefined, 1, 1)).toBeNull();
  });
  it("skips empty seasons and specials", () => {
    expect(nextEpisode([{ season_number: 1, episode_count: 2 }, { season_number: 2, episode_count: 0 }, { season_number: 3, episode_count: 5 }], 1, 2)).toEqual({ season: 3, ep: 1 });
  });
});
```

- [ ] **Step 2: Run to verify it fails, then implement**

Run: `npx jest components/player/nextEpisode.test.ts` → FAIL (module missing).

`components/player/nextEpisode.ts`:
```ts
export interface SeasonInfo {
  season_number: number;
  episode_count: number;
}

/** The episode after S{season}E{ep}: the next in the season, else E1 of the next non-empty numbered season. */
export function nextEpisode(seasons: SeasonInfo[] | undefined, season: number, ep: number): { season: number; ep: number } | null {
  if (!seasons?.length) return null;
  const current = seasons.find((s) => s.season_number === season);
  if (current && ep < current.episode_count) return { season, ep: ep + 1 };
  const later = seasons
    .filter((s) => s.season_number > season && s.season_number > 0 && s.episode_count > 0)
    .sort((a, b) => a.season_number - b.season_number)[0];
  return later ? { season: later.season_number, ep: 1 } : null;
}
```
Run again → PASS.

- [ ] **Step 3: Wire PlayerScreen**

In `src/screens/PlayerScreen.tsx`:
1. Imports: `import { controlChips } from "@/components/player/chips";`, `import { nextEpisode } from "@/components/player/nextEpisode";`,
   `import { useDetailsQuery } from "@/src/store/services/tmdbApi";`.
2. After `media` is defined:
```ts
  // TV: the episode after this one, for the controls' Next-episode button.
  const { data: showDetails } = useDetailsQuery(
    { type: "tv", id: media.tmdbId },
    { skip: media.type !== "tv" || !media.tmdbId },
  );
  const upNext =
    media.type === "tv" && media.season && media.episode
      ? nextEpisode(showDetails?.seasons, media.season, media.episode)
      : null;
```
3. On `<PlayerControls …>` add:
```tsx
  chips={controlChips(audios, qualities, subtitles)}
  onNextEpisode={upNext ? () => navigation.setParams({ season: String(upNext.season), ep: String(upNext.ep) }) : undefined}
```

- [ ] **Step 4: Wire PartyScreen**

In `src/screens/PartyScreen.tsx`, import `controlChips` and add `chips={controlChips(audios, qualities, subtitles)}` to
its `<PlayerControls …>` (the state names `audios`, `qualities`, `subtitles` exist at L215–219).

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npx eslint src/screens/PlayerScreen.tsx src/screens/PartyScreen.tsx components/player && npx jest`
Expected: clean; suite PASS.

- [ ] **Step 6: Commit**

```bash
git add components/player/nextEpisode.ts components/player/nextEpisode.test.ts src/screens/PlayerScreen.tsx src/screens/PartyScreen.tsx
git commit -m "feat(player): WebView lane and party on the new controls — quick chip, next episode"
```

---

### Task 12: `/report` lane, stage and TTFF

**Files:**
- Create: `components/player/reportFields.ts`, `components/player/reportFields.test.ts`
- Modify: `src/types/worker.types.ts`, `src/screens/PlayerScreen.tsx`
- Create: `worker/src/reportRow.ts`, `worker/src/reportRow.test.ts`; Modify: `worker/src/schemas.ts`, `worker/src/index.ts`
- Create: `supabase/migrations/20261011141809_provider_reports_native_fields.sql`

**Interfaces:**
- Produces: `ReportStage = "load" | "bind" | "first_frame" | "playing"`; `ReportArgs` gains `lane?: "native" | "embed"`,
  `stage?: ReportStage`, `ttffMs?: number`; `stageFor(outcome): ReportStage`; worker `reportRow(body, country,
  clientHash): ReportRow`.

**Ruling (ledger):** test streams are never reported (they are not providers; reports would poison health). The
native lane's reporting starts in Phase 2 with real sources; Phase 1B ships the fields, the WebView lane sends them,
and the migration + worker deploy wait for the owner's yes (stored-schema change, spec §6.4 escalation rule). Until
then the worker strips the unknown fields (zod default), so shipping the app first is harmless.

- [ ] **Step 1: Write the failing tests**

`components/player/reportFields.test.ts`:
```ts
import { stageFor } from "./reportFields";

describe("stageFor", () => {
  it.each([
    ["success", "playing"],
    ["playback_stall", "playing"],
    ["manual_switch", "playing"],
    ["no_bind", "bind"],
    ["http_error", "load"],
    ["render_crash", "load"],
    ["not_found", "load"],
    ["captcha_block", "load"],
  ] as const)("%s → %s", (outcome, stage) => expect(stageFor(outcome)).toBe(stage));
});
```

`worker/src/reportRow.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { ReportRequestSchema } from "./schemas";
import { reportRow } from "./reportRow";

const base = { providerId: "vidfast", tmdbId: "550", mediaType: "movie", outcome: "success", platform: "android" } as const;

describe("reportRow", () => {
  it("maps the new fields to columns", () => {
    const body = ReportRequestSchema.parse({ ...base, lane: "embed", stage: "playing", ttffMs: 1800 });
    expect(reportRow(body, "IN", "h")).toMatchObject({ lane: "embed", stage: "playing", ttff_ms: 1800, country: "IN", client_hash: "h" });
  });

  it("leaves them out when the client didn't send them (older apps)", () => {
    const row = reportRow(ReportRequestSchema.parse(base), null, "h");
    expect(row).not.toHaveProperty("lane");
    expect(row).not.toHaveProperty("stage");
    expect(row).not.toHaveProperty("ttff_ms");
  });

  it("rejects an unknown lane or a negative ttff", () => {
    expect(() => ReportRequestSchema.parse({ ...base, lane: "satellite" })).toThrow();
    expect(() => ReportRequestSchema.parse({ ...base, ttffMs: -1 })).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest components/player/reportFields.test.ts` and `cd worker && npx vitest run src/reportRow.test.ts; cd ..`
Expected: FAIL — modules missing.

- [ ] **Step 3: Client side**

`src/types/worker.types.ts` — add `export type ReportStage = "load" | "bind" | "first_frame" | "playing";` and to
`ReportArgs`:
```ts
    /** Which lane played (spec §5.7). */
    lane?: "native" | "embed";
    /** Where it got to / failed. */
    stage?: ReportStage;
    /** Play → first progress, on success. */
    ttffMs?: number;
```

`components/player/reportFields.ts`:
```ts
import type { ReportOutcome, ReportStage } from "@/src/types/worker.types";

/** Where a reported outcome happened (spec §5.7). */
export function stageFor(outcome: ReportOutcome): ReportStage {
  switch (outcome) {
    case "no_bind":
      return "bind";
    case "http_error":
    case "render_crash":
    case "not_found":
    case "captcha_block":
      return "load";
    default:
      return "playing";
  }
}
```

`src/screens/PlayerScreen.tsx`:
1. `import { stageFor } from "@/components/player/reportFields";`
2. In `report`, add `lane: "embed", stage: stageFor(outcome),` before `...extra`.
3. Add `const firstProgressAtRef = useRef<number | null>(null);`; reset it to `null` in the provider/episode reset effect;
   set it in `onEvent` where `progressAtRef.current = Date.now()` runs: `firstProgressAtRef.current ??= Date.now();`.
4. In the success branch: `report("success", firstProgressAtRef.current != null ? { ttffMs: firstProgressAtRef.current - mountTsRef.current } : undefined);`

- [ ] **Step 4: Worker side**

`worker/src/schemas.ts` — inside `ReportRequestSchema`'s object, after `errorMessage`:
```ts
    /** Which lane played (spec §5.7). */
    lane: z.enum(["native", "embed"]).optional(),
    /** Where it got to / failed. */
    stage: z.enum(["load", "bind", "first_frame", "playing"]).optional(),
    /** Play → first progress, ms. */
    ttffMs: z.number().int().nonnegative().max(600000).optional(),
```

`worker/src/reportRow.ts`:
```ts
import type { z } from "@hono/zod-openapi";
import type { ReportRequestSchema } from "./schemas";
import type { ReportRow } from "./supabase";

/** The provider_reports row for a validated /report body; the new columns only when the client sent them. */
export function reportRow(body: z.infer<typeof ReportRequestSchema>, country: string | null, clientHash: string): ReportRow {
  return {
    provider_id: body.providerId,
    tmdb_id: body.tmdbId,
    media_type: body.mediaType,
    outcome: body.outcome,
    time_to_fail_ms: body.timeToFailMs ?? null,
    script_version: body.scriptVersion ?? null,
    platform: body.platform,
    app_version: body.appVersion ?? null,
    error_message: body.errorMessage ?? null,
    country,
    client_hash: clientHash,
    ...(body.lane ? { lane: body.lane } : {}),
    ...(body.stage ? { stage: body.stage } : {}),
    ...(body.ttffMs != null ? { ttff_ms: body.ttffMs } : {}),
  };
}
```
(Check the `z` import path against `worker/src/schemas.ts`'s own import and match it.)

`worker/src/index.ts` — replace the inline object passed to `insertReport(c.env, {…})` with
`insertReport(c.env, reportRow(body, country, clientHash))` and import `reportRow`.

`supabase/migrations/20261011141809_provider_reports_native_fields.sql`:
```sql
-- Phase 1B telemetry (spec §5.7): which lane played, where it got to, and time to first frame.
-- Nullable and additive: older apps keep inserting without them.
alter table public.provider_reports
  add column if not exists lane text check (lane in ('native', 'embed')),
  add column if not exists stage text check (stage in ('load', 'bind', 'first_frame', 'playing')),
  add column if not exists ttff_ms integer check (ttff_ms >= 0);
```

- [ ] **Step 5: Run the tests**

Run: `npx jest components/player/reportFields.test.ts && cd worker && npx vitest run && npx tsc --noEmit -p . && cd .. && npx tsc --noEmit`
Expected: PASS; both type-checks clean.

- [ ] **Step 6: Commit (no deploy)**

```bash
git add components/player/reportFields.ts components/player/reportFields.test.ts src/types/worker.types.ts src/screens/PlayerScreen.tsx worker/src/reportRow.ts worker/src/reportRow.test.ts worker/src/schemas.ts worker/src/index.ts supabase/migrations/20261011141809_provider_reports_native_fields.sql
git commit -m "feat(telemetry): /report lane, stage and TTFF (migration + worker deploy wait for owner yes)"
```

Deploy order once the owner says yes: apply the migration → deploy the worker (`cd worker && env -u
CLOUDFLARE_API_TOKEN npx wrangler deploy`) → check one `/report` from the phone lands with `lane`.

---

### Task 13: Device — reachability, Android surface A/B, the Phase 1B gate on the phone

**Files:**
- Modify (only if the A/B picks it): `components/player/native/surface.ts`
- Temporary, never committed: an A/B switch in `src/screens/TestStreamsScreen.tsx`

**Interfaces:** consumes everything above. Produces numbers for the board and the surface ruling.

- [ ] **Step 1: Turn the remote `nativeLane` switch on (dev builds react; shipped builds have no consumer yet)**

```bash
cd worker
env -u CLOUDFLARE_API_TOKEN npx wrangler kv key get --binding CONFIG_LKG flags:v1 --remote
```
Merge `"nativeLane": true` into the JSON it prints (keep every other key as is) and write it back:
```bash
env -u CLOUDFLARE_API_TOKEN npx wrangler kv key put --binding CONFIG_LKG flags:v1 '<merged JSON>' --remote
cd ..
curl -s "https://netprime-worker.spiderfan-no1.workers.dev/config" | python3 -c "import json,sys; print(json.load(sys.stdin)['flags'])"
```
Expected: `{'embedApiLane': …, 'nativeLane': True, 'pluginHost': …}`. Phase 2 must re-check this switch before any
real title routes to the native lane.

- [ ] **Step 2: Measurement build with test streams**

```bash
cd android && EXPO_PUBLIC_TEST_STREAMS=1 JAVA_TOOL_OPTIONS=-Djava.net.preferIPv4Stack=true ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a > $SP/release-1b.log 2>&1; echo "exit $?"; cd ..
adb -s P2228K000422 install -r android/app/build/outputs/apk/release/app-release.apk
adb -s P2228K000422 shell dumpsys thermalservice | grep "Thermal Status"
```
Expected: `exit 0`, `Success`, status 0. Open More → "Test streams (dev)" must be listed (if not, the Metro transform
cache kept the old env: `rm -rf $TMPDIR/metro-* node_modules/.cache` and rebuild). This APK is for measurement only;
Step 9 reinstalls a normal release build.

- [ ] **Step 3: Reachability + TTFF (phone network)**

Open each stream from the list 5 times (back between opens), read the HUD (`uiautomator dump`, node with
`content-desc="dev-hud"`). Record TTFF per stream. Expected: every stream except `broken` reaches a first frame;
TTFF p50 ≤ 3 s per stream (spec §9 gate). A stream that fails only on this network (as Jio Wi-Fi blocked some hosts on
2026-10-11) is noted and checked on mobile data before calling it a stream problem.

- [ ] **Step 4: Android surface A/B (cadence method)**

Temporary (do **not** commit) — in `TestStreamsScreen`, a long-press on a row cycles a module-level mode
`A: surfaceView` → `B: textureView` → `C: textureView + glass` (shown in the row note), and the press passes it through
a module-level variable that `NativePlayerScreen` reads instead of `VIDEO_SURFACE`/`GLASS_OVER_VIDEO`. Rebuild with test
streams, install, thermal status 0.

For each of `tos-24p` (24 fps) and `bipbop` (60 fps), alternate A, B, C, A, B, C; for each run:
- Controls hidden, 6 s: `adb -s P2228K000422 shell dumpsys SurfaceFlinger --latency-clear`, wait 6 s, then dump the
  video layer: `adb -s P2228K000422 shell dumpsys SurfaceFlinger --list | grep -i bearoom` → mode A uses the
  `SurfaceView[…]` layer, B/C the app window layer → `adb -s P2228K000422 shell dumpsys SurfaceFlinger --latency '<layer>' > $SP/sf-<mode>-<n>.txt`;
  `python3 $SP/sf-cadence.py $SP/sf-<mode>-<n>.txt <fps>` (script below).
- Controls shown (tap, 0.7 s, 2.5 s window): `$SP/fs-measure.sh <mode>-shown-<n> 2.5` for app janky %, and the same SF
  dump.
- One 5 s perfetto trace per mode (`$SP/pf5.cfg`) for main + RenderThread busy ms/s (`$SP/q1.sql`, `$SP/q4.sql`).

`$SP/sf-cadence.py`:
```python
import sys, collections
# sf-cadence.py DUMP FPS — present intervals of one SurfaceFlinger layer, in display vsyncs; share on the ideal rhythm.
lines = open(sys.argv[1]).read().split("\n")
period = int(lines[0].strip())
ts = [int(p[1]) for p in (l.split() for l in lines[1:]) if len(p) == 3 and p[1] not in ("0", "9223372036854775807")]
iv = [round((b - a) / period) for a, b in zip(ts, ts[1:])]
ideal = round(1e9 / float(sys.argv[2]) / period)
h = collections.Counter(iv)
print(f"frames {len(ts)} ideal {ideal}; on-rhythm {100 * h[ideal] / max(1, len(iv)):.1f}%  {dict(sorted(h.items()))}")
```

Decision rule (ledger it with the numbers): a mode **passes** when video on-rhythm ≥ 95 % with controls hidden and
≥ 90 % with controls shown, and app janky ≤ 5 % shown, on both streams. Pick **C** if it passes (glass over the video —
the owner's original ask), else **A** (lightest). If C wins, set `VIDEO_SURFACE = "textureView"` in `surface.ts` and
commit that one-line change with the numbers in the message; otherwise leave `surfaceView`. Revert the temporary
switch (`git checkout src/screens/TestStreamsScreen.tsx src/screens/NativePlayerScreen.tsx`) before committing.

- [ ] **Step 5: Gate checks on the phone (spec §9 row 1B), with the chosen surface build**

Each with a screenshot (zoomed crops where text is small) saved under `$SP/shots/1b-*`:
1. **Audio by language** — `angel-hls`: settings → German, then Spanish; HUD shows the track; listen check skipped
   (no audio capture) — the HUD reflects `audioTrackChange` from the player itself.
2. **Subtitles in-stream** — `angel-hls`: English, then French (rendered by the player).
3. **Subtitles sidecar** — `tos-sidecar`: seek to 0:22, pick German; the overlay shows the cue; offset +0.5 s / −0.5 s
   and size Small/Large change it.
4. **Auto + manual quality** — `bipbop`: Auto (HUD `Auto (1080p)` on Wi-Fi), pick 540p → within ~10 s the playing tier
   drops to ≤ 540p and stays; Auto again recovers. Repeat on `angel-hls` and confirm the chosen **audio language keeps
   playing** after a quality pick (Review Focus 1).
5. **Speed** — 1.5×: the clock advances ~15 s in 10 s.
6. **Landed seek ≤ 0.25 s** — 10 scrubs/double-taps across `tos-24p`, `bbb-muxed`, `angel-hls`; every HUD `seek Δ` ≤ 0.25.
7. **F4** — `broken`: error card; Retry shows it again; "Try another source" returns to the list.
8. **F7** — seek far ahead into unbuffered media: spinner after ~300 ms, playback continues.
9. **F8** — airplane mode on while playing: video pauses + app-wide offline banner; off: resumes at the same position.
10. **Controls states** — visible / hidden / locked + unlock pill / double-tap ripple / scrub bubble + bigger thumb /
    buffering spinner / quick chip / settings sheet (every row) / loading card / error card / portrait + landscape.
11. **WebView lane on the new layer** — open Fight Club (VidFast) solo and in a party: controls with the quick chip,
    double-tap, lock, remaining time; a TV episode shows Next episode; the loading cover and error card look as before.

Any failure → systematic-debugging, fix with a RED→GREEN test, rebuild, re-check that item.

- [ ] **Step 6: Ask for the remaining gate legs**

The spec's gate also needs the Android emulator and the iOS 27 simulator (and the iOS compile of `BearoomPlayerModule`).
The owner said they are busy; ask once in the phase report whether to run those legs now or later. Do not start them
without a yes.

- [ ] **Step 7: Normal build back on the phone**

```bash
cd android && JAVA_TOOL_OPTIONS=-Djava.net.preferIPv4Stack=true ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a > $SP/release-1b-final.log 2>&1; echo "exit $?"; cd ..
adb -s P2228K000422 install -r android/app/build/outputs/apk/release/app-release.apk
```
Expected: `exit 0`; "Test streams (dev)" no longer appears in More.

---

### Task 14: Docs, memory, final review, merge

**Files:**
- Modify: `docs/superpowers/specs/2026-10-10-playback-languages-party-design.md` (§6.2 Quality: cap instead of variant
  reload; §6.2.1: Up next card and Report button arrive with Phase 2 sources; §9 row 1B status), `docs/project-board.md`
  (Phase 1B entry with the gate numbers and the surface ruling), `docs/BACKLOG.md`, memory files.

- [ ] **Step 1: Spec amendments + board + backlog**

Spec §6.2 Quality bullet → "Auto (ABR) + tiers from the player's variants. Manual quality caps adaptive selection at
that tier (`modules/bearoom-player`: Android max video size, iOS `preferredMaximumResolution`) — a single variant
playlist would drop demuxed audio and subtitle renditions." §6.2.1 States → note "Up next" card and the error card's
Report action ship with Phase 2's real sources. Board: a "Phase 1B — native player" section with what shipped, the
gate table (TTFF p50 per stream, max seek Δ, F4/F7/F8, surface A/B table and ruling), and what's pending (emulator +
iOS legs, migration + worker deploy). BACKLOG: Up-next card, Report action, iOS quality-cap compile check.

- [ ] **Step 2: Memory**

Update `glass-over-video-smoothness-goal.md` and `party-playback-jank-webview-cost.md` with the surface ruling; add a
`phase1b-status.md` (state, what's pending, how to open test streams, the KV flag) and index it in `MEMORY.md`.

- [ ] **Step 3: Final whole-branch review**

Per superpowers:executing-plans: `review-package` for `git merge-base feat/improvements HEAD`..HEAD, dispatch the
code reviewer on the most capable model with the plan, the spec, this plan's Review Focus verbatim and the ledger's
Ruling lines. One fix pass for Critical/Important (RED→GREEN each, suite green); minors → ledger.

- [ ] **Step 4: Merge and push**

```bash
npx jest && npx tsc --noEmit
git checkout feat/improvements && git merge --ff-only phase1b/native-player && git push origin feat/improvements
```
Expected: suite green; fast-forward; origin = local.
