# Plan — Party background audio + lock-screen (extend solo to the watch party)

> **Implementation plan for Cursor.** Read `docs/architecture/README.md` and
> `docs/architecture/watch-party-sync.md` first. This EXTENDS the solo background-audio
> work (`docs/plans/webview-native-features.md`) to the watch party. It touches the sync
> contract, so **where it says ASK CLAUDE, route it back** — do not guess.
>
> Standing rules: **do NOT `git push`.** Commit at each working checkpoint. Keep
> `npx tsc --noEmit` and `npx eslint .` at 0 errors.

## 0. Where we are — solo is done, and the foundation is SHARED
Solo Android background audio + lock-screen is **done and verified on a real device (Nothing
Phone)**: screen-locked and backgrounded audio both keep playing, with the MediaSession
notification. ⚠ It rides a Chromium-visibility hack — **re-verify whenever Android System
WebView updates** or on a new device.

The important part for this plan: **the native foundation is global and provider-agnostic**,
so party reuses it with *no new native module and no WebView re-plumbing*:

- **`AlwaysVisibleRNCWebView`** (added by `patches/react-native-webview+13.13.5.patch`;
  `RNCWebViewManagerImpl.kt:63` returns it for **every** `<WebView>`) → the party
  `HijackPlayer` WebView **already is one**. It forces the view to report `VISIBLE` to
  Chromium (so the media pipeline doesn't suspend) **only while `forceWindowVisible == true`**
  (`AlwaysVisibleRNCWebView.kt:29,33,39`).
- **`forceWindowVisible`** is flipped on/off by `BearoomPlayback.start()` / `.stop()`
  (`BearoomPlaybackModule.kt:22,37`), which also starts/stops the foreground service +
  MediaSession (`BearoomPlaybackService`). `BearoomWebViews.forEach` walks the whole Activity
  and applies it to **all** mounted WebViews — not gated by solo/party.
- The **`BearoomPlayback`** native module (`start(title,artwork)` / `updateState(paused,pos,dur)`
  / `stop()`) is provider-agnostic. "Solo" is only the name of the JS wrapper
  (`components/player/soloBackgroundBridge.ts`).

**Why party doesn't background-play today** is therefore NOT a missing capability. It's two gaps:
1. The party screen **never activates a session** (never flips `forceWindowVisible`, never
   starts the FGS).
2. The party WebView injects `HijackPlayer` `BRIDGE_JS`, which has **none** of the keep-alive /
   `__soloKeepAlive` / `__soloCmd` hooks that `SOLO_BG_JS` has.

## 1. The problem UNIQUE to party — the sync contract (why we can't just import SOLO_BG_JS)
`SOLO_BG_JS` posts messages shaped `{type,…,user,hidden}`; the party bridge/engine contract is
`{event,…}` (`PartySyncEngine.onPlayerEvent` reads `e.event`). Importing `SOLO_BG_JS` into party
would break sync. `soloBackgroundBridge.ts`'s own header says "Party must NOT import this" — honor it.

And the deeper issue: today, backgrounding a party **desyncs the room**. Grounded in code:
`BRIDGE_JS` has no `visibilitychange`/keep-alive, so backgrounding genuinely pauses the
`<video>` → the `pause` listener fires with `isApplying()` false
(`HijackPlayer.tsx:129`) → posts `pause` → the engine trusts *"Anything reaching here is a USER
action"* (`PartySyncEngine.ts:95`) → `handleUserControl` →
- **Host** → `client.pause()` (`PartySyncEngine.ts:146`) → **the whole room pauses.**
- **Guest** → `setDetached(true)` (`PartySyncEngine.ts:156`) → **guest drops sync.**

One line: *a visibility pause is laundered into a user control.* The fix must stop that while
still letting **real** lock-screen intent through.

## 2. The fix

### 2a. Activate a background session from the party screen
When party playback is live (bound + playing), call the background-session start (the same
`BearoomPlayback` path solo uses) → flips `forceWindowVisible=true` on the party WebView + starts
the FGS + MediaSession. Forward the bridge's `tick` → `updateState(paused, currentTime, duration)`
so the notification shows progress/state. Call `stop()` on unmount / when the room ends / when
media clears. This is the piece that actually keeps the party WebView decoding in the background —
identical mechanism to solo, just triggered from `party.tsx`/`useParty`.
- Optional cleanup: rename `soloBackgroundBridge.ts` → `backgroundPlayback.ts` and drop the
  "solo" prefix from the exported fns (the native module is already generic). Cosmetic; the
  functions work as-is for party.

### 2b. Fold keep-alive + suppression + hooks INTO `BRIDGE_JS` (not a `SOLO_BG_JS` import)
Add to `HijackPlayer`'s `BRIDGE_JS`, in its own `{event}` shape:
- Track `wasPlaying` (intended play-state — see the ⚠ below).
- In the `pause` listener, **before posting**: `if (document.hidden && wasPlaying) { keepAlive(); return; }`
  — swallow a background pause instead of posting it. (Belt-and-suspenders: with
  `forceWindowVisible` on, `document.hidden` stays false so this rarely fires — but it's the
  safety net for the window before the session activates, or if the visibility hack ever fails.)
- Add a `visibilitychange` handler → `keepAlive()` with 50/250/1000 ms retries; run `keepAlive()`
  in the existing 1 s tick interval. `keepAlive()` = re-`play()` only if `document.hidden &&
  wasPlaying && video.paused`.
- Expose **`window.__soloKeepAlive`** (the native hub injects this name during background
  keep-alive — `BearoomPlaybackHub.kt:44`) so it isn't a no-op in party.

**⚠ CRITICAL — the subtle desync (do not skip): `wasPlaying` must track INTENDED play-state,
updated by the engine's programmatic drives too.** When the engine pauses the local video via
`__vlCmd` (`markApplying`, `HijackPlayer.tsx:151`), the `pause` listener returns early at line 129
and never clears `wasPlaying`. So if the **host pauses the room while a guest is backgrounded**,
the engine pauses the guest's video — but `keepAlive()` would see `wasPlaying===true &&
video.paused` and **re-play a video the room legitimately paused → that guest desyncs.** Fix:
`__vlCmd` `play`/`pause` must set `wasPlaying = true/false` (exactly as `__soloCmd` does,
`soloBackgroundBridge.ts:168,173`). Mental model: **every intent-setting path — user, web-control,
AND engine — updates `wasPlaying`; the only pause that doesn't reflect intent is the
background-suspend one, which is precisely the one `keepAlive()` corrects.**

### 2c. Route lock-screen buttons through the room authority (NOT `party.pause()`)
Add a **user-intent command** to the bridge (call it `__vlUserCmd`, or make the party bridge's
`__soloCmd` do this) that drives the `<video>` **without `markApplying`**. The resulting genuine
`play`/`pause`/`seeked` event then flows through the existing path → `handleUserControl` → **host
pauses the room / guest detaches** — identical to tapping the provider's own web controls. Wire it
like solo does (`player.tsx:98-106` subscribes to remote commands and injects the command), but
inject the **un-suppressed** party command.
- **Do NOT** route party lock-screen buttons through `useParty.play/pause` — `party.pause()` is a
  **server no-op for guests** (`useParty.ts:25,119`), so a guest's lock-screen pause would do
  nothing (and keep-alive might re-play it). The un-suppressed-event path gives the correct
  guest-detach semantics for free.
- **Invariant the whole design turns on:** *visibility pause = suppressed (incidental); button
  pause = un-suppressed (intent).*

### 2d. Re-anchor on foreground
On RN `AppState → 'active'`: a non-detached member snaps to live (add `engine.resync()` =
`applyAnchorNow()` when `!detached`) to clear any background drift; a detached guest stays detached
until they tap **Jump to Live** (current UX, `party.tsx:351-356`). The drift loop is the safety net
— this just makes the correction instant instead of audible.

## 3. Host lease — rely on the FGS for v1, VERIFY (don't pre-build handoff)
The host renews a ~6 s lease. If backgrounding throttles the host's JS timers, the lease lapses and
the **existing** lease-expiry handoff fires (a foregrounded guest becomes host) — not broken, but an
involuntary handoff right after pocketing the phone could surprise. The solo finding (`currentTime`
keeps advancing = timers alive under the FGS) suggests the lease likely survives. **v1: rely on the
FGS, verify on a real device, and treat the existing handoff as the fallback. Do NOT build
handoff-on-background** unless verification shows it's needed.

## 4. QA — 2 devices (this is the definition of done)
- Host plays → host backgrounds (**Home and lock**) → **guest keeps playing, the room does NOT
  pause.** ← the headline fix.
- Guest backgrounds → keeps playing, does **not** detach; host unaffected; guest foreground →
  snaps to live (no lasting drift).
- Guest lock-screen **pause** → room unaffected, guest detaches; guest lock-screen **play** → jumps
  to live. Host lock-screen **pause** → room pauses for everyone.
- **Regression (run after ANY bridge change):** normal foreground host play/pause/seek still mirrors
  to the guest. If it breaks, you broke the bridge — revert and ASK CLAUDE.
- Host backgrounded >6 s → observe: lease held (room continues under host) vs. handoff.
- Debug the party WebView with Chrome DevTools over adb (see `player-and-injection.md`); confirm
  `currentTime` keeps advancing while backgrounded/locked and that no stray `pause` reaches
  `handleUserControl` (watch for an unexpected guest detach on background — if it happens, widen the
  visibility guard window).

## 5. ASK CLAUDE gates
- Anything that changes `PlayerHandle` / `PlayerEvent` / `handleUserControl` **semantics** — this is
  the sync contract (`watch-party-sync.md`).
- The two places a subtle desync hides — **(2b) `wasPlaying` = intended-state** and **(2c)
  un-suppressed routing** — verify both with the 2-device matrix before calling it done.
- If the host-lease verification shows involuntary handoffs that feel wrong, ASK CLAUDE before
  building handoff-on-background.

## 6. Definition of done
- Party activates the shared background session; party WebView keeps audio playing backgrounded +
  locked, with the MediaSession notification.
- The desync is gone: backgrounding a party (host or guest) does **not** pause the room or detach
  the guest; lock-screen buttons route through the authority correctly.
- Foreground re-anchor works; regression (foreground sync) unbroken on 2 devices.
- `tsc` + `eslint` clean. Commit at each working checkpoint. **Do not push.**
