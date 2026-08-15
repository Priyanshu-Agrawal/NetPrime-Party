# Native Player via Hidden Resolver + Dub Picker (design / plan)

> # ⛔ REJECTED as primary playback — DO NOT BUILD THIS.
> After investigation we rejected native-sniff **playback**: the provider's HLS stream uses a
> **deterministic, ephemeral, WAF-gated token** (two fresh browser sessions resolve to the *same*
> token; a URL that plays is dead hours later), so a native player **cannot self-heal on token
> expiry** and can't reliably play a full movie. **The WebView stays the primary playback engine**;
> native features (PiP/AirPlay/background/lock-screen) are added *around* it instead — see
> **[../plans/webview-native-features.md](../plans/webview-native-features.md)**. Everything below
> (the resolver, the dub reverse-engineering) remains as **research/reference**, not the plan.

> Direction for replacing the party's WebView playback with a native `expo-video`
> player, fed by an `.m3u8` **sniffed from a hidden resolver WebView**. Read with
> [player-and-injection.md](./player-and-injection.md) and
> [../providers/videasy.md](../providers/videasy.md). Status: **designed +
> feasibility-proven, not yet built.**

## Why
Native playback unlocks what a WebView can't: **PiP, background/lock-screen audio,
AirPlay/Chromecast, native scrubber/quality/speed**, and a first-class **dub picker
(India-first)**. The `@movie-web/providers` scrapers were dead (now uninstalled), but the web player
resolves the stream fine — so use it as a **headless resolver**, then play natively.

## Feasibility — PROVEN on-device (videasy, via CDP)
- Stream = **fMP4 HLS VOD**; `master.m3u8` on `moon.ironwallnet.net/vd/<TOKEN>/`, segments on `steelatom.top/vd/<TOKEN>/…m4s`.
- 3 variants (1080/720/480, H.264+AAC, **muxed audio**). **Fetchable with NO headers** (token-in-URL). ⚠ Token likely **short-lived → resolve per play**.
- "Servers" tab = **dubs** (Original + German/Hindi/Spanish/Portuguese). Hindi = **Fade** (no "Jade"). Each dub is a **separate stream** → switch = **re-resolve + `replaceAsync`**, NOT an in-manifest audio track.
- Full details: [../providers/videasy.md](../providers/videasy.md).

## Requirement
**Dub picker is the headline feature.** Default audio = **Hindi (Fade)**; **fall
back to Original** when the title has no dub (common).

## Components to build
1. **`StreamResolverWebView`** (adapt `components/player/SnifferWebView.old.tsx`) — hidden 1×1 WebView; **must add `mediaPlaybackRequiresUserAction={false}` + `allowsInlineMediaPlayback`** (`SnifferWebView.old` lacks them and videasy binds only after a play tap). Injected JS: (optional) open Settings → click the target **dub server** (Hindi→"Fade", else Original) → click play → the top-frame `fetch`/`XHR` hook captures `master.m3u8` → `onResolved({url, dub})`; `onFail` on ~8s.
2. **`NativePlayer`** (drop-in for `HijackPlayer`) — `forwardRef<PlayerHandle>` (`play/pause/seek/setRate/fullscreen`) emitting `PlayerEvent` (`ready/play/pause/seeked/tick` w/ currentTime,duration,paused). `expo-video` `useVideoPlayer({uri:master, contentType:'hls'})` + `VideoView`. **Dub switch** → resolve new server → `player.replaceAsync` → seek back.
3. **`NativeControls`** (themed, the ONLY control set over the native surface): play/pause, ±10s, scrub, fullscreen, PiP; settings sheet = **Quality** (`availableVideoTracks`/`videoTrack`), **Speed** (`playbackRate`), **Dub picker** (server re-resolve+replaceAsync, Hindi→Original), Subtitles (v2). In party, route through room authority like today. (Start from the deleted `PlayerControls.tsx` in git history.)
4. **Wire `app/party.tsx`**: `nativeUnavailable` → `nativeUnavailable ? <HijackPlayer/> : <NativePlayer onUnavailable={…}/>`. WebView stays as graceful fallback.

## Contract the native player MUST satisfy (from the sync engine)
> **Canonical definition:** [watch-party-sync.md](./watch-party-sync.md) → "The player
> contract" (incl. the ⚠ **seconds vs. milliseconds** units boundary). Recap:
- Ref handle `play/pause/seek(seconds)/setRate/fullscreen`; emit `PlayerEvent` with `tick` **~1/sec** (`player.timeUpdateEventInterval = 1` → map `timeUpdate`→`tick`).
- **⚠ Echo-suppress programmatic play/pause/seek (~500ms guard), NOT `setRate`** — the engine drives constantly; un-suppressed echoes make guests detach every anchor and hosts echo RPCs. (Mirror `HijackPlayer` `markApplying`.)
- **⚠ expo-video has no `seeked` event** — emit `seeked` from OUR scrub UI (engine's user-scrub detection needs a landed position, threshold 2s). System/PiP scrubs are hard to detect — known limitation.
- Key the component by `providerId:uri`.

## expo-video capability map (verified in types)
Quality→`availableVideoTracks`/`videoTrack` · Speed→`playbackRate`(+`preservesPitch`) · Subtitles→`availableSubtitleTracks`/`subtitleTrack` (videasy's are external → v2: sniff/Wyzie + synth `EXT-X-MEDIA` wrapper manifest) · **Dub→server re-resolve+`replaceAsync`** · PiP→`startPictureInPicture` (config plugin already in `app.json`) · Thumbnails→`generateThumbnailsAsync` · buffered→`bufferedPosition` (party group-pause-on-buffer) · fullscreen→`view.enterFullscreen()`.

## Config / build
- `expo-video ~2.2.3` installed; **config plugin already in `app.json`** (`supportsPictureInPicture:true`) → PiP wired both platforms. `expo-dev-client` present. If the installed dev client predates expo-video, **one native rebuild** is needed; enabling `supportsBackgroundPlayback` needs **`expo prebuild` + rebuild**. Otherwise the work is JS-only.

## Scope
- **v1 (POC, party-only):** hidden resolver → sniff videasy `master.m3u8` (**Hindi/Fade default → Original fallback**) → native playback + native controls (play/pause/seek/±10s/scrub/quality/speed) + **dub picker** + WebView fallback on ~8s sniff-fail.
- **v2:** subtitles (sniff/Wyzie + wrapper manifest) · PiP/background/cast/lock-screen (runtime + maybe rebuild) · thumbnail scrubbing · extend to solo player · group-pause-on-buffer.

## Caveats
- Token short-lived → resolve per play; no caching. Sniff is **videasy-specific** (dub-select DOM); native playback layer is universal. Dub availability is per-title (Hindi often absent) → Original fallback essential. PiP/background/cast may need a native rebuild. Legal/ToS unchanged.

## Verification (established workflow)
On `emulator-5554`: `adb forward tcp:9222 localabstract:webview_devtools_remote_$(adb shell pidof com.cody669.Uott)` → CDP over Node `ws` → `Runtime.evaluate`. Confirm `expo-video` plays the sniffed master (`player.currentTime`/`paused`), a dub switch swaps audio via `replaceAsync`, quality/speed via APIs, and WebView fallback on ~8s sniff timeout. `screencap` is black once a video surface binds — trust CDP/fiber. execbro MCP currently disconnected → drive via adb+CDP.
