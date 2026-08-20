# Milestone QA — dynamic providers + RTK Query + zero-wait Play + silent memory

Covers everything built this session (commits `313939c → 3d46b53`). None of it has
run on a device yet. Work top-to-bottom; check boxes as you go. Record failures
inline (👉 what you saw).

---

## ⚠️ 0. Setup — READ FIRST (or everything looks broken)

`EXPO_PUBLIC_WORKER_URL` is **inlined at bundle time** by Expo. It was just added,
so a normal hot reload will NOT pick it up — you'll get an empty provider list,
and because we removed the fallback **on purpose**, the app will show *no
providers*. That's the env var not being inlined, not a bug.

- [ ] **Rebuild with cleared cache.** Dev: `npx expo start --clear`. Release (for
      stutter/perf checks): `npx expo run:android --variant release`.
- [ ] Confirm env is live: `grep EXPO_PUBLIC_WORKER_URL .env.local` →
      `https://netprime-worker.spiderfan-no1.workers.dev`
- [ ] Confirm worker is up: `curl -s .../config | python3 -c "import sys,json;print(len(json.load(sys.stdin)['providers']))"` → **14**
- [ ] Device connected (execbro `scan_metro` / `connect_metro` / `ensure_connection`).

**Driving tips (execbro):** `android_screenshot` after each nav; `get_network_requests`
to confirm `/config`, TMDB proxy, and `api.klipy.com` calls actually fire;
`get_logs`/`search_logs` for redbox/errors; `tap`/`input_text` to navigate.

---

## 1. Config & dynamic providers (the new backbone)

- [ ] Cold launch → app reaches Home without redbox.
- [ ] `get_network_requests` shows a request to `netprime-worker.../config` on launch.
- [ ] Open any title → Play → tap the in-player **server button** (bottom bar) →
      `ProviderSheet` lists **14** providers, **NetPrime first** (priority order).
- [ ] The **9 hijackable** providers show the party (🐾) badge; the 5 non-hijackable
      don't. (Hijackable: NetPrime, VidFast, VixSrc, VidLink, VidCore, 111Movies,
      VidNest, VidPhantom, MyCineBy.)
- [ ] **Live edit test:** in Supabase set one provider `enabled=false` →
      `curl -X POST .../cache/purge` → relaunch app → it's **gone** from the sheet.
      Re-enable + purge → it's **back**.
- [ ] **Dumb-app test (the review scenario):** disable ALL providers → purge →
      relaunch → sheet is **empty**, Play shows **"No sources"**, **no crash**.
      Then re-enable all + purge → restored. *(SQL: `update public.providers set
      enabled=false;` … `=true;`)*

## 2. TMDB via RTK Query

- [ ] Home hero carousel loads (rotating backdrops); rails load: Now Playing,
      Popular Movies, Popular/Trending Series.
- [ ] Switch tabs and return to Home → rails appear **instantly** (no skeleton
      flash — RTK Query cache warm).
- [ ] Movie details: cast, "where to watch" providers, trailer, facts all render.
- [ ] TV details: seasons list; switch season → episodes reload.
- [ ] Search: type → debounced results; **rapid-type gibberish then a real query**
      → final results match the LAST query (no stale overwrite — this is the
      AbortController→callId change, worth a hard look).
- [ ] Search: clear box → browse/trending; tap a provider chip (Netflix/Prime) →
      discover results; scroll to bottom → next page loads.
- [ ] Library → Trending Shows "See all" → scroll paginates.
- [ ] Player → Episodes sheet (TV) → seasons/episodes load.

## 3. KLIPY via RTK Query

- [ ] Party → GIF picker opens; reaction GIFs load; search (debounced) works;
      Stickers tab loads.
- [ ] Tap a GIF → sends to chat. Long-press → report dialog.
- [ ] Close and reopen the picker → previous results appear **instantly** (cached).

## 4. Zero-wait Play + provider switching

- [ ] Tap **Play** on a movie → PlayerScreen mounts the **NetPrime** WebView
      **immediately** — no spinner, no scrape wait. Video plays after the provider's
      tap-to-play.
- [ ] In-player **Sources** → pick a different provider → player reloads on it.
- [ ] TV: Play → first episode of the first real season plays; Episodes sheet →
      switch episode → reloads correctly.

## 5. Silent memory (Phase 5.5)

- [ ] In player → settings → change **audio/dub** (e.g. NetPrime Hindi → English).
      Close player. Open **another** title → after it binds, the dub auto-switches
      to English **silently** (confirm via settings showing English active).
- [ ] Change **quality** (e.g. 1080p → 480p) → next playback auto-applies it where
      the provider has that rung.
- [ ] **No re-buffer on default:** with pref = Hindi (NetPrime's default), starting
      NetPrime should NOT visibly re-buffer (the `active`-guard).
- [ ] **Data saver:** toggle Data Saver ON (Playback settings) → playback caps to
      ≤480p where rungs exist; leaves **Auto** where the provider only has high rungs.
- [ ] **Cross-provider no-op:** set a dub pref on NetPrime, switch to a provider
      lacking it → **no crash**, pref silently ignored.

## 6. Regression (must-not-break)

- [ ] **Playback smoothness (RELEASE build):** no stutter on the player. (The
      blur/elevation rule — nothing blurred/elevated over the video.)
- [ ] Watch Party: host + join on two devices → play/pause/seek sync; GIF reactions;
      chat.
- [ ] Orientation: player/party rotate to immersive landscape; **Home stays portrait**
      when the device is rotated.
- [ ] Watchlist (My List) add/remove; Continue Watching / history still populate.
- [ ] Onboarding flag, autoplay-next still behave.

---

## Result log

| Suite | Pass? | Notes / failures |
|---|---|---|
| 0 Setup | ☐ | |
| 1 Providers | ☐ | |
| 2 TMDB | ☐ | |
| 3 KLIPY | ☐ | |
| 4 Zero-wait Play | ☐ | |
| 5 Silent memory | ☐ | |
| 6 Regression | ☐ | |

**Known caveats flagged during the build (eyeball these first):**
- Search rapid-typing stale-guard (Suite 2) — replaced the AbortController.
- Solo-player header position vs the detail-screen header (older open item).
- Silent-memory auto-apply depends on the auto-read-on-bind firing ~1–1.6s after
  bind; if a provider is slow to expose its Servers/Quality tabs, the pref may
  apply a beat late (acceptable) or not at all (note it).

Once this is green, the next build item is the **hard-error fallback** (WebView
`onError`/`onHttpError` → auto-present Sources) + the **actionable "Try another
source" banner** on the no-bind timeout.
