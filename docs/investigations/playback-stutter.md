# Playback "stutter" — on-device investigation (2026-08-16)

## The report
"Title/episode plays are not smooth anymore — after every second a split-second
stop", believed to be a regression from the native-controls overlay overhaul.
Earlier speculative fixes (removing the seekbar glide animation) did NOT help.

## Method (objective, on-device)
Physical device `P2228K000422`. CDP into the videasy WebView over
`adb forward tcp:9223 localabstract:webview_devtools_remote_<pid>` + Node `ws`
(scripts in the session scratchpad: `cdp_measure/trace/marginal/throttle`).
Metrics: video-clock advance vs wall clock (stalls), `getVideoPlaybackQuality()`
`droppedVideoFrames`, `readyState`, buffered-ahead margin, and
`dumpsys gfxinfo <pkg>` (the app render-thread's jank).

## Evidence
1. **Buffered data plays flawlessly** — seek into already-buffered range → `0`
   dropped frames, `0` stalls after the seek settles.
2. **Healthy sustained playback** (buffer 30s+ ahead) → `0` stalls over 20s,
   `6/473` dropped frames (0.4%). Smooth.
3. **`gfxinfo` = 0 frames** rendered by the app's render thread during playback →
   the video composites on a **separate hardware surface** (SurfaceView /
   SurfaceFlinger), bypassing the RN UI thread. The overlay/blur/re-render are
   physically not in the video's compositing path.
4. **Every stall = buffer starvation**: `readyState` drops to 2 and
   `buffered.end ≈ currentTime`. The page reports `visibilityState: "visible"`
   (not a Chromium background-throttle).
5. **Overlay state is irrelevant**: controls visible (glass blur active over the
   video) → `0` dropped/6s; a per-second `playbackRate` injection simulating
   party drift → `0` stalls/12s.
6. **Causal confirmation**: with the device's mobile hotspot connected, playback
   is smooth; when it dropped (~0.3 Mbps, `41.9 KB/s` in the status bar) the video
   hard-stalled — `currentTime` frozen, `readyState` 2 — and did NOT downshift
   from 1080p. Reconnect → smooth. The network was the variable, confirmed by the
   user ("hotspot was disconnected").

## Conclusion
The "stutter" is **videasy stream/segment starvation (the network)**, not the app.
The render path is provably clean: a video on a separate hardware surface cannot
be hitched by the RN overlay, the glass blur, the per-second re-render, or the
sync engine's `setRate` injection. The overhaul's `__vlChromeOff` hid videasy's
**own buffering spinner**, so ordinary network rebuffers turned into unexplained
freezes — which read as an app "stutter" / "regression".

## Fix — buffering spinner (commit `7c7e6d9`)
Surface `readyState` through the bridge (`tick`/events) → derive a debounced
(450 ms) buffering state in `PlayerControls` → show an on-brand honey spinner
whenever the stream stalls while meant to be playing. Restores the feedback we
removed. **Never touches the render path.** Verified on-device: spinner shows on
stall (`readyState<3`, playing), clears on resume (`readyState≥3`) and on pause.

## Rotation (commit `2e41c90`) — QA'd same session
Fullscreen ↔ portrait verified on-device: landscape fullscreen is clean (no
videasy chrome, no stuck cover), and the first settled portrait frame after the
return rotation is clean (no white half-screen, no overscaled thumbnail — the
reported artifacts). The state-driven, hoisted black cover is effective.
(The sub-100 ms mid-transition frame can't be captured: screencap is too slow and
`screenrecord` is blocked by the protected video surface — so transition *feel*
still wants a human eye; a fully seamless rotate-in-portrait remains deferred.)

## Follow-ups (NOT built — higher risk, need a decision)
- **Auto-recovery** from a dead stream (videasy remembers position, so a WebView
  reload resumes) — must be gated hard against reload loops, and videasy's
  pre-play gate reappears on reload (needs an auto-play-gate click).
- **Bitrate resilience**: videasy did NOT adapt down under bandwidth limit
  (stayed 1080p and starved). `hls.js` is not reachable in its scope, so this
  needs videasy-DOM quality control (auto-drop quality on repeated stalls).
- **Provider fallback** on chronic stalls.
