# QA Handover — Player error-recovery + the "payoff & resilience" batch

**For the execbro/CDP QA agent.** Drive a physical Android device. Work top to
bottom. Record failures inline (👉 what you saw + a screenshot). You are the
verification layer — the human does NOT re-check; be thorough and skeptical.

Covers three uncommitted-then-committed changes from this session that are
**typecheck-clean + logic-reviewed but NOT device-validated**:

| Commit | What | Suite |
|---|---|---|
| `2699517` | **Error recovery** — branded error overlay + dependency-free auto-retry + recoverable exclusions | **A (priority)** |
| `ec99342` | **Payoff batch** — party-capability badge gate, health-aware ordering, per-title failure memory, autoplay-next | B–E |
| `8fbd13b` | Earlier player fixes (resume-seek, gesture-banner, fullscreen-back, sheet-race, gorhom rotation) | F (regression) |

---

## 0. Context — what changed and why it's risky (read fully)

**Error recovery (`2699517`) is the priority.** Before it, a fatal WebView
error (dead domain, HTTP 4xx/5xx, DNS failure, renderer crash) showed the raw
white `net::ERR_…` chrome page and stranded the user until they remounted the
player. Now [HijackPlayer.tsx](../../components/player/HijackPlayer.tsx) covers
that with a **branded overlay** (Retry / Try another source), **auto-retries**
with bounded backoff (5/10/15 s, capped at 3) + on app-foreground, and makes
exclusions **recoverable** (a successful reload un-excludes; the source sheet
shows recently-failed providers dimmed-but-pickable).

**Why it's high-risk:** it is a timing + state-machine feature. Two adversarial
review rounds found and fixed **10 correctness bugs** in it (Android fires
`onLoad` *after* `onHttpError`; a load→crash loop escaping the retry cap; a dead
renderer that `reload()` can't revive; a background retry un-excluding a
provider the user just left; etc.). All fixes are `tsc`-clean and
inspection-verified, but **the real device timing/renderer behaviors can only be
confirmed here.** Suite A is the whole point.

**Payoff batch (`ec99342`)** shipped alongside: the 🐾 Party badge now shows
**only where a bridge script is actually served** (videasy today), the worker
demotes chronically-failing providers in `/config` (live but currently a no-op —
no provider is failing enough), a per-title failure memory biases the default
source cross-session, and autoplay-next is wired to a stored pref.

---

## ⚠️ 1. Prerequisites & tooling

1. **Build & run.** `npx expo run:android` (release for the stutter check;
   `npx expo start --clear` for a dev pass). The worker is already deployed at
   `netprime-worker.spiderfan-no1.workers.dev` (health-ordering is live).
2. **Device connected** (execbro `scan_metro` / `ensure_connection`).
   > ⚠️ The device connection was **unstable** during development — expect Metro
   > reconnect friction; re-`scan_metro` / relaunch via the `bearoom://` deep
   > link as needed.
3. **Two layers, two debuggers:**
   > **execbro : the React Native layer  ::  `chrome://inspect` (CDP) : the WebView.**
   > The error overlay, buttons, and the "dimmed source" rows are RN (execbro can
   > tap/screenshot them). The WebView's load/error events, the `<video>`, and the
   > provider DOM are inside the WebView — attach Chrome DevTools to watch the
   > actual reloads/errors. Bridgeless swallows in-WebView `console.log`, so CDP is
   > the only truthful WebView view.
   > CDP attach: `PID=$(adb shell cat /proc/net/unix | grep -oE 'webview_devtools_remote_[0-9]+' | head -1); adb forward tcp:9222 localabstract:$PID` → `chrome://inspect`.
4. **Tooling available:** execbro (RN taps/screenshots/`get_network_requests`/
   `redux_get_state`/`get_logs`), CDP (WebView), Playwright (public DOM),
   Supabase MCP (`execute_sql` — for the DB-edit triggers; needs auth via `/mcp`).
5. **Triggering a fatal error (Suite A) — three ways:**
   - **Airplane mode ON** just before/at Play → a network `net::ERR` main-frame
     error (the cleanest trigger; also lets you test reconnect/foreground-retry).
   - **Dead-domain provider** (needs `SUPABASE_SERVICE_ROLE_KEY` + a purge):
     `update public.providers set url_movie = 'https://dead.invalid/${id}', url_tv = 'https://dead.invalid/${id}' where id = '<some id>';` then
     `curl -X POST …/cache/purge` and relaunch. **Restore it after.**
   - **A provider whose embed currently 404/500s** (an HTTP-status error — this is
     the exact case the Android `onLoad`-after-`onHttpError` fix guards).

---

## Suite A — Error recovery (PRIORITY)

Trigger a fatal error (§1.5), then:

- [ ] **A1 · Branded overlay, not the raw page.** The player shows a branded
      "Couldn't load {provider}" card with **Retry** + **Try another source**
      buttons — NOT the white `net::ERR_…` / "Error loading page" chrome. No blur,
      no elevation (it's a video screen).
- [ ] **A2 · Retry.** Tap **Retry** → the WebView reloads (CDP shows a fresh
      load). With connectivity restored, it recovers and the overlay clears.
- [ ] **A3 · Bounded auto-retry.** Leave the error standing (airplane still on).
      Watch (execbro `get_network_requests` / CDP) — reloads auto-fire at **~5 s,
      10 s, 15 s and then STOP** (cap of 3). It must **not** loop forever.
- [ ] **A4 · Foreground retry.** Background the app, restore Wi-Fi, foreground it
      → it auto-retries and recovers.
- [ ] **A5 · Renderer crash (best-effort).** If you can kill the renderer (heavy
      page / `chrome://inspect` → crash, or OOM), Retry must **actually recover**
      (the WebView remounts) — not sit on a dead, unresponsive Retry. *This is the
      remount-nonce fix; a plain `reload()` would be a no-op on a dead renderer.*
- [ ] **A6 · "Try another source" doesn't retry behind the picker.** Tap **Try
      another source** → the ProviderSheet opens and the failed provider is
      excluded. **CRITICAL:** while the sheet is open, the abandoned provider must
      **not** reload behind it (no audio suddenly starting), and must **not** get
      silently un-excluded by a background retry.
- [ ] **A7 · Recovery un-excludes.** After an error, if the same provider later
      loads OK (reconnect / Retry), it returns to a normal (un-excluded) state.
- [ ] **A8 · Dimmed-but-pickable.** In the sheet, a recently-failed provider is
      **dimmed at the bottom** with "Recently failed · tap to retry" (not hidden).
      Tapping it reloads that provider.
- [ ] **A9 · Same-provider re-pick reloads.** Re-pick the **same** failed provider
      from the sheet → it actually reloads (not a silent no-op that leaves the
      stale overlay up).
- [ ] **A10 · Episode switch clears the overlay.** (TV) Error on S1E1, then pick
      S1E2 from the Episodes sheet → the stale overlay is gone and E2 loads fresh.
- [ ] **A11 · "Still syncing" banner re-arms on retry.** If a retry loads a page
      that never binds a `<video>` within 30 s, the "Still syncing {provider}… try
      another server" banner still appears (it was previously armed only on the
      first load).
- [ ] **A12 · Telemetry.** The fatal error POSTs `/report` with `http_error` /
      `render_crash` (execbro `get_network_requests`).

## Suite B — Party-capability badge gate (`ec99342`)

- [ ] **B1** In the ProviderSheet, the 🐾 **Party** badge shows **only on
      NetPrime** (videasy). The other 8 hijackable providers (VidFast, VixSrc,
      VidLink, VidCore, 111Movies, VidNest, VidPhantom, MyCineBy) show **no** badge.
- [ ] **B2** On a **non-videasy** provider in the player, the **Watch Party**
      button is disabled and the hint reads "Watch Party isn't supported on
      {provider}… pick the server marked with a 'Party' badge."
- [ ] **B3** The sheet's **Watch Party** filter chip lists **only** videasy.

## Suite C — Health-aware ordering (worker, live but dormant)

- [ ] **C1** `curl …/config` → providers come back with **videasy first**; note
      the order. The health demotion is a **no-op today** (no provider is failing
      above threshold) — this just confirms the reorder path didn't break `/config`.
- [ ] **C2** *(optional, needs service key)* Point a provider at a dead domain,
      generate several `http_error` reports from distinct clients, wait out the 60 s
      cache; confirm it sinks below healthy providers in `/config`. *Demotion needs
      sustained telemetry — likely not fully exercisable in one session; note it.*

## Suite D — Per-title failure memory (`ec99342`)

- [ ] **D1** Play a title; force the default provider to fail (airplane / dead
      domain) so it excludes. Close the player, reopen the **same title** → it
      should default to a **different** provider (biased away from the failed one).
      Restart the app and repeat — the bias **persists** (MMKV, 4 h TTL).
- [ ] **D2** After a provider plays a title successfully (>30 s), its failure
      memory clears — reopen the title and it defaults back to that provider.

## Suite E — Autoplay-next (`ec99342`)

- [ ] **E1** (TV) With autoplay-next **on** (default), videasy auto-advances to the
      next episode at the end. 👉 *Find the toggle* — the pref is
      `getAutoplayNext()`/`setAutoplayNext()` in `utils/prefs.ts`; if there's no UI
      yet, set it via execbro (`redux`/MMKV) or note "no UI toggle".
- [ ] **E2** Toggle autoplay-next **off** → videasy does **not** auto-advance
      (the `nextEpisode`/`autoplayNextEpisode` URL params are dropped).

## Suite F — Regression (earlier fixes must still hold)

- [ ] **F1** Resume-seek: switch dub/quality mid-playback → resumes near the prior
      position, not 0:00.
- [ ] **F2** Gesture-gated banner: idle at the pre-play gate → **no** "Taking too
      long?" banner (only the WebView's own "Still syncing" hint).
- [ ] **F3** Hardware back in fullscreen → exits fullscreen first (not straight to
      "Stop watching?").
- [ ] **F4** Rotate the device with a bottom sheet (ProviderSheet/settings) open →
      **no redbox** ("Property 'window' doesn't exist" — the gorhom patch).
- [ ] **F5** Playback smoothness on a **release** build: no stutter.

---

## Result log

| Suite | Pass? | Notes / failures (👉) |
|---|---|---|
| A — Error recovery | ⚠️ **BUG** | Overlay displays perfectly + A3 auto-retry cadence is exact (5/10/15, cap 3). **BUT the overlay buttons (Retry / Try another source) are UNREACHABLE whenever `playerBound===true` at error time** — a still-mounted `<PlayerControls>` covers them and eats the taps (see A-BUG). Works only on a never-bound first-load error. Escape = the bottom provider chip. |
| B — Party badge gate | ✅ (B2 code) | B1 ✅ badge only on NetPrime. B3 ✅ Watch-Party filter → "Select Server (1)". B2 code-verified (`canParty`/HijackHint both gate on `isPartyCapable`); on-device select blocked by slow-net + sheet snap-gesture friction. |
| C — Health ordering | ✅ (C1) | C1 ✅ `/config` returns videasy priority-1, 14 providers, order intact, reorder path unbroken. C2 blocked (needs service key + sustained multi-client telemetry). |
| D — Failure memory | ⚠️ design gap | Recording path traced: `recordProviderFailure` is called **only** inside `triggerFallback` (line 323). `onFatalError` does NOT record. So a hard fatal error records NO failure unless the user taps "Try another source" (blocked post-bind, see A-BUG) or the 25 s no-bind auto-fallback fires. `pickInitialProvider`/4 h TTL logic is correct. Not device-exercised (slow net). |
| E — Autoplay-next | ⚠️ (E1 ✅, E2 no UI) | E1 ✅ live TV URL carries `nextEpisode=true&autoplayNextEpisode=true` (`buildEmbedUrl:112`, default ON). E2: **no user-facing toggle exists** (only `getAutoplayNext()` MMKV pref) — a real user can't turn it off; code drops the params when false, unverified on device. |
| F — Regression | ◑ partial | F4 gorhom patch present in `patches/`, no redbox seen — but player/sheet is portrait-locked so the exact rotate-with-sheet repro couldn't be forced. F2 consistent (only the WebView "Still syncing" hint seen, no RN "Taking too long?" at gate). F1/F3 not re-tested this session (see phase6 QA). F5 blocked (debug build, not release). |

**Escalate immediately if any of A1 / A3 / A6 fail** — A1 is the whole feature,
A3 is the infinite-loop guard, A6 is the "don't reload/un-exclude a provider the
user abandoned" guarantee.

---

## Findings — 2026-08-21 pass (Claude; adb + CDP + Metro Hermes inspector; debug build @ HEAD 38d4a74, execbro MCP was OFFLINE this session)

### 🔴 A-BUG (CRITICAL, fails A1/A2/A6 in the common case) — error-overlay buttons unreachable once the player has bound
**Symptom:** After a provider has bound (`playerBound===true`), a subsequent fatal
error shows the branded overlay correctly, but tapping **Retry** or **Try another
source** does nothing — the tap instead toggles the video controls. Reproduced
repeatedly: from a verified-clean overlay, a tap in the button row makes the
`0:00`/title controls chrome appear (not the button action); "Try another source"
never opens the sheet and never excludes the provider (checked via the
persistent-state exclusion discriminator — NetPrime stayed un-dimmed at the top of
the sheet every time).

**Root cause (code-confirmed):** In [PlayerScreen.tsx](../../src/screens/PlayerScreen.tsx)
`<PlayerControls>` is rendered *after* `<HijackPlayer>` (so above it in z-order) and
mounts whenever `playerBound` is true (line 561). The branded error overlay lives
*inside* HijackPlayer (beneath). `onFatalError` (line 332) does **not** reset
`playerBound`, and the only reset (line 164) has deps `[selected?.id, season, ep]` —
so a same-provider error / a `Retry` / a same-provider re-pick never clears it.
`<PlayerControls>` therefore stays mounted on top of the overlay and its full-area
tap-to-toggle gesture swallows the button taps.

**Why A3 still passed:** on a *never-bound* first-load error `playerBound` is false,
PlayerControls isn't mounted, and the buttons work — that's how the 5/10/15s cap-3
cadence was measured cleanly. The bug is specific to the **post-bind** case, which is
the more common real-world fatal error (a stream that played, then died / crashed).

**User impact:** the entire error-recovery CTA is dead exactly when a working stream
fails mid-session. **Workaround that still functions:** the bottom provider chip →
Sources sheet → pick a provider (a *different* id resets `playerBound`; re-picking the
*same* id calls `playerRef.reload()`), which recovers. Suggested fix direction
(NOT applied — QA only): have `onFatalError` also `setPlayerBound(false)`, or gate
`{playerBound && !fatalError ? <PlayerControls/> : null}`, or lift the error overlay
above PlayerControls.

**Knock-on:** because `triggerFallback` is the *only* writer of both `excludedIds`
(A7/A8 recoverable-exclusion UI) and per-title failure memory (Suite D), and its main
user entry point (the TAS button) is blocked post-bind, the dimmed "Recently failed ·
tap to retry" row (A8) and the cross-session failure bias (D1) are effectively
unreachable in the post-bind path too. They remain reachable via the 25 s no-bind
auto-fallback (line 216) and on never-bound first-load errors.

### ✅ Confirmed working
- **A3 bounded auto-retry** — measured via WebView `timeOrigin`: remount at tap, then
  reloads at **+5.6s / +15.5s / +30.9s** (deltas 5.1/10.2/15.1s) then **STOP** — exactly
  3 auto-retries, no infinite loop. Textbook.
- **A1 overlay visuals** — branded "Couldn't load NetPrime" card, cloud-offline glyph,
  Retry + Try another source, dark, no blur/elevation. Correct — it's the *touch* that
  fails post-bind, not the render.
- **A2/A7 recovery (never-bound case)** — Retry with network restored cleared the overlay
  and returned to the videasy gate (bridge re-installed); recovery un-excludes.
- **A9 same-provider re-pick reloads** — via the chip/sheet, recovers.
- **B1 / B3** — Party badge only on NetPrime; Watch-Party filter shows only videasy.
- **C1** — `/config` intact, videasy priority-1.
- **E1** — autoplay params present in the live TV URL by default.

### Blocked / not exercised this session
execbro MCP offline (drove via raw adb) · **no `SUPABASE_SERVICE_ROLE_KEY`** (dead-domain
trigger for A/C2/D, DB telemetry verification) · **debug build** (A/F5 release stutter) ·
**single device** · **battery 20% + ~0.4 KB/s network** (provider-switch/load tests
impractical) · **A5 render_crash** not triggered (hardest; but note it lands in the
exact `playerBound===true` state, so it would hit A-BUG) · **A12** http_error telemetry:
RTK's `fetch` is captured at module-load so a late JS spy can't see `/report`, and the
airplane trigger means the POST can't leave the device anyway (prior phase-6 pass proved
`/report` posts `success`+scriptVersion). **A4** foreground-retry, **A10** episode-switch-
clears-overlay, **A11** banner-re-arm: not cleanly isolated. **F4** exact rotate-with-sheet
repro blocked by portrait lock (patch present, no redbox seen).

---

## Notes for the QA agent

- **Connection was unstable** this session — budget time for Metro/device
  reconnects; prefer the `bearoom://expo-development-client/?url=http://localhost:8081`
  deep link (with `adb reverse tcp:8081 tcp:8081`) to relaunch.
- Error recovery was **hardened through two adversarial review rounds (10 bugs
  fixed)** — the code is logic-sound; this suite validates the on-device timing
  (backoff cadence, Android load/error event order, renderer-crash remount) that
  static review can't.
- **Blocked without `SUPABASE_SERVICE_ROLE_KEY` / Supabase-MCP auth:** the
  dead-domain trigger (A, D) and the health-demotion test (C2). Airplane mode is
  the dependency-free trigger for A/D.
- **render_crash (A5)** is the hardest to trigger deliberately; a best-effort
  check is fine — flag it if you can't reproduce.

---

## Resolution — fixes applied 2026-08-21 (post-QA, pending a re-QA)

- **🔴 A-BUG (CRITICAL) — FIXED.** `onFatalError` now calls `setPlayerBound(false)`
  ([PlayerScreen.tsx](../../src/screens/PlayerScreen.tsx)), so `<PlayerControls>`
  unmounts and HijackPlayer's error-overlay buttons (Retry / Try another source)
  become the topmost tap target. PlayerControls remounts when the provider re-binds
  after a recovery. This also un-blocks the "Try another source" path, so the
  **A8** dimmed-exclusion rows and the **D** failure-memory writes are reachable in
  the post-bind case again. Side effect handled: the no-bind soft banner is now also
  gated on `!anyPlaybackRef` so it doesn't double up with the overlay after a
  played-then-died error.
- **D (failure not recorded on fatal error) — FIXED.** `onFatalError` now also
  `recordProviderFailure(mediaKey(media), selected.id)`, so a hard fatal error feeds
  the per-title failure bias (a >30s success still clears it; 4h TTL).
- **E2 (autoplay-next had no UI) — FIXED.** Added an "Autoplay next episode · On/Off"
  toggle to the player settings sheet ([PlayerSettingsSheet.tsx](../../components/player/PlayerSettingsSheet.tsx)),
  shown for TV. Persists the `getAutoplayNext()`/`setAutoplayNext()` pref; applies on
  the **next** stream load (it's a URL param baked at mount, so toggling mid-episode
  doesn't retroactively change the current one). *(Note: `DataSaver` still has no UI
  toggle either — separate follow-up.)*
- **Still open (not code bugs):** C2 health-demotion + the dead-domain triggers need
  `SUPABASE_SERVICE_ROLE_KEY`; F5 release-stutter needs a release build; A5
  render_crash + true 2-device checks remain.

### Re-QA — post-bind path VERIFIED on-device (2026-08-21, execbro + adb, Metro @ 8082, new bundle)
Reproduced the exact A-BUG scenario against the fixed build: played **The Odyssey** on
NetPrime → **bound** (our PlayerControls overlay up: title/scrubber/gear/fullscreen) →
airplane ON → re-picked NetPrime (forces a main-frame reload that fails while
`playerBound===true`). Result:
- ✅ **A-BUG fixed** — the branded "Couldn't load NetPrime · we'll keep retrying" overlay
  rendered with **PlayerControls GONE** (`setPlayerBound(false)` unmounted them), so the
  buttons are the top tap target.
- ✅ **A6 / TAS reachable** — tapping **Try another source** **opened the Select-Server
  sheet** (was a dead no-op before) and **excluded NetPrime** (it left the top of the list).
- ✅ **A8 dimmed-but-pickable** — NetPrime now sits at the **bottom, dimmed**, labelled
  **"Recently failed · tap to retry"** (previously unreachable). Un-blocks D's failure-memory
  write too (`onFatalError` now records the failure). *(Retry lives on the same overlay layer,
  so it's reachable by the same fix; not separately re-tapped. render_crash lands in this same
  `playerBound===true` state — now handled.)*
- Device restored (airplane off).
