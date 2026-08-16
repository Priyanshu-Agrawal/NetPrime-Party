# Plan — Bearoom-skinned native player controls (+ close-guard + orientation)

> **Live implementation plan. Big + phased.** Read `docs/architecture/README.md`,
> `player-and-injection.md`, `watch-party-sync.md`, and `docs/providers/videasy.md` first.
> Standing rules: **no `git push`**; commit at checkpoints; keep `tsc` + `eslint` clean.

## Goal (decided 2026-08-16)
Replace videasy's control chrome with our **own Bearoom-skinned controls** over the hijacked
WebView — the user chose **"full native — replace all."** Host/guest-aware. Plus **back-resist +
close-confirmation** (solo + party) and a **dynamic orientation** control. Make it **robust**.

### Host vs guest
- **Host / controller** (party `canSeek` = host or `canControlPlayback`): full controls —
  play/pause, ±10s, seek (drag), speed, quality, subtitles, server/dub, fullscreen, orientation.
  Timeline changes route through the room authority exactly like today (user control →
  `handleUserControl`; the overlay drives the `<video>` **un-suppressed** via `__soloCmd`-style so
  the engine sees it — do NOT bypass the anchor).
- **Guest** (not `canSeek`): a play/pause **indicator** (state only, not a control) + read-only
  progress; fullscreen + quality + subs stay (per-device, don't touch sync); NO seek/±10s/speed/
  server. When the guest's video is paused while the room plays (autoplay blocked / detached), the
  indicator becomes **"Tap to sync"** — that tap is the browser gesture AND a jump-to-live. This
  fixes the reported "guest can't play from pause by tapping."

## Architecture
A React Native overlay (`components/player/PlayerControls.tsx`, Bearoom honey skin) absolutely
positioned over `HijackPlayer`'s WebView, **driven by `PlayerEvent`** and **driving the `<video>`
via bridge commands**. videasy's chrome is **fully hidden**.
- ⚠ A native overlay existed before and was removed in **`5daf3b0`** *because it blocked videasy's
  inline web controls.* That's now **intended** — we hide the web controls and own the surface.
  Recover it as a starting point: `git show 5daf3b0^:components/player/PlayerControls.tsx` (verify
  path via `git show 5daf3b0 --stat`).
- Reuse the overlay for **solo** (`app/(player)/player.tsx`) too — solo's plain WebView has no
  bridge, so P1 must add the bridge (or a lighter observe/drive shim) to solo, or keep solo on web
  controls for v1 and do party first. Decide at P1.

### Bridge extensions (`HijackPlayer.tsx` BRIDGE_JS)
Have today: `__vlCmd(play|pause|seek|rate|fullscreen)`, `__soloCmd` (un-suppressed), `__soloKeepAlive`,
`__vlSetGuest`. Add:
- **`__vlChromeOff(on)`** — hide ALL videasy controls (center cluster + bottom bar), generalizing
  `__vlSetGuest`, so only our overlay shows.
- **Richer tick/ready payload**: `videoWidth`, `videoHeight` (for orientation), `playbackRate`,
  `buffered`.
- **Quality**: read levels (prefer hls.js `hls.levels`/`currentLevel` if the instance is reachable
  on `window`/element; else the Quality-tab options `2160p/1080p/720p/480p`) + set via the
  **pointer-dispatch recipe** (same as the dub switch). Report current + list to RN.
- **Subtitles**: read the Subs-tab tracks + set via pointer-dispatch. Report current + list.
- **Server/dub**: read the Servers-tab options (label = language) + switch via the **proven
  pointer-dispatch recipe** (`videasy.md`). ⚠ **NOT synced across the room** (per-WebView) —
  document; a host only changes their own audio. Sequenced LAST (the rabbit hole).
- Every read-back is DOM-scraping → **verify each via CDP** (mobile emulation + on-device) before
  wiring; the mobile layout differs from desktop (`videasy.md`).

## Phases
- **P1 — Overlay + transport.** `__vlChromeOff`; Bearoom overlay: play/pause, ±10s, draggable seek
  (host → `party.seekTo`; guest read-only), time labels, fullscreen, auto-hide on idle + tap-to-show.
  Host/guest modes + guest **"Tap to sync."** Wire into `party.tsx`.
- **P2 — Speed + Quality** ✅ **DONE (`975a6fd`)** — `PlayerSettingsSheet` (frosted GlassCard) opened
  from a gear button. **Speed** routes through the authority (`party.setRate` → `party_set_playback`
  RPC → the anchor), **host-only, synced**. ⚠ The engine's drift correction was hard-coded to base-rate
  1.0 (it did NOT sync non-1× rooms — the plan's old note was wrong); fixed to nudge around
  `anchor.rate` (no-op for 1× rooms). **Quality** = bridge `__vlCmd({readQuality|setQuality})` driving
  videasy's DOM via pointer-dispatch (hls.js isn't reachable); per-device. Device-verified: setQuality
  '480p' → `videoHeight` 1080→480.
- **P3 — Subtitles + Server/dub** sheets. Pointer-dispatch + read-back. Flag dub-not-synced.
- **P4 — Close-guard.** ✅ **DONE this session** — `hooks/useMediaCloseGuard.ts`: Android hardware
  back + in-app back → themed confirm (throttled, resists accidental exit). Wired in `party.tsx`
  (chevron + hardware back, when `hasMedia`) and solo `player.tsx` (hardware back).
- **P5 — Orientation.** A rotate button in the overlay + **dynamic** from `videoWidth/height`:
  portrait vs landscape suggestion; `expo-screen-orientation` lock/unlock; landscape on fullscreen
  for wide media. Unify with solo's existing `fullscreenchange → lock landscape`.
- **P6 — Robustness/QA.** Auto-hide timing, gesture conflicts, buffering spinner, guest
  autoplay-gesture, device matrix, CDP-verify each bridge command, on-device visual QA of the skin,
  2-device party-sync regression.

## Risks / honest flags (don't relitigate)
- **Server/dub + quality read-back** ride videasy's DOM (fragile; re-verify via CDP; mobile ≠ desktop
  layout). Sequenced last.
- **Dub switching isn't synced** across the room today (per-WebView) — a separate sync feature, not
  this project.
- **Orientation in WebView fullscreen** is quirky (videasy uses HTML5 fullscreen; our RN overlay may
  not cover the native fullscreen surface) — verify on device.
- **iOS swipe-back** isn't caught by `BackHandler` (Android-first). When iOS is stood up, add a
  `beforeRemove` interceptor. Kicked/error/programmatic leaves intentionally bypass the guard.

## QA
Bridge commands → CDP (headless-Chrome mobile emulation + on-device WebView). The skin → on-device
eye (screencap is black once video binds). Party regression: 2-device sync must stay unbroken after
any bridge change.
