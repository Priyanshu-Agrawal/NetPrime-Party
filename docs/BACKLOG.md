# Bearoom — Master Backlog & Scope

**The single, exhaustive inventory of every deferred / planned / shipped item across the project.**
This is the anti-loss anchor: if it isn't on the [active board](project-board.md), the [roadmap](ROADMAP.md),
or a [plan](plans/), it's captured here. Consolidated 2026-08-26 from the project board, the full-app review,
the investigations, the deferred-backlog memory (groups A–I), and the current session state.

**Related docs:** [README](README.md) (doc map) · [project-board](project-board.md) (active status) ·
[ROADMAP](ROADMAP.md) (sequencing) · [HANDBOOK](HANDBOOK.md) (technical manual + decision log).

**Status legend:** `PENDING` (not started) · `PARTIAL` (some shipped) · `DEFERRED` (parked, do-not-start-until-asked)
· `SHELVED` (explicitly not now) · `FAR-FUTURE` (no timeline) · `DONE` (shipped) · `N/A` (obsolete).
**Rule:** do NOT start any OPEN item until asked.

---

# PART 1 — OPEN (deferred / pending)

## A. Party room controls & host toggles
| Item | Status | Detail |
|---|---|---|
| Play-next **queue** | PENDING | Host/guest queue of what plays next. **Now the spine of the watch-together program** — see [PART 2](#part-2--major-programs). |
| Polling system | DEFERRED | In-room host-run polls. |
| Per-guest individual control | DEFERRED | Grant/revoke playback control to a specific guest (vs today's single global guest-control flag). |
| Mute/disable-chat toggles | DEFERRED | Mute chat / mute a specific guest / disable chat, host-controlled. |
| GIF loading polish + stickers | DEFERRED | GIF send + emoji reactions already ship; better GIF loading + a sticker set pending. |

## B. Party chat enhancements
| Item | Status | Detail |
|---|---|---|
| Slash-commands → polls | DEFERRED | Guest `/request-replay`, `/skip-to` that become room polls the host applies. Memory: `party-chat-commands-polls`. |
| Reply (quoted) + @-mention tagging | DEFERRED | Quoted reply threads + @-mentions. Memory: `party-chat-reply-tagging`. |
| **Dedicated chat font + cross-platform emoji** | DEFERRED | Distinct chat typeface (Nunito lead) + Twemoji/OpenMoji image emoji for iOS↔Android parity. **Plan written:** [chat-typography-and-emoji.md](plans/chat-typography-and-emoji.md). |
| Per-message send-timestamp | PARTIAL | Show each message's send time (review L8: messages appended by arrival, not ts). |
| Send-with-current-media-timestamp | DEFERRED | Attach current playback position to a chat message. |
| Persisted history / GIFs / moderation | DEFERRED | Chat is ephemeral today; persist + moderate. |

## C. Player / playback
| Item | Status | Detail |
|---|---|---|
| One unified controls layer | DEFERRED | Single controls layer (web/native, collapsed+expanded) with subs/quality/speed/dub parity across providers. Memory: `player-controls-unification`. |
| Solo player == party player | DEFERRED | Unify solo + party into one component/behavior. |
| **Episode selector for shows** | DEFERRED | Episode picker for TV (was dropped in a refactor). High value; folds into the queue program. |
| Smooth RN rotation + orientation lock | DEFERRED | Re-add cleanly (earlier accelerometer/90°-transform impl stuttered, was scrapped; landscape currently reverted/portrait-locked). |
| Seek / control feedback | DEFERRED | Visual feedback for seek + control interactions. |
| Quality "stuck loading" fix | DEFERRED | Quality selector can hang in a loading state. |
| Responsive tablet/TV (portrait+landscape) | DEFERRED | Responsive layout for larger screens. |
| **Control-icon/paused-poster** on-device confirmation | PARTIAL | opacity:0 paused-poster hide + optimistic play/pause icon are coded + logically verified; **visual on-device confirmation pending** (tall player screen exceeds the screenshot API size). |
| De-dupe ~2× videasy transport events (verify) | PARTIAL | Two app-side de-dupes shipped (300ms signature for discrete, 850ms rate-limit for ticks); a clean live tick-count recheck is still pending. |
| Slow-start poster flash — non-masking fix | PENDING | On a genuinely slow start the provider's poster can flash behind our controls between bind and first paint (the reverted first-frame gate masked the whole player on iOS). Needs a non-masking fix. |
| Auto-recovery from a dead videasy stream | DEFERRED | WebView reload resumes (videasy remembers position) but must be hard-gated against reload loops + re-click the pre-play gate. Higher risk; needs a decision. |
| Bitrate resilience (auto-drop quality on stalls) | DEFERRED | videasy stays 1080p and starves under bandwidth limits; hls.js unreachable → needs videasy-DOM quality control to step down on repeated stalls. |
| Provider fallback on chronic stalls | DEFERRED | Switch provider when a stream stalls chronically. |
| Seamless rotate-in-portrait transition | DEFERRED | Mid-rotation sub-100ms frame can't be auto-captured; needs a human eye to judge feel. |

## D. Native features around the WebView
| Item | Status | Detail |
|---|---|---|
| PiP / AirPlay / background audio / lock-screen media-session | DEFERRED | Added *around* the WebView (native stream-sniffing rejected — see decisions). **Plan:** [webview-native-features.md](plans/webview-native-features.md). Memory: `native-player-rejected`. |

## E. Providers / sources
| Item | Status | Detail |
|---|---|---|
| Filterable providers bottomsheet + more UI | DEFERRED | Provider list in a filterable bottomsheet ("add as much as you can"). Memory: `providers-bottomsheet-and-proxy`. |
| Hijack more providers | DEFERRED | Extend the bridge beyond videasy (Phase-6 QA: 8 other providers inject no script → videasy-only party today). |
| Sandbox renderer process stays alive after unmount | IDEA | 2B-1 mounts the sandbox only while resolving (done), but Android keeps WebView's renderer process (~50–57 MB PSS) alive afterwards. Reclaiming it needs `WebViewRenderProcess.terminate()` (API 29+) via a native call — only if low-end phones need it. |
| Plugin host review minors (2A) | DEFERRED | M6 system proxy honoured by OkHttp/URLSession · M7 iOS DNS-rebinding window (pre-resolve check) · M8 plugin key uses 8 hex of the sha · M9 pluginHost off leaves repo rows active (2B-2 routing checks the flag) · M10 `/cache/purge` skips the plugin-repos key; Supabase + KV both down → `[]` → app GCs plugins · M11 PluginHost cache never pruned, 12-parallel per call not global, no dedupe of concurrent resolves · M1 rest: CSP self-check timeout reads as `csp:false` with no retry. Ledger: `.superpowers/sdd/…phase2a…` (deleted after merge; this row is the record). |
| Resolution pipeline review minors (2B-1) | DEFERRED | M1 `manifests.ts` `attr()` misses `, RESOLUTION=` (space after the comma) so the height is lost · M2 rest: `EXT-X-MEDIA` with NAME but no LANGUAGE gives no language; DASH `mimeType="audio/*"` only on the Representation misses the language; `isoDuration` rejects `P0Y0M0DT…` (safe: unknown) · M3 the probe doesn't check `#EXT-X-MAP` init or `#EXT-X-KEY` URIs; DASH gets `ok` with no segment check · M4 Origin-after-302 is checked only on the first request · M5 rest: "Netflix Original" reads as the original language; a declared `language: "Original"` is ignored · M6 the 2-minute sandbox hold counts from the start of a resolve, not its end (call `warm()` on finish) · M7 per-episode runtime for the duration check (episodes skip it today); Plugin Lab: probe cache not cleared on re-run, `setBusy(false)` not in `finally`, the plugin label shown verbatim · M8 a stuck sandbox page gives every plugin a `timeout` strike before the ping replaces it · M9 worker: drop `errorMessage`/`scriptVersion` server-side on native-lane plugin reports (the app sends neither today) · M10 `rank.ts`: with `wanted = []` known-language streams sink below unknown ones; `pt-BR` never matches `pt`. Ledger deleted after merge; this row is the record. |
| Optional proxy-all for ISP resilience | DEFERRED | Optionally proxy more/all providers. **NB:** scraping on the operator's own CF IP is a dealbreaker (see decisions). |

## F. UI / design polish
| Item | Status | Detail |
|---|---|---|
| "Perfect UI" pass via Stitch/gemini | DEFERRED | Whole-UI polish pass (Stitch MCP connected, reserved). Memory: `bearoom-ui-rework-plan`. |
| Sticky / persistent top header | DEFERRED | — |
| Broader UI rework (bisect + cherry-pick) | DEFERRED | Bisect to the last good-UI commit, branch, cherry-pick desired feats, then decide blur per-surface. |
| 3D hoodie-bear mascot | FAR-FUTURE | Reference-board mascot; needs an image model / artist (procedural BearAvatar untouched). |
| Full screen-by-screen reskin | DEFERRED | Skipped in the brand batch (already on the cozy-cinema theme). |

## G. Blur / performance
| Item | Status | Detail |
|---|---|---|
| Per-surface blur decision | DEFERRED | Where to keep real blur vs drop it. **Proven rule:** no blur AND no elevation on any screen that plays video (both re-sample every frame → stutter). Memory: `playback-stutter-is-dimezis-blur`. |
| Glass: iOS 27 simulator check | OPEN | Liquid Glass on tab bar/buttons, system blur on headers, fades without pop (simulator was busy 2026-10-11). |
| Glass: Android lens/refraction | DEFERRED | AGSL `RuntimeShader` (API 33+) chained on `modules/bearoom-glass`'s blur for a Liquid-Glass edge. |
| Glass: remote kill switch | DEFERRED | `/config` flag to force crafted glass if a device misbehaves. |
| Glass over video (Android) | DECIDED: no (measured 2026-10-11) | Phase 1B A/B: a `TextureView` (needed for live blur) puts only 75–81 % of 24 fps frames on rhythm (32 % at 60 fps) vs 98–100 % for `SurfaceView`; native video stays on SurfaceView with crafted glass over it. WebView backdrops stay banned. |
| Glass review minors (2026-10-11) | DONE 2026-10-11 | Opaque fallback, one invalidate per offset + isShown guard, same-window check, backdrop prop on primitives, backdrops registered from navigation events, single reduce-transparency subscription, touchable interactive Liquid Glass, weak backdrop ref + recordings freed on detach. |
| Glass: low-end Android check | DEFERRED | Bar blur on a weak Android 12+ device (gate is already API 31+ and bars-only). |
| Party playback jank | ROOT CAUSE FOUND → Phase 1B | WebView video costs every video frame ~10–12 ms of our threads (Chromium draws inside our RenderThread ~4.5–5 ms at ~1.3 GHz + its vsync tick ~1.1 ms on the main thread at 120/s); frames start evenly every 5th vsync but land 2–4 vsyncs later → uneven cadence (≈⅓ of frames off by ±1–3 vsyncs). Not ours to fix inside a WebView: 60 Hz A/B was mixed, controls add only ~1.2 ms. Fix = native player (SurfaceView: zero app frames per video frame). Measured 2026-10-11. |
| Details error state has no way back | DONE 2026-10-11 | `DetailsError` (back + Try again) on movie/TV details. |
| Home scroll animation frames | DONE 2026-10-11 | Not scrolling: pull-to-refresh (my scroll script's up-swipes hit the top) cleared the TMDB cache → every rail swapped to skeletons in one frame (~1,800 views torn down, up to 63 ms frames). Now invalidates in place (`c66e79e`): 0 frames > 12 ms. Real Home scrolling: 0.2–0.4 % janky. |
| Native player: Up-next card + Report action | PENDING (Phase 2) | Spec §6.2.1 states; arrive with real sources (no series / nothing reportable on test streams). |
| Native player: emulator + iOS legs | PENDING (owner) | Phase 1B gate legs on the Android emulator and iOS 27 simulator, incl. the iOS compile of `modules/bearoom-player` (SharedRef<AVPlayer> argument). |
| `/report` lane · stage · ttffMs | DONE 2026-10-11 | Migration `20261011141809` applied, worker `9b30b46f` deployed; first rows carry lane/stage/ttff_ms. |
| Dead stream fails slowly | NOTED (Phase 2) | A 404 master playlist shows the error card only after ExoPlayer's retries (~10–15 s); Phase 2's StreamProbe checks reachability before the player gets a URL. |
| Home hero sized at launch orientation | OPEN | `HeroCarousel` reads `Dimensions` at module load: launching while the phone is sideways gives a full-screen hero in portrait. Use `useWindowDimensions`. |
| Native player review minors (Phase 1B) | DEFERRED | From the final review: re-fetch a sidecar file that parsed to nothing; read the expo-video/media3 pins from the installed package; Next episode skips unaired episodes; quick chip opens the sheet at its row; "Original audio (this source)" for single-track streams; prefer a track's own name over "Unknown"; block taps during the loading card; lift in-stream subtitles too; party tick rate on an existing player. Details: the Phase 1B section of the project board and the fix commits on `feat/improvements`. |

## H. Atmospheric background
| Item | Status | Detail |
|---|---|---|
| Device-adaptive living background phase | SHELVED | Do NOT build yet; must freeze on video screens. Memory: `atmospheric-background-phase`. |

## I. Backend / worker
| Item | Status | Detail |
|---|---|---|
| Phase 9 — server-side scrape caching | PENDING | Cache lazy fallback scrapes to protect the worker. `title_provider_cache` table. **Rules:** cache ONLY metadata (dubs/qualities), NEVER `.m3u8` for IP-locked providers; don't negative-cache failures for 4h. |
| `captcha_block` / `not_found` telemetry triggers | DEFERRED | Two outcome triggers blocked until the Phase-6 bridge cutover QA lands. |
| Phase 6 device QA — verify OTA bridge cutover | PENDING | Verify none of the 8 bridge subsystems regressed after the OTA delivery move. `docs/qa/phase6-cutover-qa.md`. |
| Phase 6 clean-core refactor | DEFERRED | `universal-core.ts` + `videasy.delta.ts` remain the clean-refactor target (event-rename + echo-suppression fold-in); the shipped legacy `BRIDGE_JS` already has the behavior, so this is incremental cleanup only. |

## J. Housekeeping
| Item | Status | Detail |
|---|---|---|
| Connect a GitHub remote | PENDING | For off-store distribution (GitHub Releases + Obtainium — see decisions). |
| Dead-file cleanup | PENDING | `.old` files if reusable. |
| Remove `·Q` debug marker | PENDING | Leftover in `src/screens/PlayerScreen.tsx`. |
| `expo-sensors` install-or-delete | PENDING | `hooks/useDeviceOrientationSensor.ts` imports `expo-sensors` (not installed, orphaned). Install + wire if rotation is kept, else delete. |
| Landscape-orientation edits | DEFERRED | Uncommitted `AndroidManifest`/`Info.plist`/`project.pbxproj` landscape changes from another session, deliberately left out; portrait-lock kept. Integrate only if landscape is re-added. |

---

# PART 2 — MAJOR PROGRAMS

## Program 1 — Watch-Together, Multi-Source & Queue  *(the big pivot)*
Rave-style watch-together: a **queue** of heterogeneous sources (TMDB titles, direct links, YouTube, web-sniffed
media, collections, playlists) through **one unified player**, synced to a room. Absorbs group A's "play-next
queue," group C's "episode selector / unified player," and adds direct-link / YouTube / in-app-browser sources +
TMDB collections + self-curated collections + auto-next/recommendations.
- **Full design + phases + data model + open decisions:** [watch-together-multi-source-queue.md](plans/watch-together-multi-source-queue.md).
- **Phased:** P0 TMDB-utilization deltas → P1 queue + medialess room + floating tray → P2 native player + direct-link
  → P3 YouTube + playlists → P4 in-app browser + sniffer → P5 self-curated collections → far-future community pages.

## Program 2 — Chat typography + cross-platform emoji
Dedicated chat font + Twemoji/OpenMoji image emoji for iOS↔Android parity. **Plan:**
[chat-typography-and-emoji.md](plans/chat-typography-and-emoji.md). (Also listed under group B.)

---

# PART 3 — SHIPPED (record, so this is a full history)

**Foundational phases (all DONE):** P1 architecture (Two-Tier Hybrid OMSS, reverse-proxy rejected) · P2 dynamic
Supabase provider registry (no baked-in fallback / killswitch) · P3 Cloudflare Worker (Hono+Zod, Swagger `/docs`,
60s edge cache) · P4 RN bootstrap (RTK + RTK Query) · P5 zero-wait pre-play UX · P5.5 silent preference memory
(`utils/prefs.ts`, `utils/trackMatch.ts`) · P6 **OTA bridge cutover** (lean `/config` + `/scripts`,
`upload-bridge.ts` validation gate, MMKV boot-diff, bridge deleted from binary — *only device-QA subtask open*) ·
P7 telemetry & failure memory (`/report`, health aggregation, session exclusion) · P8 lazy fallback & safety net.

**Batches (DONE):** Resilience & error-recovery (party-capability gate, health-aware ordering,
`utils/failureMemory.ts`, autoplay-next, branded error overlay + auto-retry) · Player-UI polish (branded loading
cover, half-height fix, cover-gates-on-bind, Select-Server fix, autoplay toggle) · Rotation + provider-chrome
polish · Search rework (FlashList + `useSearchData` + catalog filters) · Person Details screen · Global visual
polish + `BouncyPressable` · **Brand identity** (bear+film-strip+play mark, all icon/splash assets, asset
pipeline).

**This session (2026-08-25/26, DONE + committed on `feat/improvements`):**
- **videasy binds on iOS** (all-frames injection + nonce-gated frame-relay) — `18594a8`.
- **C1 watch-party realtime security** (private channels + RLS, migration `0007`) — `2222b68`.
- **Party loader polish + sync-badge removal + poster fetch** — `5ae036c`.
- **videasy resume-after-pause + relay reach (`window.frames`)** — OTA bridge `videasy@9ad6a4cf`, `f778634`.
- **Duplicate transport-event de-dupe** — `0f90784`.
- **BearAlert Android-ripple fix** — `8afe7ca`.
- **Backend hardening H1/M1/M7** (purge auth, report validation + fail-closed, HMAC IP hash) — `a6c20b0`, live.
- **H2/H3** (bridge integrity content-hash check + `utils/sha256.ts`; per-session message nonce) — OTA bridge
  `videasy@0c9a827c`, `8593f16`, verified end-to-end.
- **videasy poster polish** (optimistic icon + paused-poster hide) — `9e78cd5`.
- **Docs:** Cooren stream-backend ADR (NO-GO), full-app review, backend-hardening plan, chat-typography plan,
  watch-together plan, this backlog.

---

# PART 4 — STRATEGIC DECISIONS (that constrain the backlog)

- **Distribution: OFF-STORE.** Not Play, not App Store (cost + content policy). Full app ships to a private
  circle via **GitHub Releases + Obtainium** (or Firebase App Distribution). No runtime "flip to piracy" flag /
  gateway funnel (review-evasion → account termination). A public Play build, if ever, is a **build-time-separated**
  clean build (discovery + official "where to watch" + direct-link party), hijack compiled out.
- **Security plan CLOSED:** C1 · H1/M1/M7 · H2/H3 all shipped + live (was `docs/plans/backend-hardening.md`).
- **Phase 10 (App/Play review)** — **N/A / MOOT** given the off-store decision; retained only as the clean-build
  concept above.
- **~~Native stream player REJECTED~~ → AMENDED 2026-08-31: WebView stays primary, native lane is
  *additive*.** The rejection rested on **server-side** resolution (deterministic WAF tokens, IP-locked CDNs).
  Re-measured on-device, none of those walls held — see
  [`docs/research/nuvio-plugin-architecture.md`](research/nuvio-plugin-architecture.md). The hijack is **not**
  being removed; a native player + plugin source are added beside it as Program 1 · P2/P3. The real
  constraint turned out to be **codecs** (iOS cannot demux MKV; many Android devices lack an AC3/E-AC3
  decoder), which is why the libVLC upgrade is scoped as *Optional*, not required.
- **Cooren as a stream backend — NO-GO** (`docs/research/cooren-fit-adr.md`). *Still no-go; on-device
  resolution reaches the same outcome with no server, so the bandwidth trade-off is moot rather than merely
  unfavourable.*
- **Plugin supply chain (if Program 1 · P3 is built):** pin providers to **commit SHAs, never
  `refs/heads/main`**, and allowlist only the measured shortlist — 111 of 152 audited scrapers returned
  nothing and two return confidently *wrong* content.
- **No blur / no elevation on any video screen** (proven stutter rule).
- **No baked-in provider fallback** — the empty-`/config` killswitch is deliberate (store-review posture, now
  also the off-store "listing-only" mode).
- **M13 (frozen Dimensions layout)** — N/A while portrait-locked; revisit only if landscape returns.
