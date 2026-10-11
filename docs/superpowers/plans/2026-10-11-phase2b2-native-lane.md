# Phase 2B-2 — Native Lane for Real Titles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pressing Play on a title that has a playable native stream opens Bearoom's own player on that stream. The user can switch audio language (sibling streams) and source, a failing stream fails over without losing the position, and every language change is announced. Titles without a native stream keep today's web flow, unchanged.

**Architecture:**
- **Lane choice.** A new `PlayerLaneScreen` becomes the `Player` route. It runs the native lane only when `/config` has `pluginHost` and `nativeLane` on and the binary has BearoomFetch. Otherwise it renders today's `PlayerScreen` untouched.
- **Session.** `TitlePlayer` owns one title's native session:
  - resolve (Plan 2B-1's `resolveTitle`), capped at 8 s, then the web flow;
  - play the top-ranked candidate in `NativePlayerView`;
  - an Audio row backed by sibling candidates;
  - a source sheet with the candidates plus "Web player";
  - F6 failover: re-resolve the same key once, then the next stream in the same language, then any other language with a notice;
  - native-lane telemetry.
- **Pure parts.** Selection and notice copy live in `nativeSession.ts` and are unit-tested.
- **Player view.** `NativePlayerView` gains small props: start position, event passthrough, error interception, sibling audio choices, a notice, episode controls.

**Tech Stack:** React Native 0.86 / Expo SDK 57, expo-video (via `NativePlayer`), RTK Query (`useDetailsQuery`, `useReportOutcomeMutation`), jest-expo + react-test-renderer.

**Spec:** `docs/superpowers/specs/2026-10-10-playback-languages-party-design.md`:
- §6.2 Audio/Source rows, labels show the current value
- §6.2.1 loading card → first frame
- §6.3 the missing-capability copy
- §7 F4, F6, F14
- §1.1 S4 (language never changes silently) and S8 (no provider UI when a native source exists)
- §5.7 telemetry

Predecessors: Plans 2A and 2B-1 (board sections "Phase 2A" and "Phase 2B-1").

## Global Constraints

- **Unchanged paths.** The web flow (`src/screens/PlayerScreen.tsx`) is unchanged, and it is the fallback for any title without a playable native candidate on this device (spec §6.3 row 1).
- **No silent language change (S4).** Every fallback to another language shows a notice. The copy is from spec §6.3:
  - "Hindi isn't available for this title — playing original audio"
  - "Switched to <source> — Hindi isn't on this one." with a **Change** action
- **F6 order.** Re-resolve the **same key** once and resume at the same position. Then the next candidate in the **same language**. Then another language, with the notice. Then the error card (F4).
- **F4 card.** Retry re-resolves from scratch. "Try another source" opens the source sheet, or the web player when no other candidate is left. The spec's third action, Report, stays deferred, as in 1B (no report outcome exists for it).
- **Resolve budget for Play: 8 s**, then the web flow. That is S1's p90 TTFF budget; Plan 2C's title-page preview will warm the cache so Play is near-instant.
- **Telemetry (spec §5.7, §8):**
  - Fields: `lane: "native"`, `providerId = sourceId` (`repoId/pluginId`), outcome, stage, `ttffMs`.
  - Never sent: URLs, headers, cookies, player error text, or `PluginFailure.detail` (ledger ruling carried from 2A).
- **Party** stays on the web lane until Phase 3. `TitlePlayer` has no Watch Party button.
- **Video-screen rules:** no live blur and no elevation/glow on the player (solid surfaces only); no Reanimated `entering`/`exiting`/`layout`.
- **Carried from earlier plans:**
  - Physical Android phone `P2228K000422` (check `dumpsys power` idle before installing). iOS 27 simulator allowed: iPhone 18 Pro `A1518C83-9D37-419D-9865-9CDDC16F11E3`. Android emulator **not** allowed.
  - Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Switching while playing.** Picking a language or source mid-film, twice in a row, or while the previous stream is still loading. The position carries over, there's no double playback, and the old player is torn down. Task 6 pins this.
2. **Failover loops.** A title where every candidate fails, or the same key fails again after the re-resolve. It must end on the F4 card, never cycle forever. Task 6 pins this.
3. **Slow or empty resolves.** No candidates, a resolve slower than 8 s whose late result must be ignored, or details that never load. Task 6 pins this.
4. **Lane flags turned off mid-session (F14).** The next Play uses the web flow; a session already playing is left alone. Task 7 pins this.
5. **Telemetry leaks.** A stream error whose message contains a signed URL must not reach `/report`. Task 1 pins this.

---

### Task 1: Session helpers (pure)

**Files:**
- Create: `src/features/player/nativeSession.ts`, `src/features/player/nativeSession.test.ts`

**Interfaces:**
- Consumes:
  - `PlaybackCandidate` (`services/playback/candidate.ts`)
  - `languageName`, `normalizeLanguage` (`components/player/native/languages.ts`)
  - `NativeSource`, `SidecarSubtitle` (`components/player/native/NativePlayer.tsx`)
  - `ReportArgs`, `ReportOutcome` (`src/types/worker.types.ts`)
  - `stageFor` (`components/player/reportFields.ts`)
- Produces:

```ts
export function primaryLanguage(c: PlaybackCandidate): string | null;
export function toNativeSource(c: PlaybackCandidate): NativeSource;
export function sidecarsOf(c: PlaybackCandidate): SidecarSubtitle[];
export interface LanguageOption { code: string | null; label: string; active: boolean }
export function languageOptions(ranked: PlaybackCandidate[], current: PlaybackCandidate): LanguageOption[];
export function bestIn(ranked: PlaybackCandidate[], code: string | null, skip?: ReadonlySet<string>): PlaybackCandidate | undefined;
export function nextAfterFailure(ranked: PlaybackCandidate[], failed: ReadonlySet<string>, language: string | null): { candidate: PlaybackCandidate; languageLost: boolean } | null;
export function preferenceNotice(wanted: string[], originalLanguage: string | undefined, playing: PlaybackCandidate): string | null;
export function switchNotice(c: PlaybackCandidate, lost: string | null): string;
export function sourceLine(c: PlaybackCandidate): string;
export function nativeReport(c: PlaybackCandidate, title: { tmdbId: string; type: "movie" | "tv" }, outcome: ReportOutcome, extra?: { ttffMs?: number; timeToFailMs?: number }): ReportArgs;
```

- [ ] **Step 1: Write the failing test** — `src/features/player/nativeSession.test.ts`

```ts
import type { PlaybackCandidate } from "@/services/playback/candidate";
import {
  bestIn,
  languageOptions,
  nativeReport,
  nextAfterFailure,
  preferenceNotice,
  primaryLanguage,
  sidecarsOf,
  sourceLine,
  switchNotice,
  toNativeSource,
} from "./nativeSession";

const c = (key: string, languages: string[], over: Partial<PlaybackCandidate> = {}): PlaybackCandidate => ({
  key,
  sourceId: "r/p",
  label: `Src ${key}`,
  url: `https://cdn.example.net/${key}.m3u8?token=secret`,
  headers: { Referer: "https://r.example.net/" },
  container: "hls",
  languages,
  platforms: { ios: true, android: true },
  subtitles: [],
  verdict: "ok",
  order: 0,
  ...over,
});

describe("toNativeSource / sidecarsOf", () => {
  it("hands the player the URL, the stream's headers and its container", () => {
    expect(toNativeSource(c("a", []))).toEqual({ uri: "https://cdn.example.net/a.m3u8?token=secret", headers: { Referer: "https://r.example.net/" }, contentType: "hls" });
    expect(toNativeSource(c("b", [], { container: "mp4", headers: {} }))).toEqual({ uri: "https://cdn.example.net/b.m3u8?token=secret", headers: undefined, contentType: "progressive" });
    expect(toNativeSource(c("d", [], { container: "dash" })).contentType).toBe("dash");
    expect(toNativeSource(c("u", [], { container: "unknown" })).contentType).toBe("auto");
  });

  it("turns plugin subtitles into sidecar tracks", () => {
    expect(sidecarsOf(c("a", [], { subtitles: [{ id: "0", url: "https://s.example.net/en.srt", label: "English", language: "en" }] }))).toEqual([
      { id: "0", url: "https://s.example.net/en.srt", label: "English", language: "en" },
    ]);
  });
});

describe("languageOptions", () => {
  it("offers one row per language in rank order, the playing one active; unknown reads as this source's original audio", () => {
    const ranked = [c("hi1", ["hi"]), c("en1", ["en", "hi"]), c("hi2", ["hi"]), c("unk", [])];
    expect(languageOptions(ranked, ranked[1])).toEqual([
      { code: "hi", label: "Hindi", active: false },
      { code: "en", label: "English", active: true },
      { code: null, label: "Original audio (this source)", active: false },
    ]);
  });
});

describe("bestIn / nextAfterFailure", () => {
  const ranked = [c("hi1", ["hi"]), c("hi2", ["hi"]), c("en1", ["en"])];

  it("picks the best candidate in a language, skipping failed ones", () => {
    expect(bestIn(ranked, "hi")?.key).toBe("hi1");
    expect(bestIn(ranked, "hi", new Set(["hi1"]))?.key).toBe("hi2");
    expect(bestIn(ranked, "ta")).toBeUndefined();
    expect(primaryLanguage(c("x", []))).toBeNull();
  });

  it("F6: same language first, then any other with languageLost, then nothing", () => {
    expect(nextAfterFailure(ranked, new Set(["hi1"]), "hi")).toEqual({ candidate: ranked[1], languageLost: false });
    expect(nextAfterFailure(ranked, new Set(["hi1", "hi2"]), "hi")).toEqual({ candidate: ranked[2], languageLost: true });
    expect(nextAfterFailure(ranked, new Set(["hi1", "hi2", "en1"]), "hi")).toBeNull();
    expect(nextAfterFailure([c("u1", []), c("u2", [])], new Set(["u1"]), null)).toEqual({ candidate: expect.objectContaining({ key: "u2" }), languageLost: false });
  });
});

describe("notices (spec §6.3)", () => {
  it("says once when the wanted language isn't what plays", () => {
    expect(preferenceNotice(["hi", "en"], "en", c("e", ["en"]))).toBe("Hindi isn't available for this title — playing original audio");
    expect(preferenceNotice(["hi", "en"], "te", c("t", ["ta"]))).toBe("Hindi isn't available for this title — playing Tamil");
    expect(preferenceNotice(["hi", "en"], "en", c("u", []))).toBe("Hindi isn't available for this title — playing original audio");
    expect(preferenceNotice(["hi", "en"], "en", c("h", ["hi"]))).toBeNull();
    expect(preferenceNotice(["en"], "en", c("e", ["en"]))).toBeNull();
    expect(preferenceNotice([], "en", c("e", ["en"]))).toBeNull();
  });

  it("names the new source and the language that was lost", () => {
    expect(switchNotice(c("x", ["en"], { label: "Vidrock • English" }), "hi")).toBe("Switched to Vidrock • English — Hindi isn't on this one.");
    expect(switchNotice(c("x", ["hi"], { label: "Castle" }), null)).toBe("Switched to Castle.");
  });
});

describe("sourceLine", () => {
  it("reads source · language · quality", () => {
    expect(sourceLine(c("x", ["en"], { label: "Open Movies • HLS", quality: { label: "1080p", height: 1080 } }))).toBe("Open Movies • HLS · English · 1080p");
    expect(sourceLine(c("x", [], { label: "Castle" }))).toBe("Castle");
  });
});

describe("nativeReport", () => {
  it("reports the source id on the native lane and nothing from the stream itself", () => {
    const r = nativeReport(c("x", ["en"], { sourceId: "open-movies/open-movies" }), { tmdbId: "10378", type: "movie" }, "success", { ttffMs: 840 });
    expect(r).toMatchObject({ providerId: "open-movies/open-movies", tmdbId: "10378", mediaType: "movie", outcome: "success", lane: "native", stage: "playing", ttffMs: 840 });
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/cdn\.example\.net|token|Referer/);
    expect(r).not.toHaveProperty("errorMessage");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/features/player/nativeSession`
Expected: FAIL — `Cannot find module './nativeSession'`.

- [ ] **Step 3: Implement** — `src/features/player/nativeSession.ts`

```ts
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
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx jest src/features/player/nativeSession`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/player/nativeSession.ts src/features/player/nativeSession.test.ts
git commit -m "feat(player): native-lane session helpers — sources, language rows, F6 order, §6.3 copy, safe telemetry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `PlayerToast` — the player's one-line notice

**Files:**
- Create: `components/player/PlayerToast.tsx`, `components/player/PlayerToast.test.tsx`

**Interfaces:**
- Produces:
  - `interface PlayerNotice { id: number; message: string; action?: { label: string; onPress: () => void } }`
  - `NOTICE_MS = 5000`
  - `PlayerToast({ notice, onDone }: { notice: PlayerNotice | null; onDone: () => void })` — shows the message (and a pill action), fades in, and calls `onDone` after `NOTICE_MS`. The surface is solid; no blur on a video screen.

- [ ] **Step 1: Write the failing test** — `components/player/PlayerToast.test.tsx`

```tsx
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { NOTICE_MS, PlayerToast } from "./PlayerToast";

const texts = (r: ReactTestRenderer) =>
  r.root.findAll((n) => typeof n.type === "string" && typeof n.props.children === "string").map((n) => n.props.children as string);

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("PlayerToast", () => {
  it("shows nothing without a notice", () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<PlayerToast notice={null} onDone={jest.fn()} />);
    });
    expect(texts(r)).toEqual([]);
  });

  it("shows the message and its action, and is done after a few seconds", () => {
    const onPress = jest.fn();
    const onDone = jest.fn();
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<PlayerToast notice={{ id: 1, message: "Switched to Castle — Hindi isn't on this one.", action: { label: "Change", onPress } }} onDone={onDone} />);
    });
    expect(texts(r)).toEqual(["Switched to Castle — Hindi isn't on this one.", "Change ▸"]);
    act(() => r.root.find((n) => n.props.accessibilityLabel === "Change" && typeof n.props.onPress === "function").props.onPress());
    expect(onPress).toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(NOTICE_MS - 1));
    expect(onDone).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("a new notice restarts the clock", () => {
    const onDone = jest.fn();
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<PlayerToast notice={{ id: 1, message: "a" }} onDone={onDone} />);
    });
    act(() => jest.advanceTimersByTime(NOTICE_MS - 100));
    act(() => r.update(<PlayerToast notice={{ id: 2, message: "b" }} onDone={onDone} />));
    act(() => jest.advanceTimersByTime(NOTICE_MS - 100));
    expect(onDone).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(100));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest components/player/PlayerToast`
Expected: FAIL — `Cannot find module './PlayerToast'`.

- [ ] **Step 3: Implement** — `components/player/PlayerToast.tsx`

```tsx
/**
 * One-line notice over the player (spec §6.3): a language change or source switch is never silent. Solid surface —
 * no blur or glow on a video screen.
 */
import { colors, font, ms, radius } from "@/theme/bearoom";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

export interface PlayerNotice {
  /** Changes for every new notice (restarts the clock). */
  id: number;
  message: string;
  action?: { label: string; onPress: () => void };
}

export const NOTICE_MS = 5000;

export function PlayerToast({ notice, onDone }: { notice: PlayerNotice | null; onDone: () => void }) {
  const [opacity] = useState(() => new Animated.Value(0));
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  const id = notice?.id;
  useEffect(() => {
    if (id == null) return;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const t = setTimeout(() => done.current(), NOTICE_MS);
    return () => clearTimeout(t);
  }, [id, opacity]);

  if (!notice) return null;
  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, { opacity }]}>
      <View style={styles.toast} accessibilityRole="alert" accessibilityLiveRegion="polite">
        <Text style={styles.text} numberOfLines={2}>
          {notice.message}
        </Text>
        {notice.action ? (
          <Pressable accessibilityRole="button" accessibilityLabel={notice.action.label} onPress={notice.action.onPress} style={styles.action} hitSlop={8}>
            <Text style={styles.actionText}>{`${notice.action.label} ▸`}</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", top: ms(10), left: ms(12), right: ms(12), alignItems: "center" },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(10),
    maxWidth: ms(520),
    paddingVertical: ms(9),
    paddingHorizontal: ms(14),
    borderRadius: radius.pill,
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  text: { flexShrink: 1, color: colors.text, fontFamily: font.bodySemi, fontSize: ms(13) },
  action: { paddingHorizontal: ms(10), paddingVertical: ms(4), borderRadius: radius.pill, backgroundColor: colors.honeySoft },
  actionText: { color: colors.honey, fontFamily: font.label, fontSize: ms(12) },
});
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx jest components/player/PlayerToast`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/player/PlayerToast.tsx components/player/PlayerToast.test.tsx
git commit -m "feat(player): PlayerToast — the one-line notice for language and source changes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `CandidateSheet` — native sources plus the web player

**Files:**
- Create: `components/player/CandidateSheet.tsx`, `components/player/CandidateSheet.test.tsx`

**Interfaces:**
- Consumes: `PlaybackCandidate`; `languageName`; `GlassCard` (`components/ui/GlassCard`, used solid as in `PlayerSettingsSheet`).
- Produces: `CandidateSheet(props: { visible: boolean; candidates: PlaybackCandidate[]; currentKey: string | null; onPick(c: PlaybackCandidate): void; onUseWeb(): void; onClose(): void })`.
  - Each row reads: label, then "language · quality", plus "Unverified" or "Android only" where they apply.
  - The playing row is marked.
  - The last row, "Web player · other sources", has `accessibilityLabel` "Use the web player".

- [ ] **Step 1: Write the failing test** — `components/player/CandidateSheet.test.tsx`

```tsx
import type { PlaybackCandidate } from "@/services/playback/candidate";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { CandidateSheet } from "./CandidateSheet";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const cand = (key: string, over: Partial<PlaybackCandidate> = {}): PlaybackCandidate => ({
  key,
  sourceId: "r/p",
  label: `Source ${key}`,
  url: `https://x.example.net/${key}`,
  headers: {},
  container: "hls",
  languages: ["hi"],
  quality: { label: "1080p", height: 1080 },
  platforms: { ios: true, android: true },
  subtitles: [],
  verdict: "ok",
  order: 0,
  ...over,
});
const texts = (r: ReactTestRenderer) =>
  r.root.findAll((n) => typeof n.type === "string" && typeof n.props.children === "string").map((n) => n.props.children as string);
const press = (r: ReactTestRenderer, label: string) =>
  act(() => r.root.find((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === "function").props.onPress());

function render(props: Partial<React.ComponentProps<typeof CandidateSheet>> = {}) {
  const all = {
    visible: true,
    candidates: [cand("a"), cand("b", { languages: [], verdict: "unverified", quality: undefined }), cand("c", { languages: ["ta"], platforms: { ios: false, android: true } })],
    currentKey: "a",
    onPick: jest.fn(),
    onUseWeb: jest.fn(),
    onClose: jest.fn(),
    ...props,
  };
  let r!: ReactTestRenderer;
  act(() => {
    r = create(<CandidateSheet {...all} />);
  });
  return { r, ...all };
}

describe("CandidateSheet", () => {
  it("lists every native source with its language and quality, and the web player last", () => {
    const { r } = render();
    expect(texts(r)).toEqual([
      "Source",
      "Source a",
      "Hindi · 1080p",
      "Source b",
      "Language unknown · Unverified",
      "Source c",
      "Tamil · 1080p · Android only",
      "Web player · other sources",
    ]);
  });

  it("marks the playing source", () => {
    const { r } = render();
    const row = r.root.find((n) => n.props.accessibilityLabel === "Source a, Hindi · 1080p" && n.props.accessibilityState);
    expect(row.props.accessibilityState).toEqual({ selected: true });
  });

  it("picks a source, or the web player", () => {
    const { r, onPick, onUseWeb, candidates } = render();
    press(r, "Source c, Tamil · 1080p · Android only");
    expect(onPick).toHaveBeenCalledWith(candidates[2]);
    press(r, "Use the web player");
    expect(onUseWeb).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest components/player/CandidateSheet`
Expected: FAIL — `Cannot find module './CandidateSheet'`.

- [ ] **Step 3: Implement** — `components/player/CandidateSheet.tsx`

```tsx
/**
 * The native lane's source picker (spec §6.2 Source row): every playable stream for this title with its language and
 * quality badges, and a way out to the web player (the providers' own pages). Solid sheet — no blur over video.
 */
import { languageName } from "@/components/player/native/languages";
import GlassCard from "@/components/ui/GlassCard";
import type { PlaybackCandidate } from "@/services/playback/candidate";
import { colors, font, ms, radius } from "@/theme/bearoom";
import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface CandidateSheetProps {
  visible: boolean;
  candidates: PlaybackCandidate[];
  currentKey: string | null;
  onPick: (c: PlaybackCandidate) => void;
  onUseWeb: () => void;
  onClose: () => void;
}

function details(c: PlaybackCandidate): string {
  const lang = c.languages[0];
  return [
    lang ? languageName(lang) : "Language unknown",
    c.quality?.label,
    c.verdict === "unverified" ? "Unverified" : null,
    c.platforms.ios ? null : "Android only",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function CandidateSheet({ visible, candidates, currentKey, onPick, onUseWeb, onClose }: CandidateSheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.wrap} onPress={() => {}}>
          <GlassCard blur={false} rounded={radius.xxl} bordered style={styles.sheet}>
            <View style={[styles.inner, { paddingBottom: Math.max(insets.bottom, ms(16)) }]}>
              <View style={styles.handle} />
              <Text style={styles.title}>Source</Text>
              <ScrollView style={styles.list}>
                {candidates.map((c) => {
                  const on = c.key === currentKey;
                  const line = details(c);
                  return (
                    <Pressable
                      key={c.key}
                      accessibilityRole="button"
                      accessibilityLabel={`${c.label}, ${line}`}
                      accessibilityState={{ selected: on }}
                      style={[styles.row, on && styles.rowOn]}
                      onPress={() => onPick(c)}
                    >
                      <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
                        {c.label}
                      </Text>
                      <Text style={styles.details} numberOfLines={1}>
                        {line}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable accessibilityRole="button" accessibilityLabel="Use the web player" style={styles.row} onPress={onUseWeb}>
                  <Text style={styles.label}>Web player · other sources</Text>
                </Pressable>
              </ScrollView>
            </View>
          </GlassCard>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.modalBackdrop, justifyContent: "flex-end" },
  wrap: { paddingHorizontal: ms(10), paddingBottom: ms(10) },
  sheet: { backgroundColor: colors.bgElevated },
  inner: { paddingHorizontal: ms(18), paddingTop: ms(10) },
  handle: { alignSelf: "center", width: ms(38), height: ms(4), borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: ms(12) },
  title: { color: colors.text, fontFamily: font.headline, fontSize: ms(17), marginBottom: ms(10) },
  list: { maxHeight: ms(420) },
  row: { paddingVertical: ms(11), paddingHorizontal: ms(12), borderRadius: radius.lg, marginBottom: ms(6), backgroundColor: colors.surfaceStrong },
  rowOn: { backgroundColor: colors.honeySoft, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.honey },
  label: { color: colors.text, fontFamily: font.bodySemi, fontSize: ms(14) },
  labelOn: { color: colors.honey },
  details: { color: colors.textDim, fontFamily: font.body, fontSize: ms(12), marginTop: ms(2) },
});
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx jest components/player/CandidateSheet`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/player/CandidateSheet.tsx components/player/CandidateSheet.test.tsx
git commit -m "feat(player): CandidateSheet — native sources with language/quality badges, and the web player

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `NativePlayerView` — start position, events, error hand-off, sibling audio, notice, episodes

**Files:**
- Modify: `src/features/player/NativePlayerView.tsx`
- Modify: `src/features/player/NativePlayerView.test.tsx`

**Interfaces:**
- Consumes: `PlayerToast`, `PlayerNotice` (Task 2); `QualityLevel`, `PlayerEvent` (`components/player/types.ts`).
- Produces — new optional props on `NativePlayerViewProps`:

```ts
  /** Seconds to start at once the stream is ready (a switch keeps the position). */
  startAt?: number;
  /** Every player event, after the view has handled it (position, telemetry). */
  onPlayerEvent?: (e: PlayerEvent) => void;
  /** A fatal stream error: return true when the caller handles it (no error card). */
  onStreamError?: (message: string) => boolean;
  /** Languages from sibling streams, offered while the stream itself has at most one audio track. */
  audioChoices?: { options: QualityLevel[]; onPick: (label: string) => void };
  notice?: PlayerNotice | null;
  onNoticeDone?: () => void;
  /** "S1 · E3" under the title. */
  subtitle?: string;
  onNextEpisode?: () => void;
```

- [ ] **Step 1: Write the failing tests** — in `src/features/player/NativePlayerView.test.tsx`:

Replace the `PlayerControls` and `PlayerSettingsSheet` mocks so they record their props:

```tsx
let mockControlsProps: any = null;
jest.mock("@/components/player/PlayerControls", () => {
  const R = jest.requireActual("react");
  return {
    PlayerControls: R.forwardRef((p: any, ref: any) => {
      mockControlsProps = p;
      R.useImperativeHandle(ref, () => ({ setPlayback: jest.fn() }));
      return null;
    }),
  };
});
let mockSheetProps: any = null;
jest.mock("@/components/player/PlayerSettingsSheet", () => ({
  __esModule: true,
  default: (p: any) => {
    mockSheetProps = p;
    return null;
  },
}));
```

and add inside `describe("NativePlayerView", …)`:

```tsx
  const ev = (event: string, currentTime = 0) => ({ event, currentTime, duration: 900, paused: false });

  it("starts at the given position once the stream is ready, once", () => {
    act(() => {
      create(view({ startAt: 754 }));
    });
    act(() => mockPlayerProps.onPlayerEvent(ev("ready")));
    act(() => mockPlayerProps.onPlayerEvent(ev("ready")));
    expect(mockHandle.seek).toHaveBeenCalledTimes(1);
    expect(mockHandle.seek).toHaveBeenCalledWith(754);
  });

  it("passes every event on to the caller", () => {
    const onPlayerEvent = jest.fn();
    act(() => {
      create(view({ onPlayerEvent }));
    });
    act(() => mockPlayerProps.onPlayerEvent(ev("tick", 12)));
    expect(onPlayerEvent).toHaveBeenCalledWith(expect.objectContaining({ event: "tick", currentTime: 12 }));
  });

  it("lets the caller handle a fatal error instead of showing the card", () => {
    let r!: ReactTestRenderer;
    const onStreamError = jest.fn(() => true);
    act(() => {
      r = create(view({ onStreamError }));
    });
    act(() => mockPlayerProps.onFatalError("HTTP 403"));
    expect(onStreamError).toHaveBeenCalledWith("HTTP 403");
    expect(texts(r)).not.toContain("Couldn’t play this stream");
  });

  it("offers sibling languages when the stream has one audio track, and the picks go to the caller", () => {
    const onPick = jest.fn();
    act(() => {
      create(view({ audioChoices: { options: [{ label: "Hindi", active: true }, { label: "English", active: false }], onPick } }));
    });
    act(() => mockPlayerProps.onPlayerEvent({ ...ev("audio"), audios: [{ label: "English", active: true }] }));
    expect(mockSheetProps.audios).toEqual([{ label: "Hindi", active: true }, { label: "English", active: false }]);
    expect(mockSheetProps.showAudio).toBe(true);
    act(() => mockSheetProps.onSetAudio("English"));
    expect(onPick).toHaveBeenCalledWith("English");
    expect(mockHandle.setAudio).not.toHaveBeenCalled();
    expect(mockControlsProps.chips.audio).toBe("Hindi");
  });

  it("keeps the stream's own audio tracks when it has several", () => {
    const onPick = jest.fn();
    act(() => {
      create(view({ audioChoices: { options: [{ label: "Hindi", active: true }, { label: "English", active: false }], onPick } }));
    });
    act(() => mockPlayerProps.onPlayerEvent({ ...ev("audio"), audios: [{ label: "Tamil", active: true }, { label: "Telugu", active: false }] }));
    expect(mockSheetProps.audios.map((a: { label: string }) => a.label)).toEqual(["Tamil", "Telugu"]);
    act(() => mockSheetProps.onSetAudio("Telugu"));
    expect(mockHandle.setAudio).toHaveBeenCalledWith("Telugu");
    expect(onPick).not.toHaveBeenCalled();
  });

  it("shows a notice and passes episode controls to the controls layer", () => {
    let r!: ReactTestRenderer;
    const onNextEpisode = jest.fn();
    act(() => {
      r = create(view({ notice: { id: 1, message: "Hindi isn't available for this title — playing original audio" }, subtitle: "S1 · E3", onNextEpisode }));
    });
    expect(texts(r)).toContain("Hindi isn't available for this title — playing original audio");
    expect(mockControlsProps.subtitle).toBe("S1 · E3");
    expect(mockControlsProps.onNextEpisode).toBe(onNextEpisode);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest src/features/player/NativePlayerView`
Expected: FAIL — the six new tests (no seek, no passthrough, card shown, audios unchanged, no notice/subtitle).

- [ ] **Step 3: Implement** — in `NativePlayerView.tsx`:

1. Add the imports `import { PlayerToast, type PlayerNotice } from "@/components/player/PlayerToast";`. Add `QualityLevel` to the existing `@/components/player/types` import (it is already there).
2. Add the props from **Interfaces** to `NativePlayerViewProps`, and destructure them with the others.
3. Directly after `const t0 = useRef…`, add refs so the stable `onEvent` callback sees current props:

```tsx
  const startAtRef = useRef(startAt);
  const startDone = useRef(false);
  const onPlayerEventRef = useRef(onPlayerEvent);
  const onStreamErrorRef = useRef(onStreamError);
  useEffect(() => {
    startAtRef.current = startAt;
    onPlayerEventRef.current = onPlayerEvent;
    onStreamErrorRef.current = onStreamError;
  }, [startAt, onPlayerEvent, onStreamError]);
```

4. In `onEvent`, first line inside the callback:

```tsx
    if (e.event === "ready" && !startDone.current) {
      startDone.current = true;
      const at = startAtRef.current;
      if (at && at > 1) void playerRef.current?.seek(at);
    }
```

and as its last line, after the if/else chain, `onPlayerEventRef.current?.(e);`.

5. Add, after `retry`:

```tsx
  const onFatal = useCallback((message: string) => {
    if (onStreamErrorRef.current?.(message)) return;
    setError(message);
  }, []);
```

and pass `onFatalError={onFatal}` to `NativePlayer`, replacing `onFatalError={setError}`.

6. Replace `const chips = controlChips(audios, qualities, subtitles, qualityNow);` with:

```tsx
  // Sibling streams stand in for audio tracks when the stream itself has at most one (spec §6.2 Language row).
  const siblingAudio = !!audioChoices && audios.length <= 1;
  const audioRows = siblingAudio && audioChoices ? audioChoices.options : audios;
  const chips = controlChips(audioRows, qualities, subtitles, qualityNow);
```

7. In `PlayerSettingsSheet`:
   - `audios={audioRows}`
   - `onSetAudio={(label) => (siblingAudio && audioChoices ? audioChoices.onPick(label) : playerRef.current?.setAudio(label))}`
   - `showAudio={audioRows.length > 1}`

8. In `PlayerControls`, add `subtitle={subtitle}` and `onNextEpisode={onNextEpisode}`.
9. Directly after the `PlayerControls` element (inside `GlassLayer`), render `<PlayerToast notice={notice ?? null} onDone={onNoticeDone ?? noop} />`, with `const noop = () => {};` declared at module level.

- [ ] **Step 4: Run them to verify they pass**

Run: `npx jest src/features/player/NativePlayerView && npx tsc --noEmit`
Expected: PASS (all old and new tests); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/player/NativePlayerView.tsx src/features/player/NativePlayerView.test.tsx
git commit -m "feat(player): NativePlayerView takes a start position, sibling audio, a notice and episode controls

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `TitlePlayer` — one title's native session

**Files:**
- Create: `src/features/player/TitlePlayer.tsx`, `src/features/player/TitlePlayer.test.tsx`

**Interfaces:**
- Consumes:
  - Tasks 1–4.
  - `resolveTitle` (`@/services/playback`); `pluginHost.clearCache` (`@/services/plugins`).
  - `useDetailsQuery` (`tmdbApi`), `useReportOutcomeMutation` (`workerApi`).
  - `languageOrder`, `resolveOrder`, `getTitleLanguage`, `setTitleLanguage`, `titleKeyOf` (`utils/languagePrefs`); `setPreferredAudio` (`utils/prefs`).
  - `successReport` (`components/player/reportFields`); `nextEpisode` (`components/player/nextEpisode`).
  - `PlayerLoadingCard`, `PlayerErrorCard`.
- Produces:

```ts
export const RESOLVE_CAP_MS = 8000;
export interface TitlePlayerProps {
  tmdbId: string; type: "movie" | "tv"; season?: number; episode?: number;
  title?: string; posterUrl?: string;
  /** When Play was pressed (epoch ms) — the TTFF baseline. */
  startedAt: number;
  /** No native stream plays here, or the user chose the web player. */
  onUseWeb: () => void;
  onClose: () => void;
  /** Go to another episode (the route re-keys and resolves again). */
  onEpisode?: (season: number, ep: number) => void;
}
export function TitlePlayer(props: TitlePlayerProps): JSX.Element;
```

- [ ] **Step 1: Write the failing test** — `src/features/player/TitlePlayer.test.tsx`

```tsx
import type { PlaybackCandidate } from "@/services/playback/candidate";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { RESOLVE_CAP_MS, TitlePlayer } from "./TitlePlayer";

const mockResolve = jest.fn();
jest.mock("@/services/playback", () => ({ resolveTitle: (...a: unknown[]) => mockResolve(...a) }));
const mockClearCache = jest.fn();
jest.mock("@/services/plugins", () => ({ pluginHost: { clearCache: () => mockClearCache() } }));
let mockDetails: Record<string, unknown> | undefined;
jest.mock("@/src/store/services/tmdbApi", () => ({ useDetailsQuery: () => ({ data: mockDetails }) }));
const mockReport = jest.fn();
jest.mock("@/src/store/services/workerApi", () => ({ useReportOutcomeMutation: () => [mockReport] }));
const mockSetTitleLanguage = jest.fn();
jest.mock("@/utils/languagePrefs", () => ({
  languageOrder: () => ["hi", "original"],
  resolveOrder: (order: string[], original?: string) => order.map((l) => (l === "original" ? original : l)).filter(Boolean),
  getTitleLanguage: () => null,
  setTitleLanguage: (...a: unknown[]) => mockSetTitleLanguage(...a),
  titleKeyOf: (t: string, id: string) => `${t}:${id}`,
}));
const mockSetPreferredAudio = jest.fn();
jest.mock("@/utils/prefs", () => ({ setPreferredAudio: (...a: unknown[]) => mockSetPreferredAudio(...a) }));
let mockViewProps: any = null;
jest.mock("@/src/features/player/NativePlayerView", () => ({
  NativePlayerView: (props: any) => {
    mockViewProps = props;
    return null;
  },
}));
let mockSheetProps: any = null;
jest.mock("@/components/player/CandidateSheet", () => ({
  CandidateSheet: (p: any) => {
    mockSheetProps = p;
    return null;
  },
}));
jest.mock("@/components/player/PlayerLoadingCard", () => {
  const { Text } = jest.requireActual("react-native");
  return { PlayerLoadingCard: ({ status }: { status: string }) => <Text>{status}</Text> };
});
jest.mock("@/components/player/PlayerErrorCard", () => {
  const { Pressable, Text, View } = jest.requireActual("react-native");
  return {
    PlayerErrorCard: ({ title, actions }: any) => (
      <View>
        <Text>{title}</Text>
        {actions.map((a: any) => (
          <Pressable key={a.label} accessibilityLabel={a.label} onPress={a.onPress} />
        ))}
      </View>
    ),
  };
});
jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual("react-native");
  return { SafeAreaView: ({ children }: any) => <View>{children}</View> };
});

const cand = (key: string, languages: string[], over: Partial<PlaybackCandidate> = {}): PlaybackCandidate => ({
  key,
  sourceId: "open-movies/open-movies",
  label: `Src ${key}`,
  url: `https://cdn.example.net/${key}.m3u8`,
  headers: { Referer: "https://r.example.net/" },
  container: "hls",
  languages,
  platforms: { ios: true, android: true },
  subtitles: [],
  verdict: "ok",
  order: 0,
  ...over,
});
const result = (...ranked: PlaybackCandidate[]) => ({ ranked, rejected: [], failures: [], complete: true });
const texts = (r: ReactTestRenderer) =>
  r.root.findAll((n) => typeof n.type === "string" && typeof n.props.children === "string").map((n) => n.props.children as string);
const flush = () => act(async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
});
const tick = (t: number, paused = false) => act(() => mockViewProps.onPlayerEvent({ event: "tick", currentTime: t, duration: 600, paused }));

async function mount(props: Partial<React.ComponentProps<typeof TitlePlayer>> = {}) {
  const onUseWeb = jest.fn();
  let r!: ReactTestRenderer;
  act(() => {
    r = create(<TitlePlayer tmdbId="10378" type="movie" title="Big Buck Bunny" startedAt={Date.now()} onUseWeb={onUseWeb} onClose={jest.fn()} {...props} />);
  });
  await flush();
  mounted.push(r);
  return { r, onUseWeb };
}
const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach((t) => t.unmount()));
});

beforeEach(() => {
  mockResolve.mockReset();
  mockReport.mockReset();
  mockClearCache.mockReset();
  mockSetTitleLanguage.mockReset();
  mockSetPreferredAudio.mockReset();
  mockViewProps = null;
  mockSheetProps = null;
  mockDetails = { runtime: 10, original_language: "en", title: "Big Buck Bunny" };
});

describe("TitlePlayer", () => {
  it("finds the best source, then plays it with its headers, subtitles and source line", async () => {
    const hi = cand("hi1", ["hi"], { subtitles: [{ id: "0", url: "https://s.example.net/en.srt", label: "English", language: "en" }], quality: { label: "1080p", height: 1080 } });
    let release!: (v: unknown) => void;
    mockResolve.mockReturnValue(new Promise((r) => (release = r)));
    const { r } = await mount();
    expect(texts(r)).toContain("Finding the best source…");
    expect(mockResolve).toHaveBeenCalledWith(
      { tmdbId: "10378", type: "movie", season: undefined, episode: undefined, titleName: "Big Buck Bunny", runtimeMin: 10, originalLanguage: "en" },
      ["hi", "en"],
    );
    release(result(hi, cand("en1", ["en"])));
    await flush();
    expect(mockViewProps).toMatchObject({
      source: { uri: "https://cdn.example.net/hi1.m3u8", headers: { Referer: "https://r.example.net/" }, contentType: "hls" },
      sidecarSubtitles: [{ id: "0", url: "https://s.example.net/en.srt", label: "English", language: "en" }],
      sourceLabel: "Src hi1 · Hindi · 1080p",
      startAt: 0,
    });
  });

  it("hands over to the web player when no stream plays here", async () => {
    mockResolve.mockResolvedValue(result());
    const { onUseWeb } = await mount();
    expect(onUseWeb).toHaveBeenCalledTimes(1);
    expect(mockViewProps).toBeNull();
  });

  it(`hands over after ${RESOLVE_CAP_MS / 1000} s, and ignores a late answer`, async () => {
    jest.useFakeTimers();
    try {
      let release!: (v: unknown) => void;
      mockResolve.mockReturnValue(new Promise((r) => (release = r)));
      const { onUseWeb } = await mount();
      act(() => jest.advanceTimersByTime(RESOLVE_CAP_MS));
      expect(onUseWeb).toHaveBeenCalledTimes(1);
      release(result(cand("hi1", ["hi"])));
      await flush();
      expect(mockViewProps).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("says when the wanted language isn't available (spec §6.3)", async () => {
    mockResolve.mockResolvedValue(result(cand("en1", ["en"])));
    await mount();
    expect(mockViewProps.notice.message).toBe("Hindi isn't available for this title — playing original audio");
  });

  it("offers sibling languages; a pick switches at the same position and is remembered for the title", async () => {
    const hi = cand("hi1", ["hi"]);
    const en = cand("en1", ["en"]);
    mockResolve.mockResolvedValue(result(hi, en));
    await mount();
    tick(754);
    expect(mockViewProps.audioChoices.options).toEqual([
      { label: "Hindi", active: true },
      { label: "English", active: false },
    ]);
    act(() => mockViewProps.audioChoices.onPick("English"));
    expect(mockViewProps.source.uri).toBe(en.url);
    expect(mockViewProps.startAt).toBe(754);
    expect(mockSetTitleLanguage).toHaveBeenCalledWith("movie:10378", "en");
    expect(mockSetPreferredAudio).toHaveBeenCalledWith("English");
    expect(mockReport).toHaveBeenCalledWith(expect.objectContaining({ outcome: "manual_switch", lane: "native", providerId: "open-movies/open-movies" }));
  });

  it("the source sheet switches sources, or hands over to the web player", async () => {
    const a = cand("a", ["hi"]);
    const b = cand("b", ["hi"]);
    mockResolve.mockResolvedValue(result(a, b));
    const { onUseWeb } = await mount();
    act(() => mockViewProps.onOpenSource());
    expect(mockSheetProps).toMatchObject({ visible: true, currentKey: "a", candidates: [a, b] });
    act(() => mockSheetProps.onPick(b));
    expect(mockViewProps.source.uri).toBe(b.url);
    act(() => mockViewProps.onOpenSource());
    act(() => mockSheetProps.onUseWeb());
    expect(onUseWeb).toHaveBeenCalledTimes(1);
  });

  it("F6: re-resolves the same stream once and resumes where it was", async () => {
    mockResolve.mockResolvedValueOnce(result(cand("hi1", ["hi"]), cand("hi2", ["hi"])));
    const { r } = await mount();
    tick(300);
    mockResolve.mockResolvedValueOnce(result(cand("hi1", ["hi"], { url: "https://cdn.example.net/hi1-fresh.m3u8" }), cand("hi2", ["hi"])));
    let handled = false;
    act(() => {
      handled = mockViewProps.onStreamError("HTTP 403");
    });
    expect(handled).toBe(true);
    expect(texts(r)).toContain("Reconnecting…");
    expect(mockClearCache).toHaveBeenCalled();
    await flush();
    expect(mockViewProps.source.uri).toBe("https://cdn.example.net/hi1-fresh.m3u8");
    expect(mockViewProps.startAt).toBe(300);
  });

  it("F6: then the next stream in the same language, then another language with a notice, then the error card", async () => {
    mockResolve.mockResolvedValue(result(cand("hi1", ["hi"]), cand("hi2", ["hi"]), cand("en1", ["en"])));
    const { r } = await mount();
    const fail = async () => {
      act(() => {
        mockViewProps.onStreamError("boom");
      });
      await flush();
    };
    await fail(); // hi1: re-resolve, same key comes back
    expect(mockViewProps.source.uri).toContain("hi1");
    await fail(); // hi1 again: next in Hindi
    expect(mockViewProps.source.uri).toContain("hi2");
    expect(mockViewProps.notice).toBeNull();
    await fail(); // hi2: re-resolve once
    await fail(); // hi2 again: only English left
    expect(mockViewProps.source.uri).toContain("en1");
    expect(mockViewProps.notice.message).toBe("Switched to Src en1 — Hindi isn't on this one.");
    act(() => mockViewProps.notice.action.onPress());
    expect(mockSheetProps.visible).toBe(true);
    await fail(); // en1: re-resolve
    await fail(); // en1 again: nothing left
    expect(texts(r)).toContain("Couldn’t play this title here");
    mockResolve.mockResolvedValue(result(cand("hi3", ["hi"])));
    act(() => r.root.find((n) => n.props.accessibilityLabel === "Retry" && n.props.onPress).props.onPress());
    await flush();
    expect(mockViewProps.source.uri).toContain("hi3");
  });

  it("reports success once after 30 s of real playback, on the native lane with the source id", async () => {
    mockResolve.mockResolvedValue(result(cand("hi1", ["hi"])));
    await mount();
    tick(1);
    tick(2);
    tick(31);
    tick(32);
    const successes = mockReport.mock.calls.filter(([a]) => a.outcome === "success");
    expect(successes).toHaveLength(1);
    expect(successes[0][0]).toMatchObject({ providerId: "open-movies/open-movies", lane: "native", stage: "playing" });
    expect(typeof successes[0][0].ttffMs).toBe("number");
    expect(JSON.stringify(successes[0][0])).not.toContain("cdn.example.net");
  });

  it("shows the episode and moves to the next one", async () => {
    mockDetails = { original_language: "en", name: "Show", episode_run_time: [45], seasons: [{ season_number: 1, episode_count: 8 }] };
    mockResolve.mockResolvedValue(result(cand("e", ["en"])));
    const onEpisode = jest.fn();
    await mount({ type: "tv", season: 1, episode: 3, onEpisode });
    expect(mockViewProps.subtitle).toBe("S1 · E3");
    act(() => mockViewProps.onNextEpisode());
    expect(onEpisode).toHaveBeenCalledWith(1, 4);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/features/player/TitlePlayer`
Expected: FAIL — `Cannot find module './TitlePlayer'`.

- [ ] **Step 3: Implement** — `src/features/player/TitlePlayer.tsx`

```tsx
/**
 * One title's native session (spec §6.2, §6.3, §7 F4/F6):
 * - resolve the title's streams and play the best one in Bearoom's own player;
 * - switch language or source keeping the position;
 * - fail over without silence, and hand over to the web player when no native stream plays here (8 s cap).
 */
import { CandidateSheet } from "@/components/player/CandidateSheet";
import { nextEpisode } from "@/components/player/nextEpisode";
import { PlayerErrorCard } from "@/components/player/PlayerErrorCard";
import { PlayerLoadingCard } from "@/components/player/PlayerLoadingCard";
import type { PlayerNotice } from "@/components/player/PlayerToast";
import { successReport } from "@/components/player/reportFields";
import type { PlayerEvent } from "@/components/player/types";
import { resolveTitle } from "@/services/playback";
import type { PlaybackCandidate } from "@/services/playback/candidate";
import { pluginHost } from "@/services/plugins";
import { NativePlayerView } from "@/src/features/player/NativePlayerView";
import { useDetailsQuery } from "@/src/store/services/tmdbApi";
import { useReportOutcomeMutation } from "@/src/store/services/workerApi";
import type { ReportOutcome } from "@/src/types/worker.types";
import { colors, font, ms } from "@/theme/bearoom";
import { getTitleLanguage, languageOrder, resolveOrder, setTitleLanguage, titleKeyOf } from "@/utils/languagePrefs";
import { setPreferredAudio } from "@/utils/prefs";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  bestIn,
  languageOptions,
  nativeReport,
  nextAfterFailure,
  preferenceNotice,
  primaryLanguage,
  sidecarsOf,
  sourceLine,
  switchNotice,
  toNativeSource,
} from "./nativeSession";

export const RESOLVE_CAP_MS = 8000;
const DETAILS_WAIT_MS = 2000;

export interface TitlePlayerProps {
  tmdbId: string;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
  title?: string;
  posterUrl?: string;
  /** When Play was pressed (epoch ms) — the TTFF baseline. */
  startedAt: number;
  /** No native stream plays here, or the user chose the web player. */
  onUseWeb: () => void;
  onClose: () => void;
  /** Go to another episode (the route re-keys and resolves again). */
  onEpisode?: (season: number, ep: number) => void;
}

interface Session {
  ranked: PlaybackCandidate[];
  current: PlaybackCandidate;
  startAt: number;
  wanted: string[];
  /** Bumps on every (re)start so the player remounts even for the same stream. */
  attempt: number;
}

type Phase = "resolving" | "playing" | "failed";

export function TitlePlayer({ tmdbId, type, season, episode, title, posterUrl, startedAt, onUseWeb, onClose, onEpisode }: TitlePlayerProps) {
  const { data: details } = useDetailsQuery({ type, id: tmdbId });
  const [reportOutcome] = useReportOutcomeMutation();
  const [detailsWaitOver, setDetailsWaitOver] = useState(false);
  const [phase, setPhase] = useState<Phase>("resolving");
  const [status, setStatus] = useState("Finding the best source…");
  const [session, setSession] = useState<Session | null>(null);
  const [notice, setNotice] = useState<PlayerNotice | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const sessionRef = useRef<Session | null>(null);
  const alive = useRef(true);
  const started = useRef(false);
  const capTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failed = useRef(new Set<string>());
  const reResolved = useRef(new Set<string>());
  const outcomeSent = useRef(false);
  const firstProgressAt = useRef<number | null>(null);
  const lastTime = useRef<number | null>(null);
  const mountedAt = useRef(startedAt);
  const pos = useRef(0);
  const attempts = useRef(0);
  const noticeSeq = useRef(0);
  const req = useRef({ tmdbId, type });
  const titleKey = titleKeyOf(type, tmdbId);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => {
    const wait = setTimeout(() => setDetailsWaitOver(true), DETAILS_WAIT_MS);
    return () => {
      alive.current = false;
      clearTimeout(wait);
      if (capTimer.current) clearTimeout(capTimer.current);
    };
  }, []);

  const say = useCallback((message: string, action?: PlayerNotice["action"]) => {
    setNotice({ id: ++noticeSeq.current, message, action });
  }, []);

  const report = useCallback(
    (c: PlaybackCandidate, outcome: ReportOutcome, extra?: { ttffMs?: number; timeToFailMs?: number }) => {
      void reportOutcome(nativeReport(c, req.current, outcome, extra));
    },
    [reportOutcome],
  );

  const resolve = useCallback(async () => {
    const wanted = resolveOrder(languageOrder(), details?.original_language, getTitleLanguage(titleKey));
    const runtime: number | undefined = type === "movie" ? details?.runtime : details?.episode_run_time?.[0];
    const r = await resolveTitle(
      {
        tmdbId,
        type,
        season,
        episode,
        titleName: details?.title ?? details?.name ?? title,
        runtimeMin: runtime || undefined,
        originalLanguage: details?.original_language,
      },
      wanted,
    );
    return { ranked: r.ranked, wanted };
  }, [details, titleKey, type, tmdbId, season, episode, title]);

  const play = useCallback((ranked: PlaybackCandidate[], current: PlaybackCandidate, startAt: number, wanted: string[]) => {
    outcomeSent.current = false;
    firstProgressAt.current = null;
    lastTime.current = null;
    mountedAt.current = attempts.current === 0 ? startedAt : Date.now();
    attempts.current += 1;
    const next: Session = { ranked, current, startAt, wanted, attempt: attempts.current };
    sessionRef.current = next;
    setSession(next);
    setPhase("playing");
  }, [startedAt]);

  const switchTo = useCallback(
    (c: PlaybackCandidate, manual: boolean) => {
      const s = sessionRef.current;
      if (!s) return;
      if (manual && !outcomeSent.current) {
        outcomeSent.current = true;
        report(s.current, "manual_switch");
      }
      play(s.ranked, c, pos.current, s.wanted);
    },
    [play, report],
  );

  // First resolve: as soon as the title's details are in (runtime, original language), or after 2 s without them.
  useEffect(() => {
    if (started.current || (!details && !detailsWaitOver)) return;
    started.current = true;
    capTimer.current = setTimeout(() => {
      capTimer.current = null;
      if (alive.current && !sessionRef.current) onUseWeb();
    }, RESOLVE_CAP_MS);
    resolve().then(
      ({ ranked, wanted }) => {
        if (!alive.current || !capTimer.current) return; // unmounted, or already handed over at the cap
        clearTimeout(capTimer.current);
        capTimer.current = null;
        if (!ranked.length) return onUseWeb();
        play(ranked, ranked[0], 0, wanted);
        const msg = preferenceNotice(wanted, details?.original_language, ranked[0]);
        if (msg) say(msg);
      },
      () => {
        if (!alive.current || !capTimer.current) return;
        clearTimeout(capTimer.current);
        capTimer.current = null;
        onUseWeb();
      },
    );
  }, [details, detailsWaitOver, resolve, play, say, onUseWeb]);

  const failover = useCallback(
    (s: Session, at: number) => {
      const next = nextAfterFailure(s.ranked, failed.current, primaryLanguage(s.current));
      if (!next) {
        setPhase("failed");
        return;
      }
      play(s.ranked, next.candidate, at, s.wanted);
      if (next.languageLost) say(switchNotice(next.candidate, primaryLanguage(s.current)), { label: "Change", onPress: () => setSheetOpen(true) });
    },
    [play, say],
  );

  // F6: re-resolve the same stream once (fresh tokens), then the next in the same language, then any other.
  const onStreamError = useCallback(
    (_message: string): boolean => {
      const s = sessionRef.current;
      if (!s) return false;
      const cur = s.current;
      const at = pos.current;
      if (!outcomeSent.current) {
        outcomeSent.current = true;
        report(cur, firstProgressAt.current ? "playback_stall" : "http_error", { timeToFailMs: Date.now() - mountedAt.current });
      }
      if (!reResolved.current.has(cur.key)) {
        reResolved.current.add(cur.key);
        setStatus("Reconnecting…");
        setPhase("resolving");
        pluginHost.clearCache();
        resolve().then(
          ({ ranked }) => {
            if (!alive.current) return;
            const fresh = ranked.find((c) => c.key === cur.key);
            if (fresh) play(ranked.length ? ranked : s.ranked, fresh, at, s.wanted);
            else {
              failed.current.add(cur.key);
              failover({ ...s, ranked: ranked.length ? ranked : s.ranked }, at);
            }
          },
          () => {
            if (!alive.current) return;
            failed.current.add(cur.key);
            failover(s, at);
          },
        );
        return true;
      }
      failed.current.add(cur.key);
      failover(s, at);
      return true;
    },
    [failover, play, report, resolve],
  );

  const retryAll = useCallback(() => {
    failed.current.clear();
    reResolved.current.clear();
    setStatus("Finding the best source…");
    setPhase("resolving");
    pluginHost.clearCache();
    resolve().then(
      ({ ranked, wanted }) => {
        if (!alive.current) return;
        if (!ranked.length) return onUseWeb();
        play(ranked, ranked[0], pos.current, wanted);
      },
      () => alive.current && onUseWeb(),
    );
  }, [onUseWeb, play, resolve]);

  const onPlayerEvent = useCallback(
    (e: PlayerEvent) => {
      if (!Number.isFinite(e.currentTime)) return;
      const last = lastTime.current;
      lastTime.current = e.currentTime;
      pos.current = e.currentTime;
      // Real progress: time moving forward in small steps while playing (a resume seek is a jump, not progress).
      if (firstProgressAt.current == null && !e.paused && last != null && e.currentTime > last && e.currentTime - last < 2) {
        firstProgressAt.current = Date.now();
      }
      const s = sessionRef.current;
      if (s && !outcomeSent.current) {
        const ok = successReport(e.currentTime, firstProgressAt.current, mountedAt.current);
        if (ok) {
          outcomeSent.current = true;
          report(s.current, "success", { ttffMs: ok.ttffMs });
        }
      }
    },
    [report],
  );

  const next = type === "tv" && season != null && episode != null ? nextEpisode(details?.seasons, season, episode) : null;
  const subtitle = type === "tv" && season != null && episode != null ? `S${season} · E${episode}` : undefined;

  if (phase === "failed") {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.player}>
          <PlayerErrorCard
            title="Couldn’t play this title here"
            message="None of the sources worked on this device."
            actions={[
              { label: "Retry", icon: "refresh", kind: "primary", onPress: retryAll },
              { label: "Try another source", kind: "ghost", onPress: onUseWeb },
            ]}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (phase === "resolving" || !session) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.player}>
          <PlayerLoadingCard posterUrl={posterUrl} status={status} />
        </View>
        {title ? <Text style={styles.title}>{title}</Text> : null}
      </SafeAreaView>
    );
  }

  const cur = session.current;
  const options = languageOptions(session.ranked, cur);
  const audioChoices =
    options.length > 1
      ? {
          options: options.map((o) => ({ label: o.label, active: o.active })),
          onPick: (label: string) => {
            const o = options.find((x) => x.label === label);
            const s = sessionRef.current;
            if (!o || o.active || !s) return;
            const pick = bestIn(s.ranked, o.code, failed.current);
            if (!pick) return;
            if (o.code) {
              setTitleLanguage(titleKey, o.code);
              setPreferredAudio(o.label);
            }
            switchTo(pick, true);
          },
        }
      : undefined;

  return (
    <>
      <NativePlayerView
        key={`${cur.key}#${session.attempt}`}
        title={title ?? ""}
        subtitle={subtitle}
        source={toNativeSource(cur)}
        sidecarSubtitles={sidecarsOf(cur)}
        posterUrl={posterUrl}
        sourceLabel={sourceLine(cur)}
        startedAt={session.attempt === 1 ? startedAt : undefined}
        startAt={session.startAt}
        onPlayerEvent={onPlayerEvent}
        onStreamError={onStreamError}
        audioChoices={audioChoices}
        notice={notice}
        onNoticeDone={() => setNotice(null)}
        onClose={onClose}
        onOpenSource={() => setSheetOpen(true)}
        onNextEpisode={next && onEpisode ? () => onEpisode(next.season, next.ep) : undefined}
      />
      <CandidateSheet
        visible={sheetOpen}
        candidates={session.ranked}
        currentKey={cur.key}
        onPick={(c) => {
          setSheetOpen(false);
          if (c.key !== cur.key) switchTo(c, true);
        }}
        onUseWeb={() => {
          setSheetOpen(false);
          onUseWeb();
        }}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  player: { width: "100%", aspectRatio: 16 / 9, backgroundColor: colors.playerBg },
  title: { color: colors.text, fontFamily: font.headline, fontSize: ms(18), padding: ms(16) },
});
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx jest src/features/player/TitlePlayer && npx tsc --noEmit`
Expected: PASS (10 tests); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/player/TitlePlayer.tsx src/features/player/TitlePlayer.test.tsx
git commit -m "feat(player): TitlePlayer — resolve, play natively, switch language/source in place, F6 failover, F4 card

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `PlayerLaneScreen` — Play picks the lane

**Files:**
- Create: `src/screens/PlayerLaneScreen.tsx`, `src/screens/PlayerLaneScreen.test.tsx`
- Modify: `src/navigation/PlayerNavigator.tsx` (the `Player` route uses `PlayerLaneScreen`)

**Interfaces:**
- Consumes: `TitlePlayer` (Task 5); `PlayerScreen` (today's web flow, unchanged); `useFeatureFlags`; `nativeFetchAvailable`; `exitMediaBack`; `img` (`utils/tmdbDetails`).
- Produces: `PlayerLaneScreen` (the `Player` route component). It re-keys on `id`, `season` and `ep`, so a new title or episode starts native-first again.

- [ ] **Step 1: Write the failing test** — `src/screens/PlayerLaneScreen.test.tsx`

```tsx
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { PlayerLaneScreen } from "./PlayerLaneScreen";

let mockParams: Record<string, unknown> = { id: "10378", type: "movie", title: "Big Buck Bunny", poster_path: "/p.jpg" };
const mockSetParams = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: mockParams }),
  useNavigation: () => ({ setParams: mockSetParams }),
}));
let mockFlags = { embedApiLane: false, nativeLane: true, pluginHost: true };
jest.mock("@/src/store/features/providers/hooks", () => ({ useFeatureFlags: () => mockFlags }));
let mockAvailable = true;
jest.mock("@/modules/bearoom-fetch", () => ({
  get nativeFetchAvailable() {
    return mockAvailable;
  },
}));
jest.mock("@/src/navigation/actions", () => ({ exitMediaBack: jest.fn() }));
let mockTitleProps: any = null;
jest.mock("@/src/features/player/TitlePlayer", () => {
  const { Text } = jest.requireActual("react-native");
  return {
    TitlePlayer: (p: any) => {
      mockTitleProps = p;
      return <Text>native</Text>;
    },
  };
});
jest.mock("./PlayerScreen", () => {
  const { Text } = jest.requireActual("react-native");
  return { PlayerScreen: () => <Text>web</Text> };
});

const texts = (r: ReactTestRenderer) =>
  r.root.findAll((n) => typeof n.type === "string" && typeof n.props.children === "string").map((n) => n.props.children as string);
function render() {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(<PlayerLaneScreen />);
  });
  return r;
}

beforeEach(() => {
  mockParams = { id: "10378", type: "movie", title: "Big Buck Bunny", poster_path: "/p.jpg" };
  mockFlags = { embedApiLane: false, nativeLane: true, pluginHost: true };
  mockAvailable = true;
  mockTitleProps = null;
});

describe("PlayerLaneScreen", () => {
  it("tries the native lane first when the plugin host and native lane are on", () => {
    const r = render();
    expect(texts(r)).toEqual(["native"]);
    expect(mockTitleProps).toMatchObject({ tmdbId: "10378", type: "movie", title: "Big Buck Bunny", posterUrl: expect.stringContaining("/p.jpg") });
  });

  it.each([
    ["the plugin host is off", () => (mockFlags = { ...mockFlags, pluginHost: false })],
    ["the native lane is off (F14)", () => (mockFlags = { ...mockFlags, nativeLane: false })],
    ["the binary has no BearoomFetch", () => (mockAvailable = false)],
    ["there is no title id", () => (mockParams = {})],
  ])("uses today's web flow when %s", (_, set) => {
    set();
    expect(texts(render())).toEqual(["web"]);
  });

  it("switches to the web flow when the native lane hands over", () => {
    const r = render();
    act(() => mockTitleProps.onUseWeb());
    expect(texts(r)).toEqual(["web"]);
  });

  it("passes episodes through and moves to the next one via the route", () => {
    mockParams = { id: "1396", type: "tv", season: "1", ep: "3", title: "Breaking Bad" };
    render();
    expect(mockTitleProps).toMatchObject({ type: "tv", season: 1, episode: 3 });
    act(() => mockTitleProps.onEpisode(1, 4));
    expect(mockSetParams).toHaveBeenCalledWith({ season: "1", ep: "4" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/screens/PlayerLaneScreen`
Expected: FAIL — `Cannot find module './PlayerLaneScreen'`.

- [ ] **Step 3: Implement**

`src/screens/PlayerLaneScreen.tsx`:

```tsx
/**
 * The Player route (spec §9 row 2): a title with a playable native stream opens in Bearoom's own player; everything
 * else — and everything when the plugin host or native lane is switched off (F14) — keeps today's web flow.
 */
import { nativeFetchAvailable } from "@/modules/bearoom-fetch";
import { TitlePlayer } from "@/src/features/player/TitlePlayer";
import { exitMediaBack } from "@/src/navigation/actions";
import type { PlayerStackParamList } from "@/src/navigation/types";
import { useFeatureFlags } from "@/src/store/features/providers/hooks";
import { img } from "@/utils/tmdbDetails";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import React, { useState } from "react";
import { Platform } from "react-native";
import { PlayerScreen } from "./PlayerScreen";

type Params = PlayerStackParamList["Player"];

function Lanes({ params, nativeFirst }: { params: Params; nativeFirst: boolean }) {
  const navigation = useNavigation();
  const [lane, setLane] = useState<"native" | "web">(nativeFirst ? "native" : "web");
  const [startedAt] = useState(() => Date.now());
  if (lane === "web") return <PlayerScreen />;
  const toNumber = (v: unknown) => (v == null || v === "" ? undefined : Number(v));
  return (
    <TitlePlayer
      tmdbId={String(params.id)}
      type={params.type}
      season={toNumber(params.season)}
      episode={toNumber(params.ep)}
      title={params.title}
      posterUrl={img(typeof params.poster_path === "string" ? params.poster_path : null, "w342") ?? undefined}
      startedAt={startedAt}
      onUseWeb={() => setLane("web")}
      onClose={exitMediaBack}
      onEpisode={(season, ep) => (navigation as { setParams(p: Partial<Params>): void }).setParams({ season: String(season), ep: String(ep) })}
    />
  );
}

export function PlayerLaneScreen() {
  const route = useRoute<RouteProp<PlayerStackParamList, "Player">>();
  const params = route.params ?? ({} as Params);
  const { pluginHost, nativeLane } = useFeatureFlags();
  const nativeFirst = pluginHost && nativeLane && Platform.OS !== "web" && nativeFetchAvailable && !!params.id;
  return <Lanes key={`${params.id}:${params.season ?? ""}:${params.ep ?? ""}`} params={params} nativeFirst={nativeFirst} />;
}

export default PlayerLaneScreen;
```

If the `Player` params type declares `season`/`ep` as numbers rather than strings, `toNumber` still works; keep `setParams` values in the params' own type (check `src/navigation/types.ts` and adjust the two `String(...)` casts to match).

`src/navigation/PlayerNavigator.tsx`: import `PlayerLaneScreen` and use it as the `Player` route's `component` in place of `PlayerScreen`. Keep the `PlayerScreen` import only if it is still used elsewhere in the file.

- [ ] **Step 4: Run it to verify it passes; full suite**

Run: `npx jest src/screens/PlayerLaneScreen && npx jest && npx tsc --noEmit && npm run lint`
Expected: PASS; the whole suite is green; tsc clean; no new lint warnings (baseline 113).

- [ ] **Step 5: Commit**

```bash
git add src/screens/PlayerLaneScreen.tsx src/screens/PlayerLaneScreen.test.tsx src/navigation/PlayerNavigator.tsx
git commit -m "feat(player): Play opens the native lane when a stream plays here, else today's web flow

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Gate — phone and iOS simulator

**Files:**
- Modify: `docs/project-board.md`, `docs/BACKLOG.md`; memory `phase2a-status` (rename the topic to the Phase 2 status).

- [ ] **Step 1: Build both**

Android: `cd android && EXPO_PUBLIC_TEST_STREAMS=1 JAVA_TOOL_OPTIONS=-Djava.net.preferIPv4Stack=true ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a`.
iOS: `EXPO_PUBLIC_TEST_STREAMS=1 xcodebuild -workspace ios/Bearoom.xcworkspace -scheme Bearoom -configuration Release -sdk iphonesimulator -destination 'id=A1518C83-9D37-419D-9865-9CDDC16F11E3' -derivedDataPath ios/build CODE_SIGNING_ALLOWED=NO build`.
Expected: both build.

- [ ] **Step 2: Phone (after checking `dumpsys power` shows it idle ≥ 3 min)**

Install. For each title: Search → title page → **Play**, and take a screenshot.

| Title | Expected |
|---|---|
| Big Buck Bunny | Our native player within ~3 s (loading card → first frame); the source line reads "Open Movies • HLS · English · 1080p"; the notice "Hindi isn't available for this title — playing original audio"; no provider page at any moment (S8) |
| Tears of Steel | Settings → Source lists 2 streams. Pick the MOV: playback resumes at the same second, and Subtitles lists the 6 sidecar languages |
| Sintel | Plays natively (DASH) on Android |
| Fight Club | Today's web flow (the provider page with our skin), unchanged |

After 40 s of Big Buck Bunny, check Supabase: `select provider_id, lane, outcome, ttff_ms from provider_reports where provider_id = 'open-movies/open-movies' order by created_at desc limit 3;`.
**Expected:** a `success` row on lane `native` with a `ttff_ms`.

- [ ] **Step 3: iOS simulator**

| Title | Expected |
|---|---|
| Big Buck Bunny | Native (HLS) |
| Sintel | The web flow (DASH can't play on iPhone, so no native candidate) |

- [ ] **Step 4: Docs, memory, commit**

Add a "Phase 2B-2 — native lane for real titles" section to the board: the gate table, the screenshots, and the rulings. Update BACKLOG with the deferred F4 "Report" action and anything found on the devices. Update memory (`phase2a-status` → Phase 2 status: 2B done; next 2C/2D).

```bash
git add docs/project-board.md docs/BACKLOG.md
git commit -m "docs: Phase 2B-2 gate — real titles open natively on the phone and the iOS simulator

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
