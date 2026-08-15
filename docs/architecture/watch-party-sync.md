# Watch-Party Authority & Playback Sync

> How Bearoom keeps everyone in a room watching the **same frame at the same time**,
> who is allowed to drive, and how control hands off when the host drops. This is the
> most intricate subsystem — read it with
> [player-and-injection.md](./player-and-injection.md) (the player it drives) and
> [chat-and-reactions.md](./chat-and-reactions.md) (the social layer beside it).
> **Verified against current code + migrations `0001`–`0006`.**

## One-paragraph model
**Postgres is the single writer.** Every playback/admin action is a `SECURITY DEFINER`
RPC that locks the room row (`SELECT … FOR UPDATE`), mutates it, and returns a fresh
**snapshot**. Playback state is not a position that ticks — it's a **timeline anchor**
(`status/positionMs/rate/anchorServerTimeMs`) plus `epoch`/`seq`; every client computes
the live position from that anchor against the **server clock**. Supabase **Realtime
broadcast** is only a fan-out hint (`"snap"` events); the RPC return is the truth.
`PartySyncEngine` drives the local player toward the anchor (rate-nudge + hard-seek
drift correction) and routes genuine user actions back to the authority. The **host is
a 6-second lease**; if it lapses, guests hold an election and one claims it — bumping
`epoch` so nobody acts on stale leadership.

> ### ⚠ TWO authority models live in `services/party/` — only one ships
> `protocol.ts`'s header + its `ClientIntent`/`ServerEvent`/`SessionInfo`/`connectionId`
> types describe an **older Cloudflare Durable-Object + WebSocket** design. **That model
> is VESTIGIAL.** The shipped implementation (`PartyClient.ts` + `supabase/migrations/*`)
> is **Supabase-only**. From `protocol.ts`, only the shared value types (`Role`,
> `Permissions`, `Member`, `RoomConfig`, `PlaybackAnchor`, `HostLease`, `PartyMedia`,
> `PlaybackStatus`), `effectivePositionMs()`, and `LEASE_RENEW_INTERVAL_MS` are live.
> `ClientIntent`, `ServerEvent`, `ChatMessage`, `QueueItem`, `Poll`, `DEFAULT_ROOM_CONFIG`,
> `DEFAULT_GUEST_PERMISSIONS`, `LEASE_DURATION_MS` are declared but **unused** by the sync
> path. Don't wire against them.

## Files
| File | Role |
|---|---|
| `services/party/protocol.ts` | Shared types + `effectivePositionMs` (+ vestigial DO protocol — see box) |
| `services/party/PartyClient.ts` | Transport: RPC calls, Realtime channel, clock offset, election, lease renew |
| `services/party/PartySyncEngine.ts` | Drives the local player toward the anchor; routes user controls to authority |
| `services/party/useParty.ts` | React glue — builds the `PlayerControl` adapter, feeds `PlayerEvent`s to the engine |
| `services/party/identity.ts` | `installationId` + `displayName` in MMKV |
| `services/supabase.ts` | The client + `ensurePartyAuth()` (anon `userId`) |
| `supabase/migrations/0001…0006*.sql` | Tables, RLS, and the whole RPC surface |

## The timeline anchor (the core idea)
Playback is stored **once** as an anchor and extrapolated locally — never streamed
tick-by-tick.
```ts
interface PlaybackAnchor {
  status: "playing" | "paused";
  positionMs: number;
  rate: number;
  anchorServerTimeMs: number;   // server clock when this anchor was stamped
  epoch: number;                // leadership generation
  seq: number;                  // command order within a generation
}
// The single source of truth for "where are we now":
function effectivePositionMs(a, serverNowMs) {
  if (a.status === "paused") return a.positionMs;
  return Math.max(0, a.positionMs + (serverNowMs - a.anchorServerTimeMs) * a.rate);
}
```
- Paused → frozen. Playing → position grows with server time × rate, floored at 0
  (⚠ **no upper clamp** — can exceed media duration near the end; harmless).
- The server mirrors this exactly in SQL as `party_effpos(room)` (→ `bigint`).
- **Clock:** the server's `now()` is the shared reference. Clients estimate an offset
  (below) so "server now" is computable locally between snapshots.

### `epoch` vs `seq` — the two counters that order everything
- **`epoch`** = *leadership generation*. Bumped **only on host change**
  (`party_claim_host`, `party_transfer_host`, `party_grab_control`, and the
  `party_create` reclaim path). Prevents a demoted host's late command from landing.
- **`seq`** = *monotonic command order within a generation*. Bumped on **every**
  authoritative mutation (playback, media, config, kick, permissions, approve — and
  every host-change too).
- **Newest-wins rule the client uses** (`applySnapshot`):
  `newer = a.epoch > b.epoch || (a.epoch === b.epoch && a.seq >= b.seq)`.
  ⚠ Note `>=` (accepts **equal** `(epoch,seq)`) — so a lease-renewal heartbeat that
  re-broadcasts the same seq still re-anchors. Kick-detection, by contrast, requires
  **strictly** newer (`seq >`) plus `wasMember && !stillMember` — the asymmetry (accept
  `>=`, kick only on `>`) is deliberate so a heartbeat isn't misread as a removal. (This
  subtlety is exactly what migration `0004` exists to support.)
  > The `protocol.ts` doc-comment says clients reject `(epoch==, seq <= last)`
  > (strictly-newer). The **real client accepts equal seq**. Trust the code.

## Postgres is the single writer
- **Two tables**, both **RLS-enabled with SELECT-only policies** gated by
  `party_is_member(code, auth.uid())`. **No write policies exist** — every mutation goes
  through an RPC. `anon` is revoked from everything; RPCs are `grant execute … to
  authenticated` only.
  - **`party_rooms`** (PK `code`): `host_id` (null = up for grabs), `epoch`, `seq`,
    `lease_expires_at`, `play_status/position_ms/rate/anchor_at`, `media jsonb`,
    `config jsonb`, `password_hash`.
  - **`party_members`** (PK `(room_code, user_id)`, FK cascade): `installation_id`,
    `display_name`, `role`, `permissions jsonb`, `joined_at` (server-stamped, used for
    election ranking), `last_seen_at`, `approved`.
- **Every mutating RPC** is `SECURITY DEFINER`, pins `search_path = public`, does
  `SELECT … FOR UPDATE` on the room row (serializing concurrent writers), bumps `seq`,
  re-anchors when needed, and returns `party_snapshot(code)`. Host-gated RPCs all share
  the guard `if host_id <> uid or lease_expires_at < now() then raise 'not host'`, and
  each such mutation **re-stamps the lease `+6s`** (an actively-controlling host renews
  implicitly). `connected` in a snapshot = `last_seen_at > now()-15s`.

### The RPC surface (what the client calls)
| RPC | Purpose | Key facts |
|---|---|---|
| `party_server_time()` | server clock (ms) | clock-offset ping |
| `party_snapshot(code)` | full canonical snapshot | DEFINER stable; ms numbers |
| `party_create(code, install, name, config?)` | create **or reclaim** a host-less room | `ON CONFLICT … FOR UPDATE`; **epoch+1** on reclaim |
| `party_join(code, install, name, password?)` | join as guest | `FOR UPDATE`; enforces access+password+approval; **new member bumps seq + re-anchors** |
| `party_renew_lease(code)` | host heartbeat | returns **light** `{epoch, leaseExpiresAt, serverTimeMs}`, not a snapshot |
| `party_set_media(code, media)` | set title; reset timeline `paused@0` | host+live-lease |
| `party_set_playback(code, action, pos?, rate?)` | **play/pause/seek/rate** | `action ∈ {play,pause,seek,rate}`; re-anchors; `seq+1` |
| `party_claim_host(code)` | failover election | only when host-less/lapsed; requires **approved**; **epoch+1** |
| `party_transfer_host(code, target)` | host → member | **epoch+1**; ⚠ target only checked for membership, **not approved** |
| `party_grab_control(code)` | guest self-takeover | gated on `guestControlDefault` + **approved**; **epoch+1** |
| `party_leave(code)` | drop membership | if caller was host → `host_id=null` |
| `party_set_config(code, patch, password?)` | patch config / manage password | bcrypt hashing here |
| `party_set_permissions(code, target, patch)` | jsonb-merge a member's perms | `seq+1` |
| `party_approve_member(code, target)` | `approved=true` | `seq+1` |
| `party_kick(code, target)` | remove member | can't kick self |

### Access modes & admin (`RoomConfig`)
- `access`: `open` (anyone) · `password` (bcrypt-checked) · `locked` / `private`
  (both raise `'room locked'` for non-members). ⚠ **`locked` and `private` are
  functionally identical in `party_join`** — no distinct behavior is encoded.
- `approveGuests` → a genuinely-new guest is inserted `approved=false` and must be
  approved before they can claim/grab host; existing members stay approved.
- Admin ops: **kick**, **per-member permissions** (`canControlPlayback/canChat/canQueue/
  canVote`), **approve**, **grab-control**, **transfer-host**. Guest defaults:
  `{canControlPlayback:false, canChat:true, canQueue:false, canVote:true}`.

### Password hashing (+ the schema-qualify gotcha)
- **bcrypt via `pgcrypto`**: hash = `crypt(pw, gen_salt('bf'))`; verify =
  `password_hash <> crypt(pw, password_hash)`.
- ⚠ **On Supabase, pgcrypto lives in the `extensions` schema**, but these RPCs pin
  `search_path = public`, so bare `crypt()`/`gen_salt()` fail at runtime
  (`function gen_salt(unknown) does not exist`). Migration `0003` fixed this by calling
  **`extensions.crypt(...)`** / **`extensions.gen_salt('bf')`**. Keep the schema prefix
  if you touch password code.

### Host lease & failover election
- **Lease = 6s** (`interval '6 seconds'` in SQL = `LEASE_DURATION_MS`). Renewed by
  `party_renew_lease` every **2s** (`LEASE_RENEW_INTERVAL_MS`, ~⅓ of the lease) **plus**
  every playback/admin mutation re-stamps `+6s`.
- **Handoff** (`transfer`/`grab`/`claim`, and `create`-reclaim): each **bumps epoch +1**,
  `seq +1`, sets `host_id`, demotes the old host to guest, and **re-anchors**
  (`position = party_effpos(...)`, `anchor_at = now()`) so the timeline never stalls
  across a leadership change.
- **Election (guest side, in `PartyClient.checkHost`, every 1.5s):** trigger if the lease
  expired **or** the last snapshot is stale (`now - lastSnapAt > 7000ms`). Rank guests by
  `joined_at`, schedule `tryClaim` at `rank * 700ms` (staggered to avoid thundering herd);
  `party_claim_host`'s row lock guarantees a **single winner**.

## PartyClient (transport) — `PartyClient.ts`
- **Realtime channel:** `supabase.channel(`party:${code}`, {broadcast:{self:false},
  presence:{key:userId}})`. Broadcast event `"snap"` carries the full `RoomSnapshot`.
  `self:false` → we never get our own broadcasts back (we apply our own RPC returns
  directly). Presence is keyed by `userId`; `connectedCount = keys(presenceState()).length`.
- **Server-clock offset (`pingClock`):** `offset = serverMs - (t0+t2)/2` (midpoint), keep
  the last 10 samples, **pick the one with the lowest RTT** (min-RTT filter). `now() =
  Date.now() + offset`. Burst of 5 at startup, then every 10s.
- **Playback calls** all funnel through one helper →
  `party_set_playback(code, action, position_ms, rate)`: play/pause pass `position_ms:null`;
  seek passes `Math.max(0, Math.round(ms))`; rate passes `rate`.
- Timers: clock (10s), watchdog (1.5s, drives `checkHost`), host-only lease renew (2s).

## PartySyncEngine — the local pilot (`PartySyncEngine.ts`)
Consumes `PlayerEvent`s from the player and the latest anchor; emits `PlayerControl`
calls. Two jobs: **apply anchors** and **route user controls**.

- **`setAnchor(anchor)`** — computes `key = `${epoch}:${seq}``; only calls
  `applyAnchorNow()` when the key **changed** (a real control event / handoff), so
  identical re-broadcasts don't thrash the player.
- **`applyAnchorNow()`** — resets drift state, `setRate(anchor.rate)`, then seeks to the
  expected position **only if** `|lastCt − target| > 1.5s` (the **redundant-seek guard** —
  these HLS streams re-buffer on every seek, so a needless seek froze playback and made
  controls feel dead), then play/pause to match. `lastCt` is the last observed
  `currentTime`, updated on every event. (`1.5` is an inline magic number.)
- **`handleUserControl()`** (only for genuine `play`/`pause`/`seeked` — the bridge
  echo-suppresses our own programmatic changes):
  - **Host:** mirror the action to the authority — `client.play()/pause()`; for `seeked`,
    only `client.seek(currentTime*1000)` if `|currentTime − expected| >
    USER_SEEK_THRESHOLD_S (2.0)` (filters our own landing re-seeks).
  - **Guest:** a pause **detaches** (stop following); a play while detached
    `jumpToLive()` (re-attach + snap to live). Guest **scrubs are ignored** — the host
    owns the timeline.
- **Drift correction (on `tick`, when attached & playing) — two tiers:**

| Tunable | Value | Role |
|---|---|---|
| `DEAD_BAND_S` | 0.2 | below this EMA drift → no correction |
| `RESET_BAND_S` | 0.1 | stop correcting once \|EMA\| drops under this |
| `RATE_ZONE_MAX_S` | 3.0 | median drift ≥ this → **hard seek** |
| `SYNC_WINDOW_S` | 1.0 | rate-formula denominator |
| `RATE_MIN/MAX` | 0.9 / 1.1 | rate-nudge clamp |
| `HARD_SEEK_COOLDOWN_MS` | 8000 | min gap between hard seeks |
| `SEEK_PERSIST_N` | 3 | consecutive over-threshold ticks before hard seek |
| `DRIFT_EMA_ALPHA` | 0.25 | EMA smoothing (rate decision) |
| `MEDIAN_N` | 5 | median window (hard-seek decision) |
| `USER_SEEK_THRESHOLD_S` | 2.0 | `seeked` within this of expected = our own re-seek |

  1. **Hard-seek tier:** if `|median(last 5 drifts)| ≥ 3.0` for `≥3` consecutive ticks and
     cooldown elapsed → seek to expected, reset state.
  2. **Rate-nudge tier:** `setRate(clamp(1 − ema/1.0, 0.9, 1.1))` while `|ema| ≥ 0.2`,
     releasing to 1.0 once `|ema| < 0.1`. (Because `SYNC_WINDOW_S=1.0`, the clamp
     saturates for any `|ema| ≥ 0.1s` → the nudge is effectively ±10% when active.)
  Two different smoothers on purpose: **median(5)** gates the hard seek, **EMA(α=0.25)**
  gates the rate nudge.

## The player contract (what any player must satisfy)
The engine talks to the player through two shapes — **this is the seam the native player
reuses** (see [native-player.md](./native-player.md)):
```ts
interface PlayerControl { play(); pause(); seek(seconds); setRate(rate); }   // ⚠ seek in SECONDS
interface PlayerEvent   { event: 'ready'|'play'|'pause'|'seeking'|'seeked'|'ended'
                                |'waiting'|'playing'|'canplay'|'tick';
                          currentTime; duration; paused; }                    // seconds
```
> ⚠ **Units boundary:** `PlayerControl.seek` is **seconds**; `PartyClient.seek` is
> **milliseconds**; `effectivePositionMs`/anchors are **ms**. The host user-seek path
> converts once: `client.seek(e.currentTime * 1000)`.
- **Echo-suppression is mandatory but lives in the *player*, not the engine.** The engine
  drives `play/pause/seek/setRate` constantly (a rate nudge almost every tick); the player
  bridge must suppress the resulting echoed events (~500ms) so they aren't misread as user
  actions — else guests detach on every anchor and hosts echo RPCs. (`HijackPlayer`'s
  `markApplying`; a native player must reproduce it — but **not** for `setRate`.)
- The engine emits no `seeked` of its own; it relies on the player's `seeked`. expo-video
  has none, so the native player must synthesize it from its own scrub UI.

## Identity (`identity.ts` + `supabase.ts`) — three distinct ids
- **`installationId`** — per install/device. `uuidv4()` (crypto polyfill; weak fallback
  never throws), persisted in MMKV key **`party.installationId`**. Not a secret, not proof
  of ownership.
- **`userId`** — the *person*. **Supabase anonymous auth** `auth.uid()` via
  `ensurePartyAuth()` (lazy, memoized) — the RLS principal, persisted in MMKV so it's
  stable across restarts. `PartyClient.start()` awaits it.
- **`connectionId`** — **vestigial** (DO model only). No such concept in the Supabase impl;
  Realtime presence is keyed by `userId`.
- Also in MMKV: **`party.displayName`** (`getDisplayName`/`setDisplayName`, trimmed to 32).

## Security-fix history (don't regress these)
- **`0005`** closed a real hole: `party_create`'s `ON CONFLICT` reclaim checked neither
  membership nor access/password, so a non-member who knew the code could seize host of a
  locked/private/password room during a >6s lease gap — bypassing bcrypt entirely. `0005`
  also hardened `party_claim_host` to require **approved** membership.
- **`0006`** fixed a `0005` regression: requiring membership broke legitimate host
  *reconnect* (since `party_leave` deletes membership), so `0006` also lets the original
  `created_by` creator reclaim a **free** host slot.
- Net rule to preserve: **reclaim/claim must verify the caller is entitled** (member, or
  original creator, and approved where required) — never let code-knowledge alone grant host.

## Known gotchas / deferred
- `locked` vs `private` indistinguishable in SQL (above).
- `party_transfer_host` doesn't require the target to be `approved` (asymmetric with
  claim/grab).
- `effectivePositionMs` unbounded above (above).
- **Group-pause-on-buffer is NOT wired** (explicit TODO): needs a guest→host buffering
  signal. `expo-video`'s `bufferedPosition` would enable it for the native player (v2).
- `protocol.ts` `Poll` type has an orphaned doc-comment describing a votes-map field that
  doesn't exist (part of the unused DO types).
