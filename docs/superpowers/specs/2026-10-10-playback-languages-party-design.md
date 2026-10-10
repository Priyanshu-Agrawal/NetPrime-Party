# Playback, Languages & Watch Party — Design Spec

**Status:** DRAFT for owner review (2026-10-10). Nothing in here is built yet.
**Supersedes:** the engine and lane parts of [`docs/architecture/native-player.md`](../../architecture/native-player.md)
and Program 1 · P2/P3 sequencing in [`ROADMAP.md`](../../ROADMAP.md). The P1 queue spine (`0008`/`0009`, `PartySession`)
is kept as-is and built on.
**Evidence:** the eight research documents dated 2026-10 in [`docs/research/`](../../research/) (§4 lists what each one
decided).
**Owner gate:** owner approves this spec → `writing-plans` produces one plan per phase (§9) → implement.

---

## 1. Goal

The owner's requirement, in their words: *"play almost any title, in multiple languages, user-choosable, preferred Hindi
dubbed, with watch party, full-feature native player feel, multiple qualities, audios and dubs"* — and **the product flow
does not change**:

```
TMDB catalog → title page → [▶ Play] → Bearoom's own player (our controls)
                                        ├─ Language / dub   ├─ Quality   ├─ Subtitles   ├─ Speed
                                        ├─ Seek / ±10 s / scrub
                                        └─ [Watch Party] → room with the same controls, in sync
```

Either a **WebView hijack** (a provider's page driven by our controls) or a **native player** may do the playing; the user
must not be able to tell which, except where §6.3 says a capability is missing.

**Design principle, ranked (owner, 2026-10-10): robust and most stable first.** Concretely:

1. **No single point of failure.** No provider, plugin, repo or domain is required for Play to work.
2. **Every failure has a defined next step** the user can see (§7). No blank screens, no infinite spinners.
3. **Remote control without an app release.** Every new lane and source sits behind a `/config` flag and can be switched
   off server-side (the existing killswitch philosophy).
4. **Pinned and verified inputs.** Third-party code is pinned by hash, sandboxed, and can be marked down remotely.
5. **Measured gates.** Each phase ships only after its numeric gate passes on the Android emulator + iOS simulator
   (physical-device re-run before any release, §9).

### 1.1 Success criteria (measured on the §10 benchmark)

| # | Criterion | Target |
|---|---|---|
| S1 | Play starts (first frame) | **≥ 90 %** of benchmark titles; p50 time-to-first-frame **≤ 3 s**, p90 **≤ 8 s** |
| S2 | "Play in Hindi" plays **real** Hindi audio when any configured source has Hindi | **≥ 95 %** |
| S3 | Wrong content (trailer, wrong title, wrong cut) reaches the screen | **0** on the benchmark |
| S4 | Language never changes silently | 0 occurrences — every fallback is announced |
| S5 | Party drift, native lane (two devices, 10 min) | p95 **≤ 0.5 s** |
| S6 | Party drift, embed-API lane (two devices, 10 min) | p95 **≤ 2 s** |
| S7 | Every failure path in §7 ends on a visible recovery action | 100 % of the §7 table, tested |

## 2. Non-goals (YAGNI — explicitly out of this spec)

- **Writing, porting or vendoring scrapers**, or working around any site's anti-bot protection. Bearoom ships a
  **generic** plugin host; the **operator chooses plugin repos** (§5.4).
- Server-side stream resolution (rejected on evidence: `scraper-poc-postmortem.md`, `cooren-fit-adr.md` amendments).
- MKV / AC-3 / E-AC-3 / DTS playback and **libVLC**. Today's measured catalogue has none of it
  (`plugin-catalog-measurement-2026-10.md` §4). It returns only if the operator adds repos that serve it (§11, R6).
- Per-member **different-URL** alignment beyond the ±2.5 s rule (§6.4).
- Downloads, DRM content, casting. PiP / lock-screen / background audio are **Phase 4 polish**, not core (§9).
- The web target: `HijackPlayer.web.tsx` keeps working with embed lanes; the native lane is iOS + Android only.

## 3. Constraints and standing rules

- Expo SDK 53 · RN 0.79.6 · New Architecture · Hermes · `expo-video ~2.2.3` (SDK 53's bundled version).
- **No live blur and no elevation/glow on any screen that plays video** (proven stutter cause). No Reanimated
  `entering`/`exiting`/`layout` props. Never touch `src/ui/BearAlert.tsx` or `.codex/`.
- Off-store distribution (GitHub Releases + the custom `secure-ota` channel). Grey apps get store-pulled — see
  `competitor-teardown-2026-10.md` §pitfalls.
- **Operator** = the developer/owner who runs Bearoom's backend (holds the secrets, controls `/config`, the provider
  table and the plugin-repo table) — never the app's end users. Operator holds all secrets. `/config` with an empty
  source list = listing-only app (store-review killswitch).
- **Division of work (owner, 2026-10-10):** the agent builds, tests and verifies every phase; the owner connects a
  physical device when a gate needs one and gives the yes/no on which plugin repos are switched on (from the §9
  Phase 2 scorecard).
- Supabase is on the Free plan and auto-pauses after ~7 idle days (memory `supabase-free-tier-pause`). Anything the
  party depends on must degrade cleanly when the backend is unreachable (§7).

## 4. Evidence that drives the decisions

| Decision | Evidence (doc · section) |
|---|---|
| **expo-video** is the native engine (not libVLC) | Catalogue is HLS/MP4 H.264+AAC and DASH HEVC+AAC; 61 % of Hindi streams need Cookie/Origin headers libVLC cannot send; expo-video sends any header (`plugin-catalog-measurement` §4–5; `similar-apps-architecture` §1.12) |
| iOS gets headers on **every** segment request, incl. cross-host and post-302; **Origin is dropped after a 302** | AVFoundation spike T1 (memory `player-engine-decision-2026-10`) |
| iOS cannot switch audio tracks **muxed inside one TS**; disguised `.jpg/.html` segments play | Spikes T2, T6 |
| DASH plays on Android only | expo-video types; AVPlayer has no DASH |
| SDK 53 iOS seeks are imprecise (loose tolerance) | `similar-apps-architecture` §1.12 (fixed in SDK 54) |
| VidFast publishes an **official postMessage control API** ("perfect for watch party") but offers **original audio only** | VidFast docs (verified) + live in-app check; Reddit low-signal corroboration (`reddit-deep` §5) |
| Plugins had **Hindi for 12/12** benchmark titles; ~10 % of streams are wrong content | `plugin-catalog-measurement` §3, §9 |
| Sandbox shape: hidden WebView + per-call worker + native fetch with per-hop private-IP check + per-plugin cookie jars; attach the plugin's cookies as the stream's `Cookie` | `vega-cloudstream-teardown` §1, §3 |
| Plugin update model: integer version + sha256 + remote "down" flag | `vega-cloudstream-teardown` §2 |
| Sync: keep current bands; add buffering debounce 3 s, future-scheduled transitions, 30 s ready barrier, catch-up | `similar-apps-architecture` §2, §3.6 |
| Different-URL language switch in a party only within ±2.5 s duration | Syncplay rule, `similar-apps-architecture` §3.7 |
| Show language availability **before** Play; choose audio **by language**; remember per title | `competitor-teardown` patterns; `reddit-deep` §1 complaints |
| Sources die every few weeks; domains move/clone | `reddit-deep` §4; `indexes-beyond-fmhy` §5 |
| Free health feed exists (IbbyLabs JSON `/v1/status`, ~5 min) | `indexes-beyond-fmhy` §4 (verified live) |
| Party UX: stable room code + link, readiness lobby, attributed toasts, one-tap resync, pass the remote, private by default | `competitor-teardown` patterns |

## 5. Architecture

### 5.1 Overview

```
                                   Supabase ──► Worker /config
                                                 │  providers[] (embed lanes, existing table)
                                                 │  pluginRepos[] (url, version, sha256, enabled, down)   NEW
                                                 │  flags { embedApiLane, nativeLane, pluginHost }        NEW
                                                 │  health { sourceId → up|degraded|down }                NEW
                                                 ▼
 Title page ──(dwell 600 ms)──► PlaybackResolver ◄──────────── Play
   "▶ Play in Hindi"                 │  one API for both lanes, streams results as they arrive
                                     ├── EmbedSource ── providers[] → embed candidates (existing registry)
                                     └── PluginHost ─── hidden sandbox WebView → plugin candidates
                                                │            └── NativeFetch (Expo module): headers, manual redirects,
                                                │                Set-Cookie, per-hop public-IP check, per-plugin jar
                                                ▼
                                    StreamProbe (reachability · duration vs TMDB · language · platform)
                                                ▼
                                    rankCandidates()  ── pure, unit-tested
                                                ▼
                     ┌──────────────── PlayerHandle v2 (neutral contract) ────────────────┐
                     │ NativePlayer (expo-video)        HijackPlayer (WebView)            │
                     │   plugin streams                   ├─ embedApi mode (VidFast API)   │
                     │                                    └─ plain embed (solo only)       │
                     └──────────────────────────────────────────────────────────────────┘
                                                ▼
                         PlayerControls + PlayerSettingsSheet (unchanged shape, new rows)
                                                ▼
                         PartySession → PartySyncEngine (extended §6.4) ── Supabase Realtime
```

### 5.2 PlayerHandle v2 — the one contract both players implement

Moved out of `HijackPlayer.tsx` into a neutral module **`components/player/types.ts`** (today `QualityLevel` and
`PlayerEvent` are exported from the WebView player; the sync engine imports from there). Existing methods stay
source-compatible; additions are marked **new**.

```ts
export type EngineId = "native" | "embedApi" | "embed";

export interface PlayerCapabilities {            // new — the UI and sync engine read these, never the engine id
  fractionalRate: boolean;     // native: true · embedApi: false · embed: depends on bridge
  preciseSeek: boolean;        // native: true after the §8 seek patch · embedApi: false (integer seconds)
  audioTracks: boolean;        // in-stream track switching available for THIS stream on THIS platform
  qualitySelect: boolean;      // native: variant URLs (§6.2) · embedApi: false
  subtitles: boolean;          // native: our overlay · embedApi: provider menu only
  partySync: boolean;          // embed (no API, no bridge): false
}

export interface MediaTrack { id: string; language?: string /* ISO-639-1 */; label: string;
  kind: "audio" | "text"; channels?: number; codec?: string; selected: boolean; }

export interface PlayerHandle {
  play(): void; pause(): void; setRate(rate: number): void; fullscreen(): void; reload(): void;
  seek(seconds: number): Promise<number>;        // CHANGED: resolves with the LANDED position (new)
  readQuality(): void; setQuality(label: string): void;
  readAudio(): void;   setAudio(label: string): void;
  getCapabilities(): PlayerCapabilities;          // new
  getTracks(): MediaTrack[];                      // new
}

// PlayerEvent keeps today's shape ({ event, currentTime, duration, paused, readyState?, qualities?, audios? }) —
// seven files consume it. Additions are optional fields and two event types, so existing consumers compile unchanged:
export type PlayerEventType = /* existing: "ready" | "play" | "pause" | "seeking" | "seeked" | "ended" | "waiting"
  | "playing" | "canplay" | "tick" | "enterfullscreen" | "exitfullscreen" | "quality" | "audio" | "gesture" | "notFound" */
  | "buffering"   // new: raw stall start/end; the sync engine debounces (§6.4)
  | "tracks";     // new: the active stream's real tracks (native lane)
export interface PlayerEvent {
  /* existing fields unchanged */
  buffering?: boolean;          // new, on "buffering"
  bufferedAheadSec?: number;    // new, on "tick" when the engine knows it
  tracks?: MediaTrack[];        // new, on "tracks"
}
```

`NativePlayer` emits the same events the WebView bridge does (`ready`, `play`, `pause`, `seeked`, `ended`, `tick`) — for
expo-video `seeked` is synthesised (§6.2). `seek` returning the landed position is what lets the sync engine stop
re-triggering hard seeks on keyframe landings. `PlayerControl` in `PartySyncEngine.ts` is replaced by `PlayerHandle`
(it was a subset).

### 5.3 The stream model

One shape for every candidate, embed or plugin. Stremio-shaped so external repos map onto it, plus fields **Bearoom
measures itself** because plugin metadata is unreliable (labels lie: Castle "1080P" is 720p; zero-width characters pad
names).

```ts
export interface PlaybackCandidate {
  key: string;                 // stable id: `${sourceId}:${hash(normalisedLabel + url-path-shape)}` — survives re-resolve
  lane: EngineId;
  sourceId: string;            // provider id (embed) or `${repoId}/${pluginId}` (plugin)
  title: string;               // display label, zero-width chars stripped
  url?: string;                // plugin streams only; never logged
  headers?: Record<string, string>;   // REQUIRED subset after probing (§5.5), not the plugin's declared set
  container?: "hls-master" | "hls-media" | "dash" | "mp4";
  languages: string[];         // ISO-639-1 from label + manifest tags + probe; [] = unknown, never guessed
  muxedAudio?: number;         // >1 ⇒ in-stream track switching possible (Android only, T2)
  quality?: { label: string; probedHeight?: number };
  durationSec?: number;        // probed
  platforms: { ios: boolean; android: boolean };   // DASH ⇒ ios:false; Origin-after-302 ⇒ ios:false
  subtitles?: { url: string; language?: string; label: string; headers?: Record<string, string> }[];
  expiresHint?: number;        // epoch ms, for Cookie-signed streams
  verdict: "ok" | "unverified" | "rejected";
  rejectReason?: "unreachable" | "duration" | "wrong-title" | "platform" | "html-body";
}
```

`QueueRefPlugin` in `services/party/protocol.ts` already has `pluginId`, `streamId`, `language`; `streamId` carries
`PlaybackCandidate.key`.

### 5.4 PluginHost — generic, sandboxed, pinned

**Location:** `services/plugins/` (host logic), `components/plugins/PluginSandbox.tsx` (the one hidden WebView, mounted
once near the app root), `modules/bearoom-fetch/` (Expo native module).

- **Registry (operator-controlled).** `/config.pluginRepos[]` = `{ id, manifestUrl, version:int, files:[{path, sha256}],
  enabled, down, allowPlugins?:string[] }` from a new Supabase table. The app downloads each file **once per version**,
  verifies **sha256**, stores it in MMKV, and never fetches a moving branch. `down:true` unloads a plugin remotely.
  The last verified version stays usable if a new download fails (last-known-good).
- **Contract.** Nuvio-style `getStreams(tmdbId, type, season, episode)` (the format the operator's chosen repos use).
  Host shims measured as necessary (`plugin-catalog-measurement` §9): `TMDB_API_KEY`/`SCRAPER_SETTINGS`/`CryptoJS`
  globals, `cheerio` → `cheerio/slim`, `crypto-js`, and **TMDB calls rewritten to the app's TMDB proxy** (TMDB is
  blocked on Indian networks).
- **Sandbox** (Vega/Cove shape, hardened per `nuvio-plugin-architecture` §7.1d): CSP `default-src 'none'`; a **fresh
  Worker per plugin call** with network globals deleted; `window.ReactNativeWebView` captured then deleted; all egress
  through the fetch bridge; `domStorageEnabled={false}`; reload-on-hang.
- **Budgets** (Cove): ≤ 12 plugins in parallel, **15 s per plugin, 20 s overall**; return early when ≥ 3 candidates exist
  and 1.2 s pass with no new results; stragglers finish into a 15-minute per-title cache; failures are never cached;
  **an empty result in < 100 ms counts as a failure** (silent contract break).
- **NativeFetch (Expo module, decided).** RN `fetch` ignores `redirect:'manual'` and can't expose `Set-Cookie`
  reliably (Aug finding), and the host needs per-hop address checks. So: Kotlin/OkHttp + Swift/URLSession with
  manual redirects (≤ 5 hops), **public addresses only, re-checked on every hop**, credentials stripped on cross-host
  redirects, 8 s per request, 20 MiB per body, per-plugin cookie jar. After a plugin returns, the host **attaches that
  plugin's jar cookies as each stream's `Cookie` header** (unlocks the Cookie-gated Hindi DASH on Android).
- **Concurrency per backend.** Requests are serialised per **backend**, not per hostname (playimdb/zevran's ~15 hostnames
  share one backend that 429s under parallel load).

### 5.5 StreamProbe — trust nothing a plugin says

`services/playback/probe.ts`, budget **6 s per candidate**, runs only on the top few ranked candidates, serially per
backend:

1. **Reachability:** master → first variant → first segment (`Range: bytes=0-2047`). Reject `text/html` bodies that are
   not playlists, and tiny error bodies. Segments named `.jpg`/`.html` are **allowed** (T6).
2. **Required headers:** test the plugin's headers minus each non-essential one only when a stream first fails without
   it; cache the required subset per backend (the measured truth: Cookie for MovieBox DASH, Origin for Vidrock, nothing
   for Castle/playimdb).
3. **Duration check:** probed duration vs TMDB runtime — **±8 min** for films, **±3 min** for episodes. Out of range ⇒
   `rejected: duration` (catches the 10-min previews, 188-s trailer, 417-min season files).
4. **Language:** union of label, manifest tags (`EXT-X-MEDIA LANGUAGE`, DASH `lang`) and, after open, the player's
   reported tracks. Unknown stays unknown.
5. **Platform:** DASH ⇒ iOS false. A candidate whose required `Origin` is only reachable through a 302 ⇒ iOS false (T1).

### 5.6 Ranking — `rankCandidates()` (pure function, unit-tested)

Explicit order, no opaque score:

1. `verdict !== "rejected"` and playable on **this** platform (and, in a party, on **every** member's platform).
2. **Language:** the per-title remembered choice, else the user's ordered list (default `["hi", "original"]`); a
   candidate with the language in-stream ranks with one that is that language.
3. **Health:** sources marked down by `/config.health` or by local failure memory (5 consecutive failures ⇒ down; heal
   after 1 h → 4 h → 8 h) sink. Title-scoped failure memory (`utils/failureMemory.ts`) is advisory and never overrides
   an explicit user pick.
4. **Lane preference:** native > embedApi > embed (only native gives language/quality control).
5. **Probed quality**, then **latency**.

Startup policy "balanced": start the best **ready** candidate, but wait **up to 1 s** for an in-flight candidate that
would match the preferred language better.

### 5.7 Health

- **Own telemetry:** extend `POST /report` with `{ lane, sourceId, outcome, stage, ttffMs }` (no URLs, no tokens, no
  user ids — same privacy rules as today).
- **External feed:** the **worker** (not the app) reads IbbyLabs `/v1/status` and folds it into `/config.health`, cached
  at the edge. If the feed is down, health is simply absent — ranking falls back to local memory.
- Domains move and get cloned: provider/plugin identity is the `sourceId`, never a hostname.

## 6. Behaviour

### 6.1 Title page — language before Play

After 600 ms on a title page, the resolver runs in **preview** mode (embed list + plugin host, no probing beyond step 1)
and the Play button becomes one of:

- **▶ Play in Hindi** (preferred language found) — secondary chip "Other languages ▾" lists what was found.
- **▶ Play** + quiet note "Hindi not available for this title" (sources answered, none had it).
- **▶ Play** + "Checking languages…" while still resolving — **Play is never blocked by the preview**.

Preview results seed Play (15-minute cache), so pressing Play after the preview is near-instant. Preview never runs on
data-saver / metered connections unless the user opts in (setting).

### 6.2 Player — our controls, honest capabilities

`PlayerControls` keeps its imperative `setPlayback()` shape. `PlayerSettingsSheet` gains rows that render **only when
the active player's capabilities allow** them (no dead buttons):

- **Language / Audio:** one row per language (Netflix pattern), backed by either an in-stream track (Android, muxed)
  or a sibling candidate. Choosing a sibling = `replaceAsync` + seek to the same position. The choice is remembered
  **per title** and becomes the next default. If the chosen language disappears on failover, a toast says so — never
  silent.
- **Quality:** "Auto" (ABR) + the HLS master's variants. expo-video's `videoTrack` is read-only, so manual quality =
  load that variant's media playlist + seek (local only, never on the party anchor).
- **Subtitles:** plugin subtitle lists rendered by **our own overlay** (`SubtitleOverlay`, WebVTT/SRT, driven by
  `tick`), because expo-video has no sidecar API. Includes an offset control.
- **Speed**, **Source** (existing ProviderSheet, now listing candidates with language/quality/lane badges).
- Labels show the **current** value: "Audio · Hindi", "Quality · 720p (Auto)".

**NativePlayer specifics (expo-video):** `timeUpdateEventInterval = 0.5 s`; `seeked` synthesised from `statusChange`
(loading → readyToPlay) plus `timeUpdate` crossing the target; `buffering` from `statusChange`; `preservesPitch: true`.
**SDK 53 iOS seek patch:** a `patch-package` patch setting `toleranceBefore/After: .zero` in expo-video's
`VideoPlayer.swift` (the one-line SDK 54 fix), removed when the app moves to SDK 54.

**HijackPlayer `embedApi` mode (new):** for providers whose `/config` entry declares `hijack.api = "vidfast-postmessage"`
(VidFast first; VidCore.io/VidZen/CinemaOS use the same documented command set and can be enabled by data alone once
verified). The WebView loads a tiny **host page** (`source={{ html, baseUrl }}`) that iframes the embed URL with
`autoPlay`, `startAt`, `hideServer`, `chromecast=false`, `fullscreenButton=false`, relays `play/pause/seek{int}/getStatus`
in, and validates `PLAYER_EVENT` by origin out. Capabilities: `fractionalRate:false`, `preciseSeek:false`,
`audioTracks:false`, `qualitySelect:false`, `partySync:true`. The provider's own settings gear stays reachable for its
quality menu. Plain embeds (no API, no bridge) keep today's behaviour and `partySync:false`.

### 6.3 What the user sees when a capability is missing

| Situation | UI |
|---|---|
| Playing via embedApi (e.g. VidFast) | Audio row reads "Original audio (this source)"; Quality row opens the provider's menu |
| No Hindi anywhere | Toast once: "Hindi isn't available for this title — playing original audio" |
| Chosen language lost on failover | Toast: "Switched to <source> — Hindi isn't on this one. Change ▸" |
| iOS member in a room whose best stream is DASH | Host's picker greys DASH with "Not playable on iPhone" |

### 6.4 Watch party

**One room stream.** The host's chosen candidate is the room's clock. The room stores only the **stable key**
(`QueueRefPlugin { pluginId, streamId=key, language }` or `QueueRefTmdb { providerId }`); the host additionally sends
the resolved `{ url, requiredHeaders, durationSec }` **over the private Realtime channel** (ephemeral, RLS-gated since
`0007`; never written to Postgres, never logged).

**Guest join:** try the host's URL + headers → on 401/403/expired, re-resolve the **same plugin + key** locally →
verify duration within **±2.5 s** of the room's → else show "This source won't play here" with the host-side fix
(pick another stream). A candidate is only offered to the host if it is playable on **every** current member's
platform (§5.6 rule 1).

**Per-member language:** an in-stream track (Android, muxed) can be switched freely — same timeline. A **different URL**
in another language is allowed only if its probed duration is within ±2.5 s of the room stream; otherwise the option is
shown disabled with "Different cut — would desync".

**Quality** is always per device and never touches the anchor.

**Sync engine extensions** (`services/party/PartySyncEngine.ts`; keep current bands: dead-band 0.2 s, rate 0.9–1.1×,
hard seek ≥ 3 s × 3 samples, 8 s cooldown):

- Read `getCapabilities()`: when `fractionalRate` is false (embedApi), skip nudging and use a **2 s seek dead-band**.
- **Buffering protocol (Jellyfin SyncPlay):** a stall counts only after **3 s**; a guest's long stall never pauses the
  room — the guest catches up by seeking to the live anchor (+1 s for HLS); a **host** stall pauses the room
  ("Waiting for <host>…").
- **Scheduled transitions:** host play/seek/resume anchors carry `serverStartMs = now + max(2 × max member RTT, 500 ms)`
  (RTT clamped ≤ 10 s); members pre-seek while paused and start on time.
- **Ready barrier:** after a host seek or resume, wait for members' `ready`, at most **30 s**, then start without
  stragglers; a member may opt out of being waited for.

**Party UX additions** (existing room/queue/tray kept):

- **Room code + link that never changes** when the title changes (share sheet → WhatsApp first).
- **Readiness lobby** before the first play: each member Invited → Loading → Ready; auto-start when all ready or after
  the 30 s barrier; host can "Start without".
- **Attributed toasts:** "Riya paused", "Aman is buffering…", "Waiting for Aman · Continue without".
- **One-tap Resync** for guests. **Pass the remote** / transfer host / remove member (host). **Private by default.**

**Schema:** one migration (`0010_party_room_stream.sql`) adds the stable stream key and language to the room's current
queue item mirror if `0008`/`0009` don't already carry it (verified in the Phase 3 plan before writing). Tested with
the existing `supabase/tests` pattern. **Flagged for owner review** — stored-schema changes are on the escalation list.

## 7. Failure handling — every row ends on something the user can do

| # | Failure | Behaviour | User sees |
|---|---|---|---|
| F1 | `/config` unreachable / Supabase paused or erroring | Worker serves its **last-known-good** list (`stale:true`) instead of `[]`; app falls back to its MMKV copy (§9 Phase 0 — neither exists today: on 2026-10-10 a paused Supabase turned `/config` into `providers:[]`, indistinguishable from the killswitch) | Normal app; a banner only if neither copy exists |
| F2 | Plugin host disabled / fails to boot | Resolver runs embed lanes only | Nothing different (today's behaviour) |
| F3 | One plugin hangs or throws | Per-plugin timeout; sandbox reload on hang | Nothing |
| F4 | All candidates fail probing | Branded error: Retry · Try another source · Report | Error card, never a blank player |
| F5 | Candidate rejected for duration / wrong title | Excluded, reported via `/report` | Nothing (next candidate) |
| F6 | Mid-play 401/403/expired | Re-resolve **same key** once → seek back; then next candidate **same language**; then ask | ≤ 2 s spinner, or a language-change toast (§6.3) |
| F7 | Mid-play stall > 3 s | Native buffering; party protocol (§6.4) | Spinner; party toasts |
| F8 | Network lost | Existing NetInfo banner; pause; resume position on return | Offline banner |
| F9 | Sandbox WebView killed (iOS memory pressure) | Recreate on next resolve | Nothing |
| F10 | Plugin repo hash mismatch / download fails | Keep last-known-good version; mark repo degraded | Nothing |
| F11 | Party backend unreachable mid-room | Local playback continues; reconnect with backoff; re-anchor on return | "Reconnecting to room…" |
| F12 | Host leaves | Existing lease (6 s) → guests run `party_claim_host` (joinedAt-ranked, `PartyClient.claimHost`) | "<name> is now the host" |
| F13 | Embed-API provider stops answering `getStatus` | Mark `partySync:false` for this session, offer another source | "Sync lost on this source — switch?" |
| F14 | Lane flag turned off remotely | Resolver skips that lane on next resolve | Nothing |

## 8. Security

- Plugins: pinned by sha256 per version; remote `down`; sandbox CSP + no RN bridge access; all egress through
  NativeFetch with **public-address-only** checks on every redirect hop (SSRF guard); per-plugin cookie jars; no trust-all
  TLS anywhere (the Nuvio anti-pattern).
- Stream URLs and cookies are never logged, never sent to `/report`, never written to Postgres; party transfer is over
  the RLS-gated private channel only.
- Embed-API host page: `postMessage` target origins restricted to the provider's documented origins; inbound events
  accepted only from those origins (VidFast publishes its origin list).
- Minimal Android permissions (no new ones for this spec).

## 9. Phases and gates

Each phase gets its own implementation plan (`writing-plans`). Gates run on the Android emulator + iOS simulator; the
same gates re-run on physical devices before any release.

| Phase | Scope | Gate (all must pass) |
|---|---|---|
| **0 — Foundations** | **Config resilience** (worker: a Supabase error serves the last-known-good list from **Workers KV** — durable and global, unlike the per-colo evictable edge cache — with `stale:true`; only a *successful* empty query is the killswitch, signalled by an explicit `killswitch:true`; app: persist the last good `/config` in MMKV and boot from it); `components/player/types.ts` (PlayerHandle v2, neutral types); `jest-expo` + worker `vitest` unit-test harnesses; `/config` flags (`embedApiLane`, `nativeLane`, `pluginHost`) + worker schema; iOS simulator dev build | Pausing Supabase no longer empties the app (tested by pointing a local worker at an unreachable Supabase URL); `tsc` + lint clean; unit tests pass via `npm test` (app) and `npm test` (worker); existing Play/party unchanged on both devices |
| **1 — Embed-API lane** | HijackPlayer `embedApi` mode + host page; VidFast enabled via data; sync engine capability read (no-nudge, 2 s band); fix `providerRegistry.ts:113` (`nextEpisode` must be gated on `!opts.party`); `/report` fields (`lane`, `stage`, `ttffMs`); dev-only benchmark runner (moved from Phase 0: both need this phase's player events to measure anything) | Benchmark S1 ≥ 90 % via embed lanes; party 10 min emulator↔sim, drift p95 ≤ 2 s (S6); F4/F13/F14 tested |
| **2 — Native lane** | `NativePlayer` (expo-video, seek patch, synthesised `seeked`); NativeFetch module; PluginHost + registry table; StreamProbe; `rankCandidates`; language prefs + per-title memory; title-page preview; Settings rows; SubtitleOverlay; **repo scorecard** (dev tools: paste a repo URL → sandboxed run of the benchmark → titles played, real-Hindi rate, wrong-content rate, iOS playability, speed, readable-vs-obfuscated, last update — the owner's yes/no on enabling a repo is made from this) | S1, S2 (≥ 95 %), S3 (0), S4 on the benchmark; T1–T3 re-run on the **iOS simulator inside the app**; T4 Android DASH + Cookie plays; F1–F10 tested |
| **3 — Party on native** | Room stream key + private-channel URL handoff; guest re-resolve + ±2.5 s check; buffering debounce, scheduled transitions, ready barrier; lobby, toasts, resync, pass-the-remote; migration `0010` (+ SQL tests) | S5 drift p95 ≤ 0.5 s over 10 min; buffering scenarios (guest stall, host stall, 30 s barrier) pass; F11/F12 tested |
| **4 — Polish** | UI/animation pass (device-verified screenshots per the quality bar); PiP / background audio / lock-screen via expo-video; physical-device gate | Owner sign-off on screenshots; physical 2-phone gate (§11 R1) |

Order rationale: Phase 1 restores Play + Watch Party within the existing component (smallest change, immediately
useful); Phase 2 delivers the Hindi requirement; Phase 3 moves the party onto the lane that gives full control.

## 10. Testing

- **Benchmark (shared by every gate):** the 12 titles of `plugin-catalog-measurement-2026-10.md` (Jawan, Pathaan,
  Animal, Stree 2, Pushpa 2, Endgame, Oppenheimer, The Godfather, Spider-Man: Brand New Day, Breaking Bad S1E1, Mirzapur
  S1E1, Panchayat S1E1) **plus 8** chosen at Phase 0 for breadth (one 2026 Hindi release, one South-Indian original,
  one anime with a Hindi dub, one older TV episode, four random from the trending feed). The dev-only runner plays each
  for 20 s and records lane, source, language heard (track or label), TTFF, and outcome.
- **Unit (jest-expo):** `rankCandidates`, language normalisation (`hin→hi`, label parsing, zero-width stripping),
  duration check, candidate key stability, stream-model conversion, PluginHost contract rules (timeouts, `< 100 ms`
  empty = failure, last-known-good), embed-API message handling (origin checks), `PartySyncEngine` with a fake clock
  (dead-band, nudges, capability-off path, buffering debounce, scheduled start, barrier timeout).
- **SQL:** migration `0010` tests in `supabase/tests/` (existing harness).
- **Device:** emulator + simulator via metro-mcp; party runs use both at once. Every visual change is checked by
  screenshot before it is called done.

## 11. Risks

| # | Risk | Mitigation / trigger |
|---|---|---|
| R1 | Emulator/simulator can't prove battery, thermal, real decoders, or how nudges sound | Physical-device gate before release (memory `player-engine-decision-2026-10`) |
| R2 | The operator's chosen plugin repos break or get taken down | Many repos, pinned versions, last-known-good, health feed, embed lanes as floor |
| R3 | VidFast and its template siblings are one operator | Treat as one failure domain in health; native lane is the real answer |
| R4 | iOS header behaviour differs in-app from the macOS spike | Phase 2 gate re-runs T1 in the app on the iOS simulator; fallback = loopback HLS rewrite proxy (kunai pattern), only if the gate fails |
| R5 | expo-video SDK 53 gaps (read-only `videoTrack`, no `seeked`, no sidecar subs) | Workarounds in §6.2; SDK 54 upgrade later removes the seek patch |
| R6 | A repo the operator adds serves MKV / AC-3 | `platforms` false on both → ranked out; libVLC/mpv lane becomes a separate spec |
| R7 | Supabase Free auto-pause kills the party backend after idle weeks | F1/F11 behaviour; operator decision on keep-alive or Pro plan |
| R8 | Store removal / takedown pressure | Off-store channel already in place; no title artwork in any store listing |

## 12. Open items (decide in the phase plans, not now)

- The extra 8 benchmark titles (Phase 0).
- Which plugin repos the operator enables for Phase 2 testing (operator's choice; `github-scraper-landscape`,
  `indexes-beyond-fmhy` and `fmhy-github-index` list candidates as information).
- Whether `0008`/`0009` already carry enough of the room stream key to skip `0010` (Phase 3 plan verifies).

## 13. References

Research (all 2026-10): `github-scraper-landscape`, `plugin-catalog-measurement`, `similar-apps-architecture`,
`fmhy-github-index`, `competitor-teardown`, `vega-cloudstream-teardown`, `indexes-beyond-fmhy`, `reddit-deep` — in
`docs/research/`. Earlier: `nuvio-plugin-architecture.md` (sandbox benchmark, codec study), `docs/architecture/
native-player.md` (superseded parts noted at top), `docs/architecture/watch-party-sync.md` (sync contract).
