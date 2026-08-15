# Player Subsystem & WebView Injection (the "hijack")

> How Bearoom observes + drives a third-party web video player, how JS/CSS is
> injected, how the watch-party sync engine plugs in, and how to debug the
> WebView live with Chrome DevTools over CDP. Read alongside
> [../providers/videasy.md](../providers/videasy.md) for a concrete example.

## The hijack in one paragraph
The party plays a provider's embed page inside `react-native-webview`
(`components/player/HijackPlayer.tsx`). Before the page loads we inject
`BRIDGE_JS` (`injectedJavaScriptBeforeContentLoaded`). The bridge finds the
`<video>` element (walking **same-origin** iframes), relays its events to RN via
`window.ReactNativeWebView.postMessage`, and exposes `window.__vlCmd(cmd)` so RN
can drive the video. RN drives it with `webRef.injectJavaScript(...)`. That
two-way bridge is what makes host playback controllable + syncable.

## Contracts (keep stable — the native player must match these)
`components/player/HijackPlayer.tsx`:
```ts
interface PlayerHandle {           // imperative ref the app calls
  play(): void; pause(): void;
  seek(seconds: number): void;
  setRate(rate: number): void;
  fullscreen(): void;              // asks the <video> for native HTML5 fullscreen
}
interface PlayerEvent {            // every event/heartbeat from the bridge
  event: 'ready'|'play'|'pause'|'seeking'|'seeked'|'ended'|'waiting'|'playing'|'canplay'|'tick';
  currentTime: number; duration: number; paused: boolean;
}
// Props: { providerId, tmdbId, type, season?, episode?, startAt?, onPlayerEvent, onBound?, onBindFailed? }
```
(An older single-provider twin, `VidLinkPlayer.tsx`, with the same handle — used only
by a `sync-demo` route over the old `services/sync/*` engine — was **removed**. So
`HijackPlayer` is the sole live implementation of this contract today, until the native
player joins it.)

## BRIDGE_JS anatomy (`HijackPlayer.tsx`, the `BRIDGE_JS` template string)
1. **Popup/ad blocking**: `window.open = () => null`; a capture-phase `click`
   listener that `preventDefault()`s `a[target=_blank]` navigations. ⚠ It must
   **NOT** `stopPropagation()` — doing so once swallowed every control tap.
2. **CSS injection hook** (`__addSt`): injects a `<style>` for provider layout
   fixes. Current rule (videasy): `@media(max-height:480px){div.absolute.bottom-0.h-44{height:auto!important}}`
   — see videasy doc for why. Add per-provider CSS here.
3. **`findVideo(doc)`**: returns the first `<video>`, recursing into
   **same-origin** iframes only (cross-origin is invisible — a real limitation).
4. **`bind(v)`**: adds listeners for play/pause/seeking/seeked/ended/waiting/
   playing/canplay → `post(...)`; posts a `ready`; a 1s `tick` heartbeat.
5. **Echo suppression** (`markApplying`/`isApplying`, 500ms): when *we* drive the
   video, the resulting events would echo back as if the user did them, so they're
   suppressed for 500ms. ⚠ `markApplying()` is called **only for play/pause/seek**,
   NOT for `rate` — a rate change emits `ratechange` (not observed), and the sync
   engine nudges `playbackRate` constantly, so suppressing there swallowed the
   user's real taps.
6. **`window.__vlCmd(cmd)`**: `{action:'play'|'pause'|'seek'|'rate'|'fullscreen', …}`.

RN → WebView: `webRef.injectJavaScript('window.__vlCmd(' + JSON.stringify(c) + '); true;')`.
WebView → RN: `onMessage` parses JSON into a `PlayerEvent` → `onPlayerEvent`.

## How the sync engine drives it (`services/party/*`)
- `app/party.tsx` mounts `<HijackPlayer ref={playerRef} onPlayerEvent={onEvent} …/>`.
- `services/party/useParty.ts` builds a `PlayerControl` adapter from `playerRef`
  (`play/pause/seek/setRate → playerRef.current?.*`) and passes it +
  `onPlayerEvent` into `PartySyncEngine`.
- `services/party/PartySyncEngine.ts`:
  - `setAnchor(anchor)` — on a NEW `epoch:seq`, `applyAnchorNow()` snaps the local
    player to `effectivePositionMs` + play/pause/rate. ⚠ It **skips the seek when
    already on target** (`|lastCt - target| ≤ 1.5s`) — a redundant seek re-buffers
    these streams and freezes playback.
  - `onPlayerEvent(e)` — a USER play/pause/seeked (bridge suppresses ours) →
    `handleUserControl`: **host** → `client.play/pause/seek` (authoritative RPC
    `party_set_playback`); **guest** → local pause detaches, resume jumps to live.
  - Between anchors, two-tier drift correction (dead-band → rate nudge 0.9–1.1× →
    hard seek) keeps everyone locked.
- So **any** player exposing `PlayerHandle` + emitting `PlayerEvent` is a drop-in
  (this is the seam the native player uses).

## Known bug classes we've hit (and the fix each needed)
- **Overlay eats taps**: an RN view with a full-screen `Pressable` over the WebView
  intercepts every touch inline; fullscreen escapes to Android's decorView so it
  "works expanded, not collapsed". Fix: don't overlay the WebView (deleted the old
  `PlayerControls`).
- **Provider control-bar overlaps center buttons**: see videasy doc (`h-44` bar).
- **Sync suppression / re-seek**: the two ⚠ items above.

## Debugging the WebView LIVE with Chrome DevTools (CDP over adb)
Dev builds enable WebView debugging. This is the most powerful tool here — use it.
```bash
PID=$(adb -s emulator-5554 shell pidof com.cody669.Uott | tr -d '\r')
adb -s emulator-5554 forward tcp:9222 localabstract:webview_devtools_remote_${PID}
curl -s http://localhost:9222/json/list        # find the page + webSocketDebuggerUrl
# then connect over ws (Node `ws` pkg is available) and Runtime.evaluate / Network.enable
adb -s emulator-5554 forward --remove tcp:9222  # cleanup
```
Recipes proven this session (see git history / provider docs):
- **Inspect hit-testing**: `document.elementFromPoint(x,y)` + `elementsFromPoint`
  to see what's actually on top of a button.
- **Sniff the stream**: install a `fetch`/`XHR.open` hook (`window.__caught=[]`),
  trigger play, read the caught `.m3u8`/segment URLs (top-frame only).
- **Read/drive `<video>`**: `document.querySelector('video')` → `.paused`,
  `.currentTime`, `.playbackRate`, `.play()`, tracks.
- `Runtime.evaluate` accepts `userGesture:true` (satisfies autoplay policy).
> execbro MCP is currently disconnected — drive on-device via `adb` + CDP.
> `adb exec-out screencap -p` captures non-video screens; video surfaces are black.

## Per-provider injection pattern (IMPORTANT)
Every provider's player DOM differs, so **layout/interaction fixes are
per-provider**. The mechanism (BRIDGE_JS + `__addSt` CSS) is shared; the
selectors are not. **When you support/fix a provider, document it** in
`docs/providers/<id>.md` (DOM classes, the exact injected CSS/JS, the stream
shape). videasy is the worked example.
