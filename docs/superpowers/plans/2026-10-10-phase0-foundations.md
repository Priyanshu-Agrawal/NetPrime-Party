# Phase 0 — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/config` survive a Supabase outage without looking like the killswitch, give both players one neutral
contract (PlayerHandle v2), add unit-test harnesses to the app and the worker, ship remote feature flags, and get the
app running on the iOS simulator — without changing anything the user sees.

**Architecture:** The worker separates "Supabase answered with an empty list" (deliberate killswitch) from "Supabase
didn't answer" (serve the last-known-good list from Workers KV, marked `stale`). The app keeps its own last good
`/config` in MMKV and boots from it, accepting a fresh answer only if it has providers or an explicit killswitch.
Player types move out of `HijackPlayer.tsx` into `components/player/types.ts` so the Phase 2 native player can
implement the same contract.

**Tech Stack:** Expo SDK 53 · RN 0.79.6 · Redux Toolkit / RTK Query · react-native-mmkv 4 · Cloudflare Workers + Hono +
`@hono/zod-openapi` · Workers KV · jest-expo (app) · vitest (worker).

**Spec:** [`docs/superpowers/specs/2026-10-10-playback-languages-party-design.md`](../specs/2026-10-10-playback-languages-party-design.md)
— §5.2 (PlayerHandle v2), §7 F1 (config resilience), §9 Phase 0 row.

## Global Constraints

- Expo SDK 53 · RN 0.79.6 · New Architecture · Hermes. No native dependency added in this phase except dev-only test tooling.
- No live blur and no elevation/glow on any screen that plays video. No Reanimated `entering`/`exiting`/`layout` props.
- Never touch `src/ui/BearAlert.tsx` or `.codex/`.
- Operator holds all secrets; never print `PURGE_TOKEN`, Supabase keys or Cloudflare tokens into logs, commits or chat.
- `/config` with a deliberately empty provider list = listing-only app (killswitch) — must keep working.
- Every `/config` change is **additive**: old app builds in the field must keep working against the new worker.
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Scoped commits only.

## Review Focus

1. **Old app builds vs the new worker.** Installed apps don't know `stale`/`killswitch`/`flags`; the change must be
   additive and must improve them too (they now get the last-known-good list instead of `[]` on an outage).
   → Task 3 test "resolveProviders keeps the payload shape old clients read".
2. **KV missing or throwing.** No binding in `wrangler dev`, or a KV read error, must not break `/config`.
   → Task 3 test "KV read failure degrades to source none".
3. **Killswitch, then an outage.** Operator empties the list, later Supabase pauses: the app must stay empty, not
   resurrect old providers. → Task 3 test "an empty last-known-good stays a killswitch".
4. **Corrupted or foreign MMKV cache.** A half-written or older-shape cached config must be ignored, not crash boot.
   → Task 6 tests "loadCachedConfig rejects malformed JSON" and "rejects a value without a providers array".
5. **Fresh answer arriving before the cache hydrates.** The cache must never overwrite newer live data.
   → Task 6 test "hydrateFromCache is ignored after live data".

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `package.json` | modify | `test` script, `jest` config, dev deps |
| `babel.config.js` | create | Explicit `babel-preset-expo` (Expo's default) so jest can transform TS |
| `services/party/protocol.test.ts` | create | Harness smoke test on existing pure code |
| `components/player/types.ts` | create | PlayerHandle v2 + every player type (neutral, no RN imports) |
| `components/player/capabilities.ts` | create | Pure `isHijackable` / `isPartyCapable` / `hijackCapabilities` |
| `components/player/capabilities.test.ts` | create | Tests for the above |
| `components/player/providerRegistry.ts` | modify | Re-export the two predicates from `capabilities.ts` |
| `components/player/HijackPlayer.tsx` | modify | Import/re-export types; implement `getCapabilities`, `getTracks`, `seek → Promise<number>` |
| `components/player/HijackPlayer.web.tsx` | modify | Same, replacing its duplicated local types |
| `worker/package.json` | modify | `vitest`, `test` script |
| `worker/src/configResolve.ts` | create | Pure provider-outcome resolution + KV last-known-good helpers |
| `worker/src/configResolve.test.ts` | create | Tests |
| `worker/src/flags.ts` | create | Pure `parseFlags(env)` |
| `worker/src/flags.test.ts` | create | Tests |
| `worker/src/supabase.ts` | modify | `getProvidersResult` (live → edge cache + KV LKG; error → LKG) |
| `worker/src/schemas.ts` | modify | `AppConfigSchema` gains `stale`, `killswitch`, `flags` |
| `worker/src/index.ts` | modify | `/config` returns the new fields |
| `worker/wrangler.toml` | modify | `FLAG_*` vars, `CONFIG_LKG` KV binding |
| `src/types/worker.types.ts` | modify | `AppConfig` gains the optional fields; `FeatureFlags`, `DEFAULT_FLAGS` |
| `src/store/features/providers/configCache.ts` | create | Pure accept/load/save of the cached config |
| `src/store/features/providers/configCache.test.ts` | create | Tests |
| `src/store/features/providers/providersSlice.ts` | modify | `stale`, `flags`, `source`; `hydrateFromCache`; `reduceConfig` |
| `src/store/features/providers/providersSlice.test.ts` | create | Reducer tests |
| `src/store/features/providers/hooks.ts` | modify | `useFeatureFlags`, `useConfigStale` |
| `src/store/ConfigBootstrap.tsx` | modify | Hydrate from MMKV at mount; persist accepted answers |

---

### Task 1: App unit-test harness (jest-expo)

**Files:**
- Modify: `package.json` (scripts, devDependencies, `jest` key)
- Create: `babel.config.js`
- Test: `services/party/protocol.test.ts`

**Interfaces:**
- Consumes: `effectivePositionMs(a: PlaybackAnchor, serverNowMs: number): number` from `services/party/protocol.ts` (existing).
- Produces: `npm test` runs every `*.test.ts(x)` outside `worker/` with the `@/` alias resolved. Later tasks rely on it.

- [ ] **Step 1: Install the SDK-53-matched test packages**

Run: `npx expo install jest-expo jest @types/jest -- --save-dev`
Expected: `package.json` devDependencies gain `jest-expo` (~53.x), `jest` (^29.x), `@types/jest`.

- [ ] **Step 2: Add the test script and jest config to `package.json`**

In `"scripts"` add `"test": "jest"`. Add a top-level key:

```json
"jest": {
  "preset": "jest-expo",
  "moduleNameMapper": { "^@/(.*)$": "<rootDir>/$1" },
  "testPathIgnorePatterns": ["/node_modules/", "<rootDir>/worker/", "\\.old\\."]
}
```

- [ ] **Step 3: Create `babel.config.js` (Expo's default preset, made explicit so babel-jest can find it)**

```js
// Expo's default Babel setup, written out explicitly so Jest (babel-jest) uses the
// same transform as Metro. babel-preset-expo also auto-applies the Reanimated plugin.
module.exports = function (api) {
  api.cache(true);
  return { presets: ["babel-preset-expo"] };
};
```

- [ ] **Step 4: Write the smoke test**

`services/party/protocol.test.ts`:

```ts
import { effectivePositionMs, type PlaybackAnchor } from "@/services/party/protocol";

const anchor = (over: Partial<PlaybackAnchor> = {}): PlaybackAnchor => ({
  status: "playing",
  positionMs: 10_000,
  rate: 1,
  anchorServerTimeMs: 1_000_000,
  epoch: 1,
  seq: 1,
  ...over,
});

describe("effectivePositionMs", () => {
  it("advances with server time while playing", () => {
    expect(effectivePositionMs(anchor(), 1_005_000)).toBe(15_000);
  });
  it("scales by rate", () => {
    expect(effectivePositionMs(anchor({ rate: 1.1 }), 1_010_000)).toBe(21_000);
  });
  it("is frozen while paused", () => {
    expect(effectivePositionMs(anchor({ status: "paused" }), 9_999_999)).toBe(10_000);
  });
  it("never goes negative", () => {
    expect(effectivePositionMs(anchor({ positionMs: 0 }), 0)).toBe(0);
  });
});
```

- [ ] **Step 5: Run it**

Run: `npm test -- services/party/protocol.test.ts`
Expected: 4 passed. (If it fails to parse TypeScript, `babel.config.js` is not being picked up — check it is at the repo root.)

- [ ] **Step 6: Confirm Metro still bundles with the explicit Babel config**

Run: `npx expo export --platform android --output-dir "${TMPDIR:-/tmp}/bearoom-export-check"` then `rm -rf "${TMPDIR:-/tmp}/bearoom-export-check"`
Expected: "Exported" with no Babel errors.

- [ ] **Step 7: Typecheck and commit**

Run: `npx tsc --noEmit` → no errors.

```bash
git add package.json package-lock.json babel.config.js services/party/protocol.test.ts
git commit -m "test: jest-expo harness, proven on the party anchor maths" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: PlayerHandle v2 — one neutral contract for every player

**Files:**
- Create: `components/player/types.ts`, `components/player/capabilities.ts`, `components/player/capabilities.test.ts`
- Modify: `components/player/providerRegistry.ts:52-66`, `components/player/HijackPlayer.tsx:47-111` and `:409-424`,
  `components/player/HijackPlayer.web.tsx:24-65` and its `useImperativeHandle` block

**Interfaces:**
- Consumes: `Provider` type from `providerRegistry.ts` (type-only import — keeps `capabilities.ts` free of the store).
- Produces (later phases depend on these exact names):
  - `types.ts`: `PlayerEventType`, `PlayerEvent`, `FatalError`, `QualityLevel`, `EngineId`, `PlayerCapabilities`,
    `MediaTrack`, `PlayerHandle` (with `seek(seconds): Promise<number>`, `getCapabilities()`, `getTracks()`).
  - `capabilities.ts`: `isHijackable(p)`, `isPartyCapable(p)`, `NO_CAPABILITIES`, `hijackCapabilities(p)`.
  - `HijackPlayer.tsx` keeps re-exporting the moved types so its 7 consumers compile unchanged.

- [ ] **Step 1: Write the failing capabilities test**

`components/player/capabilities.test.ts`:

```ts
import { hijackCapabilities, isHijackable, isPartyCapable, NO_CAPABILITIES } from "@/components/player/capabilities";

const prov = (supported: boolean, scriptVersion: string | null) =>
  ({ hijack: { supported }, scriptVersion }) as const;

describe("party capability rules", () => {
  it("hijackable needs hijack.supported", () => {
    expect(isHijackable(prov(true, null))).toBe(true);
    expect(isHijackable(prov(false, "v1"))).toBe(false);
    expect(isHijackable(undefined)).toBe(false);
  });
  it("party-capable needs a hijack AND a served bridge script", () => {
    expect(isPartyCapable(prov(true, "videasy@abc"))).toBe(true);
    expect(isPartyCapable(prov(true, null))).toBe(false);
  });
});

describe("hijackCapabilities", () => {
  it("a bridged provider can sync, nudge rate, seek precisely and drive its menus", () => {
    expect(hijackCapabilities(prov(true, "v1"))).toEqual({
      fractionalRate: true, preciseSeek: true, audioTracks: true,
      qualitySelect: true, subtitles: false, partySync: true,
    });
  });
  it("an unbridged embed can do nothing we control", () => {
    expect(hijackCapabilities(prov(true, null))).toEqual(NO_CAPABILITIES);
    expect(hijackCapabilities(undefined)).toEqual(NO_CAPABILITIES);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- components/player/capabilities.test.ts`
Expected: FAIL — "Cannot find module '@/components/player/capabilities'".

- [ ] **Step 3: Create `components/player/types.ts`** (types moved verbatim from `HijackPlayer.tsx:47-111`, plus v2)

```ts
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
  | "tracks"; // v2: the active stream's real tracks

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
  /** HTMLMediaElement.readyState. <3 while playing ⇒ stalled/buffering. */
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
  /** v2: resolves with the LANDED position in seconds (engines that can't know it resolve with the target). */
  seek(seconds: number): Promise<number>;
  setRate(rate: number): void;
  /** Ask the provider's <video> to enter native HTML5 fullscreen. */
  fullscreen(): void;
  /** Read the provider's quality levels → emits a "quality" PlayerEvent. */
  readQuality(): void;
  /** Switch quality by label. */
  setQuality(label: string): void;
  /** Read audio/dub tracks → emits an "audio" PlayerEvent. */
  readAudio(): void;
  /** Switch audio/dub by language label (per-device, not synced across the room). */
  setAudio(label: string): void;
  /** Force a fresh load — retry the same source. */
  reload(): void;
  /** v2 */
  getCapabilities(): PlayerCapabilities;
  /** v2 */
  getTracks(): MediaTrack[];
}
```

- [ ] **Step 4: Create `components/player/capabilities.ts`**

```ts
import type { Provider } from "./providerRegistry";
import type { PlayerCapabilities } from "./types";

type ProviderLike = Pick<Provider, "hijack" | "scriptVersion"> | undefined;

/** The provider renders a <video> our injected bridge can reach. */
export function isHijackable(p: ProviderLike): boolean {
  return !!p?.hijack.supported;
}

/**
 * PARTY-capable = hijackable AND we actually serve an injection script for it
 * (`scriptVersion` set). Only these can bind the bridge and drive a synced watch
 * party; a hijackable provider with no served script injects nothing and never binds.
 */
export function isPartyCapable(p: ProviderLike): boolean {
  return isHijackable(p) && !!p?.scriptVersion;
}

export const NO_CAPABILITIES: PlayerCapabilities = {
  fractionalRate: false,
  preciseSeek: false,
  audioTracks: false,
  qualitySelect: false,
  subtitles: false,
  partySync: false,
};

/** What the WebView hijack player can do for a given provider. */
export function hijackCapabilities(p: ProviderLike): PlayerCapabilities {
  if (!isPartyCapable(p)) return NO_CAPABILITIES;
  // A bound bridge drives the provider's own <video> (rate, seek) and its menus (quality, dubs).
  return {
    fractionalRate: true,
    preciseSeek: true,
    audioTracks: true,
    qualitySelect: true,
    subtitles: false,
    partySync: true,
  };
}
```

- [ ] **Step 5: Run the test**

Run: `npm test -- components/player/capabilities.test.ts`
Expected: 4 passed.

- [ ] **Step 6: Point `providerRegistry.ts` at the shared predicates**

Delete the bodies of `isHijackable` and `isPartyCapable` (`providerRegistry.ts:52-66`, keep their doc comments out —
they now live in `capabilities.ts`) and add near the top-level exports:

```ts
export { isHijackable, isPartyCapable } from "./capabilities";
```

Keep every other function in the file unchanged (they call `isPartyCapable`; add
`import { isPartyCapable } from "./capabilities";` if the file uses it internally).

- [ ] **Step 7: Make `HijackPlayer.tsx` use the neutral types**

Replace the type block `HijackPlayer.tsx:47-111` (from `export type PlayerEventType` through the closing `}` of
`export interface PlayerHandle`) with:

```ts
import { hijackCapabilities } from "./capabilities";
import type { FatalError, MediaTrack, PlayerCapabilities, PlayerEvent, PlayerHandle } from "./types";
export type {
  EngineId,
  FatalError,
  MediaTrack,
  PlayerCapabilities,
  PlayerEvent,
  PlayerEventType,
  PlayerHandle,
  QualityLevel,
} from "./types";
```

(Place the `import` lines with the other imports at the top of the file; leave the re-export where the types were.)

In the `useImperativeHandle` block (`HijackPlayer.tsx:409-424`) replace the `seek` entry and add the two v2 methods:

```ts
        // The WebView can't report where the provider's <video> actually landed,
        // so v2's landed-position promise resolves with the requested target.
        seek: (seconds: number) => {
          cmd({ action: "seek", time: seconds });
          return Promise.resolve(seconds);
        },
        getCapabilities: (): PlayerCapabilities => hijackCapabilities(getProvider(providerId)),
        getTracks: (): MediaTrack[] => [],
```

and add `providerId` to that hook's dependency array: `[cmd, manualRetry, providerId]`.

- [ ] **Step 8: Make `HijackPlayer.web.tsx` use the same types**

Delete its local `PlayerEventType`, `QualityLevel`, `PlayerEvent` and `PlayerHandle` declarations (`:24-65`) and add:

```ts
import { hijackCapabilities } from "./capabilities";
import type { MediaTrack, PlayerCapabilities, PlayerEvent, PlayerHandle } from "./types";
export type { PlayerEvent, PlayerEventType, PlayerHandle, QualityLevel } from "./types";
```

In its `useImperativeHandle` replace `seek` and add the v2 methods and `reload` (the web twin never had one):

```ts
      reload: () => {
        const f = iframeRef.current;
        if (f) f.src = f.src; // re-navigating the iframe is a full reload of the embed
      },
      seek: (seconds: number) => {
        try {
          iframeRef.current?.contentWindow?.postMessage({ action: "seek", time: seconds }, "*");
        } catch {}
        return Promise.resolve(seconds);
      },
      getCapabilities: (): PlayerCapabilities => hijackCapabilities(getProvider(providerId)),
      getTracks: (): MediaTrack[] => [],
```

(`getProvider` is already imported from `./providerRegistry` in this file; if not, add it to that import.)

- [ ] **Step 9: Typecheck, lint, test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no type errors (every existing `seek(...)` caller ignores the return value, so `void → Promise<number>`
is compatible), lint clean, all tests pass.

- [ ] **Step 10: Commit**

```bash
git add components/player/types.ts components/player/capabilities.ts components/player/capabilities.test.ts components/player/providerRegistry.ts components/player/HijackPlayer.tsx components/player/HijackPlayer.web.tsx
git commit -m "refactor(player): one neutral PlayerHandle v2 for every engine" -m "Types move out of the WebView player into components/player/types.ts (re-exported, so the seven consumers compile unchanged) and gain capabilities, tracks and a landed-position seek. The web twin's duplicated copy goes away." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Worker — last-known-good providers and an explicit killswitch

**Files:**
- Modify: `worker/package.json`
- Create: `worker/src/configResolve.ts`, `worker/src/configResolve.test.ts`
- Modify: `worker/src/supabase.ts:23-50` (Bindings) and `:141-200` (`getProviders`), `worker/src/schemas.ts:130-141`,
  `worker/src/index.ts:121-134`

**Interfaces:**
- Consumes: `Provider` (type) from `worker/src/schemas.ts`.
- Produces:
  - `resolveProviders(live: LiveOutcome, lkg: LkgRecord | null): ProvidersResult`
  - `parseLkg(raw: string | null): LkgRecord | null`, `serializeLkg(providers, now): string`
  - `writeLkgIfChanged(kv: KvLike, providers, now): Promise<boolean>`, `LKG_KEY = "providers:lkg:v1"`
  - `getProvidersResult(env, ctx): Promise<ProvidersResult>` in `supabase.ts`; `getProviders` stays and returns `.providers`.
  - `/config` JSON gains `stale: boolean`, `killswitch: boolean`.

- [ ] **Step 1: Add vitest to the worker**

Run: `cd worker && npm install -D vitest@^3 && cd ..`
In `worker/package.json` `"scripts"` add `"test": "vitest run"`.

- [ ] **Step 2: Write the failing tests**

`worker/src/configResolve.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  LKG_KEY,
  parseLkg,
  resolveProviders,
  serializeLkg,
  writeLkgIfChanged,
  type KvLike,
} from "./configResolve";
import type { Provider } from "./schemas";

const p = (id: string) => ({ id }) as unknown as Provider;
const now = new Date("2026-10-10T12:00:00Z");

function fakeKv(initial: Record<string, string> = {}) {
  const store = { ...initial };
  const puts: string[] = [];
  const kv: KvLike = {
    get: async (k) => store[k] ?? null,
    put: async (k, v) => {
      store[k] = v;
      puts.push(k);
    },
  };
  return { kv, store, puts };
}

describe("resolveProviders", () => {
  it("serves a live non-empty answer as-is", () => {
    expect(resolveProviders({ ok: true, providers: [p("a")] }, null)).toEqual({
      providers: [p("a")], stale: false, killswitch: false, source: "live",
    });
  });
  it("treats a live EMPTY answer as the deliberate killswitch", () => {
    expect(resolveProviders({ ok: true, providers: [] }, { providers: [p("a")], savedAt: "" })).toEqual({
      providers: [], stale: false, killswitch: true, source: "live",
    });
  });
  it("serves last-known-good when Supabase did not answer", () => {
    expect(resolveProviders({ ok: false, reason: "timeout" }, { providers: [p("a")], savedAt: "x" })).toEqual({
      providers: [p("a")], stale: true, killswitch: false, source: "lkg",
    });
  });
  it("an empty last-known-good stays a killswitch through an outage", () => {
    expect(resolveProviders({ ok: false, reason: "503" }, { providers: [], savedAt: "x" })).toEqual({
      providers: [], stale: true, killswitch: true, source: "lkg",
    });
  });
  it("KV read failure degrades to source none, never a killswitch", () => {
    expect(resolveProviders({ ok: false, reason: "503" }, null)).toEqual({
      providers: [], stale: true, killswitch: false, source: "none",
    });
  });
  it("keeps the payload shape old clients read (providers is always an array)", () => {
    for (const r of [
      resolveProviders({ ok: false, reason: "x" }, null),
      resolveProviders({ ok: true, providers: [] }, null),
    ]) expect(Array.isArray(r.providers)).toBe(true);
  });
});

describe("parseLkg", () => {
  it("round-trips serializeLkg", () => {
    expect(parseLkg(serializeLkg([p("a")], now))).toEqual({ providers: [p("a")], savedAt: now.toISOString() });
  });
  it("rejects null, junk and shapes without a providers array", () => {
    expect(parseLkg(null)).toBeNull();
    expect(parseLkg("{not json")).toBeNull();
    expect(parseLkg(JSON.stringify({ savedAt: "x" }))).toBeNull();
  });
});

describe("writeLkgIfChanged", () => {
  it("writes when nothing is stored", async () => {
    const { kv, store } = fakeKv();
    expect(await writeLkgIfChanged(kv, [p("a")], now)).toBe(true);
    expect(parseLkg(store[LKG_KEY])?.providers).toEqual([p("a")]);
  });
  it("skips the write when the list is unchanged (KV write budget)", async () => {
    const { kv, puts } = fakeKv({ [LKG_KEY]: serializeLkg([p("a")], now) });
    expect(await writeLkgIfChanged(kv, [p("a")], new Date())).toBe(false);
    expect(puts).toHaveLength(0);
  });
  it("writes when the list changed, including to empty (a new killswitch)", async () => {
    const { kv, puts } = fakeKv({ [LKG_KEY]: serializeLkg([p("a")], now) });
    expect(await writeLkgIfChanged(kv, [], now)).toBe(true);
    expect(puts).toEqual([LKG_KEY]);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd worker && npm test; cd ..`
Expected: FAIL — cannot resolve `./configResolve`.

- [ ] **Step 4: Implement `worker/src/configResolve.ts`**

```ts
/**
 * @file configResolve.ts
 * Pure decisions behind GET /config's provider list.
 *
 * "Supabase answered with an empty list" and "Supabase didn't answer" used to look
 * identical (both became `providers: []`), so a paused Free-tier project silently
 * looked like the operator's killswitch and every app went dark. Now:
 *   - a successful answer is the truth — an EMPTY one is the deliberate killswitch;
 *   - no answer → serve the last-known-good list from Workers KV, marked `stale`.
 */
import type { Provider } from "./schemas";

export type LiveOutcome = { ok: true; providers: Provider[] } | { ok: false; reason: string };

export interface LkgRecord {
  providers: Provider[];
  savedAt: string;
}

export interface ProvidersResult {
  providers: Provider[];
  /** True when Supabase did not answer: we're serving last-known-good (or nothing). */
  stale: boolean;
  /** True only when the list is deliberately empty (a successful empty answer, or an LKG of one). */
  killswitch: boolean;
  source: "live" | "lkg" | "none";
}

/** Minimal KV surface (a Workers KVNamespace satisfies it). */
export type KvLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
};

export const LKG_KEY = "providers:lkg:v1";

export function resolveProviders(live: LiveOutcome, lkg: LkgRecord | null): ProvidersResult {
  if (live.ok) {
    return { providers: live.providers, stale: false, killswitch: live.providers.length === 0, source: "live" };
  }
  if (lkg) {
    return { providers: lkg.providers, stale: true, killswitch: lkg.providers.length === 0, source: "lkg" };
  }
  return { providers: [], stale: true, killswitch: false, source: "none" };
}

export function serializeLkg(providers: Provider[], now: Date): string {
  return JSON.stringify({ providers, savedAt: now.toISOString() });
}

export function parseLkg(raw: string | null): LkgRecord | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<LkgRecord>;
    return Array.isArray(v.providers) ? { providers: v.providers, savedAt: String(v.savedAt ?? "") } : null;
  } catch {
    return null;
  }
}

/** Persist the list only when it changed — KV's free tier allows ~1k writes/day. */
export async function writeLkgIfChanged(kv: KvLike, providers: Provider[], now: Date): Promise<boolean> {
  const prev = parseLkg(await kv.get(LKG_KEY));
  if (prev && JSON.stringify(prev.providers) === JSON.stringify(providers)) return false;
  await kv.put(LKG_KEY, serializeLkg(providers, now));
  return true;
}
```

- [ ] **Step 5: Run the tests**

Run: `cd worker && npm test; cd ..`
Expected: 11 passed.

- [ ] **Step 6: Wire it into `supabase.ts`**

Add to the `Bindings` type (`supabase.ts:23`):

```ts
  /** Durable last-known-good provider list (Workers KV). Optional: without it an
   *  outage degrades to an empty, non-killswitch list. */
  CONFIG_LKG?: KVNamespace;
```

Add the import at the top: `import { LKG_KEY, parseLkg, resolveProviders, writeLkgIfChanged, type LiveOutcome, type LkgRecord, type ProvidersResult } from "./configResolve";`

Replace `getProviders` (`supabase.ts:141-200`, the whole function and its doc comment) with:

```ts
/** One Supabase read of the enabled providers, health-ordered. Never throws. */
async function fetchLiveProviders(env: Bindings): Promise<LiveOutcome> {
  const { url, key } = resolveCredentials(env);
  if (!url || !key) return { ok: false, reason: "missing-credentials" };
  // Only enabled providers leave the edge. The heavy `bridge_script` body is never
  // sent here (served separately via /scripts); only its version tag.
  const cols = "id,name,enabled,priority,url_movie,url_tv,allowed_domain,hijack,script_version";
  const endpoint = `${url}/rest/v1/providers?select=${cols}&enabled=eq.true&order=priority.asc`;
  try {
    const res = await fetch(endpoint, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000), // never let a hung Supabase call hang the worker
    });
    if (!res.ok) return { ok: false, reason: `supabase-${res.status}` };
    const raw = (await res.json()) as Provider[];
    return { ok: true, providers: reorderByHealth(raw, await fetchHealth(env)) };
  } catch (err) {
    console.error("Supabase request failed or timed out:", err);
    return { ok: false, reason: "network" };
  }
}

/**
 * The provider list for /config, with outage awareness.
 * Live answers are edge-cached 60 s (shared with /scrape) and mirrored to KV as
 * last-known-good; when Supabase doesn't answer we serve that copy, marked stale.
 */
export async function getProvidersResult(env: Bindings, ctx: Waitable): Promise<ProvidersResult> {
  const cache = caches.default;
  const hit = await cache.match(PROVIDERS_CACHE_KEY);
  if (hit) return resolveProviders({ ok: true, providers: (await hit.json()) as Provider[] }, null);

  const live = await fetchLiveProviders(env);
  if (live.ok) {
    const response = new Response(JSON.stringify(live.providers), {
      headers: { "Content-Type": "application/json", "Cache-Control": "s-maxage=60" },
    });
    ctx.waitUntil(cache.put(PROVIDERS_CACHE_KEY, response));
    if (env.CONFIG_LKG) {
      ctx.waitUntil(
        writeLkgIfChanged(env.CONFIG_LKG, live.providers, new Date()).catch((e) =>
          console.error("LKG write failed:", e),
        ),
      );
    }
    return resolveProviders(live, null);
  }

  let lkg: LkgRecord | null = null;
  try {
    lkg = env.CONFIG_LKG ? parseLkg(await env.CONFIG_LKG.get(LKG_KEY)) : null;
  } catch (e) {
    console.error("LKG read failed:", e);
  }
  console.error(`Serving ${lkg ? "last-known-good" : "no"} providers: ${live.reason}`);
  return resolveProviders(live, lkg);
}

/** Back-compat for /scrape: just the list (now also survives outages via LKG). */
export async function getProviders(env: Bindings, ctx: Waitable): Promise<Provider[]> {
  return (await getProvidersResult(env, ctx)).providers;
}
```

- [ ] **Step 7: Extend the schema and the route**

`worker/src/schemas.ts`, inside `AppConfigSchema`'s object after `providers`:

```ts
    /** True when Supabase didn't answer and this is the last-known-good list. */
    stale: z.boolean().optional().openapi({ example: false }),
    /** True only when the operator deliberately emptied the list (store-review killswitch). */
    killswitch: z.boolean().optional().openapi({ example: false }),
```

`worker/src/index.ts`: change the import from `./supabase` to include `getProvidersResult`, and in the `/config`
handler replace `const providers = await getProviders(c.env, c.executionCtx);` and the `c.json(...)` call with:

```ts
  const { providers, stale, killswitch } = await getProvidersResult(c.env, c.executionCtx);
```

```ts
  return c.json(
    { appVersion: APP_VERSION, maintenanceMode: MAINTENANCE_MODE, region, providers, stale, killswitch },
    200,
  );
```

(Keep `getProviders` imported — `/scrape` still uses it.)

- [ ] **Step 8: Typecheck and test**

Run: `cd worker && npm run typecheck && npm test; cd ..`
Expected: no type errors; 11 passed.

- [ ] **Step 9: Commit**

```bash
git add worker/package.json worker/package-lock.json worker/src/configResolve.ts worker/src/configResolve.test.ts worker/src/supabase.ts worker/src/schemas.ts worker/src/index.ts
git commit -m "fix(worker): a Supabase outage no longer looks like the killswitch" -m "On 2026-10-10 a paused Free-tier project turned /config into providers:[], identical to the operator's deliberate empty list, and every app went dark. A successful empty answer is now the explicit killswitch; no answer serves the last-known-good list from KV, marked stale. Additive fields only, so installed apps get the fix too." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Worker — remote feature flags in `/config`

**Files:**
- Create: `worker/src/flags.ts`, `worker/src/flags.test.ts`
- Modify: `worker/src/supabase.ts` (Bindings), `worker/src/schemas.ts`, `worker/src/index.ts`, `worker/wrangler.toml`

**Interfaces:**
- Produces: `parseFlags(env): FeatureFlags` with `FeatureFlags = { embedApiLane: boolean; nativeLane: boolean; pluginHost: boolean }`;
  `/config.flags` carries it. Phases 1–2 gate their lanes on these names.

- [ ] **Step 1: Write the failing test**

`worker/src/flags.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseFlags } from "./flags";

describe("parseFlags", () => {
  it("defaults every lane off", () => {
    expect(parseFlags({})).toEqual({ embedApiLane: false, nativeLane: false, pluginHost: false });
  });
  it("accepts 1/true/on/yes in any case, with whitespace", () => {
    expect(parseFlags({ FLAG_EMBED_API_LANE: "1", FLAG_NATIVE_LANE: " TRUE ", FLAG_PLUGIN_HOST: "on" })).toEqual({
      embedApiLane: true, nativeLane: true, pluginHost: true,
    });
  });
  it("treats anything else as off (a typo must never switch a lane on)", () => {
    expect(parseFlags({ FLAG_EMBED_API_LANE: "0", FLAG_NATIVE_LANE: "tru", FLAG_PLUGIN_HOST: "" }).nativeLane).toBe(false);
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `cd worker && npm test -- flags; cd ..` → FAIL (module not found).

- [ ] **Step 3: Implement `worker/src/flags.ts`**

```ts
/**
 * @file flags.ts
 * Remote on/off switches for new playback lanes, sent in /config.flags. Set as
 * plain worker vars (wrangler.toml [vars] or the Cloudflare dashboard) so a lane
 * can be turned off for every installed app without an app release.
 */
export interface FeatureFlags {
  embedApiLane: boolean;
  nativeLane: boolean;
  pluginHost: boolean;
}

const ENV_NAMES: Record<keyof FeatureFlags, string> = {
  embedApiLane: "FLAG_EMBED_API_LANE",
  nativeLane: "FLAG_NATIVE_LANE",
  pluginHost: "FLAG_PLUGIN_HOST",
};

const isOn = (v: unknown): boolean => typeof v === "string" && /^(1|true|on|yes)$/i.test(v.trim());

export function parseFlags(env: Record<string, unknown>): FeatureFlags {
  return {
    embedApiLane: isOn(env[ENV_NAMES.embedApiLane]),
    nativeLane: isOn(env[ENV_NAMES.nativeLane]),
    pluginHost: isOn(env[ENV_NAMES.pluginHost]),
  };
}
```

- [ ] **Step 4: Run tests** — `cd worker && npm test; cd ..` → 14 passed.

- [ ] **Step 5: Wire it**

`supabase.ts` Bindings, add:

```ts
  /** Remote lane switches ("1"/"true"/"on"/"yes" = on). See flags.ts. */
  FLAG_EMBED_API_LANE?: string;
  FLAG_NATIVE_LANE?: string;
  FLAG_PLUGIN_HOST?: string;
```

`schemas.ts`, above `AppConfigSchema`:

```ts
export const FeatureFlagsSchema = z
  .object({
    embedApiLane: z.boolean().openapi({ example: false }),
    nativeLane: z.boolean().openapi({ example: false }),
    pluginHost: z.boolean().openapi({ example: false }),
  })
  .openapi("FeatureFlags");
```

and inside `AppConfigSchema` after `killswitch`: `flags: FeatureFlagsSchema.optional(),`

`index.ts`: `import { parseFlags } from "./flags";` and add `flags: parseFlags(c.env as unknown as Record<string, unknown>)`
to the `/config` `c.json({...})` object.

`wrangler.toml`, replace the `[vars]` block's body with:

```toml
[vars]
# SUPABASE_URL = "https://your-project-id.supabase.co"
# Remote lane switches sent in /config.flags ("1" = on). Flip in the Cloudflare
# dashboard to turn a lane off for every installed app without a release.
FLAG_EMBED_API_LANE = "0"
FLAG_NATIVE_LANE = "0"
FLAG_PLUGIN_HOST = "0"
```

- [ ] **Step 6: Typecheck, test, commit**

Run: `cd worker && npm run typecheck && npm test; cd ..` → clean, 14 passed.

```bash
git add worker/src/flags.ts worker/src/flags.test.ts worker/src/supabase.ts worker/src/schemas.ts worker/src/index.ts worker/wrangler.toml
git commit -m "feat(worker): remote lane switches in /config.flags" -m "Every new playback lane ships dark and can be turned off for all installed apps from the Cloudflare dashboard, no release needed." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Worker — create the KV namespace and deploy

**Files:**
- Modify: `worker/wrangler.toml` (KV binding)

This is a production change to the live worker every installed app talks to. Everything it adds is additive and was
unit-tested in Tasks 3–4.

- [ ] **Step 1: Create the namespace**

Run: `cd worker && npx wrangler kv namespace create CONFIG_LKG; cd ..`
Expected: output containing `id = "<32-hex id>"`. If it fails with a permissions error, the API token lacks
"Workers KV Storage: Edit" — stop and tell the owner exactly that (the code already degrades without KV).

- [ ] **Step 2: Bind it** — append to `worker/wrangler.toml`, using the id printed in Step 1:

```toml
# Durable last-known-good provider list (see src/configResolve.ts). Served when
# Supabase doesn't answer, so a paused project can't empty every app.
[[kv_namespaces]]
binding = "CONFIG_LKG"
id = "<the id printed by step 1>"
```

- [ ] **Step 3: Deploy**

Run: `cd worker && npx wrangler deploy; cd ..`
Expected: "Deployed netprime-worker" with a version id.

- [ ] **Step 4: Verify the live shape**

Run:
```bash
curl -s https://netprime-worker.spiderfan-no1.workers.dev/config | python3 -c 'import sys,json;d=json.load(sys.stdin);print({k:d.get(k) for k in ("stale","killswitch","flags")}, "providers:", len(d["providers"]))'
```
Expected: `{'stale': False, 'killswitch': False, 'flags': {'embedApiLane': False, 'nativeLane': False, 'pluginHost': False}} providers: 14`

- [ ] **Step 5: Force a fresh Supabase read so KV gets its first copy, then confirm it**

Run (reads the token from `.env.local` without printing or sourcing the file):
```bash
PURGE_TOKEN=$(grep '^PURGE_TOKEN=' .env.local | cut -d= -f2- | tr -d '"')
curl -s -X POST -H "x-purge-token: $PURGE_TOKEN" https://netprime-worker.spiderfan-no1.workers.dev/cache/purge >/dev/null
curl -s https://netprime-worker.spiderfan-no1.workers.dev/config >/dev/null; sleep 3
cd worker && npx wrangler kv key get --binding CONFIG_LKG "providers:lkg:v1" --remote | head -c 120; echo; cd ..
```
Expected: `{"providers":[{"id":"videasy",...` (the first 120 characters of the stored list).

- [ ] **Step 6: Commit**

```bash
git add worker/wrangler.toml
git commit -m "chore(worker): bind the CONFIG_LKG namespace and deploy" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: App — keep the last good `/config` and boot from it

**Files:**
- Modify: `src/types/worker.types.ts:30-43`
- Create: `src/store/features/providers/configCache.ts`, `src/store/features/providers/configCache.test.ts`,
  `src/store/features/providers/providersSlice.test.ts`
- Modify: `src/store/features/providers/providersSlice.ts`, `src/store/features/providers/hooks.ts`,
  `src/store/ConfigBootstrap.tsx`

**Interfaces:**
- Consumes: `/config` fields from Tasks 3–4; `UniversalStorage` type from `services/storage/universalStorage.types.ts`.
- Produces: `shouldAcceptConfig`, `loadCachedConfig`, `saveCachedConfig`, `CONFIG_CACHE_KEY`; slice action
  `hydrateFromCache(AppConfig)` and pure `reduceConfig(state, payload): ProvidersState`; hooks `useFeatureFlags()`,
  `useConfigStale()`; types `FeatureFlags`, `DEFAULT_FLAGS`.

- [ ] **Step 1: Extend the app's `AppConfig` type** (`src/types/worker.types.ts`, inside `interface AppConfig` after `homeFeed`, plus two new exports above it)

```ts
/** Remote lane switches from /config.flags (worker/src/flags.ts). */
export interface FeatureFlags {
    embedApiLane: boolean;
    nativeLane: boolean;
    pluginHost: boolean;
}

export const DEFAULT_FLAGS: FeatureFlags = { embedApiLane: false, nativeLane: false, pluginHost: false };
```

```ts
    /** True when the worker couldn't reach Supabase and sent its last-known-good list. */
    stale?: boolean;
    /** True only when the operator deliberately emptied the list. Absent on old workers. */
    killswitch?: boolean;
    flags?: FeatureFlags;
```

- [ ] **Step 2: Write the failing cache tests**

`src/store/features/providers/configCache.test.ts`:

```ts
import {
  CONFIG_CACHE_KEY,
  loadCachedConfig,
  saveCachedConfig,
  shouldAcceptConfig,
} from "@/src/store/features/providers/configCache";
import type { AppConfig } from "@/src/types/worker.types";

const row = { id: "vidfast" } as unknown as AppConfig["providers"][number];
const cfg = (over: Partial<AppConfig> = {}): AppConfig => ({
  appVersion: "2.1.0", maintenanceMode: false, providers: [row], ...over,
});

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getString: (k: string) => map.get(k),
    set: (k: string, v: string | number | boolean) => void map.set(k, String(v)),
  };
}

describe("shouldAcceptConfig", () => {
  it("accepts a list with providers", () => expect(shouldAcceptConfig(cfg())).toBe(true));
  it("accepts an explicit killswitch", () =>
    expect(shouldAcceptConfig(cfg({ providers: [], killswitch: true }))).toBe(true));
  it("rejects an empty list without a killswitch (an outage, or an old worker's error path)", () =>
    expect(shouldAcceptConfig(cfg({ providers: [] }))).toBe(false));
});

describe("loadCachedConfig", () => {
  it("returns null when nothing is stored", () => expect(loadCachedConfig(fakeStorage())).toBeNull());
  it("round-trips a saved config", () => {
    const s = fakeStorage();
    saveCachedConfig(cfg(), s);
    expect(loadCachedConfig(s)?.providers).toEqual([row]);
  });
  it("rejects malformed JSON (a half-written cache)", () =>
    expect(loadCachedConfig(fakeStorage({ [CONFIG_CACHE_KEY]: '{"providers":[' }))).toBeNull());
  it("rejects a value without a providers array (an older or foreign shape)", () =>
    expect(loadCachedConfig(fakeStorage({ [CONFIG_CACHE_KEY]: JSON.stringify({ maintenanceMode: false }) }))).toBeNull());
});

describe("saveCachedConfig", () => {
  it("never persists an outage answer", () => {
    const s = fakeStorage();
    saveCachedConfig(cfg({ providers: [] }), s);
    saveCachedConfig(cfg({ stale: true }), s);
    expect(s.map.size).toBe(0);
  });
  it("persists a killswitch so the app stays empty offline too", () => {
    const s = fakeStorage();
    saveCachedConfig(cfg({ providers: [], killswitch: true }), s);
    expect(loadCachedConfig(s)?.killswitch).toBe(true);
  });
  it("swallows a storage failure", () => {
    const s = { getString: () => undefined, set: () => { throw new Error("disk full"); } };
    expect(() => saveCachedConfig(cfg(), s)).not.toThrow();
  });
});
```

- [ ] **Step 3: Run to fail** — `npm test -- configCache` → FAIL (module not found).

- [ ] **Step 4: Implement `src/store/features/providers/configCache.ts`**

```ts
/**
 * The device's own copy of the last good /config, so a worker or Supabase outage
 * never empties the app. Pure functions over an injected storage (MMKV in the
 * app, a Map in tests).
 */
import type { UniversalStorage } from "@/services/storage/universalStorage.types";
import type { AppConfig } from "@/src/types/worker.types";

export const CONFIG_CACHE_KEY = "config.lkg.v1";

/**
 * Is this /config answer the operator's truth? A list with providers is; so is a
 * deliberate killswitch. An empty list WITHOUT `killswitch` is an outage (or an
 * old worker's error path) — keep what we have instead.
 */
export function shouldAcceptConfig(cfg: Pick<AppConfig, "providers" | "killswitch">): boolean {
  return (cfg.providers?.length ?? 0) > 0 || cfg.killswitch === true;
}

export function loadCachedConfig(storage: Pick<UniversalStorage, "getString">): AppConfig | null {
  const raw = storage.getString(CONFIG_CACHE_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<AppConfig> | null;
    return v && Array.isArray(v.providers) && typeof v.maintenanceMode === "boolean" ? (v as AppConfig) : null;
  } catch {
    return null;
  }
}

/** Persist only fresh, accepted answers — never an outage or a stale copy. */
export function saveCachedConfig(cfg: AppConfig, storage: Pick<UniversalStorage, "set">): void {
  if (cfg.stale || !shouldAcceptConfig(cfg)) return;
  try {
    storage.set(CONFIG_CACHE_KEY, JSON.stringify(cfg));
  } catch {
    /* non-fatal: we re-save on the next good answer */
  }
}
```

- [ ] **Step 5: Run** — `npm test -- configCache` → 10 passed.

- [ ] **Step 6: Write the failing reducer tests**

`src/store/features/providers/providersSlice.test.ts`:

```ts
import reducer, { hydrateFromCache, reduceConfig } from "@/src/store/features/providers/providersSlice";
import type { AppConfig } from "@/src/types/worker.types";

const row = (id: string) =>
  ({ id, name: id, enabled: true, priority: 1, url_movie: `https://${id}/m/\${id}`, url_tv: null,
     allowed_domain: `https://${id}`, hijack: { supported: false }, script_version: null }) as unknown as AppConfig["providers"][number];
const cfg = (over: Partial<AppConfig> = {}): AppConfig => ({
  appVersion: "2.1.0", maintenanceMode: false, providers: [row("a")], ...over,
});
const initial = () => reducer(undefined, { type: "@@init" });

describe("providers slice", () => {
  it("hydrates from the device cache on a cold start", () => {
    const s = reducer(initial(), hydrateFromCache(cfg()));
    expect(s.providers.map((p) => p.id)).toEqual(["a"]);
    expect(s.source).toBe("cache");
  });
  it("a live answer replaces the cached one", () => {
    const s = reduceConfig(reducer(initial(), hydrateFromCache(cfg())), cfg({ providers: [row("b")] }));
    expect(s.providers.map((p) => p.id)).toEqual(["b"]);
    expect(s.source).toBe("live");
    expect(s.stale).toBe(false);
  });
  it("hydrateFromCache is ignored after live data", () => {
    const live = reduceConfig(initial(), cfg({ providers: [row("b")] }));
    expect(reducer(live, hydrateFromCache(cfg())).providers.map((p) => p.id)).toEqual(["b"]);
  });
  it("an outage answer keeps the cached providers and marks them stale", () => {
    const s = reduceConfig(reducer(initial(), hydrateFromCache(cfg())), cfg({ providers: [] }));
    expect(s.providers.map((p) => p.id)).toEqual(["a"]);
    expect(s.stale).toBe(true);
  });
  it("an explicit killswitch empties the app", () => {
    const s = reduceConfig(reducer(initial(), hydrateFromCache(cfg())), cfg({ providers: [], killswitch: true }));
    expect(s.providers).toEqual([]);
  });
  it("a worker's last-known-good answer is applied but flagged stale", () => {
    const s = reduceConfig(initial(), cfg({ stale: true }));
    expect(s.providers.map((p) => p.id)).toEqual(["a"]);
    expect(s.stale).toBe(true);
  });
  it("flags default off and follow /config", () => {
    expect(initial().flags.nativeLane).toBe(false);
    const s = reduceConfig(initial(), cfg({ flags: { embedApiLane: true, nativeLane: false, pluginHost: false } }));
    expect(s.flags.embedApiLane).toBe(true);
  });
});
```

- [ ] **Step 7: Run to fail** — `npm test -- providersSlice` → FAIL (`hydrateFromCache`/`reduceConfig` not exported).

- [ ] **Step 8: Update `providersSlice.ts`**

Add imports:

```ts
import { DEFAULT_FLAGS, type AppConfig, type FeatureFlags } from "@/src/types/worker.types";
import { shouldAcceptConfig } from "./configCache";
```

Extend `ProvidersState` and `initialState`:

```ts
    /** True when what we show came from a cache (device or worker LKG), not a fresh Supabase read. */
    stale: boolean;
    /** Remote lane switches (/config.flags). Default all off. */
    flags: FeatureFlags;
    /** Where the current data came from. The device cache never overwrites "live". */
    source: "none" | "cache" | "live";
```

```ts
    stale: false,
    flags: DEFAULT_FLAGS,
    source: "none",
```

Add, above `createSlice`:

```ts
function applyConfig(state: ProvidersState, cfg: AppConfig): void {
    state.providers = remoteToProviders(cfg.providers ?? []);
    state.maintenanceMode = cfg.maintenanceMode;
    state.region = cfg.region ?? null;
    state.flags = cfg.flags ?? DEFAULT_FLAGS;
}

/**
 * Apply a /config answer. NO baked-in fallback still holds — but an empty list is
 * only believed when it's an explicit killswitch; an outage answer keeps whatever
 * we already show (device cache or the previous live list) and marks it stale.
 * Builds a brand-new object (no spread of an Immer draft), so it is safe both as a
 * pure function in tests and as a case-reducer return value.
 */
export function reduceConfig(state: ProvidersState, payload: AppConfig): ProvidersState {
    if (!shouldAcceptConfig(payload)) {
        return { ...state, stale: true };
    }
    return {
        providers: remoteToProviders(payload.providers ?? []),
        maintenanceMode: payload.maintenanceMode,
        region: payload.region ?? null,
        flags: payload.flags ?? DEFAULT_FLAGS,
        source: "live",
        stale: payload.stale === true,
    };
}
```

Add to `reducers`:

```ts
        /** Cold-start hydration from the device's last good /config (ConfigBootstrap). */
        hydrateFromCache: (state, action: PayloadAction<AppConfig>) => {
            if (state.source !== "none") return; // never overwrite fresher data
            applyConfig(state, action.payload);
            state.source = "cache";
            state.stale = true;
        },
```

Replace the `matchFulfilled` matcher body with (the outage branch mutates the draft in place; only the accept
branch returns a new object, which never contains a draft):

```ts
            (state, { payload }) => {
                if (!shouldAcceptConfig(payload)) {
                    state.stale = true;
                    return;
                }
                return reduceConfig(state, payload);
            },
```

Export
`hydrateFromCache` alongside the existing actions, and export the state type: `export type { ProvidersState };`.

- [ ] **Step 9: Run** — `npm test -- providersSlice` → 7 passed.

- [ ] **Step 10: Hooks** — append to `src/store/features/providers/hooks.ts`:

```ts
import type { FeatureFlags } from "@/src/types/worker.types";

/** Remote lane switches from /config (all off until the operator turns one on). */
export function useFeatureFlags(): FeatureFlags {
    return useAppSelector((s) => s.providers.flags);
}

/** True while the app is running on a cached /config (worker or Supabase outage). */
export function useConfigStale(): boolean {
    return useAppSelector((s) => s.providers.stale);
}
```

(Move the new `import type` line to the top with the other imports.)

- [ ] **Step 11: Wire `ConfigBootstrap.tsx`**

```tsx
import { useEffect } from "react";
import { useGetConfigQuery } from "@/src/store/services/workerApi";
import { syncScripts } from "@/src/scripts/bridgeCache";
import { useAppDispatch } from "@/src/store/hooks";
import { hydrateFromCache } from "@/src/store/features/providers/providersSlice";
import { loadCachedConfig, saveCachedConfig } from "@/src/store/features/providers/configCache";
import { universalStorage } from "@/services/storage/universalStorage";
```

Inside the component, before the existing `useEffect`:

```tsx
    const dispatch = useAppDispatch();

    // Cold start: show the last good /config immediately (and through any outage).
    // The reducer ignores this if a live answer already landed.
    useEffect(() => {
        const cached = loadCachedConfig(universalStorage);
        if (cached) dispatch(hydrateFromCache(cached));
    }, [dispatch]);
```

and as the first line inside the existing `useEffect(() => { ... }, [data])`:

```tsx
        if (data) saveCachedConfig(data, universalStorage);
```

Update the file's doc comment: add a paragraph "It also keeps the device's last good /config in MMKV and hydrates from
it at launch, so an outage never empties the app (see configCache.ts)."

- [ ] **Step 12: Typecheck, lint, full test run**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean; all suites pass (protocol 4, capabilities 4, configCache 10, providersSlice 7).

- [ ] **Step 13: Commit**

```bash
git add src/types/worker.types.ts src/store/features/providers/configCache.ts src/store/features/providers/configCache.test.ts src/store/features/providers/providersSlice.ts src/store/features/providers/providersSlice.test.ts src/store/features/providers/hooks.ts src/store/ConfigBootstrap.tsx
git commit -m "fix(config): the app keeps its last good /config and boots from it" -m "An empty provider list is only believed when the worker marks it an explicit killswitch; an outage answer keeps what the app already shows and marks it stale. Flags from /config land in the store, all off by default." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Gate — Android emulator, live and through a simulated outage

No code; this proves the Phase 0 gate. Uses the running emulator (`emulator-5554`) and Metro.

- [ ] **Step 1: Live smoke.** Restart Metro (`npx expo start`), `adb -s emulator-5554 reverse tcp:8081 tcp:8081`,
  launch `bearoom://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081`. Wait for "Android Bundled".
  Check with metro-mcp `get_errors` (expect none) and a screenshot of Home (catalog renders). Open Fight Club
  (`bearoom://movie/550`) → Play → error card → "Try another source" → VidFast plays (as before Phase 0).
- [ ] **Step 2: Confirm the cache was written.** metro-mcp `get_storage_item` (or `evaluate_js`) for key
  `config.lkg.v1` → a JSON string whose `providers` has 14 entries.
- [ ] **Step 3: Simulated outage, worker side.** In a second terminal:
  `cd worker && npx wrangler dev --port 8787 --var SUPABASE_URL:https://unreachable.invalid`
  (`resolveCredentials` reads `SUPABASE_URL` before the `EXPO_PUBLIC_*` name `.dev.vars` provides, so this wins)
  then `curl -s localhost:8787/config | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["stale"],d["killswitch"],len(d["providers"]))'`
  Expected: `True False 0` locally (no KV copy in local dev) — proving the outage is no longer reported as a killswitch.
- [ ] **Step 4: Simulated outage, app side.** Restart Metro pointed at the local worker:
  `EXPO_PUBLIC_WORKER_URL=http://localhost:8787 npx expo start --clear`, `adb reverse tcp:8787 tcp:8787`, cold-relaunch
  the app. Expected: Home still renders and the provider list (open a title → source sheet) still shows the 14 providers
  from the device cache. Screenshot it.
- [ ] **Step 5: Restore.** Stop the local worker, restart Metro normally, relaunch; confirm live data again
  (`stale` false in the store via metro-mcp `get_redux_state`).
- [ ] **Step 6: Record the result** in `docs/project-board.md` (new "Phase 0 — config resilience" entry with the two
  screenshots' findings) and commit:

```bash
git add docs/project-board.md
git commit -m "docs(board): Phase 0 gate — the app survives a simulated Supabase outage" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: iOS simulator dev build (needed by every later phase's gate)

- [ ] **Step 1: Build and install.** `npx expo run:ios --device "iPhone 18 Pro"` (the booted simulator).
  Expected: "Build Succeeded" and the app launches.
- [ ] **Step 2: If the build fails with `fmt/format-inl.h … consteval`** (the known Xcode 26+ / fmt 11 issue,
  `nuvio-plugin-architecture.md` §7.1c), add to `ios/Podfile` inside the existing `post_install do |installer|` block:

```ruby
    # fmt 11 + Xcode 26+: FMT_USE_CONSTEVAL is defined unconditionally in base.h,
    # so a -D flag can't override it — patch the header after pod install.
    fmt_base = File.join(installer.sandbox.root, 'fmt', 'include', 'fmt', 'base.h')
    if File.exist?(fmt_base)
      src = File.read(fmt_base)
      patched = src.gsub("#  define FMT_USE_CONSTEVAL 1", "#  define FMT_USE_CONSTEVAL 0")
      File.write(fmt_base, patched) if patched != src
    end
```

  then `cd ios && pod install && cd ..` and repeat Step 1.
- [ ] **Step 3: Smoke.** Home renders; Fight Club → Play → "Try another source" → VidFast plays. Screenshot via
  metro-mcp `take_screenshot` (platform ios). `get_errors` → none.
- [ ] **Step 4: Commit any Podfile change**

```bash
git add ios/Podfile ios/Podfile.lock
git commit -m "build(ios): patch fmt's consteval define so the app builds on current Xcode" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Skip if Step 2 wasn't needed.)

---

## Phase 0 exit checklist

- [ ] `npm test` (app) and `cd worker && npm test` both green.
- [ ] `npx tsc --noEmit`, `npm run lint`, `cd worker && npm run typecheck` clean.
- [ ] Live `/config` has `stale:false`, `killswitch:false`, `flags` all false, 14 providers; KV holds the list.
- [ ] Simulated outage: worker says `stale:true, killswitch:false`; the app still shows its providers.
- [ ] App runs on the Android emulator and the iOS simulator; Play → VidFast fallback unchanged.
