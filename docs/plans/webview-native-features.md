# Plan — WebView-primary player + native features via WebView

> **Implementation plan for Cursor.** This repo is a React Native (Expo SDK 53, RN 0.79,
> New Architecture ON) streaming + watch-party app ("Bearoom"). **Read
> `docs/architecture/README.md` first** for the full architecture, then this plan.
> Where it says **ASK CLAUDE**, route that question back to the human to relay to the
> Claude session that wrote this — don't guess on those.
>
> Standing rules: **do NOT `git push`** (the human manages the remote). Commit at each
> working checkpoint. Keep `npx tsc --noEmit` and `npx eslint .` clean (the repo is
> maintained at 0 errors).

## 0. The decision you're implementing (WHY — read this)
We investigated building a **native `expo-video` player** fed by a stream *sniffed* from the
provider's web player, then **rejected it**. Reason, proven empirically this session:
the provider (videasy) serves its HLS stream via a **deterministic, ephemeral, WAF-gated
token** — two independent fresh browser sessions resolve to the *identical* token, and a URL
that plays for a while is dead hours later. So a native player **cannot self-heal when the
token expires mid-playback** (re-resolving just returns the same dead URL) and can't reliably
play a full movie. Details: `docs/architecture/native-player.md`, `docs/providers/videasy.md`.

**Decision:** the **WebView stays the PRIMARY playback engine** — it runs the provider's own
player, which handles tokens / WAF / adaptive bitrate / recovery for us. We add native
**features around** the WebView (PiP, AirPlay, background audio, lock-screen controls) —
**without re-hosting the stream natively.**

Players to KEEP (do not replace):
- **Party:** `components/player/HijackPlayer.tsx` — a WebView with an injected JS bridge that
  powers watch-party sync. ⚠ **Do not break the sync bridge** (`PlayerHandle` / `PlayerEvent`);
  see `docs/architecture/watch-party-sync.md`.
- **Solo:** `app/(player)/player.tsx` — a plain WebView.

## 1. FIRST: remove the abandoned native-player POC
Delete (these ARE the rejected native approach):
- `components/player/NativePlayer.tsx`
- `components/player/StreamResolverWebView.tsx`
- `app/resolvertest.tsx`  (dev route)
- `app/vidinspect.tsx`    (dev route)

Then:
- **Uninstall `expo-video`** — verified it's used *only* by the files above: `npm remove expo-video`,
  and delete the `"expo-video"` entry from `app.json` → `expo.plugins`.
- Leave the `*.old.*` files (`utils/streamResolver.old.ts`, `components/player/SnifferWebView.old.tsx`,
  `EmbedWebView.old.tsx`) — they're excluded from the build and kept as documented research.
- **Update `docs/architecture/native-player.md`**: add a banner at the top marking the native-sniff
  PLAYBACK approach **REJECTED** (deterministic ephemeral WAF tokens → can't self-heal), and point to
  this plan. Keep the resolver/dub reverse-engineering sections as research.
- Confirm `npx tsc --noEmit` (0 errors) and `npx eslint .` (0 errors). **ASK CLAUDE** if tsc reports
  any reference to the deleted files from a non-POC file (nothing should).
- Commit: `chore: remove rejected native-player POC + expo-video (WebView stays primary)`.

## 2. Native features — build in this order (honest per-platform feasibility)

### Phase 1 — iOS easy wins (props + Info.plist; low risk) ✅
react-native-webview 13.13.5 supports these iOS props (verified in its native source
`node_modules/react-native-webview/apple/RNCWebViewImpl.{h,m}`):
`allowsInlineMediaPlayback`, `allowsPictureInPictureMediaPlayback`, `allowsAirPlayForMediaPlayback`,
`mediaPlaybackRequiresUserAction`.

1. **iOS Picture-in-Picture + AirPlay + inline.** On BOTH WebView players set:
   `allowsInlineMediaPlayback`, `allowsPictureInPictureMediaPlayback`,
   `allowsAirPlayForMediaPlayback`, `mediaPlaybackRequiresUserAction={false}`.
   - Add `UIBackgroundModes: ["audio"]` to `app.json` → `expo.ios.infoPlist` (PiP needs it to keep
     playing while backgrounded). Requires a **native rebuild** (`npx expo prebuild` / EAS dev build).
   - Add a **"PiP" button** to the RN control overlay that runs:
     `webRef.injectJavaScript("document.querySelector('video')?.requestPictureInPicture?.(); true;")`.
   - AirPlay: the video's native controls show the route picker automatically; nothing else needed.

2. **Background audio (iOS).** With `UIBackgroundModes: ["audio"]` set (above), also put the app's
   `AVAudioSession` category into `.playback` so WKWebView audio continues in background. Simplest:
   `npm i expo-audio`, call `setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true })`
   once at app start. ⚠ WKWebView manages its own audio session in edge cases — **verify on a real
   device**; if the WebView audio still pauses, **ASK CLAUDE** (a small native audio-session module may
   be needed).
   - Commit after Phase 1 verifies on a device.

### Phase 2 — harder (Android + native modules; do after Phase 1 works)
3. **Background audio (Android).** Android WebView media pauses when the Activity backgrounds.
   Keeping it playing needs **audio focus + a foreground media service** so the OS doesn't pause/kill
   it. This likely requires native Android code (or `react-native-track-player` used *only* for the
   media session, not for audio — the audio stays in the WebView). **ASK CLAUDE before starting** —
   this is a real native change; if it can't be done cleanly, document the limitation and move on.

4. **Lock-screen / media-session controls (both platforms).** Bridge the WebView `<video>` ↔ a native
   media session so the lock screen shows play/pause/seek and remote commands drive the video:
   - The bridge already emits `PlayerEvent` (play/pause/seek/tick with currentTime/duration/paused) —
     feed that into Android `MediaSessionCompat` + a media notification / iOS `MPNowPlayingInfoCenter`
     + `MPRemoteCommandCenter`.
   - Remote commands (lock-screen play/pause/seek) → `webRef.injectJavaScript(...)` to drive the
     `<video>` (mirror `HijackPlayer`'s `__vlCmd` command shape).
   - ⚠ **In a party, remote controls MUST route through the room authority (host)** exactly like the
     in-app controls, or you'll desync the party. **ASK CLAUDE about the sync contract** before wiring
     lock-screen controls into the party path.

5. **Android Picture-in-Picture (hard — treat as research).** Android PiP is Activity-based, not a
   WebView prop: MainActivity `enterPictureInPictureMode()` + keep the WebView video rendering in PiP.
   Provider/WebView-dependent and often flaky; may not be cleanly achievable. Time-box it.

### Out of scope (note, don't build)
- **Chromecast**: the stream is WAF-gated + IP/token-locked, so casting the raw URL to a TV won't work
  without the provider's own cast support. Defer. (iOS **AirPlay** in Phase 1 is the achievable "cast".)

## 3. How to QA (do this for every feature)
Test on a **real device** where it matters — background audio, PiP, lock-screen, AirPlay only test
meaningfully on hardware; use the emulator/simulator for functional + regression checks.

- **Background audio:** play a title (solo AND party) → press Home to background → audio must keep
  playing → lock the device → must keep playing.
- **iOS PiP:** play → tap the PiP button (or swipe up to background) → video pops into a floating window
  and keeps playing → tapping it returns to the app.
- **iOS AirPlay:** with an Apple TV on the LAN, open the video's native controls → AirPlay picker →
  select the TV → plays on the TV.
- **Lock-screen controls:** play → lock device → lock screen shows the media with play/pause → the
  buttons control the video.
- **⚠ WATCH-PARTY REGRESSION (run after ANY WebView change):** in a 2-device party, host
  play/pause/seek must still reflect on the guest. If sync breaks, you broke `HijackPlayer`'s bridge —
  revert and **ASK CLAUDE**.
- **Debug the WebView with Chrome DevTools over adb** (Android dev builds):
  `PID=$(adb shell cat /proc/net/unix | grep -oE 'webview_devtools_remote_[0-9]+' | head -1)`;
  `adb forward tcp:9222 localabstract:$PID`; open `chrome://inspect` or `curl localhost:9222/json/list`.
  Full workflow in `docs/architecture/player-and-injection.md`.
- **Emulator caveats (learned the hard way this session):** `adb exec-out screencap` returns a BLACK
  frame once a video surface binds — verify via the app UI / `uiautomator dump` text / CDP, NOT pixels.
  RN `console.log` often does NOT reach `adb logcat` on the New Architecture (Bridgeless) — rely on CDP
  or on-screen state instead. `adb input tap` can be unreliable on headless (`-no-window`) emulators —
  boot with a window for interactive testing.

## 4. When to ASK CLAUDE (route via the human)
- Anything touching the **watch-party sync contract** (`PlayerHandle`/`PlayerEvent`, the
  anchor/epoch/seq model) — `docs/architecture/watch-party-sync.md`. Don't change it blindly.
- Provider-specific WebView quirks (the injected bridge, ad-redirect blocking, the videasy `h-44`
  control-bar CSS fix) — `docs/providers/videasy.md`.
- Before any **native code / `expo prebuild`** change (iOS audio-session module, Android foreground
  service, Android PiP, the media-session bridge).
- If removing `expo-video` surfaces anything unexpected.

## 5. Definition of done
- **Cleanup:** POC removed, `expo-video` uninstalled, `native-player.md` marked rejected, tsc + eslint clean.
- **Phase 1 (iOS):** PiP works (button + backgrounding), AirPlay works, background audio works — verified on a device.
- **Regression:** party sync verified unbroken on 2 devices.
- **Phase 2:** Android background audio + lock-screen controls attempted — working, or the limitation clearly documented.
- Commit at each working checkpoint. Do **not** push.
