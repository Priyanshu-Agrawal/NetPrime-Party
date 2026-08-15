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

- **There is NO "Jade" server** — the Hindi one is **Fade**. DOM button labels
  concatenate agent+language: **`YoruOriginal audio`, `KilljoyGerman audio`,
  `FadeHindi audio`, `OmenSpanish audio`, `RazePortuguese audio`** — so **match the
  LANGUAGE** (`/hindi/i` + `/audio/i`), not the agent name.
- **Product rule: default to Hindi (Fade); fall back to Original when the title has
  no dub** (dubs are frequently unavailable per title).
- Each dub is a distinct stream on a **different CDN**: Original = `moon.ironwallnet.net`
  (fMP4, token-in-URL); **Hindi (Fade) = `rasta428jem.com`** (a real **master** `index.m3u8`
  with `360/`,`720/` variants, **IP+time-locked** — the URL embeds the resolver's IP + an
  expiry ts). ⚠ **IP-lock ⇒ resolve + play must be the SAME device/IP** (they are, on-device).
  A dub switch = **re-resolve that server → swap source** (native `player.replaceAsync`, seek back).
- **⚠ How to switch (injectable, PROVEN via CDP):** `element.click()` does NOT flip
  videasy's React tabs. A **full synthetic pointer sequence** does — dispatch, in order,
  `pointerover, pointerenter, pointerdown, pointerup, click, mousedown, mouseup` as
  `PointerEvent`/`MouseEvent` with `composed:true` + `clientX/Y`. Sequence: pointer-dispatch
  the **`Servers`** tab button → then the language button. (Desktop UA → the settings/Servers
  panel is already in the DOM after play; no gear-open needed.) Implemented in
  `StreamResolverWebView.selectDub`.

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

## Backend API (speedracelight.com)
Captured via headless-Chrome CDP. `player.videasy.to` only serves the shell; the real
backend is **`speedracelight.com`**:
- `db.speedracelight.com/3/<type>/<id>?append_to_response=…` — TMDB metadata proxy.
- **`api.speedracelight.com/seed?mediaId=<id>`** → `{"seed":"…","ttlMs":30000}` — a
  short-lived (30s) token.
- **`api.speedracelight.com/cdn/sources-with-title?title=…&year=…&tmdbId=…&enc=2&se…`**
  → the sources list, **ENCRYPTED** (`enc=2`; opaque blob, decrypted client-side using the
  seed). A different server hits a sibling endpoint (e.g. **`/hdmovie/sources-with-title`**).
- ⚠ Because the response is encrypted, there is **no clean API shortcut for dubs** — the
  decrypted result becomes the m3u8, so the **sniff (not the API)** is the extraction method.

## Sniffing videasy → a native-playable m3u8 (implemented)
Because `videoLocation:"top"`, a **top-frame** `fetch`/`XHR.open` hook catches the `.m3u8`.
Implemented in `components/player/StreamResolverWebView.tsx`:
1. Load the embed. **Set `mediaPlaybackRequiresUserAction={false}` + `allowsInlineMediaPlayback`**,
   and **block ad redirects** (`onShouldStartLoadWithRequest` → only provider `navHosts` for the
   top frame; injected `window.open=null`). ⚠ **Without redirect blocking videasy hijacks the top
   frame to ad sites (e.g. naidunia.com) and the sniff times out** — the main reliability bug.
2. Injected JS: "play-kick" (`video.play()` + click center) until a `<video>` is playing → then
   (if a dub is requested) the pointer-dispatch dub switch above → the hook captures the m3u8
   (report() waits until *after* the dub switch when a dub is set, so it grabs the dub stream).
3. Return `{ url, headers, dub }` to `expo-video`.

**Two CDP surfaces for investigating this:**
- **On-device WebView** (dev builds): `adb forward tcp:9222 localabstract:webview_devtools_remote_$(adb shell pidof com.cody669.Uott)` → `curl localhost:9222/json/list` → Node `ws`. ⚠ The socket is keyed to the **renderer** pid — find it in `/proc/net/unix` (`grep webview_devtools`); cold starts hit the **expo-dev-launcher** (tap the reachable `10.0.2.2:8081` server).
- **Headless Chrome sandbox (BEST for reverse-engineering** — no emulator, popups blockable, real input, and Chrome actually *decodes* the fMP4 which the emulator can't): launch `--headless=new --remote-debugging-port=9333 --autoplay-policy=no-user-gesture-required --block-new-web-contents`; `Fetch.enable` → `failRequest` non-videasy `Document` requests (kills ad redirects); `Input.dispatchMouseEvent` for real clicks; `Network`+`Page`+`Runtime` for full capture. **This is how the dub switch + backend API were cracked** (scripts in the session scratchpad `cdp_chrome*.js`).

## Open items specific to videasy
- **Re-confirm the offscreen resolve + dub switch ON-DEVICE** — proven in headless Chrome
  (Original 6.3s; Hindi switch → different-CDN master, video playing); the emulator's
  dev-launcher wedged during testing (dev-env, not code). Fallback stays the `HijackPlayer` WebView.
- **Master for Original**: hls.js is handed the 1080p media playlist directly
  (`index-s1080p…m3u8`); a master exists (Quality shows 2160p/1080p/720p/480p) but isn't
  fetched. Hindi already yields a master. Could derive `.../master.m3u8` for adaptive quality.
- Multi-dub resolution = one hidden-resolve per server (~few s each); Hindi CDN URL is
  **IP+time-locked** → resolve per play, on-device.
- Subtitles still external (v2).
