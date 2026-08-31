# Native Player via Hidden Resolver + Dub Picker (design / plan)

> # 🔄 RE-EVALUATED: Hybrid OMSS Architecture
> We initially rejected native-sniff playback because CDN tokens expire (HTTP 403) and the native player couldn't self-heal. 
> **We have solved this using the "Re-Sniff Loop"**: when `expo-video` throws an HTTP 403, we save `currentTime`, remount the hidden `SnifferWebView` to snatch a fresh `.m3u8` token, pass it back, and seek to the saved time (~1-2s invisible buffering). 
> 
> Furthermore, all sniffer outputs will now be formatted to the **CinePro OMSS Standard** (`SourceResponse` -> `StreamSource`). This completely decouples our UI from the scraping mechanics, giving us the 100% WAF-bypassing reliability of the WebView, with the clean, standardized data models of an OMSS API.

> Direction for replacing the party's WebView playback with a native `expo-video`
> player, fed by an `.m3u8` **sniffed from a hidden resolver WebView**. Read with
> [player-and-injection.md](./player-and-injection.md) and
> [../providers/videasy.md](../providers/videasy.md). Status: **designed +
> feasibility-proven, not yet built.**

> ## 📌 2026-08-31 — status update after the plugin research
> This document is **still the design of record for the native lane**, now scheduled as **Program 1 · P2**
> (board `Phase 11` covers the plugin *source* that feeds it). Three things it says have been re-measured —
> see [`../research/nuvio-plugin-architecture.md`](../research/nuvio-plugin-architecture.md).
>
> **1. The "Re-Sniff Loop" premise is weaker than assumed — likely unnecessary for the plugin lane.**
> It exists because CDN tokens were believed to expire mid-playback and force a 403 re-sniff. Measured
> against the same provider: re-resolving 4 minutes later, **under a rotated seed, returned byte-identical
> URLs**, and a URL resolved ~20 min earlier still served media. Only the 30 s *seed* rotates, not the
> stream. Keep the loop as defensive error handling, but do not architect around it — and **re-resolve
> deterministically** (same `tmdbId + provider + language` → same URL) rather than re-sniffing, which also
> lets a party guest derive the URL locally instead of receiving the host's.
>
> **2. `NativePlayer` as a drop-in `forwardRef<PlayerHandle>` is confirmed correct, and cheaper than it
> looks.** `PlayerHandle` (`components/player/HijackPlayer.tsx:92-111`) is already lane-agnostic — proven by
> `HijackPlayer.web.tsx` implementing the identical contract independently — and `PlayerControls.tsx` is
> already decoupled (state pushed in imperatively via `setPlayback()`, every action a plain callback). The
> only WebView-shaped leaks to fix: `QualityLevel` is exported *from* `HijackPlayer` rather than a neutral
> module; `readQuality()`/`readAudio()` must currently be staggered 750 ms purely for videasy's single
> settings tab; and `onBound` must be synthesised, since the two screens use `playerBound` as the
> "mount our controls" gate.
>
> **3. Codec reality, measured on real hardware.** `expo-video`/AVPlayer **cannot open MKV at all** on iOS
> (`canPlayType('video/x-matroska') === ""`; a real file fails with `MediaError code 4`) — though iOS *does*
> decode HEVC, AC-3 and E-AC3 inside MP4/HLS, so the gap is the **demuxer, not the decoders**. On Android
> the inverse: ExoPlayer demuxes MKV fine, but the A063 test device declares **no AC3/E-AC3/DTS decoder**,
> so that tier plays silent. Neither blocks P2: the plugin shortlist's Hindi dubs are **HLS/AAC**, which
> `expo-video` handles natively. The MKV tier needs `expo-libvlc-player` (runtime-verified, 35 MB,
> LGPL-2.1) and is deferred to roadmap *Optional*.
>
> Unchanged and still true: the **no `seeked` event** limitation below, the echo-suppression rule, and the
> seconds-vs-milliseconds boundary.

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
- Android background playback (FGS + MediaSession) is applied by **`plugins/bearoom-playback`** — survives `expo prebuild --clean`. Source of truth for Kotlin lives under `plugins/bearoom-playback/android/`; do not hand-edit generated `MainApplication`/`MainActivity` playback blocks.
- `expo-dev-client` present. If the installed dev client predates native changes, **one native rebuild** is needed.

## Scope
- **v1 (POC, party-only):** hidden resolver → sniff videasy `master.m3u8` (**Hindi/Fade default → Original fallback**) → native playback + native controls (play/pause/seek/±10s/scrub/quality/speed) + **dub picker** + WebView fallback on ~8s sniff-fail.
- **v2:** subtitles (sniff/Wyzie + wrapper manifest) · PiP/background/cast/lock-screen (runtime + maybe rebuild) · thumbnail scrubbing · extend to solo player · group-pause-on-buffer.

## Scope & Implementation details (Updated Hybrid OMSS Strategy)

### 1. The "Snatch and Kill" Logic
To prevent the hidden `SnifferWebView` and the Native ExoPlayer from double-buffering or playing overlapping audio, the injected JavaScript MUST kill the DOM video element immediately upon URL extraction:

```javascript
window.fetch = function (input, init) {
  var u = typeof input === 'string' ? input : input.url;
  if (/\.m3u8|\.mpd/i.test(u)) {
     // 1. Send URL to React Native
     window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'media', url: u }));
     
     // 2. Kill the video to stop hls.js / MSE buffering
     document.querySelectorAll('video').forEach(function(v) {
        v.pause();
        v.removeAttribute('src');
        v.load();
        v.remove();
     });
  }
  return originalFetch.apply(this, arguments);
};
```

### 2. The Re-Sniff Loop (Token Self-Healing)
If a token expires during long watch parties, `expo-video` will throw an HTTP 403 error on the next segment.
- Listen to `expo-video` errors.
- On HTTP 403, cache `currentTime`.
- Unmount and remount `StreamResolverWebView` to trigger a fresh page load.
- Catch the new `.m3u8` with the new token.
- Pass to `expo-video` and call `seek(currentTime)`.

### 3. The OMSS Standard Output
The React Native side of the Sniffer will map all outputs to the CinePro OMSS standard before handing them to the player/UI:

```typescript
export interface OMSSStreamSource {
  url: string;
  type: "hls" | "mp4";
  quality: "1080p" | "720p" | "Auto";
  audioTracks: {
    language: string;    // e.g., "hi"
    label: string;       // e.g., "Hindi"
  }[];
  provider: {
    id: string;          // e.g., "videasy"
    name: string;        // e.g., "NetPrime"
  }
}
```
*Result: The UI components and player state strictly consume OMSS objects, entirely decoupled from the sniffing mechanics.*
