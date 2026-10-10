# Phase 1A — Our Skin + Party on Existing Providers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every title the operator's providers can serve opens in Bearoom's own controls (no provider UI) with a
fully synced, controllable watch party, on Android and iOS.

**Architecture:** One generic, OTA-delivered bridge script (the proven videasy bridge with the videasy-specific parts
replaced by provider-agnostic ones: paint only the `<video>`, pick the feature over ads, subtitles from
`textTracks`, a start-click) is served for every hijack-capable provider. Per-provider differences are data in the
provider row (`hijack.platforms`, `hijack.startSelectors`), handed to the bridge by HijackPlayer in its injection
prologue. Providers are bindable per platform; party offers only providers bindable on both; solo playback silently
moves to the next bindable provider when one fails to bind, and only reveals provider UI when none bind.

**Tech Stack:** Expo SDK 57 · RN 0.86 · react-native-webview 13.16.1 (patched) · TypeScript 6 · jest-expo 57
(+ jsdom environment for the bridge tests) · Cloudflare Worker (Hono + zod-openapi, vitest) · Supabase (providers
table, via the Supabase MCP) · Android emulator `Medium_Phone_API_36.1`, iOS 27 simulator
`A1518C83-9D37-419D-9865-9CDDC16F11E3`, Nothing Phone 1 `P2228K000422`.

**Spec:** `docs/superpowers/specs/2026-10-10-playback-languages-party-design.md` (revision 3) — §6.2.4 and the §9
row "1A".

## Global Constraints

- No Reanimated `entering`/`exiting`/`layout` props; no live blur and no elevation/glow on any screen that plays video;
  never touch `src/ui/BearAlert.tsx` or `.codex/`.
- Scope line (spec §6.2.4): the bridge drives a page already loaded in our WebView; it does not fetch, decrypt or
  re-host streams and does not touch a provider's anti-bot measures.
- Secrets: never print, commit or log `PURGE_TOKEN`, Supabase keys or Cloudflare tokens. Worker deploys run with
  `env -u CLOUDFLARE_API_TOKEN`.
- The OTA bridge is a JS string inside a TS template literal: **no backticks and no `${`** inside it.
- Every visual is checked by screenshot on device before it is called done (`ui-animation-quality-bar`).
- Tests: `npm test` (jest-expo) and `cd worker && npm test` (vitest) stay green; `npx tsc --noEmit` clean;
  `npm run lint` 0 errors.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A pre-roll ad `<video>` mounts before the film** → the bridge must end up bound to the feature (longest
   duration), not the ad. → Task 3 test "prefers the feature over a short ad".
2. **The provider replaces its `<video>` element on pause/resume or quality change** → controls keep working (rebind,
   new `ready`). → Task 3 test "rebinds when the provider swaps the element".
3. **A provider binds but the stream never starts** (spinner forever under our controls) → treat as a failed source
   and move on, solo. → Task 2 test for `isStalledStart`, wired in Task 4.
4. **Every bindable provider fails for a title** → the user still gets a way to watch: provider UI revealed as last
   resort, or the error card (F4) if the page itself failed. → Task 2 tests for `nextBindableProvider`, Task 6 device
   check.
5. **A party guest is on a platform where the room's provider can't bind** (e.g. a cross-origin-frame provider with an
   Android guest) → such providers are never offered for a party. → Task 2 test "party needs both platforms".

---

## File Structure

| File | Responsibility |
|---|---|
| `components/player/embedUrl.ts` (new) | Pure embed-URL building (moved out of `providerRegistry.ts` so it is testable without the store) |
| `components/player/providerRegistry.ts` | Re-exports `buildEmbedUrl`; store-backed lookups (unchanged otherwise) |
| `components/player/hijackCapabilities.ts` | `HijackCapability` type gains `platforms`, `startSelectors`, `videoLocation: "cross-origin-iframe"` |
| `components/player/capabilities.ts` | `isBindableOn(p, os)`, `isPartyCapable(p)` (both platforms), `hijackCapabilities(p, os, reported?)` |
| `components/player/providerPick.ts` (new) | Pure provider choice: `pickInitialProvider`, `nextBindableProvider`, `isStalledStart` |
| `components/player/types.ts` | `PlayerEvent` gains `caps`/`subs`; `PlayerHandle` gains `setSubtitle(id)` |
| `src/scripts/generic-bridge.ts` (new) | The generic OTA bridge string + `BridgeConfig` type |
| `src/scripts/generic-bridge.test.ts` (new) | jsdom tests of the bridge |
| `components/player/HijackPlayer.tsx` | Injects `window.__vlCfg`; tracks `caps`/`subs`; `setSubtitle`; reveal-provider-UI fallback |
| `components/player/HijackPlayer.web.tsx` | `setSubtitle` no-op (web twin) |
| `components/player/PlayerSettingsSheet.tsx` | Audio/Quality rows only when supported; new Subtitles row |
| `src/screens/PlayerScreen.tsx` | Uses `providerPick`; bind-or-move-on (solo); stall detection; dev bind log |
| `services/party/PartySyncEngine.ts` | Dev-only drift log for the party gate |
| `scripts/upload-bridge.ts` | Serves the generic bridge for a list of providers; `--emit-sql` |
| `worker/src/schemas.ts` (+ test) | `HijackSchema` accepts the new fields |

---

### Task 1: Pure embed URLs, and no videasy auto-advance inside a party

**Files:**
- Create: `components/player/embedUrl.ts`
- Modify: `components/player/providerRegistry.ts` (remove `fill` + `buildEmbedUrl` bodies, re-export)
- Test: `components/player/embedUrl.test.ts`

**Interfaces:**
- Produces: `buildEmbedUrl(p: EmbedProvider, m: MediaRef, opts?: { party?: boolean; autoplayNext?: boolean }): string`
  where `EmbedProvider = Pick<Provider, "id" | "urls" | "hijack">`; `MediaRef` moves to `embedUrl.ts` and is
  re-exported from `providerRegistry.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// components/player/embedUrl.test.ts
import { buildEmbedUrl, type EmbedProvider } from "./embedUrl";

const videasy: EmbedProvider = {
  id: "videasy",
  urls: { movie: "https://p.test/movie/${id}", tv: "https://p.test/tv/${id}/${season}/${episode}" },
  hijack: { supported: true },
};
const vidfast: EmbedProvider = {
  id: "vidfast",
  urls: { movie: "https://vf.test/movie/${id}", tv: "https://vf.test/tv/${id}/${season}/${episode}" },
  hijack: { supported: true, autoplayParam: "autoPlay=false" },
};

describe("buildEmbedUrl", () => {
  it("fills the movie template", () => {
    expect(buildEmbedUrl(vidfast, { tmdbId: "550", type: "movie" })).toBe("https://vf.test/movie/550");
  });

  it("fills season and episode for TV", () => {
    expect(buildEmbedUrl(vidfast, { tmdbId: "1396", type: "tv", season: 1, episode: 2 })).toBe(
      "https://vf.test/tv/1396/1/2",
    );
  });

  it("lets videasy auto-advance episodes when watching alone", () => {
    const url = buildEmbedUrl(videasy, { tmdbId: "1396", type: "tv", season: 1, episode: 1 });
    expect(url).toContain("nextEpisode=true");
    expect(url).toContain("autoplayNextEpisode=true");
  });

  it("never lets videasy auto-advance inside a party (the host owns the queue)", () => {
    const url = buildEmbedUrl(videasy, { tmdbId: "1396", type: "tv", season: 1, episode: 1 }, { party: true });
    expect(url).not.toContain("nextEpisode=true");
    expect(url).not.toContain("autoplayNextEpisode=true");
    expect(url).toContain("episodeSelector=true");
  });

  it("adds the autoplay-off param and startAt only in a party", () => {
    const m = { tmdbId: "550", type: "movie" as const, startAt: 125.7 };
    expect(buildEmbedUrl(vidfast, m)).toBe("https://vf.test/movie/550");
    expect(buildEmbedUrl(vidfast, m, { party: true })).toBe("https://vf.test/movie/550?autoPlay=false&startAt=125");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest components/player/embedUrl.test.ts`
Expected: FAIL — `Cannot find module './embedUrl'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// components/player/embedUrl.ts
import type { HijackCapability } from "./hijackCapabilities";

export interface MediaRef {
  tmdbId: string;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
  startAt?: number;
}

/** The slice of a provider an embed URL needs (pure — no store). */
export interface EmbedProvider {
  id: string;
  urls: { movie: string; tv: string };
  hijack: HijackCapability;
}

function fill(template: string, m: MediaRef): string {
  if (!template) return ""; // defensive: a malformed provider row shouldn't crash the player
  return template
    .replace(/\$\{id\}/g, m.tmdbId)
    .replace(/\$\{season\}/g, String(m.season ?? 1))
    .replace(/\$\{episode\}/g, String(m.episode ?? 1));
}

/**
 * Build the embed URL for a provider + title. `party` mode appends the provider's
 * autoplay-off param (so members don't each auto-start before the party syncs).
 */
export function buildEmbedUrl(
  p: EmbedProvider,
  m: MediaRef,
  opts: { party?: boolean; autoplayNext?: boolean } = {},
): string {
  let url = m.type === "tv" ? fill(p.urls.tv, m) : fill(p.urls.movie, m);
  const extra: string[] = [];
  if (p.id === "videasy" && m.type === "tv") {
    extra.push("episodeSelector=true");
    // Solo only: in a party the host's queue decides the next episode, so videasy
    // must not advance on its own (members would drift onto different episodes).
    if (!opts.party && opts.autoplayNext !== false) extra.push("nextEpisode=true", "autoplayNextEpisode=true");
  }
  if (opts.party && p.hijack.autoplayParam) extra.push(p.hijack.autoplayParam);
  if (opts.party && m.startAt && m.startAt > 5) {
    extra.push(`startAt=${Math.floor(m.startAt)}`);
  }
  if (extra.length) url += (url.includes("?") ? "&" : "?") + extra.join("&");
  return url;
}
```

In `components/player/providerRegistry.ts`: delete the local `MediaRef` interface, `fill` and `buildEmbedUrl`, and
add near the other re-exports:

```ts
export { buildEmbedUrl, type MediaRef } from "./embedUrl";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest components/player/embedUrl.test.ts && npx tsc --noEmit && npm test`
Expected: 5/5 PASS; tsc clean; whole suite green.

- [ ] **Step 5: Commit**

```bash
git add components/player/embedUrl.ts components/player/embedUrl.test.ts components/player/providerRegistry.ts
git commit -m "fix(player): videasy no longer auto-advances episodes inside a party" -m "buildEmbedUrl moves to a pure module so it can be tested without the store." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Per-platform bindability, party needs both platforms, pure provider choice

**Files:**
- Modify: `components/player/hijackCapabilities.ts` (type only)
- Modify: `components/player/capabilities.ts`
- Modify: `components/player/capabilities.test.ts`
- Create: `components/player/providerPick.ts`, `components/player/providerPick.test.ts`
- Modify: `worker/src/schemas.ts`; Test: `worker/src/schemas.test.ts` (new)

**Interfaces:**
- Consumes: `Provider` (`providerRegistry.ts`), `PlayerCapabilities` (`types.ts`).
- Produces:
  - `type OS = "ios" | "android"`
  - `isBindableOn(p: ProviderLike, os: OS): boolean`
  - `isPartyCapable(p: ProviderLike): boolean` — bindable on **both** platforms
  - `interface BridgeCaps { quality: boolean; audio: boolean; subtitles: boolean }`
  - `hijackCapabilities(p: ProviderLike, os: OS, reported?: BridgeCaps): PlayerCapabilities`
  - `pickInitialProvider(list: Provider[], o: { requestedId?: string; failed: Set<string>; os: OS }): Provider | undefined`
  - `nextBindableProvider(list: Provider[], currentId: string, tried: Set<string>, os: OS): Provider | undefined`
  - `isStalledStart(s: { playIntentAt: number | null; lastProgressAt: number | null; now: number }, windowMs?: number): boolean`

- [ ] **Step 1: Write the failing tests**

Replace the body of `components/player/capabilities.test.ts` with:

```ts
import { hijackCapabilities, isBindableOn, isPartyCapable, NO_CAPABILITIES } from "./capabilities";
import type { HijackCapability } from "./hijackCapabilities";

const p = (hijack: HijackCapability, scriptVersion: string | null = "generic@1") => ({ hijack, scriptVersion });

describe("isBindableOn", () => {
  it("needs a served script", () => {
    expect(isBindableOn(p({ supported: true }, null), "android")).toBe(false);
  });
  it("needs hijack support", () => {
    expect(isBindableOn(p({ supported: false }), "android")).toBe(false);
  });
  it("treats a top-frame provider as bindable everywhere", () => {
    const top = p({ supported: true, videoLocation: "top" });
    expect(isBindableOn(top, "android")).toBe(true);
    expect(isBindableOn(top, "ios")).toBe(true);
  });
  it("treats a cross-origin-frame provider as iOS-only", () => {
    const xo = p({ supported: true, videoLocation: "cross-origin-iframe" });
    expect(isBindableOn(xo, "ios")).toBe(true);
    expect(isBindableOn(xo, "android")).toBe(false);
  });
  it("lets measured per-platform data override the location rule", () => {
    const measured = p({ supported: true, videoLocation: "top", platforms: { android: false, ios: true } });
    expect(isBindableOn(measured, "android")).toBe(false);
    expect(isBindableOn(measured, "ios")).toBe(true);
  });
});

describe("isPartyCapable", () => {
  it("party needs both platforms", () => {
    expect(isPartyCapable(p({ supported: true, videoLocation: "top" }))).toBe(true);
    expect(isPartyCapable(p({ supported: true, videoLocation: "cross-origin-iframe" }))).toBe(false);
    expect(isPartyCapable(undefined)).toBe(false);
  });
});

describe("hijackCapabilities", () => {
  it("is empty when the provider can't bind on this platform", () => {
    expect(hijackCapabilities(p({ supported: true, videoLocation: "cross-origin-iframe" }), "android")).toEqual(
      NO_CAPABILITIES,
    );
  });
  it("keeps the legacy full set when the bridge reports nothing (videasy)", () => {
    expect(hijackCapabilities(p({ supported: true }), "android")).toEqual({
      fractionalRate: true,
      preciseSeek: true,
      audioTracks: true,
      qualitySelect: true,
      subtitles: false,
      partySync: true,
    });
  });
  it("uses what the generic bridge reports", () => {
    expect(
      hijackCapabilities(p({ supported: true }), "ios", { quality: false, audio: false, subtitles: true }),
    ).toEqual({
      fractionalRate: true,
      preciseSeek: true,
      audioTracks: false,
      qualitySelect: false,
      subtitles: true,
      partySync: true,
    });
  });
  it("is not party-capable on a single-platform provider", () => {
    expect(hijackCapabilities(p({ supported: true, videoLocation: "cross-origin-iframe" }), "ios").partySync).toBe(
      false,
    );
  });
});
```

```ts
// components/player/providerPick.test.ts
import type { Provider } from "./providerRegistry";
import { isStalledStart, nextBindableProvider, pickInitialProvider } from "./providerPick";

const prov = (id: string, bind: "both" | "ios" | "none"): Provider => ({
  id,
  name: id,
  urls: { movie: "", tv: "" },
  allowedDomain: `${id}.test`,
  hijack:
    bind === "none"
      ? { supported: false }
      : { supported: true, videoLocation: bind === "both" ? "top" : "cross-origin-iframe" },
  scriptVersion: bind === "none" ? null : "generic@1",
});

const list = [prov("dead", "both"), prov("vf", "both"), prov("vc", "ios"), prov("plain", "none")];

describe("pickInitialProvider", () => {
  it("honours an explicit pick that hasn't failed", () => {
    expect(pickInitialProvider(list, { requestedId: "plain", failed: new Set(), os: "android" })?.id).toBe("plain");
  });
  it("skips an explicit pick that failed for this title", () => {
    expect(pickInitialProvider(list, { requestedId: "dead", failed: new Set(["dead"]), os: "android" })?.id).toBe("vf");
  });
  it("prefers a provider our skin can bind on this platform", () => {
    expect(pickInitialProvider(list, { failed: new Set(["dead"]), os: "android" })?.id).toBe("vf");
  });
  it("falls back to a plain embed only when nothing binds", () => {
    expect(pickInitialProvider(list, { failed: new Set(["dead", "vf"]), os: "android" })?.id).toBe("plain");
  });
});

describe("nextBindableProvider", () => {
  it("moves to the next untried provider that binds here", () => {
    expect(nextBindableProvider(list, "dead", new Set(["dead"]), "android")?.id).toBe("vf");
  });
  it("can use an iOS-only provider on iOS", () => {
    expect(nextBindableProvider(list, "vf", new Set(["dead", "vf"]), "ios")?.id).toBe("vc");
  });
  it("returns undefined when every bindable provider was tried", () => {
    expect(nextBindableProvider(list, "vf", new Set(["dead", "vf"]), "android")).toBeUndefined();
  });
});

describe("isStalledStart", () => {
  it("is false before anyone asked to play", () => {
    expect(isStalledStart({ playIntentAt: null, lastProgressAt: null, now: 100_000 })).toBe(false);
  });
  it("is false while playback advances", () => {
    expect(isStalledStart({ playIntentAt: 0, lastProgressAt: 90_000, now: 100_000 })).toBe(false);
  });
  it("is true when nothing advanced for the window after a play intent", () => {
    expect(isStalledStart({ playIntentAt: 0, lastProgressAt: null, now: 30_000 })).toBe(true);
    expect(isStalledStart({ playIntentAt: 0, lastProgressAt: 2_000, now: 30_000 })).toBe(true);
  });
  it("gives a fresh play intent the full window", () => {
    expect(isStalledStart({ playIntentAt: 20_000, lastProgressAt: null, now: 30_000 })).toBe(false);
  });
});
```

```ts
// worker/src/schemas.test.ts
import { describe, expect, it } from "vitest";
import { HijackSchema } from "./schemas";

describe("HijackSchema", () => {
  it("keeps the per-platform and start-click fields", () => {
    const parsed = HijackSchema.parse({
      supported: true,
      videoLocation: "cross-origin-iframe",
      platforms: { ios: true, android: false },
      startSelectors: ["button.play"],
    });
    expect(parsed).toEqual({
      supported: true,
      videoLocation: "cross-origin-iframe",
      platforms: { ios: true, android: false },
      startSelectors: ["button.play"],
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest components/player/capabilities.test.ts components/player/providerPick.test.ts; (cd worker && npx vitest run src/schemas.test.ts)`
Expected: FAIL — `isBindableOn` is not exported; `./providerPick` not found; vitest shows `platforms`/`startSelectors`
missing and `cross-origin-iframe` rejected.

- [ ] **Step 3: Implement**

In `components/player/hijackCapabilities.ts`, extend the interface (leave `HIJACK_CAPS` as is):

```ts
  /** Where the <video> lives, when supported. */
  videoLocation?: "top" | "same-origin-iframe" | "cross-origin-iframe";
  /**
   * Measured per-platform bind result; overrides the location rule. iOS injects into every
   * frame (so cross-origin frames bind); Android injects into the main frame only.
   */
  platforms?: { ios?: boolean; android?: boolean };
  /** Selectors the generic bridge clicks (in order) to start the provider's player. */
  startSelectors?: string[];
```

Replace `components/player/capabilities.ts` with:

```ts
import type { Provider } from "./providerRegistry";
import type { PlayerCapabilities } from "./types";

type ProviderLike = Pick<Provider, "hijack" | "scriptVersion"> | undefined;

export type OS = "ios" | "android";

/** What the generic bridge reports about the bound <video> (its `caps` event). */
export interface BridgeCaps {
  quality: boolean;
  audio: boolean;
  subtitles: boolean;
}

/** The provider renders a <video> our injected bridge can reach (on some platform). */
export function isHijackable(p: ProviderLike): boolean {
  return !!p?.hijack.supported;
}

/**
 * Our skin can drive this provider on `os`: hijack support + a served script, and the
 * <video> is reachable there. Measured `platforms` data wins; otherwise a cross-origin
 * frame is reachable only on iOS (WKWebView injects into every frame; Android's
 * react-native-webview injects into the main frame only).
 */
export function isBindableOn(p: ProviderLike, os: OS): boolean {
  if (!isHijackable(p) || !p?.scriptVersion) return false;
  const measured = p.hijack.platforms?.[os];
  if (measured !== undefined) return measured;
  return p.hijack.videoLocation !== "cross-origin-iframe" || os === "ios";
}

/**
 * PARTY-capable = bindable on BOTH platforms, so any member — iPhone or Android — can
 * bind it. The 🐾 badge, the "Watch Party" button and party launch gate on this.
 */
export function isPartyCapable(p: ProviderLike): boolean {
  return isBindableOn(p, "ios") && isBindableOn(p, "android");
}

export const NO_CAPABILITIES: PlayerCapabilities = {
  fractionalRate: false,
  preciseSeek: false,
  audioTracks: false,
  qualitySelect: false,
  subtitles: false,
  partySync: false,
};

/**
 * What the WebView hijack player can do for a provider on this platform. The generic
 * bridge reports quality/audio/subtitle support for the bound <video>; the legacy
 * videasy bridge reports nothing, so it keeps the full set it has always driven.
 */
export function hijackCapabilities(p: ProviderLike, os: OS, reported?: BridgeCaps): PlayerCapabilities {
  if (!isBindableOn(p, os)) return NO_CAPABILITIES;
  return {
    fractionalRate: true,
    preciseSeek: true,
    audioTracks: reported ? reported.audio : true,
    qualitySelect: reported ? reported.quality : true,
    subtitles: reported ? reported.subtitles : false,
    partySync: isPartyCapable(p),
  };
}
```

```ts
// components/player/providerPick.ts
import { isBindableOn, type OS } from "./capabilities";
import type { Provider } from "./providerRegistry";

/**
 * The provider a title opens on. An explicit pick wins unless it already failed for
 * this title; otherwise prefer providers our skin binds on this platform (failure
 * memory biases within that tier but never demotes a bindable provider below a plain
 * embed); plain embeds only when nothing binds.
 */
export function pickInitialProvider(
  list: Provider[],
  o: { requestedId?: string; failed: Set<string>; os: OS },
): Provider | undefined {
  const requested = o.requestedId ? list.find((p) => p.id === o.requestedId) : undefined;
  if (requested && !o.failed.has(requested.id)) return requested;
  const fresh = (arr: Provider[]) => arr.find((p) => !o.failed.has(p.id)) ?? arr[0];
  return (
    fresh(list.filter((p) => isBindableOn(p, o.os))) ??
    fresh(list.filter((p) => !isBindableOn(p, o.os))) ??
    list[0]
  );
}

/** The next provider to try silently after `currentId` failed to bind (solo only). */
export function nextBindableProvider(
  list: Provider[],
  currentId: string,
  tried: Set<string>,
  os: OS,
): Provider | undefined {
  return list.find((p) => p.id !== currentId && !tried.has(p.id) && isBindableOn(p, os));
}

/**
 * Bound, asked to play, but nothing has advanced for `windowMs` — the stream is dead
 * under our controls, so treat it like a failed bind.
 */
export function isStalledStart(
  s: { playIntentAt: number | null; lastProgressAt: number | null; now: number },
  windowMs = 25_000,
): boolean {
  if (s.playIntentAt == null) return false;
  if (s.now - s.playIntentAt < windowMs) return false;
  return s.lastProgressAt == null || s.now - s.lastProgressAt >= windowMs;
}
```

In `worker/src/schemas.ts`, extend `HijackSchema`:

```ts
export const HijackSchema = z
  .object({
    supported: z.boolean().openapi({ example: true }),
    videoLocation: z.enum(["top", "same-origin-iframe", "cross-origin-iframe"]).optional(),
    navHosts: z.array(z.string()).optional().openapi({ example: ["player.videasy.to"] }),
    autoplayParam: z.string().optional().openapi({ example: "autoplay=false" }),
    unstable: z.boolean().optional(),
    notes: z.string().optional(),
    platforms: z.object({ ios: z.boolean().optional(), android: z.boolean().optional() }).optional(),
    startSelectors: z.array(z.string()).optional(),
  })
  .openapi("Hijack");
```

Update the callers of the old signatures:
- `components/player/HijackPlayer.tsx` `getCapabilities`: `hijackCapabilities(getProvider(providerId), Platform.OS === "ios" ? "ios" : "android")`
  (Task 4 adds the reported caps). `Platform` is already imported there; add it if not.
- `src/screens/PlayerScreen.tsx` `pickInitialProvider` callback: replace its body after computing `failed` with
  `return pickInitialProvider(list, { requestedId: providerId, failed, os: Platform.OS === "ios" ? "ios" : "android" });`
  and import `pickInitialProvider as pickProvider` from `@/components/player/providerPick` (rename the local
  callback's call accordingly so names don't collide).
- `git grep -n "hijackCapabilities(" -- '*.ts' '*.tsx'` and fix any other caller the same way.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest components/player && (cd worker && npm test) && npx tsc --noEmit && npm test`
Expected: all PASS; tsc clean.

- [ ] **Step 5: Commit, deploy the worker**

```bash
git add components/player/hijackCapabilities.ts components/player/capabilities.ts components/player/capabilities.test.ts \
  components/player/providerPick.ts components/player/providerPick.test.ts worker/src/schemas.ts worker/src/schemas.test.ts \
  components/player/HijackPlayer.tsx src/screens/PlayerScreen.tsx
git commit -m "feat(player): providers are bindable per platform; a party needs both" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
cd worker && env -u CLOUDFLARE_API_TOKEN npx wrangler deploy && cd ..
curl -s https://netprime-worker.spiderfan-no1.workers.dev/config | head -c 300
```

Expected: deploy prints a new version id; `/config` still returns 14 providers.

---

### Task 3: The generic bridge

**Files:**
- Create: `src/scripts/generic-bridge.ts`
- Test: `src/scripts/generic-bridge.test.ts`
- Modify: `package.json` (devDependency `jest-environment-jsdom` `~29.7.0`, already present transitively)

**Interfaces:**
- Produces: `GENERIC_BRIDGE: string`, `GENERIC_BRIDGE_ID = "generic"`,
  `interface BridgeConfig { chromeOff?: boolean; autoStart?: boolean; startSelectors?: string[] }`.
  Window API (unchanged names, so HijackPlayer needs no new wiring for transport): `__vlCmd`, `__soloCmd`,
  `__soloKeepAlive`, `__vlChromeOff`, `__vlSetGuest`. Commands: `play`, `pause`, `seek {time}`, `rate {rate}`,
  `fullscreen`, `readQuality`, `setQuality`, `readAudio`, `setAudio`, `readSubs`, `setSub {id: string | null}`.
  Events up (all nonce-stamped `__n`): `ready`, `tick`, `play`, `pause`, `seeking`, `seeked`, `ended`, `waiting`,
  `playing`, `canplay`, `gesture`, `quality {qualities: []}`, `audio {audios: []}`,
  `caps {caps: {quality, audio, subtitles}}`, `subs {subs: {id, label, language, selected}[]}`.

- [ ] **Step 1: Write the failing tests**

```ts
/**
 * @jest-environment jsdom
 */
// src/scripts/generic-bridge.test.ts
import { GENERIC_BRIDGE } from "./generic-bridge";

type Msg = Record<string, any>;
let posted: Msg[];

function load(cfg: Record<string, unknown> = {}) {
  posted = [];
  (window as any).ReactNativeWebView = { postMessage: (s: string) => posted.push(JSON.parse(s)) };
  (window as any).__vlMsgNonce = "n1";
  (window as any).__vlCfg = cfg;
  delete (window as any).__vlBridge;
  // eslint-disable-next-line no-new-func
  new Function(GENERIC_BRIDGE)();
}

function addVideo(duration: number, tracks: Msg[] = []): HTMLVideoElement {
  const v = document.createElement("video");
  Object.defineProperty(v, "duration", { value: duration, configurable: true });
  Object.defineProperty(v, "paused", { value: true, writable: true, configurable: true });
  Object.defineProperty(v, "currentTime", { value: 0, writable: true, configurable: true });
  Object.defineProperty(v, "textTracks", { value: tracks, configurable: true });
  v.play = jest.fn(() => Promise.resolve());
  v.pause = jest.fn();
  document.body.appendChild(v);
  return v;
}

const events = (name: string) => posted.filter((m) => m.event === name);

beforeEach(() => {
  jest.useFakeTimers();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe("generic bridge", () => {
  it("binds the page's video and announces ready with the session nonce", () => {
    load();
    addVideo(8349);
    jest.advanceTimersByTime(700);
    const ready = events("ready");
    expect(ready).toHaveLength(1);
    expect(ready[0]).toMatchObject({ __n: "n1", duration: 8349 });
  });

  it("prefers the feature over a short ad", () => {
    load();
    addVideo(30);
    jest.advanceTimersByTime(700);
    addVideo(8349);
    jest.advanceTimersByTime(700);
    expect(events("ready").map((m) => m.duration)).toEqual([30, 8349]);
  });

  it("rebinds when the provider swaps the element", () => {
    load();
    const first = addVideo(8349);
    jest.advanceTimersByTime(700);
    first.remove();
    addVideo(8349);
    jest.advanceTimersByTime(700);
    expect(events("ready")).toHaveLength(2);
  });

  it("paints only the video once chrome-off is on, and can show the page again", () => {
    load({ chromeOff: true });
    const css = () => document.getElementById("__vlChromeStyle")?.textContent ?? "";
    expect(css()).toContain("iframe{visibility:visible");
    addVideo(8349);
    jest.advanceTimersByTime(700);
    expect(css()).toContain("video{visibility:visible");
    (window as any).__vlChromeOff(false);
    expect(css()).toBe("");
  });

  it("lists subtitle tracks and switches between them", () => {
    const tracks = [
      { kind: "subtitles", label: "English", language: "en", mode: "disabled" },
      { kind: "metadata", label: "id3", language: "", mode: "hidden" },
      { kind: "subtitles", label: "Hindi", language: "hi", mode: "disabled" },
    ];
    load();
    addVideo(8349, tracks);
    jest.advanceTimersByTime(700);
    expect(events("caps")[0].caps).toEqual({ quality: false, audio: false, subtitles: true });
    expect(events("subs")[0].subs.map((s: Msg) => s.id)).toEqual(["0", "2"]);
    (window as any).__vlCmd({ action: "setSub", id: "2" });
    expect(tracks.map((t) => t.mode)).toEqual(["disabled", "hidden", "showing"]);
    (window as any).__vlCmd({ action: "setSub", id: null });
    expect(tracks.map((t) => t.mode)).toEqual(["disabled", "hidden", "disabled"]);
  });

  it("blocks popups", () => {
    load();
    expect(window.open("https://ads.test")).toBeNull();
  });

  it("starts a provider's player through its start selector", () => {
    load({ startSelectors: ["#start"] });
    const btn = document.createElement("button");
    btn.id = "start";
    const onClick = jest.fn();
    btn.addEventListener("click", onClick);
    document.body.appendChild(btn);
    (window as any).__vlCmd({ action: "play" });
    expect(onClick).toHaveBeenCalled();
  });

  it("drives seek, rate and pause on the bound video", () => {
    load();
    const v = addVideo(8349);
    jest.advanceTimersByTime(700);
    (window as any).__vlCmd({ action: "seek", time: 120 });
    (window as any).__vlCmd({ action: "rate", rate: 1.05 });
    (window as any).__vlCmd({ action: "pause" });
    expect(v.currentTime).toBe(120);
    expect(v.playbackRate).toBe(1.05);
    expect(v.pause).toHaveBeenCalled();
  });

  it("answers quality and audio reads with empty lists (no provider menus driven)", () => {
    load();
    addVideo(8349);
    jest.advanceTimersByTime(700);
    (window as any).__vlCmd({ action: "readQuality" });
    (window as any).__vlCmd({ action: "readAudio" });
    expect(events("quality")[0].qualities).toEqual([]);
    expect(events("audio")[0].audios).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm i -D jest-environment-jsdom@~29.7.0 && npx jest src/scripts/generic-bridge.test.ts`
Expected: FAIL — `Cannot find module './generic-bridge'`.

- [ ] **Step 3: Implement**

```ts
// src/scripts/generic-bridge.ts
/**
 * generic-bridge.ts — the provider-agnostic injection bridge (Phase 1A, spec §6.2.4).
 *
 * The proven videasy bridge (legacy-videasy.ts) with every videasy-specific part
 * replaced by a provider-agnostic one: paint only the <video> (chrome-off), bind the
 * feature rather than an ad (longest duration wins, rebinding when a better one
 * mounts), subtitles from textTracks, and a start click from data. Served OTA per
 * provider via scripts/upload-bridge.ts; HijackPlayer sets window.__vlCfg (a
 * BridgeConfig) in its prologue before this runs.
 *
 * NOT imported by the app — only the upload CLI and tests read it.
 * It lives in a template literal: no backticks and no dollar-brace inside.
 */
export const GENERIC_BRIDGE_ID = "generic";

export interface BridgeConfig {
  /** Paint only the <video> from document-start (default true). */
  chromeOff?: boolean;
  /** Click the provider's start control at 3 s and 8 s if no <video> exists (default true). */
  autoStart?: boolean;
  /** Selectors tried in order before the centre-of-page fallback. */
  startSelectors?: string[];
}

export const GENERIC_BRIDGE: string = `
(function(){
  if (window.__vlBridge) return; window.__vlBridge = true;
  var CFG = window.__vlCfg || {};
  var __vlN; try { __vlN = window.__vlMsgNonce; delete window.__vlMsgNonce; } catch(e){}
  var __rnpost; try { __rnpost = window.ReactNativeWebView.postMessage.bind(window.ReactNativeWebView); } catch(e){}
  function post(o){ try { if (__vlN !== undefined) o.__n = __vlN; (__rnpost || window.ReactNativeWebView.postMessage)(JSON.stringify(o)); } catch(e){} }
  function snap(v, o){
    o.currentTime = (v && v.currentTime) || 0;
    o.duration = (v && isFinite(v.duration) && v.duration) || 0;
    o.paused = v ? !!v.paused : true;
    o.readyState = v ? v.readyState : 0;
    return o;
  }

  try { window.open = function(){ return null; }; } catch(e){}
  try {
    document.addEventListener('click', function(ev){
      var a = ev.target && ev.target.closest && ev.target.closest('a[target=_blank]');
      if (a){ ev.preventDefault(); ev.stopPropagation(); }
    }, true);
  } catch(e){}
  try {
    var GEV = ['pointerdown', 'touchstart', 'click'];
    var __g = function(){
      post({ event: 'gesture' });
      GEV.forEach(function(t){ document.removeEventListener(t, __g, true); });
    };
    GEV.forEach(function(t){ document.addEventListener(t, __g, true); });
  } catch(e){}

  var CHROME_CSS = 'html,body{background:#000!important}body *{visibility:hidden!important}video{visibility:visible!important}';
  var FRAME_CSS = 'html,body{background:#000!important}body *{visibility:hidden!important}iframe{visibility:visible!important}';
  var chromeOn = CFG.chromeOff !== false;
  function styleEl(){
    var el = document.getElementById('__vlChromeStyle');
    if (!el){ el = document.createElement('style'); el.id = '__vlChromeStyle'; (document.head || document.documentElement).appendChild(el); }
    return el;
  }
  function applyChrome(){
    try {
      var css = !chromeOn ? '' : (document.getElementsByTagName('video').length ? CHROME_CSS : FRAME_CSS);
      var el = styleEl(); if (el.textContent !== css) el.textContent = css;
    } catch(e){}
  }
  window.__vlChromeOff = function(on){ chromeOn = !!on; applyChrome(); };
  window.__vlSetGuest = function(){};
  applyChrome();
  try { document.addEventListener('DOMContentLoaded', applyChrome); } catch(e){}

  function collect(doc, out){
    try {
      var vs = doc.getElementsByTagName('video');
      for (var i = 0; i < vs.length; i++) out.push(vs[i]);
      var fs = doc.getElementsByTagName('iframe');
      for (var j = 0; j < fs.length; j++){
        var cd = null; try { cd = fs[j].contentDocument; } catch(e){}
        if (cd) collect(cd, out);
      }
    } catch(e){}
    return out;
  }
  function score(v){
    var d = (isFinite(v.duration) && v.duration > 0) ? v.duration : 0;
    var a = 0; try { var r = v.getBoundingClientRect(); a = r.width * r.height; } catch(e){}
    return d * 1e6 + a;
  }
  function pickVideo(){
    var all = collect(document, []), best = null;
    for (var i = 0; i < all.length; i++){
      if (all[i].isConnected === false) continue;
      if (!best || score(all[i]) > score(best)) best = all[i];
    }
    return best;
  }

  var vid = null, applying = 0, wasPlaying = false;
  function markApplying(){ applying = Date.now() + 500; }
  function isApplying(){ return Date.now() < applying; }
  function isSubTrack(t){ return !t.kind || t.kind === 'subtitles' || t.kind === 'captions'; }
  function subsOf(v){
    var out = [];
    try {
      var tt = v.textTracks || [];
      for (var i = 0; i < tt.length; i++){
        var t = tt[i];
        if (!isSubTrack(t)) continue;
        out.push({ id: String(i), label: t.label || t.language || ('Track ' + (i + 1)), language: t.language || '', selected: t.mode === 'showing' });
      }
    } catch(e){}
    return out;
  }
  function postSubs(){ if (vid) post(snap(vid, { event: 'subs', subs: subsOf(vid) })); }
  function postCaps(){
    if (!vid) return;
    post(snap(vid, { event: 'caps', caps: { quality: false, audio: false, subtitles: subsOf(vid).length > 0 } }));
    postSubs();
  }
  function keepAlive(){
    if (!vid) return;
    if (document.hidden && wasPlaying && vid.paused){
      markApplying();
      var p = vid.play(); if (p && p.catch) p.catch(function(){});
    }
  }
  window.__soloKeepAlive = keepAlive;
  function bind(v){
    if (!v || v === vid) return;
    vid = v; wasPlaying = !v.paused;
    if (!v.__vlBound){
      v.__vlBound = true;
      ['play','pause','seeking','seeked','ended','waiting','playing','canplay'].forEach(function(ev){
        v.addEventListener(ev, function(){
          if (v !== vid) return;
          if (ev === 'pause' && document.hidden && wasPlaying){ keepAlive(); return; }
          if (isApplying()) return;
          if (ev === 'play' || ev === 'playing') wasPlaying = true;
          if (ev === 'pause' || ev === 'ended') wasPlaying = false;
          post(snap(v, { event: ev }));
        });
      });
      try { v.addEventListener('loadedmetadata', function(){ if (v === vid) postCaps(); }); } catch(e){}
      try { if (v.textTracks && v.textTracks.addEventListener) v.textTracks.addEventListener('addtrack', function(){ if (v === vid) postCaps(); }); } catch(e){}
    }
    applyChrome();
    post(snap(v, { event: 'ready' }));
    postCaps();
  }
  function better(c){
    if (!vid || vid.isConnected === false) return true;
    return c !== vid && score(c) > score(vid) * 1.5;
  }
  function scan(){
    var c = pickVideo();
    if (c && better(c)) bind(c);
    else if (vid && vid.isConnected === false) vid = null;
    applyChrome();
  }
  setInterval(scan, 700);
  setInterval(function(){ keepAlive(); if (vid) post(snap(vid, { event: 'tick' })); }, 1000);
  document.addEventListener('visibilitychange', function(){
    if (!document.hidden) return;
    keepAlive(); setTimeout(keepAlive, 50); setTimeout(keepAlive, 250); setTimeout(keepAlive, 1000);
  });

  function pointerHit(el){
    try {
      var r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      ['pointerover','pointerenter','pointerdown','pointerup','mousedown','mouseup','click'].forEach(function(t){
        try {
          var E = (t.indexOf('pointer') === 0 && typeof PointerEvent !== 'undefined') ? PointerEvent : MouseEvent;
          el.dispatchEvent(new E(t, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y }));
        } catch(e){}
      });
    } catch(e){}
  }
  function clickStart(){
    var sels = CFG.startSelectors || [];
    for (var i = 0; i < sels.length; i++){
      var el = null; try { el = document.querySelector(sels[i]); } catch(e){}
      if (el){ pointerHit(el); return true; }
    }
    var c = null; try { c = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2); } catch(e){}
    if (c && c.tagName !== 'IFRAME' && c !== document.body && c !== document.documentElement){ pointerHit(c); return true; }
    return false;
  }
  if (CFG.autoStart !== false){
    [3000, 8000].forEach(function(ms){ setTimeout(function(){ if (!vid) clickStart(); }, ms); });
  }

  window.__vlCmd = function(cmd){
    try {
      if (cmd.action === 'play'){
        wasPlaying = true;
        if (!vid){ clickStart(); return; }
        markApplying();
        var p = vid.play(); if (p && p.catch) p.catch(function(){});
        return;
      }
      if (cmd.action === 'readQuality'){ post(snap(vid, { event: 'quality', qualities: [] })); return; }
      if (cmd.action === 'readAudio'){ post(snap(vid, { event: 'audio', audios: [] })); return; }
      if (cmd.action === 'readSubs'){ postSubs(); return; }
      if (!vid) return;
      if (cmd.action === 'pause'){ wasPlaying = false; markApplying(); vid.pause(); }
      else if (cmd.action === 'seek'){ markApplying(); vid.currentTime = cmd.time; }
      else if (cmd.action === 'rate'){ vid.playbackRate = cmd.rate; }
      else if (cmd.action === 'setSub'){
        var tt = vid.textTracks || [];
        for (var i = 0; i < tt.length; i++){
          if (!isSubTrack(tt[i])) continue;
          tt[i].mode = (cmd.id != null && String(i) === String(cmd.id)) ? 'showing' : 'disabled';
        }
        postSubs();
      }
      else if (cmd.action === 'fullscreen'){
        var fs = vid.requestFullscreen || vid.webkitRequestFullscreen || vid.webkitEnterFullscreen;
        if (fs) fs.call(vid);
      }
    } catch(e){}
  };
  window.__soloCmd = function(cmd){
    if (!vid || !cmd) return;
    try {
      if (cmd.action === 'play'){ wasPlaying = true; var up = vid.play(); if (up && up.catch) up.catch(function(){}); }
      else if (cmd.action === 'pause'){ wasPlaying = false; vid.pause(); }
      else if (cmd.action === 'seek' && typeof cmd.time === 'number'){ vid.currentTime = cmd.time; }
    } catch(e){}
  };
  true;
})();
`;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/scripts/generic-bridge.test.ts && npm test && npx tsc --noEmit && npm run lint`
Expected: 9/9 PASS, suite green, tsc clean, lint 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/generic-bridge.ts src/scripts/generic-bridge.test.ts package.json package-lock.json
git commit -m "feat(bridge): a generic bridge that puts our controls on any reachable <video>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Wire the generic bridge into the player (config prologue, caps, subtitles, move-on)

**Files:**
- Modify: `components/player/types.ts`
- Modify: `components/player/HijackPlayer.tsx`, `components/player/HijackPlayer.web.tsx`
- Modify: `components/player/PlayerSettingsSheet.tsx`; Test: `components/player/PlayerSettingsSheet.test.tsx`
- Modify: `src/screens/PlayerScreen.tsx`

**Interfaces:**
- Consumes: `BridgeCaps`, `hijackCapabilities(p, os, reported?)`, `nextBindableProvider`, `isStalledStart`
  (Task 2); bridge events `caps`/`subs` and command `setSub` (Task 3).
- Produces: `PlayerEventType` adds `"caps" | "subs"`; `PlayerEvent` adds
  `caps?: BridgeCaps; subs?: SubtitleTrack[]`; `export interface SubtitleTrack { id: string; label: string; language: string; selected: boolean }`;
  `PlayerHandle.setSubtitle(id: string | null): void`; `HijackPlayer` prop `revealProviderUiOnBindFail?: boolean`;
  `PlayerSettingsSheet` props `subtitles?: SubtitleTrack[]`, `onSetSubtitle?: (id: string | null) => void`,
  `showAudio?: boolean`, `showQuality?: boolean`.

- [ ] **Step 1: Write the failing test (settings sheet rows follow capabilities)**

```tsx
// components/player/PlayerSettingsSheet.test.tsx
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import PlayerSettingsSheet from "./PlayerSettingsSheet";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const base = {
  visible: true,
  onClose: () => {},
  canControl: true,
  rate: 1,
  onSetRate: () => {},
  qualities: [],
  onSetQuality: () => {},
  audios: [],
  onSetAudio: () => {},
};
const texts = (r: ReactTestRenderer) =>
  r.root.findAll((n) => typeof n.props.children === "string").map((n) => n.props.children as string);

describe("PlayerSettingsSheet", () => {
  it("hides Audio and Quality when the source can't switch them", () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<PlayerSettingsSheet {...base} showAudio={false} showQuality={false} />);
    });
    expect(texts(r)).not.toContain("AUDIO");
    expect(texts(r)).not.toContain("QUALITY");
    expect(texts(r)).not.toContain("Loading…");
  });

  it("lists subtitles with an Off choice and reports the pick", () => {
    const onSetSubtitle = jest.fn();
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <PlayerSettingsSheet
          {...base}
          showAudio={false}
          showQuality={false}
          subtitles={[
            { id: "0", label: "English", language: "en", selected: false },
            { id: "2", label: "Hindi", language: "hi", selected: true },
          ]}
          onSetSubtitle={onSetSubtitle}
        />,
      );
    });
    expect(texts(r)).toEqual(expect.arrayContaining(["SUBTITLES", "Off", "English", "Hindi"]));
    const english = r.root.find((n) => n.props.accessibilityLabel === "Subtitles English");
    act(() => english.props.onPress());
    expect(onSetSubtitle).toHaveBeenCalledWith("0");
    const off = r.root.find((n) => n.props.accessibilityLabel === "Subtitles off");
    act(() => off.props.onPress());
    expect(onSetSubtitle).toHaveBeenCalledWith(null);
  });

  it("keeps today's rows for the legacy bridge (defaults)", () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<PlayerSettingsSheet {...base} />);
    });
    expect(texts(r)).toEqual(expect.arrayContaining(["AUDIO", "QUALITY"]));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest components/player/PlayerSettingsSheet.test.tsx`
Expected: FAIL — "AUDIO" still rendered when `showAudio={false}`; no SUBTITLES section.

- [ ] **Step 3: Implement**

`components/player/types.ts` — add:

```ts
export interface SubtitleTrack { id: string; label: string; language: string; selected: boolean }
```

extend `PlayerEventType` with `| "caps" | "subs"`, add to `PlayerEvent`:

```ts
  caps?: { quality: boolean; audio: boolean; subtitles: boolean }; // on "caps" (generic bridge)
  subs?: SubtitleTrack[];                                            // on "subs"
```

and to `PlayerHandle`: `setSubtitle(id: string | null): void;`

`components/player/PlayerSettingsSheet.tsx` — add props
`showAudio = true, showQuality = true, subtitles = [], onSetSubtitle` and render:

```tsx
              {showAudio ? (
                <>
                  <Text style={styles.section}>AUDIO</Text>
                  {/* existing AUDIO row unchanged */}
                </>
              ) : null}

              {showQuality ? (
                <>
                  <Text style={styles.section}>QUALITY</Text>
                  {/* existing QUALITY row unchanged */}
                </>
              ) : null}

              {subtitles.length ? (
                <>
                  <Text style={styles.section}>SUBTITLES</Text>
                  <View style={styles.row}>
                    {(() => {
                      const offOn = !subtitles.some((s) => s.selected);
                      return (
                        <Pressable
                          accessibilityLabel="Subtitles off"
                          style={[styles.chip, offOn && styles.chipOn]}
                          onPress={() => onSetSubtitle?.(null)}
                        >
                          <Text style={[styles.chipText, offOn && styles.chipTextOn]}>Off</Text>
                        </Pressable>
                      );
                    })()}
                    {subtitles.map((s) => (
                      <Pressable
                        key={s.id}
                        accessibilityLabel={`Subtitles ${s.label}`}
                        style={[styles.chip, s.selected && styles.chipOn]}
                        onPress={() => onSetSubtitle?.(s.id)}
                      >
                        <Text style={[styles.chipText, s.selected && styles.chipTextOn]}>{s.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}
```

`components/player/HijackPlayer.tsx`:
1. Injection prologue: where the nonce prologue is built for `injectedJavaScriptBeforeContentLoaded`, prepend the
   provider config so the bridge reads it at document-start:

```ts
const bridgeCfg = {
  chromeOff: !!nativeControls,
  autoStart: true,
  startSelectors: provider?.hijack.startSelectors ?? [],
};
// …in the injected string, before the bridge:
`window.__vlCfg=${JSON.stringify(bridgeCfg)};`
```

2. Track reported caps and subtitles:

```ts
const reportedCapsRef = useRef<BridgeCaps | undefined>(undefined);
const subsRef = useRef<SubtitleTrack[]>([]);
// in handleMessage, before onPlayerEvent?.(e):
if (e.event === "caps" && e.caps) reportedCapsRef.current = e.caps;
if (e.event === "subs" && e.subs) subsRef.current = e.subs;
```

   Reset both on the same media/provider change effect that resets `fatalError`.
3. Handle: `getCapabilities: () => hijackCapabilities(getProvider(providerId), OS, reportedCapsRef.current)` where
   `const OS = Platform.OS === "ios" ? "ios" : "android"`; `getTracks` returns
   `subsRef.current.map((s) => ({ id: s.id, label: s.label, language: s.language || undefined, kind: "text", selected: s.selected }))`;
   `setSubtitle: (id) => cmd({ action: "setSub", id })`.
4. Reveal-provider-UI fallback: in the bind-timeout effect, when `!boundRef.current` and
   `revealProviderUiOnBindFail` is true, `relayInject("window.__vlChromeOff&&window.__vlChromeOff(false)")` before
   `onBindFailed?.()`.

`components/player/HijackPlayer.web.tsx`: add `setSubtitle: () => {}` to the handle.

`src/screens/PlayerScreen.tsx`:
1. State: `const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);` and
   `const [caps, setCaps] = useState<BridgeCaps | undefined>();` — set from `onEvent` for `subs`/`caps`
   events; reset with qualities/audios on provider change.
2. Pass to the sheet: `showAudio={caps ? caps.audio : true} showQuality={caps ? caps.quality : true}
   subtitles={subtitles} onSetSubtitle={(id) => playerRef.current?.setSubtitle(id)}`.
3. Bind-or-move-on (solo only — in a party the host owns the source):

```ts
const triedRef = useRef<Set<string>>(new Set());
useEffect(() => { triedRef.current = new Set(); }, [id, type, season, ep]);
const os: OS = Platform.OS === "ios" ? "ios" : "android";
const nextOnFail = useMemo(
  () => (selected ? nextBindableProvider(providers, selected.id, new Set([...triedRef.current, selected.id]), os) : undefined),
  [providers, selected, os],
);
const onBindFailed = useCallback(() => {
  if (!selected) return;
  triedRef.current.add(selected.id);
  recordProviderFailure(mediaKey(media), selected.id);
  if (DEV_BIND_LOG) logBind(selected.id, false);
  if (nextOnFail) setSelected(nextOnFail); // silent: the loading card stays up
}, [selected, media, nextOnFail]);
```

   Pass `onBindFailed={onBindFailed}` and `revealProviderUiOnBindFail={!nextOnFail}` to `HijackPlayer`.
4. Stalled start: keep `playIntentAtRef` (set when the user or autostart issues play) and `lastProgressAtRef`
   (set in `onEvent` when a `tick` advances `currentTime` by > 0.5 s). A 5 s interval calls
   `isStalledStart({ playIntentAt, lastProgressAt, now: Date.now() })` while `playerBound`; when true, call
   `onBindFailed()` once for that provider.
5. Dev bind log (gate instrumentation; dev builds only):

```ts
const DEV_BIND_LOG = __DEV__;
function logBind(providerId: string, ok: boolean) {
  const g = globalThis as unknown as { __bindLog?: { providerId: string; ok: boolean; ms: number }[] };
  (g.__bindLog ??= []).push({ providerId, ok, ms: Date.now() - mountTsRef.current });
}
```

   call `logBind(selected.id, true)` in the existing `onBound` path.

- [ ] **Step 4: Run tests**

Run: `npx jest components/player && npm test && npx tsc --noEmit && npm run lint`
Expected: PASS; tsc clean; lint 0 errors.

- [ ] **Step 5: Commit**

```bash
git add components/player src/screens/PlayerScreen.tsx
git commit -m "feat(player): our controls on every bindable provider; silent move-on when one won't bind" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Serve the generic bridge, measure which providers bind, set the data

**Files:**
- Modify: `scripts/upload-bridge.ts` (generic entries + `--emit-sql <file>`)
- Data: Supabase `providers` rows (via Supabase MCP `execute_sql`) — `bridge_script`, `script_version`, `hijack`,
  `enabled`, `priority`.

**Interfaces:**
- Consumes: `GENERIC_BRIDGE` (Task 3); `hijack.platforms` / `startSelectors` (Task 2).

- [ ] **Step 1: Teach the upload CLI the generic bridge**

In `scripts/upload-bridge.ts`, import `GENERIC_BRIDGE` and extend `SCRIPTS` for every hijack-supported provider
except videasy (which keeps its legacy bridge):

```ts
import { GENERIC_BRIDGE } from "../src/scripts/generic-bridge";
const GENERIC_PROVIDERS = ["vidfast", "vidlink", "vidnest", "vidcore", "vidphantom", "mycineby", "vixsrc", "111movies"];
const SCRIPTS: Record<string, string> = {
  [LEGACY_VIDEASY_ID]: LEGACY_VIDEASY_BRIDGE,
  ...Object.fromEntries(GENERIC_PROVIDERS.map((id) => [id, GENERIC_BRIDGE])),
};
```

Add `--emit-sql <file>`: after the existing parse smoke-test, write one statement per provider instead of calling
Supabase:

```ts
const sql = `UPDATE public.providers SET bridge_script = $bridge$${script}$bridge$, script_version = '${version}' WHERE id = '${id}';\n`;
```

- [ ] **Step 2: Validate and emit**

Run: `npx tsx scripts/upload-bridge.ts all --dry-run && npx tsx scripts/upload-bridge.ts all --emit-sql /tmp/claude-502/bridge.sql`
Expected: every provider passes the parse smoke-test; the SQL file has one UPDATE per provider, versions `generic@<8 hex>`.

- [ ] **Step 3: Publish and purge**

Run the emitted SQL through the Supabase MCP `execute_sql` (project `kdcghbuknadvcmjctsqk`), then purge the edge
cache without printing the token:

```bash
TOKEN=$(grep '^PURGE_TOKEN=' .env.local | cut -d= -f2- | tr -d '"'"'"); curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "x-purge-token: $TOKEN" https://netprime-worker.spiderfan-no1.workers.dev/cache/purge
curl -s https://netprime-worker.spiderfan-no1.workers.dev/config | python3 -c 'import json,sys; [print(p["id"], p["script_version"]) for p in json.load(sys.stdin)["providers"]]'
```

Expected: purge `200`; every generic provider now shows a `generic@…` version.

- [ ] **Step 4: Measure bindability in-app (both platforms)**

On the Android emulator and the iOS simulator (fresh launch each, Metro running), for each provider id in
`GENERIC_PROVIDERS` and each title in {Fight Club `movie/550`, Breaking Bad `tv/1396` S1E1, Game of Thrones
`tv/1399` S1E1}: open `bearoom://player?id=<id>&type=<type>[&season=1&ep=1]&providerId=<provider>`, wait 45 s, then
read `globalThis.__bindLog` over CDP (`rn-eval2.mjs`) and take a screenshot. Record a table
`provider × platform × title → bound / not bound / provider UI visible` in the ledger.

- [ ] **Step 5: Set the data from the measurements**

For each provider: `hijack.platforms = { ios, android }` from the table (bound on ≥ 2 of 3 titles = true); add
`startSelectors` where a provider needed a specific start control (found by inspecting its DOM over the WebView
devtools when the centre click didn't start it); providers that bound on no platform get `script_version = NULL`
(plain embed again). Order `priority` so providers bindable on both platforms come first, by measured bind time.
Disable `videasy` (`enabled = false`): it answers 403 to every load (spec §4). Apply with one `execute_sql`
transaction, purge again, confirm via `/config`.

- [ ] **Step 6: Commit**

```bash
git add scripts/upload-bridge.ts
git commit -m "build(bridge): serve the generic bridge for every hijack-capable provider" -m "Provider data set from in-app measurements on Android and iOS (table in the board entry)." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Gate on three devices, party drift, failure paths

**Files:**
- Modify: `services/party/PartySyncEngine.ts` (dev-only drift log)
- Modify: `docs/project-board.md` (entry with the measurements and gate results)

- [ ] **Step 1: Dev-only drift log**

In `PartySyncEngine` where a drift sample is pushed to `driftSamples`, also record it for the gate:

```ts
if (__DEV__) {
  const g = globalThis as unknown as { __partyDrift?: { t: number; d: number }[] };
  (g.__partyDrift ??= []).push({ t: Date.now(), d: sample });
}
```

(`sample` = the signed drift in seconds the engine already computes for that tick.)

- [ ] **Step 2: Install on the phone**

```bash
adb -s P2228K000422 install -r android/app/build/outputs/apk/debug/app-debug.apk
adb -s P2228K000422 reverse tcp:8081 tcp:8081
adb -s P2228K000422 shell am start -a android.intent.action.VIEW -d "exp+bearoom://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081" com.scriptingbear.bearoom
```

- [ ] **Step 3: Solo gate (each device)**

Fight Club, Breaking Bad S1E1, Game of Thrones S1E1 open in our controls; screenshot shows no provider UI;
play/pause/seek ±10/scrub work; subtitles row appears when the source has tracks and switching shows them.
Kill the first provider (open with `&providerId=` of a provider measured as non-binding) → the player moves on
silently and binds the next one.

- [ ] **Step 4: Party gate**

Host on the phone, guests on the emulator and the simulator, Fight Club. Play 10 minutes with a pause, a seek
and a ±10 from the host. Every 30 s read `globalThis.__partyDrift` on each guest over CDP; compute p95 of `|d|`.
Expected: p95 ≤ 1 s on every guest; no guest shows provider UI; host transport reaches guests within 2 s.

- [ ] **Step 5: F4**

Open `bearoom://player?id=99999999&type=movie` → every provider fails → the branded error card (Retry · Try another
source · Report) — never a blank player or a raw provider wall.

- [ ] **Step 6: Record, commit, push**

Board entry "Phase 1A — our skin on existing providers": the bind table, gate numbers, deferred items. Then:

```bash
git add services/party/PartySyncEngine.ts docs/project-board.md
git commit -m "docs(board): Phase 1A gate — our skin and party on existing providers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin feat/improvements
```
