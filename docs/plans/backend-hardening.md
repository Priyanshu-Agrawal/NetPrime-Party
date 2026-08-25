# Backend hardening task (deferred from the 2026-08-22 full-app review)

These need operator access the client pass can't touch — **Supabase service-role / SQL / Realtime RLS**
and **`wrangler secret`** on the worker. Grouped by where the work lives. Severity from
[docs/reviews/2026-08-22-full-app-review.md](../reviews/2026-08-22-full-app-review.md).

## Supabase (SQL / Realtime)
### C1 (CRITICAL) — watch-party realtime is remotely abusable — ✅ DONE (2026-08-25)
**Shipped:** migration `0007_party_realtime_authz` (applied to the remote project) adds RLS on
`realtime.messages` so only an authed room member can read/send on `party:<code>` and `party-chat:<code>`
(via `party_is_member` + `split_part(topic,':',2)`), and the client sets `private: true` on both channels
(`PartyClient.subscribe`, `usePartyChat`) with `realtime.setAuth()` before subscribe. This closes the
external attacker vector (guess-a-code → hijack/kick/impersonate). **Residual (member-level forgery):** a
legit member can still forge a snapshot within their own room — fully closing needs server-authored state
(postgres_changes) or RPC-stamped chat identity; lower severity (invited member griefing a room they're in,
and the host can kick). Verify with a 2-device party smoke test before release.
_Original problem, for reference:_
Channels are public and the client applies peer `snap`/chat broadcasts as authority with zero server
verification → anyone who guesses a room code can hijack playback, remote-kick a member, or impersonate
in chat. The Postgres RPC layer is well-hardened; the transport bypasses it.
**Fix (pick one):**
- Make the channels **`private: true`** and gate them with **Realtime Authorization / RLS on
  `realtime.messages`** (only approved room members may read/send `party:<code>`), **or**
- Stop trusting peer broadcasts entirely: drive state from the RLS-protected **`postgres_changes`**
  stream (the party tables are already in the `supabase_realtime` publication) or a server-authored
  broadcast, and derive chat `userId`/`name` from the **authed JWT**, not the payload.
Files: `services/party/PartyClient.ts` (subscribe/applySnapshot/broadcast), `services/party/usePartyChat.ts`,
new migration under `supabase/migrations/`.

### M5 (MEDIUM) — membership flap — ✅ ALREADY HANDLED (migration 0004)
`0004_party_join_bump_seq` already bumps `seq` + re-anchors on a NEW membership, so a joiner's snapshot is
strictly-newer and doesn't flap against pre-join heartbeats. No further action unless a flap is observed in
practice. _Original note, for reference:_
Joins don't bump the playback `seq`, so two near-simultaneous joiners broadcast equal-`(epoch,seq)`
snapshots with divergent member lists → the client's newest-wins accepts equal seq and the member list
flickers until the host heartbeat re-anchors. **Deliberately NOT fixed client-side:** the client's `>=`
seq test is load-bearing for host-heartbeat **liveness/election** (equal-seq heartbeats must still update
`lastSnapAt`), so tightening it to `>` would break election. **Correct fix is server-side:** bump `seq`
on membership change in the `party_join`/`party_leave` RPCs so joins are strictly-ordered. Then the
client can treat equal-seq peer snapshots as liveness-only. Files: party RPC migration.

### M7 (MEDIUM) — IP "hash" is reversible → de-anonymizable PII — ✅ DONE (2026-08-25)
**Shipped:** `worker/src/supabase.ts:hashIp(ip, salt?)` is now HMAC-SHA256 keyed by a server-only secret
(`IP_HASH_SALT`) when set; without it, degrades to the old plain digest with a `console.warn` (dev only).
`/report` passes `c.env.IP_HASH_SALT`. Verified locally: with the salt set no warning fires and the HMAC
output differs from the bare SHA-256 for the same IP (not reversible without the secret). **Operator TODO
before release:** `wrangler secret put IP_HASH_SALT` (rotate periodically).
_Original:_ a bare SHA-256 of the IP; the IPv4 space brute-forces in seconds, so `client_hash` ≈ the raw IP.

## Cloudflare Worker
### H1 (HIGH) — `/cache/purge` is unauthenticated → global provider blackout — ✅ DONE (2026-08-25)
**Shipped:** `/cache/purge` now requires `x-purge-token: <PURGE_TOKEN>` when the secret is configured
(open when unset, for local dev). `scripts/upload-bridge.ts` sends the header from `PURGE_TOKEN` env/.env.local.
Verified locally: no token / wrong token → 401, correct token → 200. **Operator TODO before release:**
`wrangler secret put PURGE_TOKEN` (and add `PURGE_TOKEN=…` to the env used to run `upload-bridge.ts`).
_Residual:_ CORS is still global `cors()` — defence-in-depth only; the token is the real gate (it holds
against non-browser clients like curl, which CORS can't stop). Scope CORS per-route later if desired.
_Original:_ anyone can loop purge+`/config`; under load `getProviders` returns `[]`, cached 60s → the
no-fallback app goes dumb for everyone.

### M1 (MEDIUM) — `/report` unvalidated → health-ordering poisoning — ✅ DONE (2026-08-25)
**Shipped:** `/report` now (a) **fails closed** — if `REPORT_LIMITER` is missing it returns 429 instead of
allowing unlimited writes, and (b) rejects a `providerId` not in the current enabled-provider list (returns
202 without an insert, so no poison row and no probe feedback to an attacker). `outcome` was already an enum
(can't be arbitrary). Verified locally: an unknown providerId returns 202 and never reaches `insertReport`
(only the valid `videasy` report did); limiter binding present in `wrangler dev`. **Deferred:** a real app
attestation/nonce (bigger lift; the rate-limit + distinct-client weighting + providerId gate cover the
cheap floods).
_Original:_ `providerId` attacker-controlled and unchecked; `REPORT_LIMITER` a no-op if unset — flooding
`no_bind` for the live provider demotes it for all users.

## Client + Worker together (OTA bridge integrity)
### H2 (HIGH) — OTA bridge injected with no integrity check → WebView RCE — ✅ DONE (2026-08-25)
**Shipped (client-side, `src/scripts/bridgeCache.ts`):** (1) **hard-require https** for the worker URL —
`isSafeWorkerUrl` refuses a non-https `EXPO_PUBLIC_WORKER_URL` (localhost + RFC-1918 LAN exempt for dev),
so an http MITM can't inject the bridge; (2) **verify the fetched body against its content-hash `version`**
before caching — `bodyMatchesVersion` computes `sha256(body)[:8]` (new dep-free `utils/sha256.ts`, since
Hermes has no `crypto.subtle` and expo-crypto would force a native rebuild) and drops a body that doesn't
match its `<id>@<hash>` tag. Verified: sha256 matches Node for known vectors + the live bridge hash; a
tampered body is rejected; the URL gate passes https/localhost/LAN and blocks public http. Works with the
current live bridge (its body still matches its tag). _Caveat:_ the version is self-computed by the worker,
so this is integrity/consistency + TLS enforcement, not defence against a fully-compromised source (that
needs a separately-keyed signature — future).

### H3 (HIGH) — WebView message bridge trusts any page script — ✅ DONE + DEPLOYED + VERIFIED (2026-08-25)
**Shipped:** the client publishes a per-mount nonce (`window.__vlMsgNonce`) in an injected prologue; the
bridge (`src/scripts/legacy-videasy.ts`) captures + deletes it at documentStart (before any page/ad script
runs) along with the genuine `ReactNativeWebView.postMessage`, and stamps `o.__n` on every `post()`.
`HijackPlayer.handleMessage` **latches**: a correct nonce flips strict mode on, after which any un-nonced
message (an ad-script spoof of `ready`/`ended`/`currentTime`) is dropped. Latching (vs. requiring upfront)
means an older cached bridge that doesn't stamp still plays — **no breakage regardless of deploy order**;
with the current live bridge (no nonce) the client is a no-op until the nonce bridge is live.
Nonce bridge `videasy@0c9a827c` **deployed** (upload-bridge + cache purge). **Verified end-to-end on a
real device:** the app re-synced the new bridge (H2 accepted its hash), the first event arrived carrying
the nonce → the client latched strict mode, and playback proceeded with zero legitimately-dropped events
(so real events are nonced + accepted, and any un-nonced spoof would be dropped).

## Suggested order
1. **C1** (+ M5's server seq bump) — the one remote-abuse hole.
2. **H1 / M1 / M7** — worker secrets + validation (small, high value).
3. **H2 + H3** — coordinated OTA deploy (bridge integrity + message nonce), since H3 can't ship before H2's
   signed script is live.
