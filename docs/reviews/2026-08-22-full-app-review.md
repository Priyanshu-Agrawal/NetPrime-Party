# Full-app code review — 2026-08-22

Comprehensive review of Bearoom/NetPrime `feat/improvements` @ `a1d1d87`, run as five parallel subsystem passes (player+bridge · watch-party+sync · data/API/worker · navigation/flows · UI/perf/theme). Known/documented issues (iOS non-bind, reverted first-frame gate, CDP selector rot, banner auto-retire, mood-chip literal search, and the search-flow fixes already shipped) were excluded. **Line numbers are as reported by the review pass — verify before editing (the branch moves).**

Severity: **Critical** = remote abuse / data loss for all users · **High** = exploitable or breaks a primary flow · **Medium** = real bug in a common path · **Low** = edge case / polish.

## Fix status
- ✅ **Fixed (2026-08-22):** H5, M8, M9, M10, M12, all Low items (L1–L14).
- ✅ **Fixed (2026-08-25, client hardening pass):** H4 (autoplay-toggle remount → pref snapshotted in a ref),
  H6 (subscribe/destroy race → channel assigned up front + torn-down guard), M2 (error filter compares the
  live main-frame URL, redirects included), M3 (malformed provider rows dropped + `fill` guarded),
  M4 (subscribe handles CHANNEL_ERROR/TIMED_OUT/CLOSED + 15s timeout), M6 (room-code collision retry +
  CSPRNG codes), M11 ("Host your own room" relabeled to match its browse action). `tsc` clean.
- ⏳ **Deferred → backend task** ([../plans/backend-hardening.md](../plans/backend-hardening.md)):
  C1 (realtime authority), H1 + M1 (worker `/cache/purge` + `/report` auth), H2 (OTA bridge integrity),
  H3 (bridge message nonce — must ship with H2's OTA deploy), M5 (membership flap — needs server-side seq
  bump; client `>=` is load-bearing for heartbeat liveness), M7 (IP HMAC salt).
- ⏹️ **N/A:** M13 (rotation-reflow from frozen `Dimensions`) — moot; the app stays **portrait-locked**
  (the landscape-enable was reverted), so grids/skeletons never reflow. Revisit only if landscape is enabled.

---

## CRITICAL

### C1 — Watch-party realtime channels are public; peer broadcasts trusted as authority
`services/party/PartyClient.ts:278-280` (+ `applySnapshot:234`), `usePartyChat.ts:68-104`
Channels are created without `private:true` / channel-authorization, so anyone with the app's public anon key can `signInAnonymously()`, subscribe to `party:<CODE>`, and `send` a forged `snap`. `applySnapshot` applies by newest-`(epoch,seq)`-wins with **zero server verification** → an attacker sends `{playback:{epoch:1e9,seq:1e9,…}}` to mass-hijack playback (seek/pause everyone), or a snapshot omitting a victim from `members` with a newer seq to drive their `kickedCb` (remote kick). Chat is the same: sender sets its own `userId`/`name` → host/member impersonation. Room codes are short + `Math.random` (enumerable). The RLS-enforceable `postgres_changes` stream exists (tables are in `supabase_realtime`) but is unused in favor of client re-broadcast.
**Fix:** mark channels `private:true` + Realtime RLS on `realtime.messages`, or drive state from server-authored `postgres_changes`/an Edge broadcast — never apply peer-authored snapshots as truth; derive chat identity from the authed JWT.

---

## HIGH

### H1 — Worker `/cache/purge` is unauthenticated → global provider blackout
`worker/src/index.ts:220` (CORS wildcard at `app.use("*", cors())`)
No auth/secret. Loop purge+`/config`: each purge forces a live Supabase read; under sustained load `getProviders` can return `[]`, which is then cached 60s (`supabase.ts:176`) → the no-fallback app goes "dumb" for **every** user. A public write endpoint induces a global outage.
**Fix:** require a shared-secret header on `/cache/purge`; scope CORS to app origins.

### H2 — OTA bridge injected with no client-side integrity check → WebView RCE
`components/player/HijackPlayer.tsx:477`, `src/scripts/bridgeCache.ts`
`injectedJavaScriptBeforeContentLoaded={getCachedScript(providerId) ?? ""}` injects whatever `/scripts` returned (Supabase `bridge_script`, cached raw in MMKV), holding the `postMessage` bridge to RN. No hash pin/signature → a compromised worker/DB row (or a non-TLS `EXPO_PUBLIC_WORKER_URL`) = arbitrary code execution in the provider WebView.
**Fix:** the `version` tag is already a content hash — verify the fetched body against it before caching/injecting; hard-require https for the worker URL.

### H3 — WebView message bridge trusts any page script (spoofable player events)
`components/player/HijackPlayer.tsx:427-444`
`handleMessage` parses `nativeEvent.data` and acts on `e.event` with no namespace/secret. On ad-heavy embed pages any in-page script can `postMessage('{"event":"ready"}')` to force a premature bind (lifts the cover, mounts controls over a video the bridge never found), `{"event":"ended"}` to kill the bg session, or fake `currentTime` to corrupt stall detection + `success` telemetry.
**Fix:** stamp a per-session nonce/namespace on every bridge `post({...})`; drop messages lacking it in `handleMessage`.

### H4 — Autoplay-next toggle remounts the WebView → episode restarts at 0:00
`components/player/HijackPlayer.tsx:455,464` (+ `PlayerScreen.tsx:714`)
The WebView `key` includes `uri`, and `uri` depends on `getAutoplayNext()` (adds/removes `autoplayNextEpisode`). Flipping the toggle mid-episode changes `uri` → changes `key` → full remount → playback restarts at 0 (no resume-seek armed for a settings toggle), contradicting the setting's own "applies to next load" comment.
**Fix:** snapshot `autoplayNext` into a ref at mount, or exclude that param from the WebView `key`.

### H5 — Bear-avatar SVG rebuilt every render in the party chat hot path (over live video)
`src/screens/PartyScreen.tsx:1007,1085` · `components/avatar/BearAvatar.tsx`
Each `Bubble`/member calls `generateRandomBearConfig("neutral", userId)` inline → new object every render → `BearAvatar`'s `useMemo([config])` invalidates → full SVG string + base64 rebuild for every visible avatar on every PartyScreen re-render (each message, each sync event), while a video plays. `Bubble` isn't memoized; `renderItem` is an inline arrow.
**Fix:** cache config per `userId` (module `Map`/`useMemo([userId])`) and `React.memo` the `Bubble`.

### H6 — Channel/timer leak when `destroy()` races an in-flight `subscribe()`
`services/party/PartyClient.ts:152-165, 285-293`
`this.channel` is only assigned after SUBSCRIBED resolves. On fast unmount or the password-retry client rebuild, `destroy()` runs mid-await, sees `channel===null`, skips `removeChannel`; the promise later resolves, tracks presence, and creates `clockTimer`/`watchdog` after teardown → every wrong-password attempt / quick leave leaks a subscribed channel + phantom presence.
**Fix:** assign `this.channel` at creation; in `destroy()` remove whatever exists and guard `subscribe()` against `this.destroyed` after the await.

---

## MEDIUM

### M1 — `/report` telemetry unauthenticated/unvalidated → health-ordering poisoning
`worker/src/index.ts:285`, `schemas.ts:206`. `providerId`/`outcome` attacker-controlled, never checked against the real provider set; `REPORT_LIMITER` is best-effort (no-op if binding unset). Flooding `no_bind` for the live provider pushes `failure_rate ≥ 0.5` → demotes the only working source for all solo users. **Fix:** reject `providerId` not in current providers; fail-closed if the limiter binding is missing.

### M2 — Fatal-error filter uses exact `n.url === uri` → post-redirect main-frame failures swallowed
`components/player/HijackPlayer.tsx:486-493`. Providers whose embed redirects fail on the *redirected* URL (≠ original `uri`) → genuine 4xx/5xx/DNS death gets no overlay, no telemetry, no fallback. **Fix:** compare against the last committed main-frame URL (via `onNavigationStateChange`) or the main-frame flag.

### M3 — Malformed provider row crashes the whole player screen
`src/store/features/providers/mappers.ts:13` (+ `providerRegistry.ts:90-95`). A config row with null `url_movie` → `fill(undefined,…).replace` → TypeError takes down `PlayerScreen` (no error boundary). Empty `allowed_domain` → `isAllowedTopNav` blocks the initial load (blank player). **Fix:** drop rows lacking usable `url_movie`/`allowed_domain` in `remoteToProviders`; guard `fill`.

### M4 — Party `subscribe()` only handles "SUBSCRIBED"; error statuses hang forever
`services/party/PartyClient.ts:285-292`. `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` never resolve the promise, so `await subscribe()` in `start()` hangs → re-announce, `clockTimer`, `watchdog`, `reconcileRole` never run; a host stops renewing its lease. **Fix:** handle error statuses (reject/`setError` + start timeout); re-track presence + re-request snapshot on reconnect.

### M5 — Equal-`(epoch,seq)` peer snapshots accepted (`>=`) → membership flap
`services/party/PartyClient.ts:243`. Joins don't bump playback seq; two near-simultaneous joiners broadcast same-seq snapshots with divergent `members` → list flaps (avatars/count flicker, a guest transiently vanishes) until the host heartbeat re-anchors. **Fix:** apply peer snapshots only when strictly newer (`>`), or bump seq on membership change; treat host heartbeat as membership truth.

### M6 — Client-generated room code, no collision retry (+ predictable `Math.random`)
`utils/roomCode.ts` + `PartyClient.start()`. Server rejects a code collision (`'room in use'`) but `start()` doesn't regenerate → confusing failure. `Math.random` codes feed the C1 enumeration. **Fix:** generate the code server-side in `party_create` (retry-on-conflict), or client-retry on 'room in use'; use `crypto.getRandomValues`.

### M7 — Unsalted SHA-256 of IP is reversible → "anonymized" client id is PII
`worker/src/supabase.ts:300` (`hashIp`). The IPv4 space brute-forces against a bare digest in seconds; stored `client_hash` (+ country) ≈ raw IP, contradicting the "never store the raw IP" comment (store-review privacy risk). **Fix:** HMAC-SHA256 with a server-only rotating salt.

### M8 — string-vs-`Error` swallows the real error in Movie/TV Details
`src/screens/MovieDetailsScreen.tsx:66`, `TvDetailsScreen.tsx:66`. `((qErr as any)?.message ?? "Failed to load")` — `.message` on a string is `undefined`, so the real TMDB message is discarded (same class fixed in `useSearchData`, missed here). **Fix:** `typeof qErr === "string" ? qErr : qErr?.message ?? "Failed to load"`.

### M9 — Player deep-link crashes on missing params
`src/screens/PlayerScreen.tsx:74`, `linking.ts:23`. `bearoom://player` (no params) → `route.params` undefined → destructure TypeError → crash. Party is guarded (`?? {}`); Player is the only unguarded stack entry. **Fix:** `route.params ?? {}` + a "nothing to play" fallback (or drop `Player` from linking).

### M10 — Home has no error/retry state → infinite skeleton on failed cold start
`components/home/MediaRail.tsx:33`, `HeroCarousel.tsx:78`. Neither reads `isError`; on a failed fetch Home sits in skeletons forever, and the ScrollView has no `RefreshControl` (only auto `refetchOnReconnect`). **Fix:** surface an error/empty state with retry, or add pull-to-refresh.

### M11 — "Host your own room" button leads nowhere
`src/screens/JoinPartyScreen.tsx` (`host`). It `navigation.replace("MainTabs")` → dumps the user on Home with no hosting affordance (real hosting is only via a Details "Watch together"). **Fix:** point at the real host entry or relabel.

### M12 — Elevation/glow over the live video in landscape/party
`PartyScreen.tsx:1527` (`sendBtn` `glow.honey`), `BearAvatar.tsx:114` (`hostRing`/`showGlow`), `PlayerScreen.tsx:822` (`partyBtn` glow), `PartyScreen.tsx:905` (rotation mask `elevation:1000`). In landscape the chat drawer + header avatars overlay the playing video while carrying shadow/elevation — the exact case the no-elevation-on-video rule strips elsewhere (a comment claims it was removed; these slipped through). **Fix:** zero shadow/`elevation` (keep `zIndex`) and pass `showGlow={false}` for anything rendered over the player.

### M13 — Core layout frozen from `Dimensions.get("window")` at module load (no rotation reflow)
`theme/styles/layout.ts:4`, `theme/bearoom.ts:23`, `src/ui/DetailsSkeleton.tsx:17`. `SCREEN_W`/`RATIO`/`gridColumnWidth()` + skeleton dims compute once at import → poster grids, details hero, and `scale()` widths stay at launch-orientation values after rotation (now that landscape is enabled). **Fix:** derive reflow-critical widths from `useWindowDimensions()` in the components that must react.

---

## LOW

- **L1** `HijackPlayer.web.tsx:101-140` — web bridge: no `event.origin` check, posts commands with `"*"` (spoof vector on the degraded web path). Validate origin; target a specific origin.
- **L2** `providerRegistry.ts:145-151` — `data:`/`blob:`/`about:` **top-frame** navs unconditionally allowed → bridge-escape gap. Only allow when `isTopFrame===false`.
- **L3** `PlayerScreen.tsx:256-264` — background FGS/MediaSession not stopped on blur (navigating to party) → stale paused media notification lingers. Stop/pause the session in the `useFocusEffect` cleanup.
- **L4** `PlayerScreen.tsx:309` — telemetry reports `selected.scriptVersion` (from /config), not the version actually injected (`getCachedScript`) → mislabels failures if sync lagged. Report `getCachedVersion(providerId)`.
- **L5** `workerApi.ts:39` — `keepUnusedDataFor:18000` (5h) contradicts the "5 min" comment; no polling/`refetchOnMountOrArgChange` → registry/killswitch changes only picked up on cold launch/reconnect. Align value; add polling if a live killswitch is wanted.
- **L6** `utils/failureMemory.ts:53` — `storage.set` unguarded (can throw into the player failure path); cached scripts never pruned when a provider is removed (unbounded). Wrap in try/catch; prune against the live provider set.
- **L7** `PartyClient.ts:347-360` — kicked client keeps watchdog/clock timers and re-attempts `party_claim_host` until unmount. Stop timers / short-circuit on a `kicked` flag.
- **L8** `usePartyChat.ts:73-77` — messages appended by arrival not `ts` (mis-sequences on out-of-order delivery); ids `Date.now()-seq` collide across clients in the same ms → dedup drops a distinct message. Sort by `ts`; namespace id with `userId`/uuid.
- **L9** `JoinPartyScreen.tsx:45` — dead test stub: `code === "000000"` → always "Room not found"; every other code is accepted without existence check and `replace`s into Party. Remove the stub; keep the user on JoinParty until the room is confirmed.
- **L10** `SearchView.tsx:173` — browse fetch error replaces the whole FlashList (incl. BrowseHeader chips) with no retry. Add a Retry affordance or render the error inline above the header.
- **L11** `linking.ts:19` — `PersonDetails` absent from linking → no `person/:id` deep link though `openPerson` works in-app. Add `PersonDetails: "person/:id"`.
- **L12** `TvDetailsScreen.tsx:232` — `{d.number_of_seasons} Seasons · {d.number_of_episodes} Episodes` unguarded → prints literal `undefined` on partial data. Guard/hide.
- **L13** a11y — `IconButton`/`GlassButton`/`FloatingTabBar` icon-only buttons lack `accessibilityRole`/`accessibilityLabel`; `headerControl` (36) and several targets < 44pt. Add role+label to the primitives; bump min size/hitSlop.
- **L14** `src/ui/Box.tsx`, `Stack.tsx` — build a fresh style object every render; passed to memoized children in hot paths (rails/rows) they defeat memoization. Prefer StyleSheet / memoize.

---

## Came back clean
- **Rules of Hooks:** no violations; the prior `useProviders`-above-early-return bug is fixed everywhere (Movie/Tv/Person Details, PlayerScreen).
- **Secrets:** `SUPABASE_SERVICE_ROLE_KEY` stays server-only; TMDB/KLIPY keys are proxied/public-by-design — no client-bundle secret leakage found.
- **No-fallback killswitch:** honored end-to-end (empty `/config` → empty app).
- **No-live-blur rule:** `Frost` confined to non-video screens; player/party glass surfaces correctly pass `blur={false}`. (Only *elevation/shadow* slipped through in landscape — M12.)
- **DB/RPC authority:** party migrations 0001–0006 are well-hardened (auth-gated RPCs, membership/password/access checks, row-lock host elections). The gap is the client trusting peer *broadcasts* instead (C1).
- Param typing, effect cleanup, and `useSearchData` ref pagination all sound.

## Suggested order of attack
1. **C1** (realtime authority) — the one remote-abuse hole; everything else is smaller. Likely needs Realtime RLS / server-authored state (backend work).
2. **Worker auth** (H1, M1) + **H2/H3** bridge integrity & message nonce — the security cluster; several are one-liners on the client, H1/M1 need worker secrets.
3. **H4** autoplay remount + **H5** avatar rebuild — real UX/perf on the primary paths; pure client fixes.
4. Then the Medium correctness/flow items (M2, M3, M8–M13) and the Low list.
