# videasy resume-after-pause / pre-play gate — diagnosis (2026-08-25)

Investigated on the iOS sim (party host, live) with temporary DOM probes injected via the
relay + `execute_in_app`. Probes reverted after. This documents the mechanism so the fix
doesn't require re-deriving it.

## Symptom
On videasy, after a pause (or on remount/foreground while the room is paused), the player
shows videasy's **own pre-play poster card** ("Title · S1E1" + a white play button), and our
resume (`__vlCmd play` → `vid.play()`) does **not** lift it. Playback appears stuck.

## What the probes showed
Probing the WebView's frame tree while the poster card was up (top frame = `player.videasy.to/tv/95350/1/1`):
- `document.getElementsByTagName('video').length` = **0**
- `document.getElementsByTagName('iframe').length` = **0**
- `window.frames.length` = **0**

i.e. during pre-play/poster state the top document has **no `<video>` and no child frames at all**.
The real `<video>` is created only **after** videasy's play button is genuinely activated and the
stream loads. This matches `src/scripts/videasy.delta.ts` (line 8–9, 87–89): videasy's `<video>` is
top-document, and the finder must **skip the pre-play poster's empty/absent `<video>`** (`findVideo`
binds only a video with `currentSrc || src || readyState>0`).

## Root cause
`legacy-videasy.ts` `__vlCmd('play')` calls `vid.play()`. In the poster/pre-play state:
- there is no bound, source-backed `<video>` to play (pre-play), or the element is detached/paused
  behind videasy's card, so `vid.play()` is a no-op and the card stays up;
- videasy's own play button does **not** respond to a plain `.click()` or a coordinate tap through
  our (pointerEvents:none) loader — it needs the **full synthetic pointer sequence**
  (`pointerover→pointerenter→pointerdown→pointerup→mousedown→mouseup→click`) already implemented as
  `hit()` in `videasy.delta.ts`.

So: to resume from videasy's poster state you must **drive videasy's OWN play affordance with the
synthetic pointer sequence**, not `vid.play()`, and then **re-arm the finder** to bind the recreated
`<video>`. The legacy bridge's `finder` `clearInterval`s itself after the first bind and never
re-arms (`keepAlive` only re-finds when `vid` is null, which never happens post-bind) — so even once
videasy recreates the video, the bridge won't re-bind it.

This is consistent with the iOS-bind fix (commit `18594a8`): the "video in a cross-origin sub-frame"
appears only once streaming; pre-play is top-document with no video.

## The blocker for writing the fix
We need videasy's **pre-play/paused play-button selector**. Best obtained by CDP (Safari Web
Inspector) into the live WebView while the poster card is up, or Playwright on desktop
`player.videasy.to` (the pre-play card renders there too). Then the fix can target it.

## FIX WRITTEN (OTA bridge) — 2026-08-25
Delivered in the OTA bridge `src/scripts/legacy-videasy.ts` (per operator: hijack logic stays
server-side, not bundled). Two changes:
1. **`__vlCmd('play')` clicks videasy's own play button** when the poster card is up — selector
   `button[class*="bg-white/95"]` (a rounded-full white circle; verified live on
   `player.videasy.to` — clicking it via the synthetic pointer sequence creates the top-document
   `<video>` and starts playback). Handled BEFORE the `!vid` guard so it works with no bound video.
2. **Persistent finder (re-arm):** the finder no longer `clearInterval`s after first bind — it drops a
   disconnected `vid` (`vid.isConnected === false`) and (re)binds whenever the live `<video>` differs,
   so a videasy-recreated element gets re-bound. (Used `isConnected`, not `document.contains`, so a
   same-origin sub-iframe video isn't wrongly dropped.)

Deploy (operator secret): `SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/upload-bridge.ts videasy`
(validates → PATCHes Supabase → purges worker cache). Dry-run `--dry-run` passes (`videasy@9ad6a4cf`).

### Verified on-device (iOS sim, SOLO, local-injected the fixed bridge)
- ✅ **play-from-poster works:** `__vlCmd('play')` from the pre-play card started playback (loader
  lifted; ticks advanced t=86→94, rs=4). Before the fix this no-op'd (loader stayed forever).
### NOT fully verified (budget) — watch on real-device retest
- ⚠️ In the same solo harness a follow-up `__vlCmd('pause')` did NOT stop playback (ticks kept
  advancing paused=false). This is almost certainly the **pre-existing command-relay reach** issue —
  NOT a regression from this change (the play/pause command path is untouched except adding the button
  click): the relay fans commands via `document.querySelectorAll('iframe')` from the top frame, which
  may not reach videasy's video frame in solo's topology. The **party** path has pause/seek verified
  working (C1 two-device sync), so the sync use-case is fine. Resolve the relay reach (target
  `window.frames` / cross-origin frames) + the DUPLICATE-events issue as a follow-up, and retest
  pause/resume on a real device after deploy.

## RELAY REACH FIX — 2026-08-25 (app-side, follow-up to the bridge fix)
The bridge fix above was DEPLOYED OTA (`videasy@9ad6a4cf`, worker cache purged). During on-device
retest, `__vlCmd('pause')` didn't reach videasy's video frame in solo — root cause: the app-side relay
(`HijackPlayer.tsx`) fanned commands to sub-frames via `document.querySelectorAll('iframe')`, which
only sees **light-DOM** `<iframe>` elements and misses a frame nested in a **shadow root** (where
videasy mounts its cross-origin `<video>` frame). Fixed by fanning via **`window.frames`** instead —
the child-browsing-context list, which enumerates every child frame regardless of DOM nesting and is a
strict superset of the light-DOM iframe list (so it's used ALONE; fanning via both would double-deliver
and, since each frame re-broadcasts, blow up exponentially with depth). Shared snippet `RELAY_FAN_JS`
now drives both `relayInject` (RN→frames) and the per-frame `relayListenerJs` (frame→its children).
This is generic postMessage plumbing, NOT videasy hijack logic, so it stays app-side (the binary carries
only a nonce-gated eval bus; the videasy selectors/logic remain OTA). tsc clean.

**Verification status: ✅ CONFIRMED WORKING on the operator's real device (2026-08-25)** — play → pause
→ resume works end-to-end with the deployed bridge (`videasy@9ad6a4cf`) + the window.frames relay fix.
(Sim retest had been blocked by videasy's own title-load flakiness, unrelated to the fix.) Rollback for
the bridge = re-upload the prior version. Remaining follow-up: de-dupe the ~2× transport events.

## Fix options (superseded by "FIX WRITTEN" above; kept for context)
1. **App-side supplementary injection (no OTA, no operator secret).** In `HijackPlayer`, when a resume
   is requested and we're in the poster state (no ticks advancing / `vid` missing), inject (via
   `relayInject` into the reachable top frame) a routine that finds videasy's play button and fires the
   synthetic pointer sequence, then relies on the finder to re-bind. Preferred (like the existing
   `#__npChromeKill` app-side approach). Needs the selector.
2. **OTA bridge change (needs `SUPABASE_SERVICE_ROLE_KEY`).** Update `legacy-videasy.ts`: (a) re-arm the
   finder when the bound `vid` detaches/swaps (`!document.contains(vid)` → null it, restart the finder);
   (b) make `__vlCmd('play')` fall back to clicking videasy's play button when there's no source-backed
   video. Redeploy via `scripts/upload-bridge.ts`.

## Also found — DUPLICATE transport events → FIXED 2026-08-25 (app-side)
With `injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}` the bridge runs in multiple frames,
so ≥2 frames post the same event and the sync engine saw every event ~2×. Fixed in `HijackPlayer.tsx`
`handleMessage` with TWO de-dupe mechanisms (the two kinds duplicate differently — confirmed live):
- **Discrete transport/state events** (play/pause/seeking/seeked/playing/canplay/waiting/ended/quality/
  audio) fire at an agreed `currentTime` in both frames → drop when the signature
  (`event|round(ct*10)|paused|readyState`) repeats within 300ms. (Live-verified: the post-play burst
  came through single.)
- **Ticks** are periodic (~1/s per frame) and each frame samples `currentTime` a few ms apart, so an
  exact-value match misses them → rate-limit to one tick per 850ms by wall clock. (Correct by
  construction for any frame phase-offset; a clean live tick-count recheck was blocked by videasy's
  pre-play gate + Fast-Refresh remounts on the sim.)

## Repro notes / gotchas
- Driving playback in a party is entangled with the sync engine + videasy's pre-play gate; **solo
  playback is the cleaner isolation** for the next repro (no room state, videasy autoplays).
- The dev-menu ⊕ FAB overlaps the center play/pause button and eats coordinate taps — drive `__vlCmd`
  via a temp `globalThis.__vlTestCmd` hook + `execute_in_app` instead (as done here).
- Each Fast Refresh remounts the WebView → back to videasy's pre-play card.
