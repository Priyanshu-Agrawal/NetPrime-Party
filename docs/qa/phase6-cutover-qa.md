# QA Handover — Phase 6 OTA-bridge cutover (+ full backend-era regression)

**For the execbro/MCP QA agent.** Drive a physical Android device. Work top to
bottom. Record failures inline (👉 what you saw + a screenshot). You are the
verification layer — the human does NOT re-check; be thorough and skeptical.

---

## 0. Context — what changed and why it's risky (read fully)

Over this session the app moved from a hardcoded, single-file player to a
**dynamic, server-driven** one. The commits since `313939c`:
- **Dynamic providers**: the provider list is fetched from a **Cloudflare worker**
  (`netprime-worker.spiderfan-no1.workers.dev/config`) backed by Supabase. There is
  **NO baked-in fallback** — empty config = no providers (a deliberate store-review
  killswitch). Playback URLs + WebView nav-security live server-side.
- **RTK Query** is the data layer (`workerApi`/`tmdbApi`/`klipyApi`).
- **Telemetry**: `POST /report` feeds provider health.
- **Phase 8 fallback**: hard-error / no-bind / stall detection → source picker.
- **⚠️ THE BIG ONE (this cutover): the WebView hijack script is now served
  over-the-air**, not bundled. On boot the app diffs each provider's `script_version`
  (from `/config`) against an MMKV cache and, if changed, fetches the body from
  `/scripts`, caches it, and `HijackPlayer` injects the **cached** script.

**Why the cutover is high-risk:** we replaced the *delivery* of the injection
script but kept the *code* identical (the proven `BRIDGE_JS`, moved verbatim to
`src/scripts/legacy-videasy.ts` and served as `videasy@<hash>`). If the served/
cached script is wrong, stale, or empty, the player silently loses one of **8
subsystems** — and none of these show up as a crash. **Suite A is the priority.**

---

## ⚠️ 1. Prerequisites — do these or the whole pass is invalid

1. **Re-upload the legacy bridge.** The live `/scripts` may still hold an older test
   script. Upload the current one:
   ```bash
   SUPABASE_SERVICE_ROLE_KEY=sb_secret_… npx tsx scripts/upload-bridge.ts videasy
   ```
   Then confirm the live server serves it:
   ```bash
   curl -s https://netprime-worker.spiderfan-no1.workers.dev/config \
     | python3 -c "import sys,json;print([p['script_version'] for p in json.load(sys.stdin)['providers'] if p['id']=='videasy'])"
   # expect a single videasy@<hash> (currently videasy@7ed78cf9, ~12565-byte body)
   curl -s https://netprime-worker.spiderfan-no1.workers.dev/scripts \
     | python3 -c "import sys,json;s=json.load(sys.stdin);print([(x['id'],x['version'],len(x['script'])) for x in s])"
   ```
2. **Rebuild with cleared cache** (env vars + native are build-time):
   `npx expo run:android --variant release` (release for the stutter/background checks)
   or `npx expo start --clear` for a dev pass.
3. Device connected (execbro `scan_metro`/`ensure_connection`).

**Two layers, two debuggers — use the right one:**

> **execbro : the React Native layer  ::  `chrome://inspect` (CDP) : the WebView layer.**
> The injected bridge, the provider's DOM, and the `<video>` all live INSIDE the WebView
> — execbro can't see them. To inspect what the served script is actually doing on the
> device, attach Chrome DevTools to the WebView (Suite A0-A).

**Available tooling (use whatever fits):**
- **execbro** — the physical Android device / RN layer: `get_network_requests`,
  `redux_get_state` (the `providers` slice), `get_logs`/`search_logs`, `tap`/`input_text`,
  `android_screenshot`.
- **Chrome DevTools remote (CDP over adb)** — the on-device **WebView** debugger. This is
  where you verify the served bridge globals, the bound `<video>`, and videasy's DOM *in
  the real runtime* (Suite A0-A). Note: on New-Arch (Bridgeless), RN `console.log` often
  does NOT reach `adb logcat` — rely on CDP for anything inside the WebView.
- **Playwright** — a real desktop browser, **no device needed**. Independent check of the
  served script against videasy's public DOM — catches selector rot early (Suite A0-B).
- **Supabase MCP** (`execute_sql`) — verify telemetry rows actually LAND in
  `provider_reports` / `provider_health` (not just that `/report` fired), and toggle
  `providers.enabled` for the dynamic + review tests. **Clean up any test rows you insert.**
- Anything else wired (context7, etc.) as needed.

**Driving tips:** `get_network_requests` (confirm `/config`, `/scripts`, `/report`,
TMDB proxy, `api.klipy.com` fire), `redux_get_state`, `get_logs`, screenshots per step.

---

## Suite A0 — Validate the served script (WebView DOM level)

Does the served script still match videasy's **current** DOM? Selector rot (videasy
renames a Radix tab, moves the `<video>`) is the #1 cat-and-mouse failure and is invisible
from the RN side until playback breaks. Do this at the WebView layer, two ways.

### A0-A. On-device WebView via Chrome DevTools (PRIMARY — real runtime)
Inspect the *actual served + cached script* running in the device WebView.
1. Play a videasy title so the WebView is live. Attach DevTools (dev build):
   ```bash
   PID=$(adb shell cat /proc/net/unix | grep -oE 'webview_devtools_remote_[0-9]+' | head -1)
   adb forward tcp:9222 localabstract:$PID
   # open chrome://inspect (or: curl localhost:9222/json/list) → Inspect the videasy WebView
   ```
2. In the WebView **console**, verify the served **legacy bridge** installed and works:
   - [ ] `window.__vlBridge === true`, and the globals exist:
         `typeof window.__vlCmd`, `__soloCmd`, `__vlSetGuest`, `__vlChromeOff` are all `"function"`.
   - [ ] a `<video>` is bound: `document.querySelector('video')` exists with a `currentSrc`.
   - [ ] videasy's Radix triggers exist: `document.querySelector('[id*="trigger-Quality"]')`
         and `[id*="trigger-Servers"]` are non-null → selectors still match.
   - [ ] `window.__vlCmd({action:"pause"})` pauses the video; `{action:"play"}` resumes.
   - [ ] `window.__vlCmd({action:"readAudio"})` → an `audio` message is posted to RN (watch
         `execbro get_network_requests`/logs, or the app's settings sheet populates the dubs).
   - [ ] `window.__vlSetGuest(true)` hides the provider's transport controls;
         `window.__vlChromeOff(true)` hides videasy chrome.

### A0-B. Public site via Playwright (SUPPLEMENTARY — no device, catches rot early)
1. Fetch the served body: `GET …/scripts` → the `videasy` entry's `script` (+ `version`).
2. `browser_navigate` to `https://player.videasy.to/movie/550`; dismiss ads / click the
   pre-play gate so a real `<video>` exists.
3. Stub the RN bridge to capture emits, then inject the served string (`browser_evaluate`):
   ```js
   window.__vlEvents = [];
   window.ReactNativeWebView = { postMessage: (m) => window.__vlEvents.push(JSON.parse(m)) };
   // …inject the fetched /scripts videasy `script` string here…
   ```
   Verify (poll a few seconds): `window.__vlBridge === true`; `__vlEvents` gets `{event:"ready"}`
   + `tick`s; `[id*="trigger-Quality"]`/`[id*="trigger-Servers"]` non-null; `__vlCmd({action:"pause"})`
   pauses; `__vlCmd({action:"readAudio"})` → `{event:"audio", audios:[…]}`.

**If a selector/trigger is missing in either lane → videasy changed their DOM.** That's
the cat-and-mouse loop firing: update `src/scripts/legacy-videasy.ts`, re-run the upload
CLI, and the fix ships OTA. Flag it as the top finding.

---

## Suite A — OTA bridge cutover (PRIORITY)

### A1. The script actually loads and binds
- [ ] Cold launch → `get_network_requests` shows **one `GET /scripts`** on boot (or
      none if the cache was already warm from a prior launch on this build).
- [ ] Open any title → **Play** (mounts NetPrime/videasy) → tap the provider's play →
      video plays and **native controls bind** (our overlay appears, scrubber moves).
      *If it never binds, the injected script is empty/wrong → STOP, check `/scripts`
      and the MMKV cache.*

### A2. The 8 preserved subsystems — verify NONE regressed (this is the whole point)
| # | Subsystem | How to verify | Pass = |
|---|---|---|---|
| 1 | **Watch-party echo-suppression** | Host a party (2 devices, or 1 device + observe). Host taps pause/play/seek. | Room does NOT bounce/echo — a host action doesn't re-fire as a "member paused" loop. Sync stays stable. |
| 2 | **Background audio (`keepAlive`)** | Start playback, press Home / lock the screen. | **Audio keeps playing** (Chromium hidden-pause is defeated). |
| 3 | **Lock-screen controls (`__soloCmd`)** | While backgrounded, use the notification/lock-screen media controls. | Play/pause/seek from the lock screen drive the video. |
| 4 | **Guest transport hiding (`__vlSetGuest`)** | Join a party as a **guest** (non-host). | Guest does NOT see the provider's own seek bar / ±10s / play — host owns the timeline. |
| 5 | **Native controls chrome (`__vlChromeOff`)** | Play solo; our overlay is up. | videasy's OWN chrome is hidden — you don't see double controls. |
| 6 | **Quality / dub switching** | Player → settings → change quality (e.g. 1080p→720p) and audio/dub (Hindi→English). | The list populates AND the change actually takes (resolution/dub switches). |
| 7 | **Fullscreen** | Enter/exit the provider's fullscreen. | State tracks correctly (no stuck/black state). |
| 8 | **videasy control-bar fix** | In the collapsed (non-fullscreen) player, use the bottom controls. | The center play/±10s buttons are tappable (not swallowed by the bottom bar). |

### A3. Cat-and-mouse (OTA update without a rebuild) — the payoff
- [ ] On the machine: make a trivial edit to `src/scripts/legacy-videasy.ts` (e.g. a
      comment), re-run `upload-bridge.ts videasy` → note the **new** `videasy@<hash>`.
- [ ] **Cold-launch the app again (NO rebuild).** `get_network_requests` shows a fresh
      `/scripts` fetch; playback still works. → OTA update path proven.

### A4. `scriptVersion` telemetry (verify it LANDS, not just that it fired)
- [ ] After playing >30s (or switching sources), the app POSTs to `/report`. Confirm the
      request body carries `scriptVersion: "videasy@<hash>"` (`get_network_requests` →
      the `/report` POST).
- [ ] **Supabase MCP** — confirm the row actually persisted (best-effort writes return
      202 even on failure, so the network log alone isn't proof):
      ```sql
      select provider_id, outcome, script_version, platform, country, created_at
      from public.provider_reports order by created_at desc limit 5;
      ```
      Expect a `videasy` row with the right `outcome` (`success`/`manual_switch`) and the
      matching `script_version`, and a server-derived `country`. Optionally check
      `select * from public.provider_health;`. **Delete the test rows when done:**
      `delete from public.provider_reports where provider_id = 'videasy';` (only if these
      are your test rows — the table is otherwise empty).

### A5. No-script degradation (accepted trade)
- [ ] (Optional) First-ever launch with airplane mode on: no cached script → provider
      page may load without the bridge (no control). This is **expected** (no bundled
      fallback). Just confirm it doesn't crash.

---

## Suite B — Dynamic providers & config

- [ ] `redux_get_state` → `providers.providers` has the enabled providers (NetPrime
      priority-1); `maintenanceMode` false.
- [ ] In-player **Sources** (server button) → ProviderSheet lists them; party (🐾)
      badge on the hijackable ones.
- [ ] **Live edit** (Supabase MCP `execute_sql`): `update public.providers set enabled=false
      where id='vidfast';` → `curl -X POST …/cache/purge` → relaunch → it's gone from the
      sheet. `…set enabled=true…` + purge → back.
- [ ] **Dumb-app (review) test:** `update public.providers set enabled=false;` → purge →
      relaunch → sheet empty, Play shows "No sources", **no crash**. Then
      `update public.providers set enabled=true;` + purge → restored. *(This proves the
      store-review killswitch — no baked-in fallback leaks the list.)*

## Suite C — Zero-wait Play & source switching

- [ ] Tap **Play** on a movie → NetPrime WebView mounts **instantly** (no scrape spinner).
- [ ] In-player Sources → switch provider → player reloads on it and rebinds.
- [ ] TV: Play → first episode plays; Episodes sheet → switch episode.

## Suite D — Silent memory (audio/quality prefs)

- [ ] Change dub to English in the player → close → open another title → after bind it
      **auto-applies English silently**. Same for a quality pick.
- [ ] No re-buffer when the pref already equals the provider default (Hindi on NetPrime).
- [ ] Data Saver ON caps quality where rungs exist; leaves Auto otherwise.

## Suite E — Phase 8 fallback (best-effort to trigger)

- [ ] **Hard error:** point a provider's row at a dead domain (Supabase) + purge + play
      it → the WebView main-frame errors → **ProviderSheet auto-opens** (and the failed
      provider is excluded from it). Restore the domain after.
- [ ] **No-bind banner:** on a provider that won't bind, after ~10s an actionable
      "Taking too long? Try another source" banner appears; it does NOT auto-pop if you
      never tapped play (idle).
- [ ] Telemetry: `/report` receives `http_error` / `no_bind` outcomes accordingly.

## Suite F — TMDB & KLIPY (RTK Query)

- [ ] Home: hero + rails load; return to Home from another tab → **no skeleton flash**.
- [ ] Movie/TV details load (cast, providers, seasons/episodes).
- [ ] Search: type → results; **rapid-type gibberish then a real query** → final list
      matches the LAST query (stale-guard).
- [ ] Party → GIF picker: trending + search + stickers; send; reopen → cached instantly.

## Suite G — Regression (must-not-break)

- [ ] **Playback smoothness (RELEASE build):** no stutter on the player.
- [ ] Watch party: host+join sync (play/pause/seek), GIF reactions, chat.
- [ ] Orientation: player/party rotate to immersive landscape; **Home stays portrait**.
- [ ] Watchlist add/remove; Continue Watching populates; onboarding/autoplay unaffected.

---

## Result log

| Suite | Pass? | Notes / failures (👉) |
|---|---|---|
| A0-A Served script in device WebView (CDP/chrome://inspect) | ☐ | |
| A0-B Served script vs public DOM (Playwright) | ☐ | |
| A OTA cutover (8 subsystems, OTA, telemetry) | ☐ | |
| B Dynamic providers | ☐ | |
| C Zero-wait Play | ☐ | |
| D Silent memory | ☐ | |
| E Phase 8 fallback | ☐ | |
| F TMDB/KLIPY | ☐ | |
| G Regression | ☐ | |

**Escalate immediately if any of Suite A #1–#5 fail** — those are the party/background/
guest subsystems the whole cutover was designed to preserve. A failure there means the
served script is not the full legacy bridge (check `/scripts` version+size vs the CLI's
`--dry-run` output, and the MMKV `bridge.scripts.v1` cache).
