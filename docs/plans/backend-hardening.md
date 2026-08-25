# Backend hardening task (deferred from the 2026-08-22 full-app review)

These need operator access the client pass can't touch — **Supabase service-role / SQL / Realtime RLS**
and **`wrangler secret`** on the worker. Grouped by where the work lives. Severity from
[docs/reviews/2026-08-22-full-app-review.md](../reviews/2026-08-22-full-app-review.md).

## Supabase (SQL / Realtime)
### C1 (CRITICAL) — watch-party realtime is remotely abusable
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

### M5 (MEDIUM) — membership flap (paired with C1's server-authored move)
Joins don't bump the playback `seq`, so two near-simultaneous joiners broadcast equal-`(epoch,seq)`
snapshots with divergent member lists → the client's newest-wins accepts equal seq and the member list
flickers until the host heartbeat re-anchors. **Deliberately NOT fixed client-side:** the client's `>=`
seq test is load-bearing for host-heartbeat **liveness/election** (equal-seq heartbeats must still update
`lastSnapAt`), so tightening it to `>` would break election. **Correct fix is server-side:** bump `seq`
on membership change in the `party_join`/`party_leave` RPCs so joins are strictly-ordered. Then the
client can treat equal-seq peer snapshots as liveness-only. Files: party RPC migration.

### M7 (MEDIUM) — IP "hash" is reversible → de-anonymizable PII
`worker/src/supabase.ts:hashIp` is a bare SHA-256 of the IP; the IPv4 space brute-forces in seconds, so
`client_hash` ≈ the raw IP (store-review privacy risk). **Fix:** HMAC-SHA256 with a **server-only secret
salt** (`wrangler secret put IP_HASH_SALT`), rotated periodically.

## Cloudflare Worker
### H1 (HIGH) — `/cache/purge` is unauthenticated → global provider blackout
`worker/src/index.ts:~220`, CORS wildcard. Anyone can loop purge+`/config`; under load `getProviders`
returns `[]`, cached 60s → the no-fallback app goes dumb for everyone. **Fix:** require a shared-secret
header (`wrangler secret put PURGE_TOKEN`) on `/cache/purge`; scope CORS to app origins.

### M1 (MEDIUM) — `/report` unauthenticated/unvalidated → health-ordering poisoning
`worker/src/index.ts:~285`, `schemas.ts`. `providerId`/`outcome` are attacker-controlled and never checked
against the real provider set; `REPORT_LIMITER` is a no-op if the binding is unset. Flooding `no_bind`
for the live provider demotes it for all users. **Fix:** reject `providerId` not in the current provider
list; **fail-closed** if the rate-limiter binding is missing; consider a lightweight app attestation/nonce.

## Client + Worker together (OTA bridge integrity)
### H2 (HIGH) — OTA bridge injected with no integrity check → WebView RCE
`components/player/HijackPlayer.tsx` injects `getCachedScript(providerId)` (Supabase `bridge_script`,
cached raw in MMKV) with no hash/signature → a compromised worker/DB row (or a non-TLS
`EXPO_PUBLIC_WORKER_URL`) = arbitrary JS in the provider WebView. **Fix:** the `/scripts` `version` tag is
already a **content hash** — have the client **verify the fetched body against it** before caching/
injecting (in `src/scripts/bridgeCache.ts`), and **hard-require https** for the worker URL. (Client-side,
but listed here because it's the security cluster and pairs with H3.)

### H3 (HIGH) — WebView message bridge trusts any page script
`handleMessage` acts on any `postMessage` with no shared secret → ad scripts on the embed page can spoof
`ready`/`ended`/`currentTime`. **Fix:** stamp a **per-session nonce** on every bridge `post({...})` in the
injected script (`src/scripts/legacy-videasy.ts`) and drop messages lacking it in `HijackPlayer.handleMessage`.
**Deferred because it's coupled to an OTA deploy:** the bridge is served over-the-air, so shipping the
nonce requires re-running `scripts/upload-bridge.ts` (needs `SUPABASE_SERVICE_ROLE_KEY`) — do it together
with H2 so the client only starts requiring the nonce once the new signed+nonce'd script is deployed
(otherwise the client would reject the current no-nonce bridge and break playback).

## Suggested order
1. **C1** (+ M5's server seq bump) — the one remote-abuse hole.
2. **H1 / M1 / M7** — worker secrets + validation (small, high value).
3. **H2 + H3** — coordinated OTA deploy (bridge integrity + message nonce), since H3 can't ship before H2's
   signed script is live.
