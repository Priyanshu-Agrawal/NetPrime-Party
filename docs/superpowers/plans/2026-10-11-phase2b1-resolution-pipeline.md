# Phase 2B-1 — Resolution Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the plugin host's raw streams into a ranked list of playable candidates for one title — languages read from labels and manifests, each shortlisted stream probed (reachable, right length, right platform), ranked by the user's language order and source health — and prove it on the phone in the Plugin Lab.

**Architecture:** Pure modules under `services/playback/`, each test-first:
- `languages` reads ISO codes from free text, never guessing a code from a fragment.
- `candidate` maps a `PluginStream` to the spec's `PlaybackCandidate`, with a stable key.
- `manifests` parses HLS, DASH and MP4.
- `probe` is the spec §5.5 StreamProbe. It fetches through the plugin host's SSRF-guarded fetch, with truncation allowed.
- `rank` is spec §5.6.
- `health` holds 5 failures ⇒ down, healing after 1 h → 4 h → 8 h.
- `resolver` runs the host, then candidates, then probes the top 4 (in series within one backend, in parallel across backends), then ranks.

The sandbox now mounts only while resolving, and is released 2 minutes after the last resolve. The worker accepts `/report` rows for plugin sources (`repoId/pluginId`, lane native). Play routing, language switching and failover are Plan 2B-2.

**Tech Stack:** TypeScript (jest-expo), Cloudflare Worker (vitest), the Phase 2A plugin host.

**Spec:** `docs/superpowers/specs/2026-10-10-playback-languages-party-design.md` — §5.3 (stream model), §5.5 (StreamProbe), §5.6 (ranking), §5.7 (health/telemetry), §7 F5. Predecessor: `docs/superpowers/plans/2026-10-11-phase2a-plugin-host.md` (board "Phase 2A").

## Global Constraints

- **Unknown stays unknown.** `languages: []` means unknown. A language is never guessed: no 2-letter fragments; 3-letter codes only from a fixed unambiguous set; full names only (spec §5.3, §5.5 step 4).
- **Probe budget (spec §5.5):** 6 s per candidate, only the top few (`PROBE_TOP = 4`), serial per backend (registrable domain).
- **Duration check (spec §5.5 step 3):** ±8 min for films, ±3 min for episodes; out of range ⇒ `rejected: duration`. When the TMDB runtime is unknown, the check is skipped.
- **Platforms (spec §5.5 step 5):**
  - DASH ⇒ `ios: false`.
  - Origin-after-302 ⇒ `ios: false`.
  - MKV/WebM/AVI ⇒ both false (spec §2, R6).
- **Ranking order (spec §5.6):**
  1. not rejected and playable on this platform;
  2. language (per-title memory, then the user's order, default `["hi","original"]`);
  3. health (down sinks);
  4. lane (native only here);
  5. probed quality;
  6. arrival order.
- **Health (spec §5.6 rule 3):**
  - 5 consecutive failures ⇒ down; it heals after 1 h → 4 h → 8 h, and one success resets it.
  - Counted host failures: `timeout`, `error`, `bad-shape`.
  - Never counted: `empty-fast`, `unsafe`, `not-ready`, `crashed` (ledger ruling from 2A).
- **Privacy:** stream URLs, cookies and headers are never logged and never sent to `/report`. Telemetry carries only `sourceId` (`repoId/pluginId`), outcome, stage and timings (spec §5.7, §8).
- **Sandbox memory:** it is mounted only while resolving (or while the Plugin Lab is open), and unmounted 2 min after the last resolve. Phase 2A measured ≈ 118 MB PSS while mounted.
- **Carried from 2A:** physical phone only (`adb -s P2228K000422`); no scrapers; commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; deploy the worker with `env -u CLOUDFLARE_API_TOKEN`; never print secrets.

## Review Focus

1. **Lying labels.** A stream named after a film whose title contains a language word ("English Vinglish", "Hindi Medium"), "Ben 10", "This Is Us", "Multi Audio". No language is invented. Task 1 pins this.
2. **Hostile or odd manifests.** A 200 response with an HTML login page; a media playlist with no `#EXT-X-ENDLIST` (live); relative and absolute variant URIs; a server that ignores `Range` and streams gigabytes. The probe must cap reads and never throw past its budget. Tasks 3–4 pin this.
3. **Slow servers.** A probe that hangs: the candidate becomes `unverified` (still playable, ranked lower) when the 6 s budget ends, never `rejected`. Task 4 pins this.
4. **Health that never heals.** Down and back up: the 1 h → 4 h → 8 h escalation, and reset after one success. Sandbox crashes must not mark sources down. Task 5 pins this.
5. **Forged telemetry ids.** `/report` with a made-up `repo/plugin` id, a down repo, a plugin outside `allowPlugins`, or a plugin id on the embed lane. None of them are inserted. Task 8 pins this.

---

### Task 1: Read languages from stream labels

**Files:**
- Create: `services/playback/languages.ts`, `services/playback/languages.test.ts`

**Interfaces:**
- Consumes: `normalizeLanguage`, `languageName` (`components/player/native/languages.ts`).
- Produces:
  - `textLanguages(text: string, originalLanguage?: string): string[]` — ISO-639-1 codes in order of appearance. "Original" maps to `originalLanguage` when it is known.
  - `languageOf(value: string | undefined): string | undefined` — one code from a code or a name ("hi", "hin", "Hindi"), otherwise `undefined`.
  - `streamLanguages(s: { language?: string; name: string; title: string }, ctx: { originalLanguage?: string; titleName?: string }): string[]` — the declared language first, then the label text, with the film's own title removed first.

- [ ] **Step 1: Write the failing test** — `services/playback/languages.test.ts`

```ts
import { languageOf, streamLanguages, textLanguages } from "./languages";

describe("textLanguages", () => {
  it.each([
    ["Vidrock • Hindi", ["hi"]],
    ["Castle - Tamil - 1080P", ["ta"]],
    ["[Hindi + English] Dual Audio", ["hi", "en"]],
    ["English, Hindi", ["en", "hi"]],
    ["HIN AAC 2.0", ["hi"]],
    ["Español Latino", ["es"]],
    ["Japanese (jpn) + English subs", ["ja", "en"]],
  ])("%s → %j", (text, want) => expect(textLanguages(text)).toEqual(want));

  it("reads native-script names", () => {
    expect(textLanguages("हिंदी 720p")).toEqual(["hi"]);
    expect(textLanguages("தமிழ்")).toEqual(["ta"]);
  });

  it.each(["this is fine", "Ben 10", "Multi Audio", "Dual Audio 1080p", "HD", "The Mallard"])("guesses nothing from %s", (text) => {
    expect(textLanguages(text)).toEqual([]);
  });

  it("maps 'Original' to the title's original language, and to nothing when that is unknown", () => {
    expect(textLanguages("Original-Audio", "en")).toEqual(["en"]);
    expect(textLanguages("Original-Audio")).toEqual([]);
  });
});

describe("languageOf", () => {
  it.each([
    ["hi", "hi"],
    ["hin", "hi"],
    ["Hindi", "hi"],
    ["en-US", "en"],
    ["HD", undefined],
    ["Multi", undefined],
    [undefined, undefined],
  ])("%s → %s", (v, want) => expect(languageOf(v)).toBe(want));
});

describe("streamLanguages", () => {
  it("puts the plugin's declared language first", () => {
    expect(streamLanguages({ language: "Hindi", name: "Vidrock", title: "English subs" }, {})).toEqual(["hi", "en"]);
  });

  it("ignores language words that are only the film's own title", () => {
    expect(streamLanguages({ name: "Open • English Vinglish 1080p", title: "" }, { titleName: "English Vinglish" })).toEqual([]);
    expect(streamLanguages({ name: "English Vinglish • Hindi", title: "" }, { titleName: "English Vinglish" })).toEqual(["hi"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest services/playback/languages`
Expected: FAIL — `Cannot find module './languages'`.

- [ ] **Step 3: Implement** — `services/playback/languages.ts`

```ts
/**
 * Which languages a stream offers, read from what its plugin says (spec §5.3, §5.5 step 4): the declared language,
 * then the stream's name and title. Full names (English or native script) and a fixed set of unambiguous 3-letter
 * codes only — a fragment is never guessed, and unknown stays unknown (an empty list).
 */
import { languageName, normalizeLanguage } from "@/components/player/native/languages";

// Latin names match as whole words; native-script names as substrings (\b does not work outside ASCII).
const NAMES: [RegExp, string][] = [
  [/\bhindi\b|हिन्दी|हिंदी/, "hi"],
  [/\benglish\b/, "en"],
  [/\btamil\b|தமிழ்/, "ta"],
  [/\btelugu\b|తెలుగు/, "te"],
  [/\bmalayalam\b|മലയാളം/, "ml"],
  [/\bkannada\b|ಕನ್ನಡ/, "kn"],
  [/\bbengali\b|\bbangla\b|বাংলা/, "bn"],
  [/\bmarathi\b|मराठी/, "mr"],
  [/\bgujarati\b|ગુજરાતી/, "gu"],
  [/\bpunjabi\b|ਪੰਜਾਬੀ/, "pa"],
  [/\burdu\b/, "ur"],
  [/\bjapanese\b/, "ja"],
  [/\bkorean\b/, "ko"],
  [/\bchinese\b|\bmandarin\b|\bcantonese\b/, "zh"],
  [/\bspanish\b|\bespa[nñ]ol\b|\bcastellano\b|\blatino\b/, "es"],
  [/\bfrench\b|\bfran[cç]ais\b/, "fr"],
  [/\bgerman\b|\bdeutsch\b/, "de"],
  [/\bitalian\b|\bitaliano\b/, "it"],
  [/\bportuguese\b|\bportugu[eê]s\b/, "pt"],
  [/\brussian\b/, "ru"],
  [/\barabic\b/, "ar"],
  [/\bturkish\b/, "tr"],
  [/\bthai\b/, "th"],
  [/\bindonesian\b/, "id"],
];

// ISO-639-2 codes that are not also everyday words (no "ben", "mal", "kan", "pan", "mar", "ind", "urd").
const CODES = new Set(["hin", "eng", "tam", "tel", "jpn", "kor", "spa", "fre", "fra", "ger", "deu", "ita", "rus", "ara", "chi", "zho", "por", "tur", "tha"]);

export function textLanguages(text: string, originalLanguage?: string): string[] {
  const lower = text.toLowerCase();
  const hits: [number, string][] = [];
  for (const [re, code] of NAMES) {
    const at = lower.search(re);
    if (at >= 0) hits.push([at, code]);
  }
  for (const m of lower.matchAll(/[a-z]+/g)) {
    if (CODES.has(m[0])) {
      const code = normalizeLanguage(m[0]);
      if (code) hits.push([m.index ?? 0, code]);
    }
  }
  const orig = lower.search(/\borig(inal)?\b/);
  const origCode = normalizeLanguage(originalLanguage);
  if (orig >= 0 && origCode) hits.push([orig, origCode]);
  hits.sort((a, b) => a[0] - b[0]);
  const out: string[] = [];
  for (const [, code] of hits) if (!out.includes(code)) out.push(code);
  return out;
}

/** A code we can name ("hi", "hin", "en-US") or a full name ("Hindi"); anything else is unknown. */
export function languageOf(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const code = normalizeLanguage(value);
  if (code && languageName(code) !== code.toUpperCase()) return code;
  return textLanguages(value)[0];
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function streamLanguages(
  s: { language?: string; name: string; title: string },
  ctx: { originalLanguage?: string; titleName?: string },
): string[] {
  let text = `${s.name} ${s.title}`;
  if (ctx.titleName?.trim()) text = text.replace(new RegExp(escapeRe(ctx.titleName.trim()), "gi"), " ");
  const out: string[] = [];
  const declared = languageOf(s.language);
  if (declared) out.push(declared);
  for (const code of textLanguages(text, ctx.originalLanguage)) if (!out.includes(code)) out.push(code);
  return out;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx jest services/playback/languages`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/playback/languages.ts services/playback/languages.test.ts
git commit -m "feat(playback): read stream languages from labels without guessing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The candidate model

**Files:**
- Create: `services/playback/candidate.ts`, `services/playback/candidate.test.ts`

**Interfaces:**
- Consumes: `PluginStream` (`services/plugins/streams.ts`); `streamLanguages`, `languageOf` (Task 1).
- Produces:

```ts
export type Container = "hls" | "dash" | "mp4" | "unsupported" | "unknown";
export type Verdict = "ok" | "unverified" | "rejected";
export type RejectReason = "unreachable" | "duration" | "html-body" | "platform";
export interface CandidateSubtitle { id: string; url: string; label: string; language?: string }
export interface PlaybackCandidate {
  key: string; sourceId: string; label: string; url: string; headers: Record<string, string>;
  container: Container; languages: string[]; quality?: { label: string; height?: number }; durationSec?: number;
  platforms: { ios: boolean; android: boolean }; subtitles: CandidateSubtitle[];
  verdict: Verdict; rejectReason?: RejectReason; order: number;
}
export function containerOf(url: string): Container;
export function platformsOf(container: Container): { ios: boolean; android: boolean };
export function heightOf(label?: string): number | undefined;
export function urlShape(url: string): string;
export function candidateKey(sourceId: string, label: string, url: string): string;
export function toCandidates(streams: PluginStream[], ctx: { originalLanguage?: string; titleName?: string }): PlaybackCandidate[];
```

- [ ] **Step 1: Write the failing test** — `services/playback/candidate.test.ts`

```ts
import type { PluginStream } from "@/services/plugins/streams";
import { candidateKey, containerOf, heightOf, platformsOf, toCandidates, urlShape } from "./candidate";

const stream = (over: Partial<PluginStream> = {}): PluginStream => ({
  pluginKey: "r/p@1",
  repoId: "r",
  pluginId: "p",
  name: "Vidrock • Hindi",
  title: "Jawan 1080p",
  url: "https://cdn3.example.net/hls/9f8e7d6c5b4a/1080/index.m3u8?token=abc",
  headers: { Referer: "https://r.example.net/" },
  subtitles: [],
  ...over,
});

describe("containerOf / platformsOf", () => {
  it.each([
    ["https://a.example.net/x/master.m3u8?t=1", "hls"],
    ["https://a.example.net/x/manifest.mpd", "dash"],
    ["https://a.example.net/film.MP4", "mp4"],
    ["https://a.example.net/film.mov", "mp4"],
    ["https://a.example.net/film.mkv", "unsupported"],
    ["https://a.example.net/play?id=9", "unknown"],
  ])("%s → %s", (url, want) => expect(containerOf(url)).toBe(want));

  it("keeps DASH off iPhone and unsupported files off both", () => {
    expect(platformsOf("dash")).toEqual({ ios: false, android: true });
    expect(platformsOf("unsupported")).toEqual({ ios: false, android: false });
    expect(platformsOf("hls")).toEqual({ ios: true, android: true });
  });
});

describe("heightOf", () => {
  it.each([
    ["1080P", 1080],
    ["FHD", 1080],
    ["720p", 720],
    ["HD", 720],
    ["4K HDR", 2160],
    ["480p", 480],
    ["SD", 480],
    ["Auto", undefined],
    [undefined, undefined],
  ])("%s → %s", (label, want) => expect(heightOf(label)).toBe(want));
});

describe("candidate keys", () => {
  it("survive a re-resolve: fresh tokens, CDN numbers and query strings don't change them", () => {
    const a = "https://cdn3.example.net/hls/9f8e7d6c5b4a3210/1080/index.m3u8?token=abc";
    const b = "https://cdn7.example.net/hls/0a1b2c3d4e5f6789/1080/index.m3u8?token=xyz";
    expect(urlShape(a)).toBe(urlShape(b));
    expect(candidateKey("r/p", "Vidrock • Hindi", a)).toBe(candidateKey("r/p", "vidrock  •  hindi", b));
  });

  it("differ by source and by label", () => {
    const u = "https://a.example.net/x.m3u8";
    expect(candidateKey("r/p", "Hindi", u)).not.toBe(candidateKey("r/q", "Hindi", u));
    expect(candidateKey("r/p", "Hindi", u)).not.toBe(candidateKey("r/p", "Tamil", u));
  });
});

describe("toCandidates", () => {
  it("maps a plugin stream to an unverified candidate", () => {
    const [c] = toCandidates([stream({ quality: "1080p", subtitles: [{ url: "https://s.example.net/en.vtt", language: "English", label: "English" }] })], { titleName: "Jawan" });
    expect(c).toMatchObject({
      sourceId: "r/p",
      label: "Vidrock • Hindi",
      container: "hls",
      languages: ["hi"],
      quality: { label: "1080p", height: 1080 },
      platforms: { ios: true, android: true },
      subtitles: [{ id: "0", url: "https://s.example.net/en.vtt", label: "English", language: "en" }],
      verdict: "unverified",
      order: 0,
      headers: { Referer: "https://r.example.net/" },
    });
    expect(c.key.startsWith("r/p:")).toBe(true);
  });

  it("drops duplicate URLs and keeps keys unique", () => {
    const out = toCandidates(
      [
        stream({ url: "https://a.example.net/1/x.m3u8" }),
        stream({ url: "https://a.example.net/1/x.m3u8", pluginKey: "r/q@1", pluginId: "q" }),
        stream({ url: "https://a.example.net/2/x.m3u8" }),
      ],
      {},
    );
    expect(out).toHaveLength(2);
    expect(new Set(out.map((c) => c.key)).size).toBe(2);
    expect(out.map((c) => c.order)).toEqual([0, 1]);
  });

  it("rejects files no player here can open", () => {
    expect(toCandidates([stream({ url: "https://a.example.net/film.mkv" })], {})[0]).toMatchObject({ verdict: "rejected", rejectReason: "platform" });
  });

  it("takes the height from the name when the plugin gives no quality", () => {
    expect(toCandidates([stream({ name: "Castle - Tamil - 720P" })], {})[0].quality).toEqual({ label: "720p", height: 720 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest services/playback/candidate`
Expected: FAIL — `Cannot find module './candidate'`.

- [ ] **Step 3: Implement** — `services/playback/candidate.ts`

```ts
/**
 * One playable stream for a title (spec §5.3), whatever plugin it came from. Fields Bearoom measures itself (container,
 * duration, platforms, verdict) start from the URL and the probe fills them in; labels are never trusted as fact.
 */
import type { PluginStream } from "@/services/plugins/streams";
import { languageOf, streamLanguages } from "./languages";

export type Container = "hls" | "dash" | "mp4" | "unsupported" | "unknown";
export type Verdict = "ok" | "unverified" | "rejected";
export type RejectReason = "unreachable" | "duration" | "html-body" | "platform";

export interface CandidateSubtitle {
  id: string;
  url: string;
  label: string;
  language?: string;
}

export interface PlaybackCandidate {
  /** Stable across re-resolves: source + label + URL shape (tokens and numbers masked). */
  key: string;
  /** `${repoId}/${pluginId}` — health, telemetry and failure memory key on this, never on a hostname. */
  sourceId: string;
  /** The plugin's own line, e.g. "Vidrock • Hindi". */
  label: string;
  url: string;
  headers: Record<string, string>;
  container: Container;
  /** ISO-639-1, most likely first; [] = unknown. */
  languages: string[];
  quality?: { label: string; height?: number };
  durationSec?: number;
  platforms: { ios: boolean; android: boolean };
  subtitles: CandidateSubtitle[];
  verdict: Verdict;
  rejectReason?: RejectReason;
  /** Arrival order: the latency tiebreak in ranking. */
  order: number;
}

export function containerOf(url: string): Container {
  let path: string;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    path = url.toLowerCase();
  }
  if (/\.m3u8?$/.test(path)) return "hls";
  if (path.endsWith(".mpd")) return "dash";
  if (/\.(mp4|m4v|mov)$/.test(path)) return "mp4";
  if (/\.(mkv|webm|avi)$/.test(path)) return "unsupported";
  return "unknown";
}

export function platformsOf(container: Container): { ios: boolean; android: boolean } {
  if (container === "dash") return { ios: false, android: true }; // AVPlayer has no DASH
  if (container === "unsupported") return { ios: false, android: false }; // spec §2: no MKV lane
  return { ios: true, android: true };
}

export function heightOf(label?: string): number | undefined {
  if (!label) return undefined;
  const s = label.toLowerCase();
  if (/\b(4k|uhd|2160p?)\b/.test(s)) return 2160;
  if (/\b(2k|1440p?)\b/.test(s)) return 1440;
  if (/\b(fhd|1080[pi]?)\b/.test(s)) return 1080;
  if (/\b720p?\b/.test(s)) return 720;
  const m = /\b(\d{3,4})p\b/.exec(s);
  if (m) return Number(m[1]);
  if (/\bhd\b/.test(s)) return 720;
  if (/\bsd\b/.test(s)) return 480;
  return undefined;
}

/** Host + path with numbers and hex runs masked: what stays the same when a plugin re-resolves a stream. */
export function urlShape(url: string): string {
  try {
    const u = new URL(url);
    return (u.hostname + u.pathname).toLowerCase().replace(/[0-9a-f]{8,}|\d+/g, "#");
  } catch {
    return url;
  }
}

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export function candidateKey(sourceId: string, label: string, url: string): string {
  return `${sourceId}:${fnv1a(`${label.toLowerCase().replace(/\s+/g, " ").trim()}|${urlShape(url)}`)}`;
}

export function toCandidates(streams: PluginStream[], ctx: { originalLanguage?: string; titleName?: string }): PlaybackCandidate[] {
  const seenUrls = new Set<string>();
  const seenKeys = new Map<string, number>();
  const out: PlaybackCandidate[] = [];
  for (const s of streams) {
    if (seenUrls.has(s.url)) continue;
    seenUrls.add(s.url);
    const sourceId = `${s.repoId}/${s.pluginId}`;
    const base = candidateKey(sourceId, s.name, s.url);
    const n = seenKeys.get(base) ?? 0;
    seenKeys.set(base, n + 1);
    const container = containerOf(s.url);
    const height = heightOf(s.quality) ?? heightOf(s.name) ?? heightOf(s.title);
    const qualityLabel = s.quality ?? (height ? `${height}p` : undefined);
    const unsupported = container === "unsupported";
    out.push({
      key: n ? `${base}~${n}` : base,
      sourceId,
      label: s.name,
      url: s.url,
      headers: s.headers,
      container,
      languages: streamLanguages(s, ctx),
      quality: qualityLabel ? { label: qualityLabel, height } : undefined,
      platforms: platformsOf(container),
      subtitles: s.subtitles.map((t, i) => ({ id: String(i), url: t.url, label: t.label, language: languageOf(t.language) ?? languageOf(t.label) })),
      verdict: unsupported ? "rejected" : "unverified",
      rejectReason: unsupported ? "platform" : undefined,
      order: out.length,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx jest services/playback/candidate`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/playback/candidate.ts services/playback/candidate.test.ts
git commit -m "feat(playback): PlaybackCandidate model with stable keys, containers and platforms

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Manifest parsers (HLS, DASH, MP4)

**Files:**
- Create: `services/playback/manifests.ts`, `services/playback/manifests.test.ts`

**Interfaces:**
- Consumes: `normalizeLanguage` (`components/player/native/languages.ts`).
- Produces:
  - `isHls(text): boolean`, `looksLikeHtml(text): boolean`
  - `parseHlsMaster(text, baseUrl): { variants: { url: string; height?: number; bandwidth?: number }[]; audioLanguages: string[] } | null` — `null` when the text is not a master playlist.
  - `parseHlsMedia(text, baseUrl): { durationSec?: number; firstSegment?: string; ended: boolean }` — a duration only with `#EXT-X-ENDLIST`.
  - `parseDash(text): { durationSec?: number; audioLanguages: string[] } | null`
  - `isoDuration(s): number | undefined`
  - `mp4Duration(bytes: Uint8Array): number | undefined`, `isMatroska(bytes): boolean`, `isMp4(bytes): boolean`
  - `base64ToBytes(s): Uint8Array`, `asciiHead(bytes, n = 512): string`

- [ ] **Step 1: Write the failing test** — `services/playback/manifests.test.ts`

```ts
import {
  asciiHead,
  base64ToBytes,
  isHls,
  isMatroska,
  isMp4,
  isoDuration,
  looksLikeHtml,
  mp4Duration,
  parseDash,
  parseHlsMaster,
  parseHlsMedia,
} from "./manifests";

const MASTER = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Hindi",LANGUAGE="hin",URI="audio/hi.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="English",LANGUAGE="en",DEFAULT=YES,URI="audio/en.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="French",LANGUAGE="fr",URI="subs/fr.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,AUDIO="aud"
low/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,AUDIO="aud"
https://cdn.example.net/high/index.m3u8
`;

const MEDIA = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
seg0.jpg
#EXTINF:9.5,
seg1.jpg
#EXTINF:4.25,
seg2.jpg
#EXT-X-ENDLIST
`;

describe("HLS", () => {
  it("reads variants (relative URIs resolved) and audio rendition languages from a master", () => {
    expect(parseHlsMaster(MASTER, "https://a.example.net/x/master.m3u8")).toEqual({
      variants: [
        { url: "https://a.example.net/x/low/index.m3u8", height: 360, bandwidth: 800000 },
        { url: "https://cdn.example.net/high/index.m3u8", height: 1080, bandwidth: 5000000 },
      ],
      audioLanguages: ["hi", "en"],
    });
    expect(parseHlsMaster(MEDIA, "https://a.example.net/x/")).toBeNull();
  });

  it("sums a finished media playlist and finds its first segment", () => {
    expect(parseHlsMedia(MEDIA, "https://a.example.net/x/low/index.m3u8")).toEqual({
      durationSec: 23.75,
      firstSegment: "https://a.example.net/x/low/seg0.jpg",
      ended: true,
    });
  });

  it("gives no duration for a live playlist", () => {
    expect(parseHlsMedia(MEDIA.replace("#EXT-X-ENDLIST\n", ""), "https://a.example.net/").durationSec).toBeUndefined();
  });

  it("tells playlists from HTML", () => {
    expect(isHls("  #EXTM3U\n")).toBe(true);
    expect(isHls("<html>")).toBe(false);
    expect(looksLikeHtml("\n<!DOCTYPE html><html>")).toBe(true);
    expect(looksLikeHtml("<HTML><HEAD>")).toBe(true);
    expect(looksLikeHtml("#EXTM3U")).toBe(false);
  });
});

describe("DASH", () => {
  const MPD = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT1H2M3.5S" type="static">
  <Period>
    <AdaptationSet contentType="video" mimeType="video/mp4"></AdaptationSet>
    <AdaptationSet contentType="audio" lang="hi" mimeType="audio/mp4"></AdaptationSet>
    <AdaptationSet mimeType="audio/mp4" lang="eng"></AdaptationSet>
    <AdaptationSet contentType="text" lang="fr"></AdaptationSet>
  </Period>
</MPD>`;

  it("reads the duration and the audio languages", () => {
    expect(parseDash(MPD)).toEqual({ durationSec: 3723.5, audioLanguages: ["hi", "en"] });
    expect(parseDash("#EXTM3U")).toBeNull();
  });

  it.each([
    ["PT10M", 600],
    ["PT1H", 3600],
    ["PT0.5S", 0.5],
    ["P1DT1S", 86401],
    ["PT0S", undefined],
    ["garbage", undefined],
  ])("isoDuration(%s) = %s", (s, want) => expect(isoDuration(s)).toBe(want));
});

/** A box: 4-byte size, 4-byte type, payload. */
function box(type: string, payload: number[]): number[] {
  const size = 8 + payload.length;
  return [(size >>> 24) & 255, (size >>> 16) & 255, (size >>> 8) & 255, size & 255, ...[...type].map((ch) => ch.charCodeAt(0)), ...payload];
}
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

describe("MP4", () => {
  it("reads mvhd version 0 and version 1", () => {
    const v0 = box("mvhd", [0, 0, 0, 0, ...u32(0), ...u32(0), ...u32(1000), ...u32(596_000), ...new Array(80).fill(0)]);
    const v1 = box("mvhd", [1, 0, 0, 0, ...u32(0), ...u32(0), ...u32(0), ...u32(0), ...u32(600), ...u32(0), ...u32(600 * 734), ...new Array(80).fill(0)]);
    const ftyp = box("ftyp", [..."isom".split("").map((c) => c.charCodeAt(0)), 0, 0, 2, 0]);
    expect(mp4Duration(new Uint8Array([...ftyp, ...box("moov", v0)]))).toBe(596);
    expect(mp4Duration(new Uint8Array([...ftyp, ...box("moov", v1)]))).toBe(734);
    expect(isMp4(new Uint8Array(ftyp))).toBe(true);
    expect(mp4Duration(new Uint8Array(ftyp))).toBeUndefined();
  });

  it("spots Matroska and decodes base64", () => {
    expect(isMatroska(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0]))).toBe(true);
    expect(Array.from(base64ToBytes("AAEC"))).toEqual([0, 1, 2]);
    expect(asciiHead(new Uint8Array([60, 104, 116, 109, 108, 62]))).toBe("<html>");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest services/playback/manifests`
Expected: FAIL — `Cannot find module './manifests'`.

- [ ] **Step 3: Implement** — `services/playback/manifests.ts`

```ts
/**
 * Just enough of HLS, DASH and MP4 to probe a stream (spec §5.5): variants and audio languages, total duration, the
 * first segment, and the movie header's duration. Pure functions over text and bytes.
 */
import { normalizeLanguage } from "@/components/player/native/languages";

export function isHls(text: string): boolean {
  return /^\s*#EXTM3U/.test(text);
}

export function looksLikeHtml(text: string): boolean {
  return /^\s*(<!doctype html|<html|<head|<body)/i.test(text);
}

function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|,)${name}=("([^"]*)"|[^,]*)`).exec(attrs);
  return m ? (m[2] ?? m[1]) : undefined;
}

function resolveUrl(uri: string, base: string): string {
  try {
    return new URL(uri, base).toString();
  } catch {
    return uri;
  }
}

function pushLang(list: string[], raw: string | undefined): void {
  const code = normalizeLanguage(raw);
  if (code && !list.includes(code)) list.push(code);
}

export function parseHlsMaster(
  text: string,
  baseUrl: string,
): { variants: { url: string; height?: number; bandwidth?: number }[]; audioLanguages: string[] } | null {
  if (!/#EXT-X-STREAM-INF/.test(text)) return null;
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const variants: { url: string; height?: number; bandwidth?: number }[] = [];
  const audioLanguages: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith("#EXT-X-STREAM-INF:")) {
      const a = l.slice("#EXT-X-STREAM-INF:".length);
      let j = i + 1;
      while (j < lines.length && (!lines[j] || lines[j].startsWith("#"))) j++;
      if (j >= lines.length) continue;
      const res = attr(a, "RESOLUTION");
      const bw = attr(a, "BANDWIDTH");
      const height = res ? Number(res.split("x")[1]) || undefined : undefined;
      variants.push({ url: resolveUrl(lines[j], baseUrl), height, bandwidth: bw ? Number(bw) || undefined : undefined });
    } else if (l.startsWith("#EXT-X-MEDIA:")) {
      const a = l.slice("#EXT-X-MEDIA:".length);
      if (attr(a, "TYPE") === "AUDIO") pushLang(audioLanguages, attr(a, "LANGUAGE"));
    }
  }
  return { variants, audioLanguages };
}

export function parseHlsMedia(text: string, baseUrl: string): { durationSec?: number; firstSegment?: string; ended: boolean } {
  let total = 0;
  let sawInf = false;
  let firstSegment: string | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim();
    if (l.startsWith("#EXTINF:")) {
      total += parseFloat(l.slice("#EXTINF:".length)) || 0;
      sawInf = true;
    } else if (l && !l.startsWith("#") && !firstSegment) {
      firstSegment = resolveUrl(l, baseUrl);
    }
  }
  const ended = /#EXT-X-ENDLIST/.test(text);
  return { durationSec: ended && sawInf ? Math.round(total * 1000) / 1000 : undefined, firstSegment, ended };
}

export function isoDuration(s: string): number | undefined {
  const m = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(s.trim());
  if (!m) return undefined;
  const [d, h, mi, se] = m.slice(1).map((x) => (x ? Number(x) : 0));
  const total = d * 86400 + h * 3600 + mi * 60 + se;
  return total > 0 ? total : undefined;
}

export function parseDash(text: string): { durationSec?: number; audioLanguages: string[] } | null {
  if (!/<MPD[\s>]/.test(text)) return null;
  const dur = /mediaPresentationDuration="([^"]+)"/.exec(text);
  const audioLanguages: string[] = [];
  for (const m of text.matchAll(/<AdaptationSet\b[^>]*>/g)) {
    const tag = m[0];
    const audio = /contentType="audio"/.test(tag) || /mimeType="audio\//.test(tag);
    if (audio) pushLang(audioLanguages, /\blang="([^"]+)"/.exec(tag)?.[1]);
  }
  return { durationSec: dur ? isoDuration(dur[1]) : undefined, audioLanguages };
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function base64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buf = 0;
  let bits = 0;
  let j = 0;
  for (const ch of clean) {
    buf = (buf << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (buf >> bits) & 0xff;
    }
  }
  return out.subarray(0, j);
}

export function asciiHead(bytes: Uint8Array, n = 512): string {
  let s = "";
  for (let i = 0; i < Math.min(n, bytes.length); i++) s += String.fromCharCode(bytes[i]);
  return s;
}

export function isMp4(b: Uint8Array): boolean {
  return b.length >= 8 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70; // "ftyp"
}

export function isMatroska(b: Uint8Array): boolean {
  return b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
}

/** The movie header's duration, when `moov` sits within the bytes read (fast-start files). */
export function mp4Duration(b: Uint8Array): number | undefined {
  const u32 = (o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  for (let i = 4; i + 36 <= b.length; i++) {
    if (b[i] !== 0x6d || b[i + 1] !== 0x76 || b[i + 2] !== 0x68 || b[i + 3] !== 0x64) continue; // "mvhd"
    const v1 = b[i + 4] === 1;
    const scale = v1 ? u32(i + 24) : u32(i + 16);
    const dur = v1 ? u32(i + 28) * 2 ** 32 + u32(i + 32) : u32(i + 20);
    return scale > 0 && dur > 0 ? dur / scale : undefined;
  }
  return undefined;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx jest services/playback/manifests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/playback/manifests.ts services/playback/manifests.test.ts
git commit -m "feat(playback): HLS/DASH/MP4 parsers for the stream probe

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: StreamProbe

**Files:**
- Modify: `services/plugins/pluginFetch.ts`, `services/plugins/pluginFetch.test.ts` (host-only `maxBytes` / `truncate`)
- Create: `services/playback/probe.ts`, `services/playback/probe.test.ts`

**Interfaces:**
- Consumes: `PlaybackCandidate`, `RejectReason` (Task 2); the parsers (Task 3); `hasHeader` (`services/plugins/urlGuard.ts`).
- Produces:
  - `PluginFetchRequest` gains `maxBytes?: number; truncate?: boolean`. These are host-only: `toPluginFetchRequest` never copies them from a worker.
  - `PluginFetchResponse` gains `truncated: boolean`.
  - `interface ProbeResponse { status: number; url: string; redirected: boolean; body: string; encoding: "text" | "base64" }`
  - `type ProbeFetch = (url: string, headers: Record<string, string>, opts: { maxBytes: number; responseType: "text" | "base64" }) => Promise<ProbeResponse>`
  - `interface ProbeContext { kind: "movie" | "tv"; runtimeMin?: number }`
  - `probeCandidate(c: PlaybackCandidate, ctx: ProbeContext, fetch: ProbeFetch, budgetMs?: number): Promise<PlaybackCandidate>`
  - `PROBE_BUDGET_MS = 6000`

- [ ] **Step 1: Write the failing tests**

Append inside `describe("pluginFetch", …)` in `services/plugins/pluginFetch.test.ts`:

```ts
  it("lets the host (never a plugin) read just the start of a body", async () => {
    const { seen, jar, deps } = setup({ "https://a.example.net/big": res({ truncated: true, body: "head" }) });
    await expect(pluginFetch(jar, { url: "https://a.example.net/big", maxBytes: 4096, truncate: true }, deps)).resolves.toMatchObject({
      body: "head",
      truncated: true,
    });
    expect(seen[0].maxBytes).toBe(4096);
    expect(toPluginFetchRequest({ url: "https://a.example.net/", maxBytes: 1, truncate: true })).not.toHaveProperty("truncate");
  });
```

`services/playback/probe.test.ts`:

```ts
import type { PlaybackCandidate } from "./candidate";
import { PROBE_BUDGET_MS, probeCandidate, type ProbeFetch, type ProbeResponse } from "./probe";

const cand = (over: Partial<PlaybackCandidate> = {}): PlaybackCandidate => ({
  key: "r/p:k",
  sourceId: "r/p",
  label: "Hindi",
  url: "https://a.example.net/x/master.m3u8",
  headers: { Referer: "https://r.example.net/" },
  container: "hls",
  languages: [],
  platforms: { ios: true, android: true },
  subtitles: [],
  verdict: "unverified",
  order: 0,
  ...over,
});
const text = (body: string, over: Partial<ProbeResponse> = {}): ProbeResponse => ({ status: 200, url: "", redirected: false, body, encoding: "text", ...over });
const bin = (bytes: number[] | string, over: Partial<ProbeResponse> = {}): ProbeResponse => ({
  status: 206,
  url: "",
  redirected: false,
  body: Buffer.from(typeof bytes === "string" ? bytes : Uint8Array.from(bytes)).toString("base64"),
  encoding: "base64",
  ...over,
});

/** Routes by "url|responseType" first, then by url. */
function server(routes: Record<string, ProbeResponse | Error | (() => Promise<ProbeResponse>)>) {
  const calls: { url: string; headers: Record<string, string>; opts: { maxBytes: number; responseType: string } }[] = [];
  const fetch: ProbeFetch = async (url, headers, opts) => {
    calls.push({ url, headers, opts });
    const r = routes[`${url}|${opts.responseType}`] ?? routes[url];
    if (!r) throw new Error(`no route ${url}`);
    if (r instanceof Error) throw r;
    const v = typeof r === "function" ? await r() : r;
    return { ...v, url: v.url || url };
  };
  return { fetch, calls };
}

const MASTER = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="Hindi",LANGUAGE="hi",URI="a/hi.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=1280x720
v/720.m3u8
`;
const mediaOf = (secs: number[], ended = true) => `#EXTM3U\n${secs.map((s, i) => `#EXTINF:${s},\nseg${i}.jpg`).join("\n")}\n${ended ? "#EXT-X-ENDLIST\n" : ""}`;
const FILM = { kind: "movie" as const, runtimeMin: 10 };

function box(type: string, payload: number[]): number[] {
  const size = 8 + payload.length;
  return [(size >>> 24) & 255, (size >>> 16) & 255, (size >>> 8) & 255, size & 255, ...[...type].map((ch) => ch.charCodeAt(0)), ...payload];
}
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const MP4_600S = [...box("ftyp", [105, 115, 111, 109, 0, 0, 2, 0]), ...box("moov", box("mvhd", [0, 0, 0, 0, ...u32(0), ...u32(0), ...u32(1000), ...u32(600_000), ...new Array(80).fill(0)]))];

describe("probeCandidate", () => {
  it("follows master → media → first segment and reads languages, height and length", async () => {
    const { fetch, calls } = server({
      "https://a.example.net/x/master.m3u8": text(MASTER),
      "https://a.example.net/x/v/720.m3u8": text(mediaOf([300, 300])),
      "https://a.example.net/x/v/seg0.jpg": bin([0xff, 0xd8, 0xff, 0xe0]),
    });
    const out = await probeCandidate(cand({ quality: { label: "1080P", height: 1080 } }), FILM, fetch);
    expect(out).toMatchObject({ verdict: "ok", durationSec: 600, languages: ["hi"], quality: { label: "720p", height: 720 }, container: "hls" });
    expect(calls.map((c) => c.url)).toEqual(["https://a.example.net/x/master.m3u8", "https://a.example.net/x/v/720.m3u8", "https://a.example.net/x/v/seg0.jpg"]);
    expect(calls[2].headers).toEqual({ Referer: "https://r.example.net/", Range: "bytes=0-2047" });
    expect(calls[2].opts).toEqual({ maxBytes: 4096, responseType: "base64" });
  });

  it("leaves a live playlist unverified", async () => {
    const { fetch } = server({ "https://a.example.net/x/master.m3u8": text(mediaOf([6, 6], false)), "https://a.example.net/x/seg0.jpg": bin([1, 2]) });
    await expect(probeCandidate(cand(), FILM, fetch)).resolves.toMatchObject({ verdict: "unverified", durationSec: undefined });
  });

  it("rejects an unreachable stream, an HTML page, and a segment that is really a page", async () => {
    expect(await probeCandidate(cand(), FILM, server({ "https://a.example.net/x/master.m3u8": text("", { status: 403 }) }).fetch)).toMatchObject({
      verdict: "rejected",
      rejectReason: "unreachable",
    });
    expect(await probeCandidate(cand(), FILM, server({ "https://a.example.net/x/master.m3u8": text("<!DOCTYPE html><html>login") }).fetch)).toMatchObject({
      verdict: "rejected",
      rejectReason: "html-body",
    });
    const seg = server({ "https://a.example.net/x/master.m3u8": text(mediaOf([600])), "https://a.example.net/x/seg0.jpg": bin("<html><body>no") });
    expect(await probeCandidate(cand(), FILM, seg.fetch)).toMatchObject({ verdict: "rejected", rejectReason: "html-body" });
  });

  it("rejects the wrong length: ±8 min for films, ±3 min for episodes", async () => {
    const routes = { "https://a.example.net/x/master.m3u8": text(mediaOf([600])), "https://a.example.net/x/seg0.jpg": bin([1]) };
    expect(await probeCandidate(cand(), { kind: "movie", runtimeMin: 120 }, server(routes).fetch)).toMatchObject({
      verdict: "rejected",
      rejectReason: "duration",
      durationSec: 600,
    });
    expect(await probeCandidate(cand(), { kind: "tv", runtimeMin: 6 }, server(routes).fetch)).toMatchObject({ verdict: "rejected", rejectReason: "duration" });
    expect(await probeCandidate(cand(), { kind: "tv", runtimeMin: 8 }, server(routes).fetch)).toMatchObject({ verdict: "ok" });
    expect(await probeCandidate(cand(), { kind: "movie" }, server(routes).fetch)).toMatchObject({ verdict: "ok" }); // runtime unknown: no check
  });

  it("DASH plays on Android only; length and languages come from the MPD", async () => {
    const mpd = `<MPD mediaPresentationDuration="PT10M"><Period><AdaptationSet contentType="audio" lang="ta"></AdaptationSet></Period></MPD>`;
    const out = await probeCandidate(cand({ url: "https://a.example.net/m.mpd", container: "dash", platforms: { ios: false, android: true } }), FILM, server({ "https://a.example.net/m.mpd": text(mpd) }).fetch);
    expect(out).toMatchObject({ verdict: "ok", durationSec: 600, languages: ["ta"], platforms: { ios: false, android: true }, container: "dash" });
  });

  it("reads an MP4's length from its first 64 KB with a Range request", async () => {
    const { fetch, calls } = server({ "https://a.example.net/f.mp4": bin(MP4_600S) });
    const out = await probeCandidate(cand({ url: "https://a.example.net/f.mp4", container: "mp4" }), FILM, fetch);
    expect(out).toMatchObject({ verdict: "ok", durationSec: 600, container: "mp4" });
    expect(calls[0].headers.Range).toBe("bytes=0-65535");
    expect(calls[0].opts).toEqual({ maxBytes: 65536, responseType: "base64" });
  });

  it("re-reads an extensionless playlist as text", async () => {
    const url = "https://a.example.net/play?id=9";
    const { fetch } = server({ [`${url}|base64`]: bin(mediaOf([600])), [`${url}|text`]: text(mediaOf([600])), "https://a.example.net/seg0.jpg": bin([1]) });
    await expect(probeCandidate(cand({ url, container: "unknown" }), FILM, fetch)).resolves.toMatchObject({ verdict: "ok", container: "hls", durationSec: 600 });
  });

  it("rejects Matroska for every platform", async () => {
    const out = await probeCandidate(cand({ url: "https://a.example.net/v", container: "unknown" }), FILM, server({ "https://a.example.net/v": bin([0x1a, 0x45, 0xdf, 0xa3, 1]) }).fetch);
    expect(out).toMatchObject({ verdict: "rejected", rejectReason: "platform", platforms: { ios: false, android: false } });
  });

  it("keeps a stream off iPhone when its Origin header only works before a redirect", async () => {
    const { fetch } = server({ "https://a.example.net/x/master.m3u8": text(mediaOf([600]), { redirected: true, url: "https://b.example.net/x/m.m3u8" }), "https://b.example.net/x/seg0.jpg": bin([1]) });
    const out = await probeCandidate(cand({ headers: { Origin: "https://r.example.net" } }), FILM, fetch);
    expect(out.platforms).toEqual({ ios: false, android: true });
  });

  it("a network error rejects as unreachable", async () => {
    await expect(probeCandidate(cand(), FILM, server({ "https://a.example.net/x/master.m3u8": new Error("boom") }).fetch)).resolves.toMatchObject({
      verdict: "rejected",
      rejectReason: "unreachable",
    });
  });

  it("running out of time leaves the candidate playable but unverified", async () => {
    jest.useFakeTimers();
    try {
      const { fetch } = server({ "https://a.example.net/x/master.m3u8": () => new Promise<ProbeResponse>(() => {}) });
      const out = probeCandidate(cand(), FILM, fetch);
      await jest.advanceTimersByTimeAsync(PROBE_BUDGET_MS);
      await expect(out).resolves.toMatchObject({ verdict: "unverified" });
    } finally {
      jest.useRealTimers();
    }
  });

  it("returns an already-rejected candidate untouched, without any request", async () => {
    const { fetch, calls } = server({});
    const c = cand({ verdict: "rejected", rejectReason: "platform" });
    await expect(probeCandidate(c, FILM, fetch)).resolves.toBe(c);
    expect(calls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest services/playback/probe services/plugins/pluginFetch`
Expected: FAIL — `Cannot find module './probe'`; the new pluginFetch test fails (`maxBytes` is 20 MiB, and `too-large` is thrown).

- [ ] **Step 3: Implement**

`services/plugins/pluginFetch.ts`:
- Add to `PluginFetchRequest`:

  ```ts
    /** Host-only (the probe): read at most this much. Never set from a worker — see toPluginFetchRequest. */
    maxBytes?: number;
    /** Host-only: hand back a cut-off body instead of failing. */
    truncate?: boolean;
  ```

- Add `truncated: boolean;` to `PluginFetchResponse`.
- In the `fetchOnce` call, use `maxBytes: req.maxBytes ?? MAX_BODY_BYTES`.
- Replace the truncation check with `if (res.truncated && !req.truncate) throw new PluginFetchError("too-large", "Response over 20 MiB");`.
- Add `truncated: res.truncated` to the returned object.

`services/playback/probe.ts`:

```ts
/**
 * StreamProbe (spec §5.5): trust nothing a plugin says. Within 6 s per candidate: is it reachable down to a first
 * segment, is it a playlist or video rather than an HTML page, does its length match the title, which audio
 * languages does it carry, and which platforms can play it. Only evidence rejects — a probe that runs out of time
 * leaves the candidate playable but unverified.
 */
import { hasHeader } from "@/services/plugins/urlGuard";
import type { PlaybackCandidate, RejectReason } from "./candidate";
import { asciiHead, base64ToBytes, isHls, isMatroska, isMp4, looksLikeHtml, mp4Duration, parseDash, parseHlsMaster, parseHlsMedia } from "./manifests";

export interface ProbeResponse {
  status: number;
  url: string;
  redirected: boolean;
  body: string;
  encoding: "text" | "base64";
}

export type ProbeFetch = (
  url: string,
  headers: Record<string, string>,
  opts: { maxBytes: number; responseType: "text" | "base64" },
) => Promise<ProbeResponse>;

export interface ProbeContext {
  kind: "movie" | "tv";
  /** TMDB runtime in minutes; unknown skips the length check. */
  runtimeMin?: number;
}

export const PROBE_BUDGET_MS = 6000;
const PLAYLIST_BYTES = 2 * 1024 * 1024;
const HEAD_BYTES = 64 * 1024;
const TOLERANCE_MIN = { movie: 8, tv: 3 } as const;

const reject = (c: PlaybackCandidate, reason: RejectReason, extra: Partial<PlaybackCandidate> = {}): PlaybackCandidate => ({
  ...c,
  ...extra,
  verdict: "rejected",
  rejectReason: reason,
});

export async function probeCandidate(c: PlaybackCandidate, ctx: ProbeContext, fetch: ProbeFetch, budgetMs = PROBE_BUDGET_MS): Promise<PlaybackCandidate> {
  if (c.verdict === "rejected") return c;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const outOfTime = new Promise<PlaybackCandidate>((resolve) => {
    timer = setTimeout(() => resolve(c), budgetMs);
  });
  try {
    return await Promise.race([inspect(c, ctx, fetch).catch(() => reject(c, "unreachable")), outOfTime]);
  } finally {
    clearTimeout(timer);
  }
}

async function inspect(c: PlaybackCandidate, ctx: ProbeContext, fetch: ProbeFetch): Promise<PlaybackCandidate> {
  const sniff = c.container === "mp4" || c.container === "unknown";
  let first = await fetch(c.url, sniff ? { ...c.headers, Range: "bytes=0-65535" } : c.headers, {
    maxBytes: sniff ? HEAD_BYTES : PLAYLIST_BYTES,
    responseType: sniff ? "base64" : "text",
  });
  if (first.status >= 400) return reject(c, "unreachable");
  const platforms = { ...c.platforms };
  if (first.redirected && hasHeader(c.headers, "origin")) platforms.ios = false; // iOS drops Origin after a 302 (spike T1)
  const languages = [...c.languages];
  const addLanguages = (codes: string[]) => {
    for (const l of codes) if (!languages.includes(l)) languages.push(l);
  };
  let container = c.container;
  let probedHeight: number | undefined;
  let durationSec: number | undefined;

  if (first.encoding === "base64") {
    const bytes = base64ToBytes(first.body);
    const head = asciiHead(bytes);
    if (isHls(head) || /<MPD[\s>]/.test(head)) {
      // A playlist behind an extensionless URL: read it whole, as text.
      first = await fetch(c.url, c.headers, { maxBytes: PLAYLIST_BYTES, responseType: "text" });
      if (first.status >= 400) return reject(c, "unreachable");
    } else if (looksLikeHtml(head)) {
      return reject(c, "html-body");
    } else if (isMatroska(bytes)) {
      return reject(c, "platform", { container: "unsupported", platforms: { ios: false, android: false } });
    } else {
      if (isMp4(bytes)) container = "mp4";
      durationSec = mp4Duration(bytes);
    }
  }

  if (first.encoding === "text") {
    const text = first.body;
    if (isHls(text)) {
      container = "hls";
      let media = text;
      let mediaUrl = first.url;
      const master = parseHlsMaster(text, first.url);
      if (master) {
        addLanguages(master.audioLanguages);
        const tallest = Math.max(0, ...master.variants.map((v) => v.height ?? 0));
        if (tallest) probedHeight = tallest;
        const variant = master.variants[0];
        if (!variant) return reject(c, "unreachable");
        const r = await fetch(variant.url, c.headers, { maxBytes: PLAYLIST_BYTES, responseType: "text" });
        if (r.status >= 400) return reject(c, "unreachable");
        if (!isHls(r.body)) return reject(c, looksLikeHtml(r.body) ? "html-body" : "unreachable");
        media = r.body;
        mediaUrl = r.url;
      }
      const m = parseHlsMedia(media, mediaUrl);
      durationSec = m.durationSec;
      if (m.firstSegment) {
        const seg = await fetch(m.firstSegment, { ...c.headers, Range: "bytes=0-2047" }, { maxBytes: 4096, responseType: "base64" });
        if (seg.status >= 400) return reject(c, "unreachable");
        // Disguised segments (.jpg, .html, no extension) are fine; an actual HTML page is not.
        if (looksLikeHtml(asciiHead(base64ToBytes(seg.body)))) return reject(c, "html-body");
      }
    } else {
      const dash = parseDash(text);
      if (!dash) return reject(c, looksLikeHtml(text) ? "html-body" : "unreachable");
      container = "dash";
      platforms.ios = false;
      durationSec = dash.durationSec;
      addLanguages(dash.audioLanguages);
    }
  }

  if (durationSec != null && ctx.runtimeMin && Math.abs(durationSec / 60 - ctx.runtimeMin) > TOLERANCE_MIN[ctx.kind]) {
    return reject(c, "duration", { durationSec });
  }
  return {
    ...c,
    container,
    languages,
    platforms,
    durationSec,
    quality: probedHeight ? { label: `${probedHeight}p`, height: probedHeight } : c.quality,
    verdict: durationSec != null ? "ok" : "unverified",
  };
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx jest services/playback/probe services/plugins/pluginFetch`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/plugins/pluginFetch.ts services/plugins/pluginFetch.test.ts services/playback/probe.ts services/playback/probe.test.ts
git commit -m "feat(playback): StreamProbe — reachability, length check, languages, platforms in 6 s

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Source health and `rankCandidates`

**Files:**
- Create: `services/playback/health.ts`, `services/playback/health.test.ts`
- Create: `services/playback/rank.ts`, `services/playback/rank.test.ts`

**Interfaces:**
- Consumes: `PlaybackCandidate` (Task 2); `FailureReason` (`services/plugins/PluginHost.ts`); `UniversalStorage` type.
- Produces:
  - `class SourceHealth { constructor(storage: Pick<UniversalStorage, "getString" | "set">, now?: () => number); isDown(sourceId: string): boolean; record(sourceId: string, ok: boolean): void }`
  - `countsAgainstSource(reason: FailureReason): boolean`
  - constants `DOWN_AFTER = 5`, `HEAL_MS = [3_600_000, 14_400_000, 28_800_000]`
  - `interface RankContext { platform: "ios" | "android"; languages: string[]; isDown(sourceId: string): boolean }`
  - `languageRank(c: PlaybackCandidate, wanted: string[]): number`
  - `rankCandidates(cands: PlaybackCandidate[], ctx: RankContext): PlaybackCandidate[]`

- [ ] **Step 1: Write the failing tests**

`services/playback/health.test.ts`:

```ts
import { countsAgainstSource, DOWN_AFTER, HEAL_MS, SourceHealth } from "./health";

function memory() {
  const m = new Map<string, string>();
  return { getString: (k: string) => m.get(k), set: (k: string, v: string | number | boolean) => void m.set(k, String(v)) };
}
const HOUR = 3_600_000;

describe("SourceHealth", () => {
  it(`goes down after ${DOWN_AFTER} failures in a row and heals after an hour`, () => {
    const t = { now: 0 };
    const h = new SourceHealth(memory(), () => t.now);
    for (let i = 0; i < DOWN_AFTER - 1; i++) h.record("r/p", false);
    expect(h.isDown("r/p")).toBe(false);
    h.record("r/p", false);
    expect(h.isDown("r/p")).toBe(true);
    t.now = HOUR + 1;
    expect(h.isDown("r/p")).toBe(false);
  });

  it("escalates 1 h → 4 h → 8 h while it keeps failing; one success resets it", () => {
    const t = { now: 0 };
    const h = new SourceHealth(memory(), () => t.now);
    const fail5 = () => {
      for (let i = 0; i < DOWN_AFTER; i++) h.record("r/p", false);
    };
    fail5();
    t.now += HEAL_MS[0] + 1;
    fail5();
    expect(h.isDown("r/p")).toBe(true);
    t.now += HEAL_MS[0] + 1;
    expect(h.isDown("r/p")).toBe(true); // second time down: 4 h
    t.now += HEAL_MS[1];
    fail5();
    t.now += HEAL_MS[1] + 1;
    expect(h.isDown("r/p")).toBe(true); // third time: 8 h
    h.record("r/p", true);
    expect(h.isDown("r/p")).toBe(false);
    fail5();
    t.now += HEAL_MS[0] + 1;
    expect(h.isDown("r/p")).toBe(false); // back to 1 h after the success
  });

  it("a success in between resets the count", () => {
    const h = new SourceHealth(memory(), () => 0);
    for (let i = 0; i < DOWN_AFTER - 1; i++) h.record("r/p", false);
    h.record("r/p", true);
    h.record("r/p", false);
    expect(h.isDown("r/p")).toBe(false);
  });

  it("is kept on the device", () => {
    const store = memory();
    for (let i = 0; i < DOWN_AFTER; i++) new SourceHealth(store, () => 0).record("r/p", false);
    expect(new SourceHealth(store, () => 0).isDown("r/p")).toBe(true);
  });

  it("only real plugin failures count — not 'nothing for this title', not sandbox trouble", () => {
    expect(["timeout", "error", "bad-shape"].map((r) => countsAgainstSource(r as never))).toEqual([true, true, true]);
    expect(["empty-fast", "unsafe", "not-ready", "crashed"].map((r) => countsAgainstSource(r as never))).toEqual([false, false, false, false]);
  });
});
```

`services/playback/rank.test.ts`:

```ts
import type { PlaybackCandidate } from "./candidate";
import { languageRank, rankCandidates } from "./rank";

const c = (key: string, over: Partial<PlaybackCandidate> = {}): PlaybackCandidate => ({
  key,
  sourceId: "r/p",
  label: key,
  url: `https://a.example.net/${key}.m3u8`,
  headers: {},
  container: "hls",
  languages: [],
  platforms: { ios: true, android: true },
  subtitles: [],
  verdict: "ok",
  order: 0,
  ...over,
});
const keys = (list: PlaybackCandidate[]) => list.map((x) => x.key);
const ctx = (over: Partial<Parameters<typeof rankCandidates>[1]> = {}) => ({ platform: "android" as const, languages: ["hi", "en"], isDown: () => false, ...over });

describe("rankCandidates", () => {
  it("drops rejected candidates and those this platform can't play", () => {
    const list = [c("ok"), c("rej", { verdict: "rejected" }), c("dash", { platforms: { ios: false, android: true } })];
    expect(keys(rankCandidates(list, ctx()))).toEqual(["ok", "dash"]);
    expect(keys(rankCandidates(list, ctx({ platform: "ios" })))).toEqual(["ok"]);
  });

  it("orders by the wanted languages; unknown sits between them and other languages", () => {
    const list = [c("ta", { languages: ["ta"] }), c("unknown"), c("en", { languages: ["en"] }), c("hi", { languages: ["en", "hi"] })];
    expect(keys(rankCandidates(list, ctx()))).toEqual(["hi", "en", "unknown", "ta"]);
  });

  it("sinks down sources within the same language, then prefers verified, then taller, then earlier", () => {
    const list = [
      c("down", { languages: ["hi"], sourceId: "r/down", order: 0 }),
      c("unverified", { languages: ["hi"], verdict: "unverified", order: 1 }),
      c("720", { languages: ["hi"], quality: { label: "720p", height: 720 }, order: 2 }),
      c("1080", { languages: ["hi"], quality: { label: "1080p", height: 1080 }, order: 3 }),
      c("late1080", { languages: ["hi"], quality: { label: "1080p", height: 1080 }, order: 4 }),
    ];
    expect(keys(rankCandidates(list, ctx({ isDown: (id) => id === "r/down" })))).toEqual(["1080", "late1080", "720", "unverified", "down"]);
  });

  it("languageRank", () => {
    expect(languageRank(c("x", { languages: ["en"] }), ["hi", "en"])).toBe(1);
    expect(languageRank(c("x"), ["hi", "en"])).toBe(2);
    expect(languageRank(c("x", { languages: ["ta"] }), ["hi", "en"])).toBe(3);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest services/playback/health services/playback/rank`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

`services/playback/health.ts`:

```ts
import type { FailureReason } from "@/services/plugins/PluginHost";
import type { UniversalStorage } from "@/services/storage/universalStorage.types";

/**
 * Local source health (spec §5.6 rule 3): 5 failures in a row mark a source down for 1 h; each time it goes down
 * again the wait grows to 4 h, then 8 h; one success heals it fully. Kept on the device; keyed by `repoId/pluginId`.
 */
export const DOWN_AFTER = 5;
export const HEAL_MS = [60 * 60_000, 4 * 60 * 60_000, 8 * 60 * 60_000];
const KEY = "srchealth.v1";

interface Entry {
  fails: number;
  level: number;
  downUntil: number;
}

/** Host failures that say something about the source — not "nothing for this title", not sandbox trouble. */
export function countsAgainstSource(reason: FailureReason): boolean {
  return reason === "timeout" || reason === "error" || reason === "bad-shape";
}

export class SourceHealth {
  constructor(
    private readonly storage: Pick<UniversalStorage, "getString" | "set">,
    private readonly now: () => number = Date.now,
  ) {}

  isDown(sourceId: string): boolean {
    return (this.read()[sourceId]?.downUntil ?? 0) > this.now();
  }

  record(sourceId: string, ok: boolean): void {
    const all = this.read();
    if (ok) {
      if (all[sourceId]) {
        delete all[sourceId];
        this.write(all);
      }
      return;
    }
    const e = all[sourceId] ?? { fails: 0, level: 0, downUntil: 0 };
    e.fails += 1;
    if (e.fails >= DOWN_AFTER) {
      e.downUntil = this.now() + HEAL_MS[Math.min(e.level, HEAL_MS.length - 1)];
      e.level += 1;
      e.fails = 0;
    }
    all[sourceId] = e;
    this.write(all);
  }

  private read(): Record<string, Entry> {
    try {
      return JSON.parse(this.storage.getString(KEY) ?? "{}") as Record<string, Entry>;
    } catch {
      return {};
    }
  }

  private write(all: Record<string, Entry>): void {
    this.storage.set(KEY, JSON.stringify(all));
  }
}
```

`services/playback/rank.ts`:

```ts
import type { PlaybackCandidate } from "./candidate";

/**
 * rankCandidates (spec §5.6) — an explicit order, no opaque score: playable here; the wanted languages in order (a
 * stream whose language is unknown sits after them but before a known other language); healthy sources first;
 * verified before unverified; taller first; then whoever answered first.
 */
export interface RankContext {
  platform: "ios" | "android";
  /** Wanted languages, most wanted first ("original" already resolved to a code). */
  languages: string[];
  isDown(sourceId: string): boolean;
}

export function languageRank(c: PlaybackCandidate, wanted: string[]): number {
  for (let i = 0; i < wanted.length; i++) if (c.languages.includes(wanted[i])) return i;
  return c.languages.length ? wanted.length + 1 : wanted.length;
}

export function rankCandidates(cands: PlaybackCandidate[], ctx: RankContext): PlaybackCandidate[] {
  return cands
    .filter((c) => c.verdict !== "rejected" && c.platforms[ctx.platform])
    .map((c) => ({
      c,
      lang: languageRank(c, ctx.languages),
      down: ctx.isDown(c.sourceId) ? 1 : 0,
      unverified: c.verdict === "ok" ? 0 : 1,
      height: c.quality?.height ?? 0,
    }))
    .sort((a, b) => a.lang - b.lang || a.down - b.down || a.unverified - b.unverified || b.height - a.height || a.c.order - b.c.order)
    .map((x) => x.c);
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx jest services/playback/health services/playback/rank`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/playback/health.ts services/playback/health.test.ts services/playback/rank.ts services/playback/rank.test.ts
git commit -m "feat(playback): rankCandidates and local source health (5 strikes, 1h→4h→8h)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Language order and per-title memory

**Files:**
- Create: `utils/languagePrefs.ts`, `utils/languagePrefs.test.ts`

**Interfaces:**
- Consumes: `canonLang` (`utils/trackMatch.ts`); `normalizeLanguage` (`components/player/native/languages.ts`); `getPreferredAudio` (`utils/prefs.ts`); `universalStorage`.
- Produces:
  - `ORIGINAL = "original"`, `DEFAULT_ORDER = ["hi", "original"]`
  - `languageOrder(preferredAudioLabel?: string | null): string[]` — from the existing silent-memory audio label ("Hindi" → `["hi","original"]`, "Original" → `["original"]`, none → `DEFAULT_ORDER`).
  - `resolveOrder(order: string[], originalLanguage?: string, titleChoice?: string | null): string[]` — the title's own choice first; "original" becomes the title's original language (dropped when unknown); duplicates removed.
  - `titleKeyOf(type: "movie" | "tv", tmdbId: string): string` — per show, not per episode.
  - `getTitleLanguage(key: string, storage?): string | null`, `setTitleLanguage(key: string, code: string, storage?): void` — at most 300 titles; the oldest go first.

- [ ] **Step 1: Write the failing test** — `utils/languagePrefs.test.ts`

```ts
import { DEFAULT_ORDER, getTitleLanguage, languageOrder, resolveOrder, setTitleLanguage, titleKeyOf } from "./languagePrefs";

function memory() {
  const m = new Map<string, string>();
  return { getString: (k: string) => m.get(k), set: (k: string, v: string | number | boolean) => void m.set(k, String(v)) };
}

describe("languageOrder", () => {
  it("defaults to Hindi, then the original audio", () => {
    expect(languageOrder(null)).toEqual(["hi", "original"]);
    expect(DEFAULT_ORDER).toEqual(["hi", "original"]);
  });

  it("follows the audio language the user last picked", () => {
    expect(languageOrder("Tamil")).toEqual(["ta", "original"]);
    expect(languageOrder("Original")).toEqual(["original"]);
    expect(languageOrder("Klingon")).toEqual(["hi", "original"]);
  });
});

describe("resolveOrder", () => {
  it("puts the title's own choice first and turns 'original' into the title's language", () => {
    expect(resolveOrder(["hi", "original"], "en", "ta")).toEqual(["ta", "hi", "en"]);
    expect(resolveOrder(["hi", "original"], "hi")).toEqual(["hi"]);
    expect(resolveOrder(["original"], undefined)).toEqual([]);
  });
});

describe("per-title language", () => {
  it("remembers per show (not per episode)", () => {
    const s = memory();
    expect(titleKeyOf("tv", "1396")).toBe("tv:1396");
    setTitleLanguage("tv:1396", "hi", s);
    expect(getTitleLanguage("tv:1396", s)).toBe("hi");
    expect(getTitleLanguage("movie:1", s)).toBeNull();
  });

  it("keeps the 300 most recent titles", () => {
    const s = memory();
    for (let i = 0; i < 305; i++) setTitleLanguage(`movie:${i}`, "en", s);
    expect(getTitleLanguage("movie:0", s)).toBeNull();
    expect(getTitleLanguage("movie:304", s)).toBe("en");
    setTitleLanguage("movie:10", "ta", s); // re-picking moves a title to the front
    for (let i = 305; i < 600; i++) setTitleLanguage(`movie:${i}`, "en", s);
    expect(getTitleLanguage("movie:10", s)).toBe("ta");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest utils/languagePrefs`
Expected: FAIL — `Cannot find module './languagePrefs'`.

- [ ] **Step 3: Implement** — `utils/languagePrefs.ts`

```ts
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
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx jest utils/languagePrefs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add utils/languagePrefs.ts utils/languagePrefs.test.ts
git commit -m "feat(prefs): language order from the last picked audio, and per-title language memory

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The resolver, and a sandbox that mounts only when needed

**Files:**
- Create: `services/playback/resolver.ts`, `services/playback/resolver.test.ts`
- Create: `services/playback/index.ts`
- Modify: `services/plugins/demand.ts` (+ `demand.test.ts`): `warmSandbox`
- Modify: `services/plugins/index.ts`: export `hostFetch`
- Modify: `src/features/plugins/PluginBootstrap.tsx` (+ test): the sandbox mounts only while something holds it

**Interfaces:**
- Consumes:
  - from 2A: `PluginHost.getStreams`, `HostResult`, `PluginFailure`, `ResolveRequest`; `registrableDomain`; `PluginFetchRequest`.
  - from this plan: Tasks 2–5.
- Produces:
  - `interface TitleRequest { tmdbId: string; type: "movie" | "tv"; season?: number; episode?: number; titleName?: string; runtimeMin?: number; originalLanguage?: string }`
  - `interface ResolveDeps { getStreams(req: ResolveRequest): Promise<HostResult>; probe(c: PlaybackCandidate, ctx: ProbeContext): Promise<PlaybackCandidate>; health: Pick<SourceHealth, "isDown" | "record">; platform: "ios" | "android"; languages: string[]; warm?(): void }`
  - `interface ResolveResult { ranked: PlaybackCandidate[]; rejected: PlaybackCandidate[]; failures: PluginFailure[]; complete: boolean }`
  - `resolvePlayback(req: TitleRequest, deps: ResolveDeps): Promise<ResolveResult>`, `PROBE_TOP = 4`, `sourceIdOf(pluginKey): string`
  - `probeByBackend(cands, probe): Promise<PlaybackCandidate[]>`
  - `@/services/playback`: `resolveTitle(req: TitleRequest, languages: string[]): Promise<ResolveResult>`, `sourceHealth: SourceHealth`
  - `@/services/plugins`: `hostFetch(req: PluginFetchRequest): Promise<PluginFetchResponse>`
  - `@/services/plugins/demand`: `warmSandbox(ms?: number): void`

- [ ] **Step 1: Write the failing tests**

`services/playback/resolver.test.ts`:

```ts
import type { HostResult } from "@/services/plugins/PluginHost";
import type { PluginStream } from "@/services/plugins/streams";
import type { PlaybackCandidate } from "./candidate";
import type { ProbeContext } from "./probe";
import { PROBE_TOP, probeByBackend, resolvePlayback, sourceIdOf } from "./resolver";

const stream = (plugin: string, url: string, name = "Hindi"): PluginStream => ({
  pluginKey: `r/${plugin}@abc`,
  repoId: "r",
  pluginId: plugin,
  name,
  title: "",
  url,
  headers: {},
  subtitles: [],
});

function deps(host: HostResult, verdicts: Record<string, Partial<PlaybackCandidate>> = {}) {
  const recorded: [string, boolean][] = [];
  const probed: string[] = [];
  const warm = jest.fn();
  return {
    recorded,
    probed,
    warm,
    d: {
      getStreams: jest.fn(async () => host),
      probe: jest.fn(async (c: PlaybackCandidate, _ctx: ProbeContext) => {
        probed.push(c.url);
        return { ...c, verdict: "ok" as const, ...verdicts[c.url] };
      }),
      health: { isDown: () => false, record: (id: string, ok: boolean) => void recorded.push([id, ok]) },
      platform: "android" as const,
      languages: ["hi", "en"],
      warm,
    },
  };
}

describe("resolvePlayback", () => {
  it("keeps the sandbox warm, probes only the top candidates, and returns them ranked", async () => {
    const streams = [
      stream("a", "https://x.example.net/1.m3u8", "English"),
      stream("a", "https://x.example.net/2.m3u8", "Hindi"),
      stream("b", "https://y.example.net/3.m3u8", "Tamil"),
      stream("b", "https://y.example.net/4.m3u8"),
      stream("c", "https://z.example.net/5.m3u8", "Hindi"),
      stream("c", "https://z.example.net/6.mkv", "Hindi"),
    ];
    const { d, probed, warm } = deps(
      { streams, failures: [], ran: ["r/a@abc", "r/b@abc", "r/c@abc"], complete: true },
      { "https://x.example.net/2.m3u8": { verdict: "rejected", rejectReason: "duration" } },
    );
    const out = await resolvePlayback({ tmdbId: "1", type: "movie" }, d);
    expect(warm).toHaveBeenCalledTimes(1);
    expect(probed).toHaveLength(PROBE_TOP);
    expect(probed).not.toContain("https://z.example.net/6.mkv"); // rejected by its container, never probed
    expect(out.ranked.map((c) => c.url)).toEqual([
      "https://y.example.net/4.m3u8",
      "https://z.example.net/5.m3u8",
      "https://x.example.net/1.m3u8",
      "https://y.example.net/3.m3u8",
    ]);
    expect(out.rejected.map((c) => c.rejectReason).sort()).toEqual(["duration", "platform"]);
  });

  it("records health: real failures count against a source, an answer counts for it; empty-fast and sandbox trouble don't count", async () => {
    const { d, recorded } = deps({
      streams: [stream("a", "https://x.example.net/1.m3u8")],
      failures: [
        { pluginKey: "r/b@abc", reason: "timeout", ms: 15000 },
        { pluginKey: "r/c@abc", reason: "empty-fast", ms: 3 },
        { pluginKey: "r/d@abc", reason: "crashed", ms: 1 },
      ],
      ran: ["r/a@abc", "r/b@abc", "r/c@abc", "r/d@abc", "r/e@abc"],
      complete: true,
    });
    await resolvePlayback({ tmdbId: "1", type: "movie" }, d);
    expect(recorded.sort()).toEqual([
      ["r/a", true],
      ["r/b", false],
      ["r/e", true],
    ]);
  });

  it("hands the probe the title's kind and runtime", async () => {
    const { d } = deps({ streams: [stream("a", "https://x.example.net/1.m3u8")], failures: [], ran: [], complete: true });
    await resolvePlayback({ tmdbId: "1", type: "tv", season: 1, episode: 2, runtimeMin: 47 }, d);
    expect(d.probe.mock.calls[0][1]).toEqual({ kind: "tv", runtimeMin: 47 });
    expect(d.getStreams).toHaveBeenCalledWith({ tmdbId: "1", type: "tv", season: 1, episode: 2 });
  });
});

describe("probeByBackend", () => {
  it("probes one backend at a time and different backends in parallel", async () => {
    const active = new Map<string, number>();
    let peakSame = 0;
    let peakAll = 0;
    const gates: (() => void)[] = [];
    const cands = ["https://a.x.example.net/1", "https://b.x.example.net/2", "https://y.example.org/3"].map(
      (url, i) => ({ key: String(i), url }) as PlaybackCandidate,
    );
    const run = probeByBackend(cands, async (c) => {
      const host = new URL(c.url).hostname.split(".").slice(-2).join(".");
      active.set(host, (active.get(host) ?? 0) + 1);
      peakSame = Math.max(peakSame, active.get(host)!);
      peakAll = Math.max(peakAll, [...active.values()].reduce((a, b) => a + b, 0));
      await new Promise<void>((r) => gates.push(r));
      active.set(host, active.get(host)! - 1);
      return c;
    });
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 0));
      gates.splice(0).forEach((g) => g());
    }
    await expect(run).resolves.toHaveLength(3);
    expect(peakSame).toBe(1);
    expect(peakAll).toBe(2);
  });

  it("sourceIdOf drops the version", () => {
    expect(sourceIdOf("open-movies/open-movies@1c8f6cac")).toBe("open-movies/open-movies");
  });
});
```

Append to `services/plugins/demand.test.ts`:

```ts
describe("warmSandbox", () => {
  it("holds the sandbox for a while after the latest call", () => {
    jest.useFakeTimers();
    try {
      warmSandbox(1000);
      expect(sandboxDemand()).toBe(1);
      jest.advanceTimersByTime(800);
      warmSandbox(1000); // a new resolve extends it, without a second hold
      expect(sandboxDemand()).toBe(1);
      jest.advanceTimersByTime(900);
      expect(sandboxDemand()).toBe(1);
      jest.advanceTimersByTime(200);
      expect(sandboxDemand()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
```

and change its import to `import { holdSandbox, sandboxDemand, warmSandbox } from "./demand";`.

In `src/features/plugins/PluginBootstrap.test.tsx`, replace the test `"mounts the sandbox and installs /config's repos (the cached list offline) when the flag is on"` with:

```tsx
  it("with the flag on, installs /config's repos (the cached list offline) but mounts the sandbox only while something holds it", () => {
    mockFlags = { ...mockFlags, pluginHost: true };
    const r = render();
    expect(mockSync).toHaveBeenCalledWith(mockRepos);
    expect(sandboxes(r)).toHaveLength(0);
    let release = () => {};
    act(() => {
      release = holdSandbox();
    });
    expect(sandboxes(r)).toHaveLength(1);
    act(() => release());
    expect(sandboxes(r)).toHaveLength(0);
  });
```

and in `"never mounts in a binary without BearoomFetch"` add `const release = holdSandbox();` before rendering and `release();` after the expectations.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest services/playback/resolver services/plugins/demand src/features/plugins`
Expected: FAIL — `./resolver` missing; `warmSandbox` is not a function; the bootstrap mounts the sandbox while nothing holds it.

- [ ] **Step 3: Implement**

`services/playback/resolver.ts`:

```ts
import { registrableDomain } from "@/services/plugins/limiter";
import type { HostResult, PluginFailure, ResolveRequest } from "@/services/plugins/PluginHost";
import { toCandidates, type PlaybackCandidate } from "./candidate";
import { countsAgainstSource, type SourceHealth } from "./health";
import type { ProbeContext } from "./probe";
import { rankCandidates } from "./rank";

/**
 * One title → ranked native candidates (spec §5.5–5.6): ask the plugin host, read candidates, probe the top few
 * (one request stream per backend at a time, backends in parallel), rank for this device and the wanted languages.
 * Plugin outcomes feed source health on the way.
 */
export interface TitleRequest {
  tmdbId: string;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
  /** The film or show name, so a language word in it isn't read as the stream's language. */
  titleName?: string;
  /** TMDB runtime (minutes) for the length check. */
  runtimeMin?: number;
  /** TMDB original_language — what "Original audio" means. */
  originalLanguage?: string;
}

export interface ResolveDeps {
  getStreams(req: ResolveRequest): Promise<HostResult>;
  probe(c: PlaybackCandidate, ctx: ProbeContext): Promise<PlaybackCandidate>;
  health: Pick<SourceHealth, "isDown" | "record">;
  platform: "ios" | "android";
  /** Wanted languages, resolved (see utils/languagePrefs.resolveOrder). */
  languages: string[];
  /** Keep the sandbox mounted for this resolve and a while after. */
  warm?(): void;
}

export interface ResolveResult {
  /** Playable here, best first. */
  ranked: PlaybackCandidate[];
  rejected: PlaybackCandidate[];
  failures: PluginFailure[];
  /** Every plugin answered (no early return). */
  complete: boolean;
}

export const PROBE_TOP = 4;

export function sourceIdOf(pluginKey: string): string {
  return pluginKey.split("@")[0];
}

function backendOf(url: string): string {
  try {
    return registrableDomain(new URL(url).hostname);
  } catch {
    return "?";
  }
}

export async function probeByBackend(cands: PlaybackCandidate[], probe: (c: PlaybackCandidate) => Promise<PlaybackCandidate>): Promise<PlaybackCandidate[]> {
  const groups = new Map<string, PlaybackCandidate[]>();
  for (const c of cands) {
    const g = groups.get(backendOf(c.url)) ?? [];
    g.push(c);
    groups.set(backendOf(c.url), g);
  }
  const done = new Map<string, PlaybackCandidate>();
  await Promise.all(
    [...groups.values()].map(async (group) => {
      for (const c of group) done.set(c.key, await probe(c));
    }),
  );
  return cands.map((c) => done.get(c.key) ?? c);
}

export async function resolvePlayback(req: TitleRequest, deps: ResolveDeps): Promise<ResolveResult> {
  deps.warm?.();
  const host = await deps.getStreams({ tmdbId: req.tmdbId, type: req.type, season: req.season, episode: req.episode });

  const failed = new Set(host.failures.map((f) => f.pluginKey));
  for (const f of host.failures) if (countsAgainstSource(f.reason)) deps.health.record(sourceIdOf(f.pluginKey), false);
  for (const key of host.ran) if (!failed.has(key)) deps.health.record(sourceIdOf(key), true);

  const all = toCandidates(host.streams, { originalLanguage: req.originalLanguage, titleName: req.titleName });
  const ctx = { platform: deps.platform, languages: deps.languages, isDown: (id: string) => deps.health.isDown(id) };
  const shortlist = rankCandidates(all, ctx).slice(0, PROBE_TOP);
  const probeCtx: ProbeContext = { kind: req.type === "movie" ? "movie" : "tv", runtimeMin: req.runtimeMin };
  const probed = await probeByBackend(shortlist, (c) => deps.probe(c, probeCtx));
  const byKey = new Map(probed.map((c) => [c.key, c]));
  const merged = all.map((c) => byKey.get(c.key) ?? c);
  return {
    ranked: rankCandidates(merged, ctx),
    rejected: merged.filter((c) => c.verdict === "rejected"),
    failures: host.failures,
    complete: host.complete,
  };
}
```

`services/plugins/demand.ts` — add:

```ts
let warmRelease: (() => void) | null = null;
let warmTimer: ReturnType<typeof setTimeout> | undefined;

/** Keep the sandbox mounted for `ms` after the latest call: resolves come in bursts, and mounting costs ~0.5 s. */
export function warmSandbox(ms = 120_000): void {
  warmRelease ??= holdSandbox();
  clearTimeout(warmTimer);
  warmTimer = setTimeout(() => {
    warmRelease?.();
    warmRelease = null;
  }, ms);
}
```

`services/plugins/index.ts` — add (and import `type PluginFetchRequest` from `./pluginFetch`):

```ts
/** The host's own fetch (the stream probe): the same per-hop guard and limits, and no plugin's cookies. */
export function hostFetch(req: PluginFetchRequest) {
  return pluginFetch(new CookieJar(), req, fetchDeps);
}
```

`src/features/plugins/PluginBootstrap.tsx`:
- Change the return to `return supported && demand > 0 ? <PluginSandbox bridge={sandboxBridge} /> : null;`.
- Update the comment: "keeps the installed repos in step with /config.pluginRepos while the flag is on, and mounts the sandbox only while something holds it (a resolve keeps it 2 minutes; the Plugin Lab while open) — its WebView renderer costs ≈118 MB".

`services/playback/index.ts`:

```ts
/**
 * The app's resolver, wired to the real plugin host, the SSRF-guarded fetch and the device's source health.
 */
import { hostFetch, pluginHost } from "@/services/plugins";
import { warmSandbox } from "@/services/plugins/demand";
import { universalStorage } from "@/services/storage/universalStorage";
import { Platform } from "react-native";
import type { PlaybackCandidate } from "./candidate";
import { SourceHealth } from "./health";
import { probeCandidate, type ProbeFetch } from "./probe";
import { resolvePlayback, type ResolveResult, type TitleRequest } from "./resolver";

export const sourceHealth = new SourceHealth(universalStorage);

const probeFetch: ProbeFetch = async (url, headers, opts) => {
  const r = await hostFetch({ url, headers, maxBytes: opts.maxBytes, truncate: true, responseType: opts.responseType });
  return { status: r.status, url: r.url, redirected: r.redirected, body: r.body, encoding: r.encoding };
};

// Probe results by URL for 15 minutes (the plugin host's cache window); a re-resolve with fresh tokens probes again.
const PROBE_CACHE_MS = 15 * 60_000;
const probed = new Map<string, { at: number; c: PlaybackCandidate }>();

export function resolveTitle(req: TitleRequest, languages: string[]): Promise<ResolveResult> {
  return resolvePlayback(req, {
    getStreams: (r) => pluginHost.getStreams(r),
    probe: async (c, ctx) => {
      const hit = probed.get(c.url);
      if (hit && Date.now() - hit.at < PROBE_CACHE_MS) return { ...hit.c, order: c.order };
      const out = await probeCandidate(c, ctx, probeFetch);
      probed.set(c.url, { at: Date.now(), c: out });
      return out;
    },
    health: sourceHealth,
    platform: Platform.OS === "ios" ? "ios" : "android",
    languages,
    warm: () => warmSandbox(),
  });
}
```

- [ ] **Step 4: Run them to verify they pass, then the full suite**

Run: `npx jest services/playback services/plugins src/features/plugins && npx jest && npx tsc --noEmit`
Expected: all PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add services/playback/resolver.ts services/playback/resolver.test.ts services/playback/index.ts services/plugins/demand.ts services/plugins/demand.test.ts services/plugins/index.ts src/features/plugins
git commit -m "feat(playback): resolver (host → candidates → probe → rank); sandbox mounts only while resolving

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `/report` accepts plugin sources on the native lane

**Files:**
- Modify: `worker/src/pluginRepos.ts`, `worker/src/pluginRepos.test.ts` (`isPluginSourceId`)
- Modify: `worker/src/index.ts` (`/report` provider check)
- Create: `worker/src/report.test.ts`

**Interfaces:**
- Consumes: `getPluginRepos`, `PluginRepo` (2A Task 1).
- Produces: `isPluginSourceId(id: string, repos: PluginRepo[]): boolean`. It is true for `repoId/pluginId` when the repo is listed, not down, and allows the plugin. `/report` inserts a lane-`native` row whose `providerId` passes this check.

- [ ] **Step 1: Write the failing tests**

Append to `worker/src/pluginRepos.test.ts` (and import `isPluginSourceId`):

```ts
describe("isPluginSourceId", () => {
  const repos = [
    { id: "open-movies", manifestUrl: "https://h/m.json", version: 1, files: [], enabled: true, down: false, allowPlugins: null },
    { id: "narrow", manifestUrl: "https://h/m.json", version: 1, files: [], enabled: true, down: false, allowPlugins: ["ok"] },
    { id: "gone", manifestUrl: "https://h/m.json", version: 1, files: [], enabled: true, down: true, allowPlugins: null },
  ];
  it.each([
    ["open-movies/open-movies", true],
    ["narrow/ok", true],
    ["narrow/other", false],
    ["gone/x", false],
    ["made-up/x", false],
    ["videasy", false],
    ["open-movies/../x", false],
  ])("%s → %s", (id, want) => expect(isPluginSourceId(id, repos)).toBe(want));
});
```

`worker/src/report.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import app from "./index";

const repoRow = { id: "open-movies", manifest_url: "https://h.test/m.json", version: 1, files: [], enabled: true, down: false, allow_plugins: null };
const providerRow = { id: "vidfast", name: "VidFast", enabled: true, priority: 1, url_movie: "https://v/{id}", url_tv: null, allowed_domain: "https://v", hijack: { supported: false }, script_version: null };

function stub() {
  const inserts: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("provider_reports")) {
      inserts.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 201 });
    }
    if (url.includes("provider_health")) return new Response("[]", { status: 200 });
    if (url.includes("plugin_repos")) return new Response(JSON.stringify([repoRow]), { status: 200 });
    return new Response(JSON.stringify([providerRow]), { status: 200 });
  });
  const store = new Map<string, Response>();
  vi.stubGlobal("caches", {
    default: { match: async (r: Request) => store.get(r.url)?.clone(), put: async (r: Request, res: Response) => void store.set(r.url, res) },
  });
  return inserts;
}

const env = {
  SUPABASE_URL: "https://supa.test",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "svc",
  IP_HASH_SALT: "salt",
  REPORT_LIMITER: { limit: async () => ({ success: true }) },
};

async function report(body: Record<string, unknown>) {
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => void pending.push(p), passThroughOnException: () => {} };
  const res = await app.request(
    "/report",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tmdbId: "10378", mediaType: "movie", outcome: "success", platform: "android", ...body }) },
    env,
    ctx as never,
  );
  await Promise.allSettled(pending);
  return res.status;
}

afterEach(() => vi.unstubAllGlobals());

describe("POST /report", () => {
  it("stores a native-lane report for a listed plugin source", async () => {
    const inserts = stub();
    expect(await report({ providerId: "open-movies/open-movies", lane: "native", stage: "playing", ttffMs: 900 })).toBe(202);
    expect(inserts).toEqual([expect.objectContaining({ provider_id: "open-movies/open-movies", lane: "native", ttff_ms: 900 })]);
  });

  it("drops made-up sources, and plugin ids reported on the embed lane", async () => {
    const inserts = stub();
    expect(await report({ providerId: "made-up/x", lane: "native" })).toBe(202);
    expect(await report({ providerId: "open-movies/open-movies", lane: "embed" })).toBe(202);
    expect(inserts).toEqual([]);
  });

  it("still stores embed reports for registry providers", async () => {
    const inserts = stub();
    await report({ providerId: "vidfast", lane: "embed" });
    expect(inserts).toEqual([expect.objectContaining({ provider_id: "vidfast" })]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd worker && npx vitest run src/pluginRepos.test.ts src/report.test.ts`
Expected: FAIL — `isPluginSourceId` not exported; the native report is not inserted.

- [ ] **Step 3: Implement**

`worker/src/pluginRepos.ts`:

```ts
const SOURCE_ID = /^([a-z0-9][a-z0-9-]{1,40})\/([A-Za-z0-9._-]{1,80})$/;

/** `repoId/pluginId` of a repo the operator lists (not down) that allows that plugin. */
export function isPluginSourceId(id: string, repos: PluginRepo[]): boolean {
  const m = SOURCE_ID.exec(id);
  if (!m || m[2].includes("..")) return false;
  return repos.some((r) => r.id === m[1] && !r.down && (r.allowPlugins == null || r.allowPlugins.includes(m[2])));
}
```

`worker/src/index.ts` — import `isPluginSourceId`, then replace the provider check in `/report` with:

```ts
  // M1: only real sources: an enabled registry provider, or (native lane) a plugin of a repo the operator lists.
  const providers = await getProviders(c.env, c.executionCtx);
  const known =
    providers.some((p) => p.id === body.providerId) ||
    (body.lane === "native" && isPluginSourceId(body.providerId, await getPluginRepos(c.env, c.executionCtx)));
  if (!known) {
    return c.json({ accepted: true }, 202);
  }
```

- [ ] **Step 4: Run them to verify they pass; whole worker suite; typecheck; deploy**

Run: `cd worker && npx vitest run && npx tsc --noEmit && env -u CLOUDFLARE_API_TOKEN npx wrangler deploy`
Expected: all PASS; tsc clean; deployed (note the version id).

- [ ] **Step 5: Commit**

```bash
git add worker/src/pluginRepos.ts worker/src/pluginRepos.test.ts worker/src/index.ts worker/src/report.test.ts
git commit -m "feat(worker): /report accepts native-lane reports for listed plugin sources

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Plugin Lab shows ranked candidates; phone check

**Files:**
- Modify: `src/screens/PluginLabScreen.tsx` (Resolve uses `resolveTitle` with TMDB details)
- Modify: `docs/project-board.md`, `docs/BACKLOG.md`, memory `phase2a-status`

**Interfaces:**
- Consumes:
  - `resolveTitle` (Task 7) and `languageOrder` / `resolveOrder` (Task 6);
  - `languageName` (`components/player/native/languages.ts`);
  - `fetchDetails` (the TMDB details fetcher `tmdbApi` uses; its import path is checked in Step 1).
- Produces: dev-only UI.

- [ ] **Step 1: Find the details fetcher**

Run: `grep -rn "export async function fetchDetails\|export function fetchDetails" utils contexts src services`
Expected: one hit (e.g. `utils/tmdbDetails.ts`). Use that import below.

- [ ] **Step 2: Switch the Lab's Resolve to the resolver**

In `PluginLabScreen.tsx`, replace the `resolve` function and the result rendering:

```tsx
  const [ranked, setRanked] = useState<(ResolveResult & { ms: number; wanted: string[] }) | null>(null);

  const resolve = async () => {
    setBusy(true);
    setRanked(null);
    pluginHost.clearCache();
    const started = Date.now();
    const details = await fetchDetails(type, tmdbId.trim()).catch(() => null);
    const runtimeMin = type === "movie" ? details?.runtime : details?.episode_run_time?.[0];
    const wanted = resolveOrder(languageOrder(), details?.original_language);
    const r = await resolveTitle(
      {
        tmdbId: tmdbId.trim(),
        type,
        season: type === "tv" ? 1 : undefined,
        episode: type === "tv" ? 1 : undefined,
        titleName: details?.title ?? details?.name,
        runtimeMin: runtimeMin || undefined,
        originalLanguage: details?.original_language,
      },
      wanted,
    );
    setRanked({ ...r, ms: Date.now() - started, wanted });
    setBusy(false);
  };
```

and, in place of the old `result ? (…) : null` block:

```tsx
          {ranked ? (
            <>
              <Text style={styles.line}>
                {`${ranked.ranked.length} playable · ${ranked.rejected.length} rejected · ${(ranked.ms / 1000).toFixed(1)} s · wants ${ranked.wanted.join(" > ") || "–"}`}
              </Text>
              {[...ranked.ranked, ...ranked.rejected].map((c) => (
                <Text key={c.key} style={[styles.line, c.verdict === "rejected" && styles.fail]}>
                  {[
                    `${c.verdict}${c.rejectReason ? ` (${c.rejectReason})` : ""}`,
                    c.label,
                    c.languages.map(languageName).join("/") || "lang ?",
                    c.durationSec != null ? `${(c.durationSec / 60).toFixed(1)} min` : "len ?",
                    c.quality?.label ?? "?",
                    c.container,
                    c.platforms.ios ? "iOS+Android" : c.platforms.android ? "Android" : "none",
                    hostOf(c.url),
                  ].join(" · ")}
                </Text>
              ))}
              {ranked.failures.map((f) => (
                <Text key={f.pluginKey} style={[styles.line, styles.fail]}>{`${f.pluginKey} · ${f.reason} · ${f.ms} ms`}</Text>
              ))}
            </>
          ) : null}
```

Remove the now-unused `result` state and `HostResult` import, and add the imports: `resolveTitle` from `@/services/playback`, `ResolveResult` from `@/services/playback/resolver`, `languageOrder` and `resolveOrder` from `@/utils/languagePrefs`, `languageName`, and `fetchDetails`.

- [ ] **Step 3: Checks**

Run: `npx jest && npx tsc --noEmit && npm run lint`
Expected: green; no new lint warnings.

- [ ] **Step 4: Phone check (release, `EXPO_PUBLIC_TEST_STREAMS=1`)**

Build, install, then open More → Test streams (dev) → Plugin lab and resolve:

| TMDB | Title | Expected |
|---|---|---|
| 10378 | Big Buck Bunny | 1 playable, `ok`, ≈ 9.9 min (TMDB says 8), English, `wants hi > en` |
| 133701 | Tears of Steel | 2 playable: HLS `ok` ≈ 12.2 min; the MOV `ok` or `unverified` (depends on where its `moov` box sits) |
| 45745 | Sintel | 1 playable on Android, `dash`, "Android" |
| 550 | Fight Club | 0 playable, one `empty-fast` failure |

Then close the Lab and wait 2 minutes.
**Expected:** Bearoom's WebView renderer process is gone (`adb -s P2228K000422 shell ps -A | grep sandboxed`, checking the app user). The memory is released.

Then fire one native report and check it landed:
`curl -s -X POST "$WORKER/report" -H 'Content-Type: application/json' -d '{"providerId":"open-movies/open-movies","tmdbId":"10378","mediaType":"movie","outcome":"success","platform":"android","lane":"native","stage":"playing","ttffMs":800}'`, then
`select provider_id, lane, ttff_ms from provider_reports where provider_id = 'open-movies/open-movies' order by created_at desc limit 1;` (Supabase MCP).
**Expected:** one row.

- [ ] **Step 5: Docs and commit**

Add a "Phase 2B-1 — resolution pipeline" section to `docs/project-board.md` (gate table above, rulings). Update memory `phase2a-status` → "2B-1 done; next 2B-2 (Play routes to the native player)". Then:

```bash
git add src/screens/PluginLabScreen.tsx docs/project-board.md docs/BACKLOG.md
git commit -m "feat(dev): Plugin Lab resolves through the full pipeline; docs: Phase 2B-1 gate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
