# 👋 Start Here — Agent / Developer Onboarding

You're picking up **Bearoom / NetPrime** — a server-driven movie & synced-watch-party app on **Expo SDK 53 / React Native 0.79 / React 19 (New Architecture, Bridgeless)**. This file is the fastest path in. Everything here lives in the repo (no external context needed).

## The two living docs that matter most
- **[docs/HANDBOOK.md](HANDBOOK.md)** — the complete top-to-bottom manual: architecture, every subsystem (what/how/why/alternatives-rejected/key-files/open-items), the **decision log** (#1–#43), the file & directory map, the env/secrets/ops runbook, and **§19 = the deferred backlog**. Read this for depth; jump via its Index.
- **[docs/project-board.md](project-board.md)** — the living status board (done / active / OPEN). Read the **tail** for the latest batches and open items.
- QA logs: [docs/qa/](qa/) · investigations: [docs/investigations/](investigations/) · plans: [docs/plans/](plans/).

## The one-paragraph mental model
Tier 1 is a **Cloudflare Worker (Hono + Zod) + Supabase Postgres** serving `/config` (the dynamic provider registry — **no baked-in fallback**, a store-review killswitch), `/scripts` (OTA DOM-hijack bridges), `/report` (telemetry), `/scrape`. Tier 2 is a **`react-native-webview`** mounted on the provider's own embed page, into which the app injects a JS **bridge** (`src/scripts/legacy-videasy.ts`, served OTA, cached in MMKV) that finds and drives the provider's `<video>` — this is what powers solo playback AND synced watch-party. State is **Redux Toolkit + RTK Query**. Only the `videasy` provider (branded **"NetPrime"** in-app) ships a working bridge today.

## 🧭 Current direction (2026-08-31) — read this before planning anything
The line above ("only `videasy` ships a working bridge") **is the problem the project is now solving.** The
live worker serves 14 providers with exactly **one** `script_version`, and only the operator can deploy a new
bridge, so every source that rots is an operator evening.

Three days of measurement ([docs/research/nuvio-plugin-architecture.md](research/nuvio-plugin-architecture.md))
established a second, **additive** lane: **on-device plugin resolution** — a sandboxed third-party scraper
turns a `tmdbId` into a raw stream URL + headers + audio-track id, played in a **native** player with our own
controls. The WebView hijack is **not** being removed; it stays as the fallback.

**Build order is decided** (see [ROADMAP](ROADMAP.md) → Program 1):
**P1 queue spine → P2 native player lane → P3 plugin source → P4 in-app browser/sniffer**, with a libVLC
upgrade held as *Optional*. **P1 is next** — it needs nothing from the research and is the socket every later
source plugs into.

⚠️ **Two archived documents will actively mislead you if read cold.**
[`scraper-poc-postmortem.md`](research/scraper-poc-postmortem.md) says native playback is impossible and
[`cooren-fit-adr.md`](research/cooren-fit-adr.md) says the same about proxying — **both measured *server-side*
resolution**, where the CDN token is minted for the resolver's IP and the phone is a different IP. On-device
that mismatch cannot arise, and it was not reproduced (2 MB served HTTP 206 to a foreign Tor exit, no
headers). Both docs now carry an amendment banner. Cite them for *why server-side was rejected*, never for
"native is impossible."

The genuinely hard problem turned out to be **codecs, not scraping**: iOS cannot demux MKV (it *can* decode
HEVC/AC-3/E-AC3 inside MP4/HLS), and the Android test device has no AC3/E-AC3 decoder at all. This does not
block P2/P3 — the measured Hindi dubs are HLS/AAC and play on plain `expo-video`.

## Where things stand (last refreshed 2026-08-31)
> ⚠️ The bullets in this section are a **2026-08-22 snapshot** and have drifted. For current status read the
> **tail of [project-board.md](project-board.md)** (now through `Phase 11`) and [ROADMAP.md](ROADMAP.md).
> Since that snapshot: Discovery D1–D4 shipped, and the plugin research above landed.
- Branch **`feat/improvements`**, HEAD ≈ **`ce06e5f`**, `tsc` clean. Worker live at `netprime-worker.spiderfan-no1.workers.dev`. (The branch moves fast across concurrent sessions — trust `git log`, not this hash.)
- **Search rework (`8add469`, `ce06e5f`):** `SearchView` migrated to **FlashList** with an extracted `useSearchData` hook (debounced, race-safe, ref-based pagination, dedup, short-list auto-load) and **catalog filters** (All/Movies/TV/People type chips + provider chips via TMDB `discover`). New files under `src/features/search/` (`useSearchData.ts`, `BrowseHeader.tsx`, `GridItem.tsx`, `SearchInput.tsx`) + new `tmdbApi` endpoints. **See the board's "Search rework" entry for six open review follow-ups** (notably `watch_region=US` vs the India-first audience, and swallowed TMDB error messages).
- **Brand refresh (`7932d54`):** the logo is now a **bear + film-strip + play** mark (not the old paw) — honey on flat charcoal, no glow. Every app-icon/splash asset was regenerated from it (source + native), and `assets/images/brandmark.png` (transparent) is wired into the header/onboarding via `src/ui/BrandWordmark.tsx`. See the "Brand identity" board entry for the reusable SVG→headless-Chromium asset pipeline. The board's 3D mascot bear is NOT generated (needs an image model).
- App plays on iOS sim + Android. Recent batches (all committed): player-UI polish (pro loading screen, error-overlay reachability, autoplay toggle, BearAlert press-feedback), a reverted first-frame gate, rotation-mask + provider-chrome hiding + banner auto-retire. See project-board tail.
- ⚠️ Commit `4bfb5c0` is **mislabeled** "refactor(api): RTK Query" — it actually also bundles the player-UI-polish batch + iOS pods (an amend collision between two concurrent agents). Don't trust that one message.

## ✅ RESOLVED (2026-08-25) — videasy binds on iOS (was the TOP OPEN item)
On iOS videasy renders its `<video>` in a **cross-origin sub-frame** the main-frame-only bridge/finder couldn't reach → `bound` stayed false. **Fixed in `HijackPlayer.tsx`:** inject the bridge into ALL frames (`injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}`) so the finder binds from inside the video's frame, + a nonce-gated **frame-relay** (`relayInject`) so `injectJavaScript` commands (play/pause/seek/quality/audio, guest-mode, chrome-hide) fan out to the sub-frame. **Verified live on 2 devices** (iOS binds + shows native controls/position/duration; Android no regression). See the project-board "RESOLVED — videasy binds on iOS" entry. **Follow-ups also RESOLVED (2026-08-25):** resume-after-pause (OTA bridge `videasy@9ad6a4cf` clicks videasy's own play button when its poster card is up + a persistent finder re-binds the recreated `<video>`; verified on a real device), command relay reach (fan via `window.frames` so commands reach videasy's shadow-DOM-nested video frame), and duplicate transport events (de-duped in `handleMessage`). See the project-board "RESOLVED — videasy resume-after-pause…" entry + [investigations/videasy-resume-after-pause.md](investigations/videasy-resume-after-pause.md). **Still-open polish (not blocking):** control-icon/poster-state desync; chrome-hide doesn't cover the paused poster.

## Key gotchas (these will bite you)
- **A DNS ad-blocker breaks the app before any code runs.** The primary Android test device has **Private DNS = AdGuard** (`adb shell settings get global private_dns_mode` → `hostname` / `dns.adguard.com`), which silently blocks the app's own worker (`*.workers.dev` → `/config` fails → providers EMPTY → "Failed to fetch movies") AND `image.tmdb.org` (blank posters). Looks like "the app is broken," but it's DNS. iOS sim has no DNS block. Also: the **in-app KB/s number is data _consumption_, not bandwidth** — don't diagnose speed from it (`curl -w '%{speed_download}' https://speed.cloudflare.com/__down?bytes=3000000` for the real rate).
- **Provider DOM selectors rot.** videasy renames classes. As of 2026-08-21 (CDP-verified live): `mobileCenterControls` is **DEAD**; the transport/seekbar is `div.absolute.bottom-0.h-44`; the "Player Settings/Quality/Subs/Servers" drawer is `[class*='z-[110]']`. Always re-verify against the live DOM (Playwright on desktop videasy, or CDP into the app's WebView) before trusting a selector.
- **The bridge is OTA, not bundled.** Source of truth = `src/scripts/legacy-videasy.ts` (byte-for-byte legacy `BRIDGE_JS`, NOT imported by the app → not decompilable). Changing it requires re-running `scripts/upload-bridge.ts` (needs `SUPABASE_SERVICE_ROLE_KEY`, the operator's secret) to deploy; the app boot-diffs `script_version` and re-caches. Prefer **app-side supplementary injection** (like `HijackPlayer`'s `#__npChromeKill` style) when you can, to avoid an OTA deploy.
- **NO blur and NO elevation on any screen that plays video** — both blur backends re-capture the WebView every frame and stutter (proven on release). Static image blur (expo-image `blurRadius`) is fine; live `BlurView`/`dimezisBlurView`/elevation is not. See [docs/investigations/playback-stutter.md](investigations/playback-stutter.md).
- **HTML5 fullscreen is unused** — `playerRef.fullscreen()` has zero callers; "fullscreen" = OS rotation with the video inline. So the bridge's `!document.fullscreenElement` chrome-restore is dead weight (that's why we hide videasy chrome unconditionally).
- **Don't run two coding agents on the same branch** — it caused an amend collision + detached HEAD this session (recovered by fast-forward). Cursor's eslint server also rewrites files on save.

## How to run & debug
- **Metro:** `npx expo start` (Android device: `adb reverse tcp:8081 tcp:8081` + the `bearoom://` deep link; a second app on the machine may hold 8081 → use `--port 8082`). iOS: `npx expo run:ios`.
- **Two-debugger model:** RN layer via **execbro** MCP (`scan_metro`, `get_logs`, `inspect_component`, `redux_get_state`, `execute_in_app`, screenshots/tap) — works on both the iOS sim and Android device. WebView layer via **Chrome DevTools / Safari Web Inspector (CDP)** — the only truthful view of the injected bridge (`console.log` inside the WebView is swallowed under Bridgeless). Public provider DOM via **Playwright** (desktop, cheap selector-rot check). Recipe in [HANDBOOK §"Device debug recipe"](HANDBOOK.md).
- **Env:** `EXPO_PUBLIC_WORKER_URL` (root `.env.local`, symlinked into `worker/.dev.vars`). `SUPABASE_SERVICE_ROLE_KEY` + `KLIPY` key are the **operator's secrets** — never commit them; the operator runs `wrangler secret put` / the upload CLI.
- **Commit discipline:** commit **only when explicitly asked**; branch first if on `master`. End commit messages with a `Co-Authored-By:` trailer naming **the model actually doing the work**
  (history contains `Claude Opus 4.8` for older commits and `Claude Opus 5` from 2026-08-31 onward — attribute
  honestly rather than matching the previous line).

## Product guardrails (from the operator)
Values hard technical pushback over agreement — flag runtime regressions `tsc` can't catch. Scarred by lost work → persist deferred ideas durably (that's what the project-board + HANDBOOK §19 are for). Never demote/pollute production data affecting real users. No baked-in provider fallback (the killswitch).
