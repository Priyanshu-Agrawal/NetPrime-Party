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
| A — Error recovery | ⬜ | |
| B — Party badge gate | ⬜ | |
| C — Health ordering | ⬜ | |
| D — Failure memory | ⬜ | |
| E — Autoplay-next | ⬜ | |
| F — Regression | ⬜ | |

**Escalate immediately if any of A1 / A3 / A6 fail** — A1 is the whole feature,
A3 is the infinite-loop guard, A6 is the "don't reload/un-exclude a provider the
user abandoned" guarantee.

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
