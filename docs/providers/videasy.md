# Provider: videasy  (providers.json name: **"NetPrime"**)

> The primary provider, and the one we've reverse-engineered in depth (via Chrome
> DevTools / CDP). Everything here was **verified on-device**; keep it current.
> See [../architecture/player-and-injection.md](../architecture/player-and-injection.md) for the shared mechanism.

## Identity
- id `videasy`; embed host **`player.videasy.to`** (React + Tailwind + CSS-modules player).
- Embed URLs (`providers.json` / `providerRegistry.buildEmbedUrl`):
  - movie: `https://player.videasy.to/movie/<tmdbId>`
  - tv: `https://player.videasy.to/tv/<tmdbId>/<season>/<episode>` (+ `?nextEpisode=true&autoplayNextEpisode=true&episodeSelector=true`)
- `hijackCapabilities.ts` → `videasy: { supported: true, videoLocation: "top", navHosts:[player.videasy.to/.net, videasy.to/.net], notes:"NetPrime …binds once play is tapped" }`. **No `autoplayParam`** (it autostarts). `allowedDomain = https://player.videasy.to`.
- **`<video>` is in the TOP document** (good — top-frame hooks see it) **but is created/resolved only AFTER a user gesture** (tap play). This matters for sniffing (below).

## Player DOM (for injection targeting)
Tailwind + CSS-module classes seen via CDP:
- Center controls container: `[class*="mobileCenterControls_*"]`; buttons are `BUTTON.tabbable p-2 rounded-full` wrapping `SPAN.text-3xl … > svg/path`.
- Bottom control bar: **`div.absolute.bottom-0.left-0.right-0.z-30.h-44`** (a FIXED 176px-tall flex `items-end` bar holding the scrubber + CC/gear/cloud/fullscreen). `pointer-events: auto`.
- Settings ("gear") menu tabs: **Quality · Subs · Servers · Speed**.

### ⚠ Known layout bug + the committed fix
In the short inline/collapsed viewport (**~231px tall**), the 176px `h-44` bottom
bar **blankets the vertical-center play/pause/±10s buttons** and, being
`pointer-events:auto`, **swallows their taps** — while the scrubber/gear (its own
children) work. Fullscreen has a tall viewport so the bar is a thin strip → works
there. That's the "collapsed broken, expanded fine" symptom.
**Fix (committed in `HijackPlayer.tsx` BRIDGE_JS `__addSt`):**
```css
@media (max-height:480px){ div.absolute.bottom-0.h-44 { height:auto !important } }
```
Collapses the bar to content height only in short viewports; touches nothing else
(scrubber/quality/subs keep working). Verified: bar 176→88px, play button becomes
the hit-test target, tapping it toggles the `<video>`, forward-10 = +10s.

## "Servers" tab = the DUB / AUDIO-LANGUAGE selector (not stream sources!)
Named after Valorant agents. Each "server" is a **separate stream with its own
muxed audio** in that language — i.e. selecting a server switches the DUB.
Full list captured for one title:

| Server | Audio |
|---|---|
| Yoru | Original (*may be 4K*) |
| Cypher / Breach / Neon / Vyse | Original |
| **Killjoy** | German |
| **Fade** | **Hindi** |
| Omen | Spanish |
| Raze | Portuguese |

- **There is NO "Jade" server** — the Hindi one is **Fade**.
- **Product rule: default to Hindi (Fade); fall back to Original when the title has
  no dub** (dubs are frequently unavailable per title).
- Because each dub is a distinct stream (own `m3u8`), a dub switch is **NOT** an
  in-player audio-track change (`availableAudioTracks` shows only the 1 muxed
  track). It is: **re-resolve that server → swap source** (native: `player.replaceAsync`, seek back to position).

## The stream (what the player actually loads)
- `video.src` is a **`blob:`** → hls.js + MSE. Real URLs are only visible by hooking `fetch`/`XHR`.
- **fMP4 HLS VOD** (`#EXT-X-PLAYLIST-TYPE:VOD`, `#EXT-X-MAP` init + `.m4s` segments).
- **Two hosts, one token:**
  - Playlist: `https://moon.ironwallnet.net/vd/<TOKEN>/master.m3u8` and media playlists `.../index-s{1080,720,480}p-v1-a1.m3u8`.
  - Segments/init: `https://steelatom.top/vd/<TOKEN>/seg-N-s{q}p-v1-a1.m4s`, `.../init-s{q}p-v1-a1.mp4`.
- **master.m3u8** — 3 variants: 1920x800@6.2M, 1728x720@3.1M, 852x480@1.3M, all `CODECS="avc1…,mp4a.40.2"` (**audio muxed**, no `EXT-X-MEDIA`).
- **NO request headers required** — playlist + segments return `200` from outside the WebView with no Referer/Origin/cookies. Auth is the **URL token only**.
- ⚠ **The token is almost certainly short-lived** (session/time-bound) → **resolve per play**; do not cache the m3u8.
- **Subtitles are NOT in the manifest** — videasy loads external subs on demand (needs a separate sniff, or use the Wyzie subtitle API keyed by tmdbId, then a synthetic `EXT-X-MEDIA` wrapper manifest for native).

## Sniffing videasy → a native-playable m3u8 (for the native player)
Because `videoLocation:"top"`, a **top-frame** `fetch`/`XHR.open` hook catches the
`.m3u8`. Approach for the hidden resolver WebView:
1. Load the embed URL. **Set `mediaPlaybackRequiresUserAction={false}`** (and
   `allowsInlineMediaPlayback`) — `SnifferWebView.old` currently omits these, and
   videasy won't resolve without a "play" trigger.
2. Inject JS that (optionally) opens Settings → clicks the target dub **server**
   (match the language label; Hindi→"Fade", else Original/first) → clicks the
   center play button (a real-ish gesture) → the page resolves + hls.js fetches
   `master.m3u8` → the hook captures it.
3. Return `{ masterUrl, dub }` to the native player (`expo-video`).

CDP recipe that proved all of the above (dev builds only):
```bash
PID=$(adb shell pidof com.cody669.Uott); adb forward tcp:9222 localabstract:webview_devtools_remote_$PID
curl -s localhost:9222/json/list        # get webSocketDebuggerUrl
# connect via Node `ws`; Runtime.evaluate to hook fetch/XHR, read window.__caught, inspect DOM
```

## Open items specific to videasy
- Re-verify the hidden-WebView sniff actually triggers resolution offscreen (the
  gesture requirement is the risk). Fallback: keep the `HijackPlayer` WebView.
- Multi-dub resolution = one hidden-resolve per server (cost ~1–3s each).
