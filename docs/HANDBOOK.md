# Bearoom / NetPrime — Project Handbook

> Branch `feat/improvements` @ `ce06e5f` (search rework: FlashList + catalog filters; brand refresh at `7932d54`) · Expo SDK 53 / React Native 0.79 / React 19 (New Architecture, Bridgeless) · edge worker deployed at `netprime-worker.spiderfan-no1.workers.dev`.
>
> **New here? Read [docs/AGENT_START_HERE.md](AGENT_START_HERE.md) first** (fast orientation + the current TOP OPEN item), then [docs/project-board.md](project-board.md) for live status. This handbook is the deep manual. *Note: this header commit + the §1 phase status lag behind the project-board tail — treat the board as the source of truth for "what's the latest."*

## How to use this handbook

This is a top-to-bottom manual for the whole system: read it in order and each section builds on the last, or jump straight to a subsystem via the **Index** below, which links every section by anchor. The body sections (§3–§14) each follow the same shape — what it is, how it works, why it was built this way, alternatives rejected, key files, and open items. The appendices (§15–§18) hold the cross-cutting reference material: the decision log, the file & directory map, the environment/secrets/operations runbook, and the glossary.

## 1. Executive overview {#overview}

Bearoom (Android package `com.scriptingbear.bearoom`; the `videasy` provider is branded "NetPrime" in-app) is a server-driven streaming and synced watch-party app for an India-first audience, built on Expo SDK 53 / React Native 0.79 / React 19 on the New Architecture (Bridgeless). Its core problem is playing content from an adversarial, piracy-style provider ecosystem — rotating AES keys, Cloudflare WAF challenges, IP-locked CDN tokens — resiliently and at **$0 infrastructure cost**, while letting friends watch a title together in sync (with the Hindi-dub track that audience expects), and while staying "dumb" enough to survive app-store review.

The design answer is a **two-tier server-driven thesis**. Tier 1 is a serverless edge fast-path: a Cloudflare Worker (Hono + Zod) backed by Supabase Postgres that serves app config, the dynamic provider registry, telemetry ingestion, and the over-the-air (OTA) DOM-hijack injection scripts in milliseconds. Tier 2 is the RN "heavy tank": a `react-native-webview` mounted on the provider's own embed page, into which the app injects a JavaScript bridge that observes and drives the provider's `<video>`. Because a real browser engine runs the provider's own decryption and WAF handshake on the user's residential IP, playback survives the traps that kill server scrapers and native stream-sniffers. All app state is Redux Toolkit + RTK Query.

Two decisions define the current shape. Native stream-sniffing was **rejected** — the provider serves HLS behind a deterministic, ephemeral, WAF-gated token (two fresh headless sessions resolve the *identical* token, and a URL is dead within hours), so a native player cannot self-heal on expiry; the WebView stays the primary player, and native features (PiP, AirPlay, background audio, lock-screen) are added *around* it. And providers are **100% dynamic from Supabase with no baked-in fallback**, so clearing the table yields a genuinely empty app.

Current status: Phases 1–5 and 8 are closed; Phase 6 (OTA injection scripts) and Phase 7 (telemetry & failure memory) are active and device-verified on `videasy`; Phases 9 (scrape caching) and 10 (store-review mode + web parity) are pending. Phase 6 shipped via "Option 1" — the proven legacy `BRIDGE_JS` served byte-for-byte over-the-air — so today **only `videasy` injects a working bridge**; the other eight hijackable providers inject nothing until the clean core+delta refactor lands (the F1 decision of 2026-08-20 = defer, videasy-only party).

## 2. Product scope & goals {#scope}

**Target users.** An India-first streaming audience that wants a free, resilient way to watch movies and TV — including the Hindi-dub audio track (fuzzy dub-track matching and silent per-title preferences are first-class) — and to watch it *together*. The watch-party value proposition is synced playback: a host and guests join a room, playback (play/pause/seek/rate) is driven in unison through the injected bridge, with room chat, reactions, and access controls layered on top. Solo playback and party playback share the same WebView hijack player.

**The hard constraint.** App-store review is a first-class design input, expressed as the **provider killswitch**: the provider registry is fully dynamic from Supabase with *no* bundled fallback anywhere. Clearing or disabling the rows produces a genuinely empty `/config` over the wire — there is nothing in the binary to leak or demonstrate during review, and the operator can globally dark the app on demand. This is why a bundled provider list, a bundled fallback bridge, and any baked-in catalog were all deliberately rejected: each would defeat the killswitch exactly when it is needed. The cost is accepted (first-ever launch offline shows no providers and injects no bridge).

**Non-goals.** Bearoom does not proxy video bytes (that would incur ~$500/mo bandwidth and defeat the $0 goal — the worker never touches the stream); it does not ship a native stream-sniffing player (WAF tokens defeat it); it does not carry an on-device open-source stream extractor (`@movie-web/providers` / `p-stream` — abandoned/DMCA'd, uninstalled); and it does not run blur or elevation on any screen that plays video (both blur backends re-capture the WebView every frame and stutter). Polished store-review "listing mode" UI, automated health-driven provider ordering, and broadening beyond videasy-only party are explicitly deferred, not in scope now.

## Index

1. [Executive overview](#overview)
2. [Product scope & goals](#scope)
3. [System architecture — the two-tier OMSS model](#architecture)
4. [The edge worker (Cloudflare + Hono)](#edge-worker)
5. [The data layer (Redux Toolkit + RTK Query)](#data-layer)
6. [Dynamic providers & the review killswitch](#providers)
7. [The WebView hijack player & injection bridge](#player-bridge)
8. [Over-the-air injection scripts (Phase 6)](#ota-scripts)
9. [Telemetry & failure memory (Phases 7–8)](#telemetry)
10. [Player UX, silent memory & the safety net](#player-ux)
11. [Watch party (synced playback)](#watch-party)
12. [UI & rendering — the blur/stutter rule, navigation & orientation](#ui-rendering)
13. [QA & verification methodology](#qa)
14. [Roadmap, phases & deferred backlog](#roadmap)
15. [Decision log](#decision-log)
16. [File & directory map](#file-map)
17. [Environment, secrets & operations runbook](#ops)
18. [Glossary](#glossary)
19. [Future scope & deferred features (complete)](#future-scope)
20. [References & sources](#references)


## 3. System architecture — the two-tier OMSS model {#architecture}

The map for the whole handbook: Bearoom is a server-driven React Native app whose playback is a **two-tier hybrid OMSS** (Open Media Source Standard) — a serverless edge fast-path in front of a WebView "heavy tank" that both plays and drives the provider's own video.

### 3.1 What it is & responsibilities

Bearoom (Android package `com.scriptingbear.bearoom`; provider `videasy` is branded "NetPrime" in-app) is an Expo SDK 53 / React Native 0.79 / React 19 New-Architecture (Bridgeless) streaming + watch-party app. The architecture's job is to get a title playing with minimal latency and maximal resilience against an adversarial provider ecosystem (rotating AES keys, Cloudflare WAF, IP-locked CDN tokens), at **$0 infrastructure cost**, while keeping the app "dumb" enough to pass store review (clear the provider table → the app shows nothing).

Two tiers:

- **Tier 1 — the serverless edge fast-path.** A Cloudflare Worker (Hono + Zod) is the app's config/scrape/telemetry/OTA-script backend. It answers `GET /config` in ~milliseconds and is the source of the provider registry.
- **Tier 2 — the RN WebView "heavy tank."** [HijackPlayer.tsx](components/player/HijackPlayer.tsx) mounts a `react-native-webview` on the provider embed and injects a JS bridge that observes and drives the provider's `<video>`. Because a real browser engine runs the provider's own JS, it survives WAF challenges and key rotations that break server scrapers.

> Note a live gap between design docs and code: the original master plan (see [native-streaming-master-plan.md](docs/architecture/native-streaming-master-plan.md), [streaming-strategy-v2.md](docs/architecture/streaming-strategy-v2.md)) had Tier 2 *sniff* a `.m3u8` and hand it to a native `expo-video` player ("Snatch and Kill"). That native path was **rejected** (§3.3). Today Tier 2 *is* the playback engine — the WebView plays; the bridge just controls it. The heavy-tank/fast-path framing survives; the "feed native player" half does not.

### 3.2 How it works — a Play tap, end to end

1. **Boot / config.** [App.tsx](App.tsx) mounts `<ReduxProvider>` (store in [src/store/index.ts](src/store/index.ts)) and a headless [ConfigBootstrap](src/store/ConfigBootstrap.tsx). `ConfigBootstrap` holds a live `useGetConfigQuery()` subscription ([workerApi.ts](src/store/services/workerApi.ts)) → `GET {EXPO_PUBLIC_WORKER_URL}/config`. The worker ([worker/src/index.ts:118](worker/src/index.ts#L118)) reads `public.providers` from Supabase (edge-cached 60s, `enabled`-filtered) and returns `{ appVersion, maintenanceMode, providers }`.
2. **Registry hydration.** `providersSlice` ([providersSlice.ts](src/store/features/providers/providersSlice.ts)) intercepts `getConfig.matchFulfilled` and runs `remoteToProviders()` (mappers.ts) into `Provider[]`. **There is NO baked-in fallback** — the slice starts `providers: []` and stays empty if the server sends none.
3. **OTA script sync.** On the same `/config` payload, `ConfigBootstrap` calls `syncScripts()` ([bridgeCache.ts](src/scripts/bridgeCache.ts)), which boot-diffs each provider's `script_version` against the MMKV cache and fetches `GET /scripts` ([worker/src/index.ts:250](worker/src/index.ts#L250)) only when a version changed.
4. **Play tap.** [PlayerScreen.tsx](src/screens/PlayerScreen.tsx) reads the reactive `useProviders()` list, picks `selected` (requested `providerId` or top), and mounts `<HijackPlayer>` ([PlayerScreen.tsx:509](src/screens/PlayerScreen.tsx#L509)). The imperative registry accessors — `getActiveProviders`/`getProvider`/`buildEmbedUrl`/`defaultHijackProvider` in [providerRegistry.ts](components/player/providerRegistry.ts) — read the Redux store **directly** (non-reactive snapshots; the store→registry import is type-only, so no runtime cycle).
5. **WebView + injected bridge.** `HijackPlayer` builds the embed URL via `buildEmbedUrl(p, m, {party})`, gates top-frame navigation via `providerHosts()`/`isAllowedTopNav()` (popup blocking), and injects the cached bridge: `injectedJavaScriptBeforeContentLoaded={getCachedScript(providerId) ?? ""}` ([HijackPlayer.tsx:272](components/player/HijackPlayer.tsx#L272)). The bridge walks same-origin iframes to find the `<video>`, emits `PlayerEvent`s over `onMessage`, and accepts commands (`play`/`pause`/`seek`) via the `PlayerHandle`. In a party this is what the sync engine drives (see [Watch-party sync](#watch-party)).
6. **Telemetry.** `PlayerScreen` fires `reportOutcome` (`POST /report`, [worker/src/index.ts:285](worker/src/index.ts#L285)) — `success` after sustained playback, `manual_switch`/failure outcomes at fallback points — feeding `provider_health` (see [Telemetry](#telemetry)).

**The 4 hidden walls of WebView sniffing** ([architecture-case-studies-summary.md](docs/research/architecture-case-studies-summary.md)) that the injected bridge is armored against: (1) **cross-origin iframe trap** → inject into all frames (`injectedJavaScriptForMainFrameOnly={false}`); (2) **iOS native-HLS trap** → a `MutationObserver` catches a `<video>` that gets a `.m3u8` src the network hooks miss; (3) **Service Worker trap** → aggressively unregister SWs on load; (4) **fetch-vs-XHR trap** → monkey-patch both `window.fetch` and `XMLHttpRequest.prototype`.

Worker surface (all under `netprime-worker.spiderfan-no1.workers.dev`): `GET /config`, `GET /scrape` (mock aggregator), `GET /scripts`, `POST /report`, `POST /cache/purge`, `GET /health`, `GET /docs` + `/openapi.json`. Key env var: `EXPO_PUBLIC_WORKER_URL` (inlined at build time — rebuild with `--clear` after changing).

### 3.3 Why this approach

- **Providers are adversarial.** Static server scrapers break weekly on AES rotations and get WAF-blocked from datacenter IPs. A WebView runs the provider's *own* decryption on the user's residential IP, so it degrades gracefully instead of dying.
- **IP-locked tokens force the client.** `videasy` locks CDN tokens to the requesting IP, so a Worker-fetched stream 403s on the phone. The playback path must live on-device.
- **Server-driven = a store-review killswitch.** Making providers 100% dynamic from Supabase with *no* fallback means clearing/disabling rows yields a genuinely empty `/config` over the wire — nothing to leak during review or a global kill.
- **$0 cost.** Cloudflare Workers free tier + Supabase free tier + on-device compute; the Worker never proxies video bytes.

### 3.4 Alternatives considered & rejected

- **Native `expo-video` fed by a sniffed stream** — ~~rejected~~ **AMENDED 2026-08-31 → adopted as an
  *additive* lane (Program 1 · P2/P3); the WebView hijack stays primary and is not removed.** The original
  rejection reasoned from a *server-side* resolver, where the CDN token is minted for the resolver's IP and
  the phone is a different IP. Re-measured with resolution **on the device**, none of it held: no IP-lock
  (2 MB served **HTTP 206 to a foreign Tor exit, no headers**), no WAF/JA3 block from Node *or* RN fetch,
  and the "can't self-heal" model was simply wrong — only the 30 s *seed* rotates, and re-resolving under a
  **different** seed returns **byte-identical URLs**, so the lane is deterministically self-healing by
  construction. What *is* real is a **codec** wall (iOS cannot demux MKV; many Android devices ship no
  AC3/E-AC3 decoder) — which is why the libVLC upgrade is scoped *Optional* rather than required. Study:
  [nuvio-plugin-architecture.md](research/nuvio-plugin-architecture.md); design:
  [native-player.md](architecture/native-player.md).
- **On-device open-source extraction (`@movie-web/providers` / `p-stream`)** — rejected/removed: the package is abandoned (all sources return null); the maintained fork is DMCA-taken-down. Package uninstalled.
  **Note (2026-08-31):** this rejection was about *those two libraries*, not the idea. The **Nuvio plugin
  ecosystem** is a different, live implementation of the same concept — 227 scrapers, actively maintained —
  and is now Program 1 · P3. Curation is the catch: 111 of 152 audited scrapers returned nothing, and two
  return confidently *wrong* content, so only a measured, SHA-pinned shortlist is usable
  ([plugin-provider-shortlist.md](providers/plugin-provider-shortlist.md)).
- **Pure server scraper (CinePro-style)** — rejected: fast but brittle, breaks on every AES key update.
- **Reverse-proxy hub (iMayhem-style)** — rejected: proxying video segments incurs massive bandwidth cost (~$500/mo), defeating the $0 goal. *(Still rejected — and now moot: on-device resolution reaches the same outcome with no server at all. See [cooren-fit-adr.md](research/cooren-fit-adr.md).)*
- **Bundled provider list (`providers.json`)** — superseded: kept only as the Supabase seed source, not imported at runtime; a bundled fallback would leak the catalog exactly during store review.

### 3.5 Key files & entry points

- [App.tsx](App.tsx) — root: Redux provider, `ConfigBootstrap`, navigation, forced-dark, portrait lock.
- [src/store/index.ts](src/store/index.ts) — store: `providers`/`player`/`watchParty` slices + `workerApi`/`tmdbApi`/`klipyApi`.
- [ConfigBootstrap.tsx](src/store/ConfigBootstrap.tsx) — headless `/config` subscription + OTA script sync trigger.
- [workerApi.ts](src/store/services/workerApi.ts) — RTK Query: `getConfig`/`scrapeTitle`/`purgeCache`/`reportOutcome`.
- [providersSlice.ts](src/store/features/providers/providersSlice.ts) — derives the registry from `/config`; no fallback.
- [providerRegistry.ts](components/player/providerRegistry.ts) — imperative registry reading the store; `buildEmbedUrl`, nav-security helpers.
- [HijackPlayer.tsx](components/player/HijackPlayer.tsx) — the Tier-2 WebView + injected bridge (`PlayerHandle`/`PlayerEvent`).
- [bridgeCache.ts](src/scripts/bridgeCache.ts) — MMKV OTA-script cache + boot-diff.
- [PlayerScreen.tsx](src/screens/PlayerScreen.tsx) — solo playback host, source switching, telemetry.
- [worker/src/index.ts](worker/src/index.ts) — the edge worker (all routes).

### 3.6 Open items / backlog / gotchas

- **OTA scripts ship videasy-only.** Phase 6 shipped "Option 1" — the proven legacy `BRIDGE_JS` served verbatim as `videasy@<hash>` ([legacy-videasy.ts](src/scripts/legacy-videasy.ts), not bundled). The clean `universal-core.ts` + `videasy.delta.ts` split is a **future refactor** (lacks 8 subsystems). Post-cutover only `videasy` injects a script; the other 8 hijackable providers inject nothing yet — the party badge on them is an accepted lie (F1 = defer, videasy-only party).
- **No bundled fallback anywhere** — first-launch-offline = no providers and no bridge (deliberate; accepted).
- **`/scrape` is a mock.** The Tier-1 aggregator returns placeholder metadata; real existence checks / AES decrypt are TODO. Fast-path playback for hijackable providers is confirmation-only — the WebView still does the real work.
- **`maintenanceMode` is a hardcoded `false` placeholder**, not yet a real store-review "listing mode" flag.
- **Phase 9 (server-side scrape caching)** and **Phase 10 (store-review benign UI + web parity)** are pending; the polished empty-state UI is deferred.
- **Rendering gotcha:** no blur AND no elevation on any screen that plays video (both blur impls re-capture the WebView every frame → stutter); test stutter only on release/cold-launch.


## 4. The edge worker (Cloudflare + Hono) {#edge-worker}

The edge worker is Bearoom's server-driven control plane: a single Cloudflare Worker (Hono + `@hono/zod-openapi`) that serves app config, the dynamic provider registry, OTA injection scripts, a title-resolution stub, and telemetry ingestion — all edge-cached, self-documenting, and backed by Supabase.

### 4.1 What it is & responsibilities

One Worker, deployed at `netprime-worker.spiderfan-no1.workers.dev`, owns every server-authoritative decision the app makes at runtime:

- **`GET /config`** — app bootstrap: `appVersion`, `maintenanceMode`, and the ordered provider registry (the app has **no baked-in provider fallback** — see [Providers & the hijack player](#providers)).
- **`GET /scripts`** — the heavy OTA DOM-hijack injection bridges, keyed by `script_version` (see [OTA injection scripts](#ota-scripts)).
- **`GET /scrape`** — per-title provider resolution (currently a mock; real scraping deferred).
- **`POST /report`** — provider-health telemetry ingestion (see [Telemetry](#telemetry)).
- **`POST /cache/purge`** — invalidate the edge cache after a Supabase edit.
- **`GET /health`** — liveness probe.
- **`GET /docs`** + **`GET /openapi.json`** — Swagger UI and the auto-generated OpenAPI 3.0 spec.

It is the App-Store "killswitch": clearing/disabling rows in Supabase makes `/config` genuinely empty over the wire, so the app renders nothing observable during store review.

### 4.2 How it works

**Framework.** [worker/src/index.ts](worker/src/index.ts) builds an `OpenAPIHono<{ Bindings }>` app. Hono is used because Cloudflare Workers have no Node `http` server; Hono is the Web-Standards routing/middleware/CORS layer. A `defaultHook` normalizes every Zod validation failure to a `{ error, issues }` 400 body, and `app.use("*", cors())` handles preflight globally. Two constants live at the top: `APP_VERSION = "2.1.0"` (single source for both the `/config` payload and OpenAPI `info.version`) and `MAINTENANCE_MODE = false` (a hardcoded placeholder for a future store-review "listing mode" flag — not yet wired to a remote source).

**Routes as schemas.** Every route is a `createRoute({ method, path, request, responses })` whose request/response shapes are the Zod schemas in [worker/src/schemas.ts](worker/src/schemas.ts) — the single source of truth for (1) runtime validation, (2) `z.infer` TypeScript types, and (3) the OpenAPI spec. `app.doc("/openapi.json", …)` emits the spec from those schemas, and `app.get("/docs", swaggerUI({ url: "/openapi.json" }))` renders it — **docs on demand**, never hand-written. `/` redirects to `/docs`; `app.notFound` returns a consistent `{ error: "Endpoint not found" }` 404. `z` is imported from `@hono/zod-openapi` (Zod augmented with `.openapi()` metadata), not plain `zod`.

**Data access + edge cache.** [worker/src/supabase.ts](worker/src/supabase.ts) fronts the Supabase PostgREST API through the Cloudflare Cache API (`caches.default`). Reads key on **synthetic, stable `Request` objects** — `https://internal.cache/providers` and `https://internal.cache/scripts` — so `/config` and `/scrape` share one cached provider payload (they previously cached under their own request URLs and never shared a hit). Both entries carry `Cache-Control: s-maxage=60`. `getProviders()` selects explicit lean columns and **never** ships the heavy `bridge_script` body:

```
id,name,enabled,priority,url_movie,url_tv,allowed_domain,hijack,script_version
```

with `?enabled=eq.true&order=priority.asc`. `getScripts()` uses a separate query (`select=id,script_version,bridge_script&enabled=eq.true&bridge_script=not.is.null`) under its own cache key, so the large scripts payload stays out of `/config`. Both calls use `AbortSignal.timeout(5000)` and **degrade to `[]`** on missing creds, timeout, or non-200 (callers never 500). The cache write is persisted via `ctx.waitUntil(cache.put(...))`, off the response path. `purgeProviders()` deletes **both** cache keys and returns whether either existed.

**Credentials.** `resolveCredentials()` reads root-first env names (`SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_URL`, then `SUPABASE_ANON_KEY`/`SUPABASE_PUBLISHABLE_KEY`/`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) — these come from the repo-root `.env.local`, symlinked as `worker/src/.dev.vars` for `wrangler dev`. Reads use the **anon/publishable** key. Writes (`insertReport`) use the **service-role** key (`SUPABASE_SERVICE_ROLE_KEY`, set via `wrangler secret put`) because `provider_reports` is RLS-locked with no client write policy — the service-role path is the only writer, which is the anti-poisoning guarantee.

**`POST /report` flow** ([worker/src/index.ts](worker/src/index.ts), `reportRoute` handler):

1. Body validated against `ReportRequestSchema` (`errorMessage` capped at 300 chars, stored as-is, never rendered/executed).
2. Client IP read from the Cloudflare header `cf-connecting-ip` (fallback `0.0.0.0`).
3. **Rate limit** via the optional `REPORT_LIMITER` binding: `await limiter.limit({ key: \`report:${ip}\` })`; on `!success` → `429`. If the binding is absent the gate is skipped (best-effort). IP keys are coarse on mobile/NAT, so this is the first gate, not the only defense — aggregation also weights by distinct clients.
4. **Server-derived, untrusted-of-client fields**: `country` from `request.cf.country` (Cloudflare geo), and `client_hash` = first 32 hex chars of `SHA-256(ip)` via `hashIp()` — the raw IP is never stored. `country` and client id are deliberately **not** accepted from the body.
5. **Best-effort write**: `ctx.waitUntil(insertReport(...))` fires the service-role insert (`Prefer: return=minimal`) off the response path; the route returns `202` regardless — a failed DB write still returns 202 so telemetry never breaks playback.

**`GET /scrape`** filters providers to `enabled`, then per provider returns `requires_client_for_stream` for `hijack.supported` rows (client must mount the WebView bridge to snatch the IP-locked m3u8) or a mock `success` m3u8 for Tier-1 rows. `titleExists` is hardcoded `true` (`TODO: real existence check`).

**Client + tooling.** The app consumes the worker via RTK Query in [workerApi.ts](src/store/services/workerApi.ts) (`useGetConfigQuery`, `useScrapeTitleQuery`, `usePurgeCacheMutation`, `useReportOutcomeMutation`), base URL from `EXPO_PUBLIC_WORKER_URL`. [ConfigBootstrap.tsx](src/store/ConfigBootstrap.tsx) holds the live `/config` subscription and diffs `script_version` to drive [bridgeCache.ts](src/scripts/bridgeCache.ts) which fetches `/scripts` only on change. The [upload-bridge.ts](scripts/upload-bridge.ts) CLI writes `bridge_script` + a content-hash `script_version` with the service-role key, then `POST`s `/cache/purge`.

### 4.3 Why this approach

- **Hono, not Express**: Workers provide no Node `http`; Hono is the Web-Standards fit and its `zod-openapi` layer makes docs a byproduct of the schemas.
- **Schema-first**: one Zod definition drives validation, types, and docs — no drift between what's enforced and what's documented.
- **Edge Cache API with synthetic keys**: 60s TTL absorbs launch-spike reads on cheap edge storage; shared keys stop `/config` and `/scrape` from double-fetching Supabase; a manual purge avoids waiting out the TTL after an edit.
- **Split `/config` vs `/scripts`**: config must be tiny and hit on every launch; injection scripts are large and change rarely, so version-gated separate caching keeps the launch payload lean.
- **Server-derived geo + hashed IP**: privacy (no raw IP stored) and integrity (client can't spoof country or identity) for [telemetry](#telemetry).
- **Graceful degradation everywhere**: missing creds, Supabase timeouts, absent rate-limiter, and failed inserts all return safe defaults so the worker never 500s into the client.

### 4.4 Alternatives considered & rejected

- **Express / Node runtime** — Workers have no `http` server; would need a different host and lose the edge-cache + `request.cf` primitives.
- **Hand-written OpenAPI / separate docs** — drifts from the code; `@hono/zod-openapi` generates the spec from the same schemas that validate requests.
- **Per-request-URL cache keys** — `/config` and `/scrape` cached separately and never shared a hit; replaced by two synthetic stable keys.
- **Shipping `bridge_script` inside `/config`** — bloats the every-launch payload with rarely-changing heavy JS; split into version-gated `/scripts`.
- **Trusting client-supplied country / client id** — spoofable and poisonable; derived server-side from `request.cf` and hashed IP instead.
- **Direct client writes to `provider_reports`** — would require a client-writable RLS policy and open the table to poisoning; all writes go through the service-role route only.
- **Baked-in provider fallback list** — rejected deliberately: full-dynamic providers are the store-review killswitch, so an empty Supabase means an empty app.

### 4.5 Key files & entry points

- [worker/src/index.ts](worker/src/index.ts) — app assembly, every route (`healthRoute`, `configRoute`, `scrapeRoute`, `purgeRoute`, `scriptsRoute`, `reportRoute`), `/openapi.json` + `/docs`, `APP_VERSION`, `MAINTENANCE_MODE`.
- [worker/src/supabase.ts](worker/src/supabase.ts) — `Bindings`, `getProviders`, `getScripts`, `purgeProviders`, `insertReport`, `hashIp`, `resolveCredentials`, cache keys.
- [worker/src/schemas.ts](worker/src/schemas.ts) — all Zod schemas (`AppConfigSchema`, `ProviderSchema`, `HijackSchema`, `Scrape*`, `ReportRequestSchema`, `ReportOutcome`, error envelope).
- [worker/wrangler.toml](worker/wrangler.toml) — `name`, `main`, `compatibility_date = 2024-03-20`, `[[ratelimits]] REPORT_LIMITER` (`limit = 30, period = 60`).
- [worker/package.json](worker/package.json) — deps (`hono@^4.6`, `@hono/zod-openapi@^0.19`, `@hono/swagger-ui@^0.5`, `wrangler@^4.86`); scripts `dev` / `deploy` / `typecheck`.
- [workerApi.ts](src/store/services/workerApi.ts), [ConfigBootstrap.tsx](src/store/ConfigBootstrap.tsx), [bridgeCache.ts](src/scripts/bridgeCache.ts), [scripts/upload-bridge.ts](scripts/upload-bridge.ts) — the app/CLI side.

### 4.6 Open items / backlog / gotchas

- **`/scrape` is a mock**: `titleExists = true` is hardcoded and Tier-1 `success` returns a fabricated `cdn.<id>.com/.../master.m3u8` — no real HTML parse / AES decrypt / existence check yet.
- **`MAINTENANCE_MODE` is a hardcoded `false`** — not wired to a remote store-review "listing mode" flag.
- **`REPORT_LIMITER` uses a placeholder `namespace_id = "1001"`** and is IP-keyed (coarse on NAT/mobile); it's a first gate only. The binding is optional — remove it and the route still serves.
- **Version constants are manual**: `APP_VERSION` must be kept in sync with `app.json` `expo.version` by hand.
- **`.dev.vars` is a symlink** to the repo-root `.env.local`; production secrets (esp. `SUPABASE_SERVICE_ROLE_KEY`) must be set via `wrangler secret put` — a missing service-role key silently disables `/report` writes.
- **No auth on `/cache/purge`** — any caller can purge; acceptable only because a purge just forces a fresh Supabase read.


## 5. The data layer (Redux Toolkit + RTK Query) {#data-layer}

The data layer is Bearoom's single source of truth for all remote state — app config, the dynamic provider registry, TMDB catalog data, and KLIPY GIFs — modeled as three RTK Query APIs plus three feature slices behind one Redux store.

### 5.1 What it is & responsibilities

The store ([src/store/index.ts](src/store/index.ts)) composes three feature reducers (`providers`, `player`, `watchParty`) and three RTK Query caches (`workerApi`, `tmdbApi`, `klipyApi`). RTK Query is the *intended* architecture: before it, the store was dead scaffolding and each screen fetched ad-hoc. Now every network read flows through a generated hook that dedupes, caches, and keeps data warm. Responsibilities by API:

- **workerApi** — the Cloudflare edge worker: remote `/config` (app version, maintenance flag, provider registry), `/scrape` (stream resolution), `/cache/purge`, and `/report` (provider-health telemetry, see [Telemetry](#telemetry)).
- **tmdbApi** — the TMDB catalog: Home rails, hero carousel, paginated lists, details bundles, TV seasons, multi-search, discover-by-provider.
- **klipyApi** — KLIPY GIFs/clips for party chat: trending, search, recent, categories, plus share/report signals.

The `providers` slice ([providersSlice.ts](src/store/features/providers/providersSlice.ts)) is derived state — it is fed *from* workerApi, not fetched independently.

### 5.2 How it works — the real mechanism

**Store wiring.** [index.ts](src/store/index.ts) calls `configureStore` with each API's `reducerPath` reducer, concatenates all three `.middleware` instances, and runs `setupListeners(store.dispatch)` so `refetchOnReconnect` fires when the RN device regains connectivity. `serializableCheck` is disabled (reserved for later non-serializable payloads). Typed access is via `useAppSelector` / `useAppDispatch` ([hooks.ts](src/store/hooks.ts)).

**workerApi** ([workerApi.ts](src/store/services/workerApi.ts)) uses a real `fetchBaseQuery({ baseUrl: WORKER_URL })` where `WORKER_URL = process.env.EXPO_PUBLIC_WORKER_URL ?? ""`. If the env var is unset, queries fail gracefully and the providers slice stays empty. It declares one tag type, `Config`:

```ts
getConfig:  build.query<AppConfig, void>({ query: () => "/config",
              keepUnusedDataFor: 18000, providesTags: ["Config"] }),
scrapeTitle: build.query<ScrapeResponse, ScrapeArgs>({ /* keepUnusedDataFor: 120 */ }),
purgeCache:  build.mutation<PurgeResponse, void>({ invalidatesTags: ["Config"] }),
reportOutcome: build.mutation<{ accepted: boolean }, ReportArgs>({ /* /report, no tags */ }),
```

`refetchOnReconnect: true` is set at the API level. `purgeCache` invalidating `Config` makes any mounted `getConfig` subscription refetch — the mechanism for pushing a Supabase edit live without an app update.

**tmdbApi & klipyApi** ([tmdbApi.ts](src/store/services/tmdbApi.ts), [klipyApi.ts](src/store/services/klipyApi.ts)) use `fakeBaseQuery()` and implement each endpoint with `queryFn`, wrapping the *pre-existing, proven* utility functions rather than re-implementing fetches. tmdbApi's `queryFn`s call `fetchList` / `fetchListPage` / `fetchDetails` (from [utils/tmdbLists](utils/tmdbLists.ts), [utils/tmdbDetails](utils/tmdbDetails.ts)) and a local `raw()` helper that appends `language=en-US` and uses `API_URL`/`API_HEADERS` from the movie context. klipyApi wraps `trendingMedia` / `searchMedia` / `recentMedia` / `getCategories` / `shareTrigger` / `reportMedia` from [services/gifs](services/gifs.ts) — the device→KLIPY calls stay direct because KLIPY's ToS forbids proxying. RTK Query only adds caching, dedupe, and generated hooks on top. This replaced the bespoke module cache in `src/features/home/tmdbCache.ts`, so Home no longer flashes its skeleton on tab focus. klipyApi tags `Recent`; `klipyShare` invalidates it so the "recently shared" rail refreshes.

**Caching windows** via `keepUnusedDataFor` (seconds): config 18000; TMDB lists/hero/details/season 600, listPage 300, search/discover/trending 120; KLIPY categories 3600, trending 600, search 300, recent 120; scrape 120.

**config → slice bridge.** [providersSlice.ts](src/store/features/providers/providersSlice.ts) does not fetch. Its `extraReducers` add a matcher on `workerApi.endpoints.getConfig.matchFulfilled`; when `/config` resolves it runs `remoteToProviders(payload.providers)` and sets `maintenanceMode`. So one fetch keeps the whole app in sync, and there is deliberately **no fallback** — empty server response → empty provider list ([mappers.ts](src/store/features/providers/mappers.ts) filters `enabled`, sorts by `priority`, maps each `RemoteProviderRow` → the playback `Provider` shape).

**Consumption.** React components read via [hooks.ts](src/store/features/providers/hooks.ts): `useProviders()`, `useHijackableProviders()` (filters `hijack.supported`), `useMaintenanceMode()`. Imperative/non-React code reads the store directly through the registry — `getActiveProviders` / `getProvider` / `defaultHijackProvider` in [providerRegistry.ts](components/player/providerRegistry.ts) — used at [PlayerScreen.tsx:477](src/screens/PlayerScreen.tsx#L477) and by the Details screens' "Watch together" action. The registry imports the store's types only (one-way), so there is no runtime import cycle.

**Bootstrap.** [ConfigBootstrap.tsx](src/store/ConfigBootstrap.tsx) is a headless component mounted once high in the tree inside `<ReduxProvider>` ([App.tsx:113](App.tsx#L113)). It calls `useGetConfigQuery()`, holding a live subscription so config loads on launch and stays warm across `refetchOnReconnect`. Its `useEffect` also drives the OTA bridge-script sync: on each config arrival it calls `syncScripts(...)` ([bridgeCache.ts](src/scripts/bridgeCache.ts)) with each provider's `id` + `script_version`, diffing against the MMKV cache and fetching `/scripts` only when a version changed. Response shapes are typed in [worker.types.ts](src/types/worker.types.ts) (`AppConfig`, `RemoteProviderRow`, `ScrapeResponse`, `ReportArgs`, mirroring the worker's Zod schemas / `/openapi.json`).

### 5.3 Why this approach

Playback is server-driven (Supabase → worker → app) so the provider list can change — including being cleared to nothing for App-Store review (the deliberate killswitch) — without shipping an app update. RTK Query gives that model automatic caching, request dedupe, and reconnect refetch for free, replacing hand-rolled caches. The `matchFulfilled` bridge means every subsystem (solo player, watch-party gating, script sync) derives from one `/config` fetch, so there is exactly one source of truth and no manual mirroring. `queryFn`/`fakeBaseQuery` was chosen for TMDB/KLIPY so the already-proven extractors and ToS-compliant direct calls stay byte-for-byte identical while still gaining the cache/hook layer.

### 5.4 Alternatives considered & rejected

- **Baked-in provider fallback list** — rejected: it would defeat the store-review killswitch; empty must mean empty.
- **`fetchBaseQuery` for TMDB/KLIPY** — rejected: would force rewriting the proven `tmdbLists`/`tmdbDetails`/`gifs` transforms; KLIPY also forbids proxying, so its URL-building must stay in `services/gifs.ts`.
- **Keep the bespoke `tmdbCache.ts` module cache** — rejected: no dedupe/reconnect semantics and it flashed the Home skeleton on tab focus.
- **Manually mirroring the provider registry into a module holder** — rejected: the registry reads `store.getState()` live, so no sync code and no staleness.
- **Plain thunks / ad-hoc `fetch` in components** — rejected: that was the "dead scaffolding" era; no caching, duplicated in-flight requests.

### 5.5 Key files & entry points

- [src/store/index.ts](src/store/index.ts) — store composition, middleware, `setupListeners`.
- [src/store/hooks.ts](src/store/hooks.ts) — typed `useAppSelector` / `useAppDispatch`.
- [src/store/ConfigBootstrap.tsx](src/store/ConfigBootstrap.tsx) — headless launch fetch + script sync.
- [src/store/services/workerApi.ts](src/store/services/workerApi.ts) — edge-worker API, `Config` tag, telemetry mutation.
- [src/store/services/tmdbApi.ts](src/store/services/tmdbApi.ts) — TMDB endpoints over existing utils.
- [src/store/services/klipyApi.ts](src/store/services/klipyApi.ts) — KLIPY endpoints, `Recent` tag.
- [src/store/features/providers/providersSlice.ts](src/store/features/providers/providersSlice.ts) — `matchFulfilled` → derived provider/maintenance state.
- [src/store/features/providers/mappers.ts](src/store/features/providers/mappers.ts) — `RemoteProviderRow` → `Provider`.
- [src/store/features/providers/hooks.ts](src/store/features/providers/hooks.ts) — reactive selectors.
- [src/types/worker.types.ts](src/types/worker.types.ts) — worker response types.
- [components/player/providerRegistry.ts](components/player/providerRegistry.ts) — imperative store readers.

### 5.6 Open items / backlog / gotchas

- **Stale docstring:** `getConfig` has `keepUnusedDataFor: 18000` (5 h) but its comment still says "keep the client copy for 5 min." The worker edge-caches config ~60 s; the long client window means a party can run on provider data up to hours old unless a reconnect or `purgeCache` refetches — verify this is intended.
- **`serializableCheck: false`** is a blanket disable "for later" non-serializable payloads; nothing currently requires it, so it silently hides genuine non-serializable state bugs.
- **No error/retry surface:** `queryFn` wrappers rethrow raw `Error`s and telemetry/`/report` is fire-and-forget (202 regardless); there is no shared retry/backoff policy across the three APIs.
- **`refetchOnFocus`** is wired via `setupListeners` but not opted into per-endpoint — a candidate for the config query.
- **Provider gap (deferred, F1):** only `videasy` ships an OTA hijack script; the slice still exposes 8 other `hijack.supported` providers, so `useHijackableProviders()` over-reports party capability. See [Playback & the hijack bridge](#player-bridge).


## 6. Dynamic providers & the review killswitch {#providers}

The streaming-source catalog is served entirely from Supabase at runtime with **no baked-in fallback**, so clearing rows makes the app show nothing — a deliberate App-Store-review killswitch.

### 6.1 What it is & responsibilities

A "provider" is a third-party streaming **embed page** the app loads in a WebView (see [Player & injection](#player-bridge)). The provider system owns: the live catalog (which embeds exist, their movie/TV URL templates, the domains the WebView may navigate to), the per-provider **hijack capability** overlay (can our injected bridge reach the `<video>` for watch-party sync?), and the served-script version tag. It is the single runtime authority for both **solo playback** (the server chips) and the **Watch Party** gate.

Its defining property is that the catalog is **100% server-driven**: adding, retargeting, disabling, or globally killing a provider is a Supabase row edit plus a cache purge — no app release. There is intentionally **no hardcoded fallback list** anywhere in the shipped bundle.

### 6.2 How it works — mechanism & data flow

**Table shape.** Providers live in Supabase `public.providers` (RLS on; public `select`, service-role-only writes). The playing shape is defined across three migrations:

```sql
-- 20260819131319_create_providers_table.sql  (initial marketing shape)
id text primary key, name text, enabled boolean, unstable boolean,
priority integer, url_template text, capabilities jsonb, ...
-- 20260820055924_providers_full_dynamic_playback_columns.sql
url_movie text, url_tv text, allowed_domain text,
hijack jsonb not null default '{"supported":false}'::jsonb  -- url_template relaxed to nullable
-- 20260820113012_providers_bridge_scripts.sql
bridge_script text,        -- compiled core+delta JS the WebView injects
script_version text        -- content-hash tag stamped by the upload CLI
```

Runtime rows key on `url_movie` / `url_tv` / `allowed_domain` / `hijack` / `script_version`; the legacy `url_template` / `capabilities` / `*_description` columns are kept for back-compat but unused by the player.

**Server-side `enabled` filter.** The Cloudflare Worker's `getProviders()` fetches from PostgREST with an explicit column list and `&enabled=eq.true&order=priority.asc` — disabled rows never leave the edge — and edge-caches for 60s ([worker/src/supabase.ts:88](worker/src/supabase.ts#L88)). The heavy `bridge_script` body is **never** in `/config`; only `script_version` ships there (the body is served separately via `/scripts`, see [Player & injection](#player-bridge) and [Telemetry](#telemetry)).

**Fetch → store.** On launch, headless [ConfigBootstrap.tsx](src/store/ConfigBootstrap.tsx) holds a live `useGetConfigQuery()` subscription (RTK Query, base URL `EXPO_PUBLIC_WORKER_URL`; `refetchOnReconnect`, `keepUnusedDataFor` 5min) against `GET /config` ([workerApi.ts](src/store/services/workerApi.ts)). When it fulfils, `providersSlice` derives state via `extraReducers` on `workerApi.endpoints.getConfig.matchFulfilled` ([providersSlice.ts:39](src/store/features/providers/providersSlice.ts#L39)) — one fetch keeps the whole app in sync.

**`remoteToProviders` mapper** ([mappers.ts](src/store/features/providers/mappers.ts)) does client-side shaping on top of the server filter:

```ts
[...rows].filter(r => r.enabled).sort((a,b) => (a.priority??0)-(b.priority??0)).map(remoteToProvider)
```

`remoteToProvider` maps `RemoteProviderRow` → the app `Provider`: `urls: { movie: url_movie, tv: url_tv ?? url_movie }`, `allowedDomain`, `hijack: row.hijack ?? { supported: false }`, `scriptVersion: script_version ?? null` (types in [worker.types.ts](src/types/worker.types.ts)).

**The registry reads the store directly.** [providerRegistry.ts](components/player/providerRegistry.ts) is the one runtime source of truth. Its non-reactive snapshot reads `store.getState().providers.providers` straight through:

```ts
export function getActiveProviders(): Provider[] {
  return store.getState().providers.providers;   // no module holder, no store.subscribe mirror
}
```

This is for **imperative** callers (event handlers, `HijackPlayer` URL building). React components must instead use the reactive **`useProviders()`** hook ([hooks.ts](src/store/features/providers/hooks.ts)) so they re-render; `useHijackableProviders()` filters to `p.hijack.supported`, and `useMaintenanceMode()` exposes the remote flag. The `registry → store` import is one-way (the store chain imports the registry type-only), so there is no runtime cycle.

Registry helpers built on the snapshot: `getProvider(id)`, `isHijackable(p)` (`!!p.hijack.supported`), `isUnstable(p)`, `defaultHijackProvider()` (prefers a stable hijackable, then any hijackable), `buildEmbedUrl(p, media, {party})` (fills `${id}/${season}/${episode}`, appends `hijack.autoplayParam` + `startAt` in party mode, special-cases videasy TV with `nextEpisode/autoplayNextEpisode/episodeSelector`), and the nav-security pair `providerHosts(p)` / `isAllowedTopNav(hosts, req)` used for popup blocking.

**`HIJACK_CAPS` and `unstable`.** [hijackCapabilities.ts](components/player/hijackCapabilities.ts) defines `HijackCapability` = `{ supported, videoLocation?: "top"|"same-origin-iframe", navHosts?, autoplayParam?, unstable?, notes? }`. It exists in-repo as the **Supabase seed source** for the `hijack` jsonb column, not imported at runtime. "Hijackable" means the `<video>` is reachable by the injected bridge (top document or a same-origin iframe the bridge walks into) with no Cloudflare wall — that reachability is what enables play/pause/seek watch-party sync. `unstable: true` flags a provider that hosts its own internal source picker (e.g. `111movies` — upstreams go offline independently, members land on different/dead streams), so the UI can warn; `defaultHijackProvider()` avoids it.

**Killswitch, end to end.** State starts `providers: []`. If `/config` returns no providers (rows cleared/disabled for review, or a global kill), the slice stays empty, the registry snapshot is empty, the solo server list is empty, and the party gate never lights. Nothing is observable — the app goes "dumb."

### 6.3 Why this approach

- **App-Store-review killswitch.** The reviewer must be able to see an app with no infringing sources. Because there is no bundled catalog, clearing Supabase rows (or flipping `enabled=false`) yields a genuinely empty app over the wire, with no client code to reverse-engineer a hidden list from.
- **Ship providers without a release.** Streaming embeds die, get Cloudflare-walled, or change domains weekly. Full-dynamic rows mean retargeting a URL or disabling a dead source is a DB edit + `POST /cache/purge`, not a store submission and multi-day review.
- **One source of truth.** Reading `store.getState()` directly (instead of a mirrored module variable) removes an entire class of "the registry is stale vs Redux" bugs; imperative and reactive readers see the same array.
- **Lean config, heavy scripts split out.** Keeping `bridge_script` out of `/config` keeps launch config small; script bodies sync on a version diff via `/scripts` (see [Player & injection](#player-bridge)).

### 6.4 Alternatives considered & rejected

- **Bundled `providers.json` imported at runtime** — the original design (`import providersData from "@/providers.json"`). Rejected: ships an infringing catalog inside the binary (no killswitch) and needs a release to change anything. The JSON + `HIJACK_CAPS` now survive only as the Supabase *seed* source, not a runtime import. (Note: [docs/providers/README.md](docs/providers/README.md) still describes the bundled-import model and is **stale** vs the current store-backed code.)
- **A baked-in fallback list for when `/config` is empty/unreachable** — rejected outright: any fallback defeats the review killswitch. Empty means empty, by design; if the worker is unreachable the app shows nothing rather than a hidden default.
- **Module-holder + `store.subscribe` mirror in the registry** — a cached local array kept in sync via a store subscription. Rejected in favor of reading `store.getState()` directly: the subscription adds lifecycle/staleness risk for no benefit, since the snapshot is only ever read on demand.
- **Client-side scraping / native stream extraction** (`@movie-web/providers`, `consumet`, `p-stream`) — all DMCA'd or dead by mid-2026, and native sniffing is defeated by deterministic WAF tokens; the WebView-embed model stays. (See [Player & injection](#player-bridge).)
- **Filtering only client-side** — rejected: `enabled` is filtered server-side (`enabled=eq.true`) so disabled rows never reach the device at all; the client `.filter(r => r.enabled)` is defense-in-depth, not the gate.

### 6.5 Key files & entry points

- [src/store/features/providers/providersSlice.ts](src/store/features/providers/providersSlice.ts) — `providers`/`maintenanceMode` state; `matchFulfilled` derivation; no-fallback contract.
- [src/store/features/providers/mappers.ts](src/store/features/providers/mappers.ts) — `remoteToProvider` / `remoteToProviders` (filter `enabled`, sort `priority`, map to `Provider`).
- [src/store/features/providers/hooks.ts](src/store/features/providers/hooks.ts) — `useProviders`, `useHijackableProviders`, `useMaintenanceMode`.
- [components/player/providerRegistry.ts](components/player/providerRegistry.ts) — `getActiveProviders`/`getProvider`/`isHijackable`/`defaultHijackProvider`/`buildEmbedUrl`/`providerHosts`/`isAllowedTopNav` (reads `store.getState()`).
- [components/player/hijackCapabilities.ts](components/player/hijackCapabilities.ts) — `HijackCapability`, `HIJACK_CAPS` (seed source for the `hijack` jsonb).
- [src/store/services/workerApi.ts](src/store/services/workerApi.ts) — RTK Query service; `getConfig`/`scrapeTitle`/`purgeCache`/`reportOutcome`; `EXPO_PUBLIC_WORKER_URL`.
- [src/store/ConfigBootstrap.tsx](src/store/ConfigBootstrap.tsx) — headless launch fetch of `/config` + script-version diff/sync.
- [worker/src/supabase.ts](worker/src/supabase.ts) — `getProviders`/`getScripts` (PostgREST `enabled=eq.true`, edge cache, 5s timeout).
- [src/types/worker.types.ts](src/types/worker.types.ts) — `RemoteProviderRow`, `AppConfig`, scrape/report shapes.
- `supabase/migrations/2026081913…`, `…20260820055924…`, `…20260820113012…` — table + full-dynamic playback + bridge-script columns.
- [database/seed_providers.json](database/seed_providers.json) — legacy marketing-shape seed (10 rows).

### 6.6 Open items / backlog / gotchas

- **Stale doc.** [docs/providers/README.md](docs/providers/README.md) describes the removed bundled-`providers.json` import model; the runtime is now store-backed. Rewrite when touched.
- **Seed drift.** [database/seed_providers.json](database/seed_providers.json) is still the OLD shape (`url_template`, `capabilities`, `*_description`) — it does **not** carry `url_movie` / `url_tv` / `allowed_domain` / `hijack`. It is not a faithful seed for the full-dynamic columns; the live rows were populated separately.
- **Party badge lie (F1, deferred 2026-08-20).** Post-cutover only `videasy` has an OTA `bridge_script`; the other 8 hijackable providers inject nothing but still show `hijack.supported=true`, so the Watch Party badge appears on providers that cannot actually sync — a videasy-only party until the universal core+delta refactor lands (see [Player & injection](#player-bridge)).
- **`maintenanceMode`** is wired through the slice/hook but is a future store-review "listing mode"; no UI consumes it yet.
- **Providers bottom-sheet (deferred).** A filterable @gorhom bottom-sheet with richer UI over the provider list is planned; also "hijack more providers + QA each," and an optional proxy-all for ISP-block resilience. Do not build until asked.
- **Cache purge is manual.** After editing rows in Supabase, call `POST /cache/purge` (invalidates the `Config` RTK tag and both edge cache keys); otherwise the 60s edge cache serves stale providers.


## 7. The WebView hijack player & injection bridge {#player-bridge}

Bearoom plays a third-party provider's embed page inside a `react-native-webview` and injects a JavaScript bridge that both observes and drives the provider's `<video>`, giving the app a syncable, controllable player without owning the stream.

### 7.1 What it is & responsibilities

[HijackPlayer.tsx](components/player/HijackPlayer.tsx) is a `forwardRef<PlayerHandle>` component that mounts one `WebView` for one hijackable provider and wires up a two-way "hijack" bridge:

- **Observe** — the injected script relays the provider `<video>`'s events and a 1 Hz heartbeat to RN via `window.ReactNativeWebView.postMessage`, surfaced as `PlayerEvent`s through `onPlayerEvent`.
- **Drive** — RN calls `webRef.injectJavaScript("window.__vlCmd(...)")` to play/pause/seek/rate/fullscreen and read/switch quality and dub.
- **Guard** — a nav-security gate blocks popups and off-provider top navigations; main-frame load failures and renderer crashes escalate to `onFatalError` for provider fallback.

It is the sole live implementation of the player contract that the watch-party sync engine consumes (see [Watch-party sync](#watch-party)); the same component backs solo playback in [PlayerScreen.tsx](src/screens/PlayerScreen.tsx). Only providers whose `hijack.supported` is true in [hijackCapabilities.ts](components/player/hijackCapabilities.ts) are ever mounted here.

### 7.2 How it works — mechanism & data flow

**Provider resolution & URL.** Providers are read live from the Redux store via [providerRegistry.ts](components/player/providerRegistry.ts) (`getProvider`, `getActiveProviders`) — there is no baked-in list. `buildEmbedUrl(provider, mediaRef, {party})` fills `${id}/${season}/${episode}` templates and, in party mode, appends the provider's `hijack.autoplayParam` (autoplay-off so members start in unison) plus `startAt=` when resuming; videasy TV also gets `nextEpisode`/`autoplayNextEpisode`/`episodeSelector`. The `WebView` is keyed `` `${providerId}:${uri}` `` so any change remounts cleanly.

**Injection.** The bridge is **not bundled**. It is served over-the-air and cached in MMKV by [bridgeCache.ts](src/scripts/bridgeCache.ts); [HijackPlayer.tsx:272](components/player/HijackPlayer.tsx#L272) injects it via `injectedJavaScriptBeforeContentLoaded={getCachedScript(providerId) ?? ""}`. [ConfigBootstrap.tsx](src/store/ConfigBootstrap.tsx) diffs each provider's `script_version` from `GET /config` against the cache and calls `syncScripts()` (fetch `GET /scripts`, 8 s abort) only when something changed. There is no bundled fallback — first-launch-offline means no bridge, so the provider is uncontrollable until a sync succeeds (see [OTA scripts pipeline](#ota-scripts)). The shipped body is [legacy-videasy.ts](src/scripts/legacy-videasy.ts) (`LEGACY_VIDEASY_BRIDGE`), the proven legacy `BRIDGE_JS` moved verbatim; only its delivery changed.

**Finding the video.** `findVideo(doc)` returns the first `<video>`, recursing into **same-origin** iframes only (cross-origin is invisible — the core reachability limit that defines "hijackable"). A `setInterval` finder polls every 700 ms until a video appears, then `bind(v)` attaches listeners for `play/pause/seeking/seeked/ended/waiting/playing/canplay`, posts `ready`, and a 1 s `tick`. `HijackPlayer` flips `bound` on the first `ready` and fires `onBound`; if nothing binds within `BIND_TIMEOUT_MS` (30 s) it shows a soft "still syncing" banner without unmounting (the finder keeps polling).

**The injected surface (window globals):**

```js
window.__vlCmd({action:'play'|'pause'|'seek'|'rate'|'fullscreen'|
                       'readQuality'|'setQuality'|'readAudio'|'setAudio', ...})
window.__soloCmd({action:'play'|'pause'|'seek', time?})   // lock-screen / notification
window.__vlSetGuest(on)     // hide provider transport controls for a non-controlling guest
window.__vlChromeOff(on)    // hide ALL provider chrome (our overlay takes over)
window.__soloKeepAlive()    // re-play a hidden-tab video (native background hub)
```

RN mirrors these through the imperative `PlayerHandle` (`play/pause/seek/setRate/fullscreen/readQuality/setQuality/readAudio/setAudio`) plus reactive effects that call `__vlSetGuest`/`__vlChromeOff` whenever `hideTransportControls`/`nativeControls` (bound to `playerBound`) change — re-applied when `bound` flips so a prop set before the bridge loaded still lands (an early inject is a harmless no-op).

**The 8 preserved subsystems** in `LEGACY_VIDEASY_BRIDGE`:

1. **Party echo-suppression** — `markApplying()`/`isApplying()` (500 ms). Programmatic `play/pause/seek` are suppressed so our own commands don't echo back as user actions. Deliberately **not** applied to `rate` (the drift engine nudges `playbackRate` every tick; suppressing there swallowed real taps).
2. **Background keepAlive (Android)** — tracks `wasPlaying` (intended play-state, kept in sync by both events and `__vlCmd`); swallows Chromium's hidden-tab `pause` when `document.hidden && wasPlaying` and re-`play()`s on `visibilitychange` and tick.
3. **Lock-screen `__soloCmd`** — drives the video **without** `markApplying`, so a genuine `play/pause/seeked` reaches the sync engine's `handleUserControl` (host pauses room, guest detaches) — a lock-screen button behaves like tapping the web controls.
4. **Guest transport hiding `__vlSetGuest`** — toggles a `<style>` hiding `[class*=mobileCenterControls]`, `#ButtonPlay`, and `[class*=videoSeekBar]` for a non-controlling guest.
5. **Chrome-off `__vlChromeOff`** — hides all videasy chrome so our native overlay is the only control surface; **restored in HTML5 fullscreen** (`fullscreenchange` re-applies) since the RN overlay sits behind the native fullscreen view.
6. **Quality / dub** — videasy's controls aren't hls.js-reachable, so `__vlPointerHit` dispatches a full pointer/mouse event sequence at Radix buttons; `__vlActivateTab` opens the Quality/Servers tab (Radix only renders the active tab) before `readQuality`/`setQuality`/`readAudio`/`setAudio` post `quality`/`audio` events with clean labels.
7. **Fullscreen** — `__vlCmd('fullscreen')` calls `requestFullscreen`/`webkit…`/`moz…` on the `<video>`; `fullscreenchange` posts `enterfullscreen`/`exitfullscreen`.
8. **Videasy control-bar fix** — `__addSt` injects `@media (max-height:480px){div.absolute.bottom-0.h-44{height:auto!important}}` so the fixed 176 px bottom bar stops blanketing the center play/±10 s buttons in the collapsed viewport.

Also present: `window.open = () => null` and a capture-phase click swallow of `a[target=_blank]` (popup/ad blocking), and a one-shot `gesture` post on first `pointerdown`/`touchstart`/`click` — the play-intent signal that gates the no-bind fallback.

**Nav-security gate.** `onShouldStartLoadWithRequest={(req) => isAllowedTopNav(hosts, req)}` ([providerRegistry.ts](components/player/providerRegistry.ts)): sub-resources/media/iframes (`isTopFrame === false`) always pass so the stream loads; top-frame navigations must match `providerHosts(provider)` (the `allowedDomain` host plus `hijack.navHosts`) by exact host or subdomain; `about:`/`data:`/`blob:` pass.

**Failure → fallback.** `onError`/`onHttpError` compare the errored URL to the embed `uri` so constant ad/tracker sub-resource 404s never trigger fallback; only main-frame failures (or `onRenderProcessGone`/`onContentProcessDidTerminate`) call `onFatalError({kind:'http_error'|'render_crash', ...})`. [PlayerScreen.tsx:304](src/screens/PlayerScreen.tsx#L304) reports it once to telemetry and opens the provider fallback sheet. On top of the WebView's own signals, PlayerScreen runs a **Phase-8 no-bind safety net**: 10 s → actionable banner and 25 s → hard fallback, both gated on `userGesturedRef` (play-intent) with no playback started and app focused — so idling on a pre-play/ad gate never pops. A separate stall detector reports `playback_stall` if `currentTime` stops advancing >20 s (token expiry / dead segment).

### 7.3 Why this approach

Native stream-sniffing was **rejected** (see 7.4 and [native-player.md](docs/architecture/native-player.md)): videasy serves HLS behind a deterministic, ephemeral, WAF-gated token — two fresh headless-Chrome sessions resolved the *identical* token, and a URL dead (403) hours later. A native player can't self-heal on token expiry (re-resolve returns the same dead URL), so it can't reliably play a full movie. The WebView runs the provider's own resolver/WAF handshake exactly as intended, so playback just works; the injected bridge is the thin seam that makes an opaque third-party player observable and driveable for room sync. Serving the bridge OTA lets provider-DOM fixes ship without an app-store release.

### 7.4 Alternatives considered & rejected

- **Native `expo-video` fed by a sniffed `.m3u8`** — rejected: deterministic WAF tokens expire and re-resolve identically, so no self-heal; full-length playback unreliable. (A "Re-Sniff Loop"/OMSS hybrid was explored on paper but not adopted.)
- **`@movie-web/providers` / server-side scrapers** — dead/uninstalled; the web player resolves streams the scrapers couldn't.
- **postMessage-only sync (no `<video>` control)** — only videasy exposes play/pause + position; most providers post metadata only, and inbound commands aren't reliably supported. Insufficient to enforce sync.
- **Cross-origin iframe video** — unreachable by same-origin `findVideo`; such providers are marked `supported:false` and are solo-only.
- **RN overlay `Pressable` over the WebView** — intercepts every touch inline (works only in fullscreen where taps escape to the decorView); the old `PlayerControls` overlay was deleted for this reason.

### 7.5 Key files & entry points

- [components/player/HijackPlayer.tsx](components/player/HijackPlayer.tsx) — the WebView + bridge component; `PlayerHandle`, `PlayerEvent`, `FatalError`.
- [components/player/providerRegistry.ts](components/player/providerRegistry.ts) — live provider list, `buildEmbedUrl`, `isAllowedTopNav`, `providerHosts`, `defaultHijackProvider`.
- [components/player/hijackCapabilities.ts](components/player/hijackCapabilities.ts) — per-provider `hijack.supported`, `videoLocation`, `navHosts`, `autoplayParam`, `unstable`.
- [src/scripts/legacy-videasy.ts](src/scripts/legacy-videasy.ts) — the shipped `LEGACY_VIDEASY_BRIDGE` (all 8 subsystems).
- [src/scripts/bridgeCache.ts](src/scripts/bridgeCache.ts) — MMKV cache, `getCachedScript`, `syncScripts`.
- [components/player/backgroundPlayback.ts](components/player/backgroundPlayback.ts) — Android FGS/MediaSession wrapper + `subscribeRemoteCommands` (→ `__soloCmd`); `SOLO_BG_JS` for solo keep-alive.
- [src/store/ConfigBootstrap.tsx](src/store/ConfigBootstrap.tsx) — drives OTA script sync on `/config`.
- [src/screens/PlayerScreen.tsx](src/screens/PlayerScreen.tsx) — host: fatal-error report + fallback, no-bind/stall net, resume-after-switch, fullscreen back interceptor.

### 7.6 Open items / backlog / gotchas

- **Only videasy has an OTA script** (F1 decision, deferred): the other 8 hijackable providers inject nothing post-cutover, so the party badge shows on them but sync doesn't work — videasy-only party until the core+delta refactor.
- **`universal-core.ts` + `videasy.delta.ts`** are a future-refactor skeleton (missing ~8 subsystems), **not shipped**; the legacy monolith ships instead.
- **Same-origin only** — cross-origin iframe providers can never be hijacked by this bridge.
- **Per-provider selectors** — the videasy quality/dub/guest/chrome selectors are DOM-specific; each new provider needs its own probe and CSS/JS (document in `docs/providers/<id>.md`).
- **Echo-suppress `rate` = bug** — never `markApplying()` on rate; the drift engine nudges `playbackRate` constantly.
- **No offline bridge** — first-launch offline leaves providers uncontrollable until `/scripts` syncs.
- **Native features via the WebView** — PiP/AirPlay/background-audio/lock-screen are added around the WebView (not by re-hosting the stream). Background audio relies on the `AlwaysVisibleRNCWebView` visibility hack; party must not set `forceWindowVisible`.
- **Rendering rule** — no blur/elevation on any screen playing video (both blur backends re-capture the WebView every frame → stutter).


## 8. Over-the-air injection scripts (Phase 6) {#ota-scripts}

The WebView hijack bridge is served from the edge and cached on-device rather than baked into the binary, so a broken provider can be fixed without an app-store update — the cat-and-mouse loop.

### 8.1 What it is & responsibilities

Playback is WebView-based: an injected JavaScript "bridge" drives the provider's `<video>` and speaks to React Native over `postMessage`. Before Phase 6 that bridge (`BRIDGE_JS`) was a hardcoded string compiled into the app, so any DOM change on a provider (a renamed Radix tab, a moved `<video>`) meant a full rebuild + store review to fix. Phase 6 moves the *delivery* of that script over-the-air (OTA):

- Supabase `public.providers` carries the compiled script (`bridge_script`) and a content-hash tag (`script_version`).
- The Cloudflare Worker serves the tag in a lean `/config` and the heavy bodies from a separate `/scripts`.
- The app boot-diffs versions, caches bodies in MMKV, and injects the cached copy at WebView mount.
- A publish CLI concatenates → validates → hashes → writes → purges.

Responsibility boundary: this subsystem owns *script transport and caching only*. The bridge's runtime behaviour is unchanged from the proven legacy `BRIDGE_JS`. Provider list, config, and telemetry are siblings — see [Worker & config](#edge-worker) and [Telemetry](#telemetry).

### 8.2 How it works — the real mechanism

**Publish (the gate).** [upload-bridge.ts](scripts/upload-bridge.ts) holds a `SCRIPTS: Record<string, string>` map (currently `{ videasy: LEGACY_VIDEASY_BRIDGE }`). `buildAndValidate(id)` runs the injection string through `new Function(script)` — a strict parse smoke-test. A syntax error would break *every* user on that provider, so a bad string never leaves the machine. On pass it computes `sha256(script).slice(0,8)` and stamps `script_version = \`${id}@${hash}\`` (e.g. `videasy@7ed78cf9`). `upload()` then PATCHes `bridge_script` + `script_version` onto the providers row using the **service-role** key (bypasses RLS; never committed, passed at call time), and POSTs `/cache/purge` so the edge serves the new body immediately.

```bash
SUPABASE_SERVICE_ROLE_KEY=sb_secret_… npx tsx scripts/upload-bridge.ts videasy
npx tsx scripts/upload-bridge.ts videasy --dry-run   # compile + parse only
```

**Serve (two payloads, two cache keys).** [worker/src/supabase.ts](worker/src/supabase.ts) keeps `/config` lean: `getProviders()` selects explicit columns (`id,name,enabled,priority,url_movie,url_tv,allowed_domain,hijack,script_version`) — the ~12 KB `bridge_script` body is deliberately excluded so every launch's `/config` stays small. `getScripts()` (the `GET /scripts` route, [worker/src/index.ts:250](worker/src/index.ts#L250)) selects `id,script_version,bridge_script` filtered `enabled=eq.true & bridge_script=not.is.null`, and returns `ProviderScript[]` of `{ id, version, script }`. Each has its own edge-cache key (`PROVIDERS_CACHE_KEY` vs `SCRIPTS_CACHE_KEY`, 60s), and `purgeProviders()` deletes **both**.

**Boot-diff + cache.** [bridgeCache.ts](src/scripts/bridgeCache.ts) is an MMKV store under key `bridge.scripts.v1` (`Record<providerId, {version, script}>`). [ConfigBootstrap.tsx](src/store/ConfigBootstrap.tsx) mounts high in the tree, subscribes to `useGetConfigQuery()`, and on every `/config` arrival calls `syncScripts(providers.map(p => ({ id, scriptVersion: p.script_version })))`. `syncScripts` diffs the reported versions against the cache; **only if some `scriptVersion` differs** does it `fetch(${WORKER_URL}/scripts)` (8s `AbortController` timeout), then merges bodies into the cache. The common warm launch fetches nothing. `EXPO_PUBLIC_WORKER_URL` is the base URL.

**Inject.** [HijackPlayer.tsx:272](components/player/HijackPlayer.tsx#L272) sets `injectedJavaScriptBeforeContentLoaded={getCachedScript(providerId) ?? ""}` — a synchronous MMKV read at document-start. `getCachedVersion()` feeds the `scriptVersion` field on `/report` telemetry.

The end-to-end loop (fix a provider with no rebuild): edit the source string → re-run the CLI (new hash) → cold-launch → `/config` reports the new `script_version` → boot-diff fetches `/scripts` → re-caches → injects. Verified on-device.

### 8.3 Why this approach

Two constraints shaped it. First, **cat-and-mouse**: providers change their DOM unpredictably; a bundled bridge means a multi-day store round-trip per break, unacceptable. OTA delivery makes a fix a `tsx` command. Second, **safety of a shared string**: because one Supabase cell now drives all users of a provider, a malformed script is catastrophic — hence the `new Function()` parse gate as a hard precondition to upload, and the content-hash version that makes staleness detectable and telemetry-traceable. Splitting `/config` (lean, every launch) from `/scripts` (heavy, only on change) keeps the hot path cheap.

**Option 1 (serve the proven bridge verbatim)** was chosen over shipping the clean rewrite. A red-team pass found the legacy `BRIDGE_JS` implements **8 subsystems** the clean `universal-core` skeleton still lacks: watch-party echo-suppression (`markApplying`/`wasPlaying`), background `keepAlive` (Chromium hidden-pause defeat), lock-screen `__soloCmd`, guest transport hiding `__vlSetGuest`, native-controls chrome `__vlChromeOff`, iframe-walking `findVideo` (vixsrc), fullscreen emit, and the videasy control-bar CSS fix. Changing execution logic *and* delivery at once would silently regress party/background playback. So `BRIDGE_JS` was moved **byte-for-byte** to [legacy-videasy.ts](src/scripts/legacy-videasy.ts) (not imported by the app → not bundled/decompilable; only the CLI reads it) and served as `videasy@<hash>`.

### 8.4 Alternatives considered & rejected

- **Ship the clean `universal-core` + `videasy.delta` split now** — the skeleton ([universal-core.ts](src/scripts/universal-core.ts), [videasy.delta.ts](src/scripts/videasy.delta.ts)) lacks the 8 subsystems above and uses a new event contract (`ready`/`timeupdate`/`state`) the RN `onMessage` handler doesn't yet key on. Shipping it = silent regression. Kept in-repo as the future-refactor baseline.
- **Keep the bridge bundled** — every provider DOM break needs a store-review rebuild; the whole point of Phase 6 is to escape that.
- **Ship a bundled fallback script** — rejected to preserve the deliberate store-review killswitch (empty config ⇒ empty app; see [Worker & config](#edge-worker)). A bundled bridge would keep a provider hijack-controllable exactly when the operator wanted the app dark. Trade-off: first-ever launch offline ⇒ no cached script ⇒ that provider loads without control (no crash).
- **Put `bridge_script` in `/config`** — would bloat every launch with a ~12 KB body per provider; instead it lives in `/scripts`, fetched only on a version diff.
- **Skip the `new Function()` gate** — one syntax error in Supabase would break every user on that provider with no local catch; the gate makes a bad string un-shippable.

### 8.5 Key files & entry points

- [scripts/upload-bridge.ts](scripts/upload-bridge.ts) — publish CLI: concat → `new Function()` validate → content-hash `script_version` → service-role PATCH → `/cache/purge`. `SCRIPTS` map = what ships.
- [src/scripts/legacy-videasy.ts](src/scripts/legacy-videasy.ts) — the proven `BRIDGE_JS` moved verbatim; `LEGACY_VIDEASY_ID`, `LEGACY_VIDEASY_BRIDGE`. Not app-imported.
- [src/scripts/bridgeCache.ts](src/scripts/bridgeCache.ts) — MMKV cache (`bridge.scripts.v1`); `syncScripts`, `getCachedScript`, `getCachedVersion`.
- [src/store/ConfigBootstrap.tsx](src/store/ConfigBootstrap.tsx) — drives the boot-diff on every `/config`.
- [components/player/HijackPlayer.tsx](components/player/HijackPlayer.tsx#L272) — injects the cached script at `injectedJavaScriptBeforeContentLoaded`.
- [worker/src/supabase.ts](worker/src/supabase.ts) — `getProviders` (lean), `getScripts`, `purgeProviders`; dual cache keys.
- [worker/src/index.ts](worker/src/index.ts#L232) — `GET /scripts` route + `/cache/purge`.
- [supabase/migrations/20260820113012_providers_bridge_scripts.sql](supabase/migrations/20260820113012_providers_bridge_scripts.sql) — adds `bridge_script`, `script_version`.
- [src/scripts/universal-core.ts](src/scripts/universal-core.ts) / [src/scripts/videasy.delta.ts](src/scripts/videasy.delta.ts) — future core+delta refactor skeleton (not shipped).

### 8.6 Open items / backlog / gotchas

- **F1 (DECIDED 2026-08-20 = DEFER): only videasy is served.** `/scripts` serves `videasy@<hash>` alone, so the other 8 hijackable providers (VidFast, VixSrc, VidLink, VidCore, 111Movies, VidNest, VidPhantom, MyCineBy) inject `""` — no bind, no party sync, no background/lock-screen. Pre-cutover `BRIDGE_JS` was injected into *every* provider ([8e0412f HijackPlayer:518]). Accepted: videasy-only party until the core+delta refactor.
- **The 🐾 party badge lies.** It still shows on the 8 script-less providers, so a user can host a party there that silently never syncs; `gesture`/`no_bind` telemetry is blind on them (gesture detection lives in the bridge). A ~1-line honesty fix — gate the badge on `script_version != null` — was offered but not taken.
- **No bundled fallback.** First-ever launch offline ⇒ no cached script ⇒ provider is uncontrollable (by design; no crash). Accepted trade for the killswitch.
- **Must re-run the CLI after any script edit** — the app boot-diffs the version; an un-uploaded edit ships nothing.
- **The refactor debt** in `universal-core`: the deferred event-rename (`timeupdate`/`state` vs the legacy `tick`/`playing`/`pause`) and folding echo-suppression into `np.cmd` belong to the clean rewrite, not Option 1.
- **Selector rot is invisible from RN.** A videasy DOM change breaks playback with no crash; verify at the WebView layer (CDP / Playwright) per [docs/qa/phase6-cutover-qa.md](docs/qa/phase6-cutover-qa.md) Suite A0.


## 9. Telemetry & failure memory (Phases 7-8) {#telemetry}

The app fire-and-forgets one playback-outcome report per provider session to the edge worker, which writes it — service-role-only — into an RLS-locked Supabase table that a distinct-client-weighted 24h view turns into a failure *rate*, so dying streaming providers are measured instead of guessed.

### 9.1 What it is & responsibilities

Two cooperating phases:

- **Phase 7 — ingestion + aggregation.** A `POST /report` route on the Cloudflare worker, a write-only `public.provider_reports` table, and a `public.provider_health` view that computes the rolling-24h failure rate per provider. The client wires the two outcomes it can prove without a WebView error surface: `success` (sustained playback) and `manual_switch` (leaving a bound provider for another).
- **Phase 8 — the failure safety net.** Client-side detectors in [PlayerScreen.tsx](src/screens/PlayerScreen.tsx) that turn otherwise-silent playback failures (never bound, main-frame HTTP/render death, mid-stream stall) into precise `no_bind` / `http_error` / `render_crash` / `playback_stall` reports *and* an actionable "try another source" fallback UI — gated hard so they never fire on a guess and poison the denominator.

Non-responsibilities: telemetry must never affect playback. Every write is best-effort; the worker returns `202` regardless of whether the DB insert succeeds (see [§9.3](#telemetry)).

### 9.2 How it works — mechanism & data flow

**Client → `POST /report`.** The report shape is `ReportArgs` in [worker.types.ts](src/types/worker.types.ts), sent via the RTK Query `reportOutcome` mutation in [workerApi.ts](src/store/services/workerApi.ts#L68) (no cache tags — pure side-effect). A single `report()` callback in [PlayerScreen.tsx:269](src/screens/PlayerScreen.tsx#L269) stamps every call with `providerId`, `tmdbId`, `mediaType`, `platform` (`Platform.OS`), `appVersion` (`Constants.expoConfig?.version`), and crucially `scriptVersion` (`selected.scriptVersion`) — the version tag of the OTA injection bridge that was live, so old-script failures separate cleanly from post-fix ones (see [OTA scripts](#ota-scripts)). `country` and client id are **not** sent — they are derived server-side.

**The outcome enum** (`ReportOutcome`, mirrored in the table `check` and the worker Zod `ReportOutcome`):
`success · no_bind · http_error · render_crash · captcha_block · playback_stall · not_found · manual_switch`.
`success` is the denominator; `not_found` is a per-title catalog gap (not ill-health); `manual_switch` is a weak negative; `playback_stall` = bound then died mid-stream.

**Worker route** ([index.ts:285](worker/src/index.ts#L285)):
1. Reads `cf-connecting-ip` as the rate-limit key and (hashed) the distinct-client id — the raw IP is never stored.
2. Per-IP rate limit via the `REPORT_LIMITER` binding (`wrangler.toml [[ratelimits]]`, `simple = { limit = 30, period = 60 }`); a `429` if exceeded, but it degrades gracefully — if the binding is absent the gate is skipped, because IP keys are coarse on mobile NAT and distinct-client weighting is the real defense.
3. Derives trusted geo from `request.cf.country` and `client_hash` from `hashIp()` (SHA-256 of the IP, truncated to 32 hex chars, [supabase.ts:235](worker/src/supabase.ts#L235)).
4. Inserts via `ctx.waitUntil(insertReport(...))` and immediately returns `202` — a fire-and-forget write that can't delay or break the client.

**`insertReport()`** ([supabase.ts:207](worker/src/supabase.ts#L207)) POSTs to `/rest/v1/provider_reports` using **`SUPABASE_SERVICE_ROLE_KEY`** — a distinct worker secret, *not* the publishable/anon key used for `/config` reads. The table has RLS on with **no policies**, so the anon key is hard-blocked (proven live: an anon insert returns Postgres `42501` permission-denied). Service-role is the only path in.

**The table & view** ([20260820101449_provider_reports_telemetry.sql](supabase/migrations/20260820101449_provider_reports_telemetry.sql)): columns include the enum-checked `outcome`, `time_to_fail_ms` (0ms = never bound vs ~20min = token-expiry stall — very different weights), `script_version`, `error_message` (untrusted, capped at 300 chars client-side, stored as-is, never rendered/executed), server-derived `country` + `client_hash`. `provider_health` computes:

```sql
failure_rate = hard_failures
  / nullif(successes + hard_failures, 0)   -- success is the denominator
```

where `hard_failures` = `no_bind|http_error|render_crash|captcha_block|playback_stall`, plus `count(distinct client_hash) as distinct_clients` so one spammer can't tank a provider. `not_found` and `manual_switch` are surfaced separately and excluded from the numerator.

**Phase-8 client detectors** (all keyed off `selected?.id, season, ep`, reset together in the effect at [PlayerScreen.tsx:138](src/screens/PlayerScreen.tsx#L138)) hang off **two independent locks per provider session**:

- `initialOutcomeRef` — the *startup* verdict: `success` XOR a startup failure XOR `manual_switch`, fired at most once.
- `stallReportedRef` — a *mid-stream* death (`playback_stall`), which MUST be able to fire **even after** a `success` (a stream that played 30s then died at 20min on token expiry is the single most valuable signal).

Signals feeding them:
- **`success`** — in `onEvent`, once `currentTime >= 30` ([PlayerScreen.tsx:383](src/screens/PlayerScreen.tsx#L383)). 30s sustained playback = the denominator.
- **`no_bind`** — a two-timer effect ([PlayerScreen.tsx:173](src/screens/PlayerScreen.tsx#L173)) counting from mount: **10s** → soft actionable banner, **25s** → hard `no_bind` report + fallback. Both are gated on `userGesturedRef` (a real interaction inside the WebView = play-intent) and `!anyPlaybackRef` and `focusedRef`, so idling at the provider's pre-play/ad gate never fires. The `gesture` player event sets `userGesturedRef` ([PlayerScreen.tsx:341](src/screens/PlayerScreen.tsx#L341)).
- **`http_error` / `render_crash`** — `onFatalError` ([PlayerScreen.tsx:304](src/screens/PlayerScreen.tsx#L304)) receives a `FatalError { kind }` from the WebView main-frame handlers (`onHttpError` / `onRenderProcessGone` / `onContentProcessDidTerminate` in [HijackPlayer.tsx](components/player/HijackPlayer.tsx#L280)); `info.kind` *is* the outcome, reported with `errorMessage` + `timeToFailMs`.
- **`playback_stall`** — a 5s-interval detector ([PlayerScreen.tsx:204](src/screens/PlayerScreen.tsx#L204)): while bound, playing, and focused, if `currentTime` hasn't advanced for >20s, report once via `stallReportedRef` and raise the banner. `lastProgressTsRef` is bumped in `onEvent` whenever `currentTime` moves forward.
- **`manual_switch`** — `onSelectProvider` ([PlayerScreen.tsx:475](src/screens/PlayerScreen.tsx#L475)) reports the **OLD** provider (before the switch), once, only if it was bound.

**Session exclusion list.** A failed provider is pushed onto `excludedIds` in `triggerFallback()` ([PlayerScreen.tsx:295](src/screens/PlayerScreen.tsx#L295)) and passed as `excludeIds` to `<ProviderSheet>`, so the fallback picker never loops back to a corpse.

### 9.3 Why this approach

- **Failure *rate*, not raw count.** Providers degrade unevenly by title/region; an absolute error count is meaningless without the denominator, so `success` is a first-class reported outcome and the health view divides by `successes + hard_failures`.
- **Distinct-client weighting.** A single abusive client (or a NAT'd office) shouldn't be able to condemn a provider, so the view counts distinct `client_hash` values — the structural anti-poisoning defense, above the coarse per-IP rate limit.
- **Service-role-only writes.** The table is a trust boundary. If clients could write it directly, the health signal that drives fallback ordering would be trivially forgeable; RLS-with-no-policies + a server-held service-role key makes the worker the sole writer, and geo/client-id are server-derived so the client can't lie about them either.
- **Fire-and-forget, best-effort.** Telemetry is strictly subordinate to playback: `ctx.waitUntil` + unconditional `202` guarantee a slow or failing Supabase never stalls or errors the player.
- **Don't report on a guess.** Every Phase-8 detector is gated (gesture-intent, focus, actual-playback, one-shot locks) precisely because a false `no_bind` or `manual_switch` inflates `hard_failures` and corrupts every downstream decision.

### 9.4 Alternatives considered & rejected

- **Client writes Supabase directly (anon/publishable key)** — the anon key is RLS-blocked by design (live `42501`); direct writes would also be unauthenticated and forgeable, poisoning the very signal. Rejected for the worker-mediated service-role path.
- **Raw failure counts / thresholds** — one spammer or one bad title tanks a provider; replaced by a rate over distinct clients.
- **Trusting client-supplied `country` / client id** — trivially spoofable; derived server-side from `request.cf` + hashed IP instead. The Zod schema deliberately omits them.
- **Storing the raw client IP** — privacy; only a truncated SHA-256 hash is kept, sufficient for distinct-client counting.
- **Blocking/awaiting the insert before responding** — would let telemetry stall playback; rejected for `waitUntil` + `202`.
- **Firing failure outcomes eagerly (on any non-play event)** — poisons the denominator; rejected for gesture/focus/one-shot-gated detectors that only fire on proven failure.
- **A single outcome lock per session** — would swallow a mid-stream stall that follows an early `success`; split into `initialOutcomeRef` + `stallReportedRef`.

### 9.5 Key files & entry points

- [worker/src/index.ts](worker/src/index.ts#L285) — `POST /report` route: rate-limit, geo/hash derivation, `waitUntil` insert, `202`.
- [worker/src/supabase.ts](worker/src/supabase.ts#L207) — `insertReport()` (service-role write) + `hashIp()`.
- [worker/src/schemas.ts](worker/src/schemas.ts#L206) — `ReportRequestSchema` / `ReportAcceptedSchema` (OpenAPI + validation; note that `country`/client id are excluded).
- `worker/wrangler.toml` — `[[ratelimits]]` `REPORT_LIMITER` (`limit 30 / 60s`); secret `SUPABASE_SERVICE_ROLE_KEY`.
- [supabase/migrations/20260820101449_provider_reports_telemetry.sql](supabase/migrations/20260820101449_provider_reports_telemetry.sql) — `provider_reports` table (RLS on, no policies) + `provider_health` view.
- [src/store/services/workerApi.ts](src/store/services/workerApi.ts#L68) — `reportOutcome` RTK Query mutation.
- [src/types/worker.types.ts](src/types/worker.types.ts#L78) — `ReportOutcome` + `ReportArgs`.
- [src/screens/PlayerScreen.tsx](src/screens/PlayerScreen.tsx#L269) — `report()`, the two ref locks, and all Phase-8 detectors/fallback UI.
- [components/player/HijackPlayer.tsx](components/player/HijackPlayer.tsx#L51) — `FatalError` + the WebView main-frame error handlers.

### 9.6 Open items / backlog / gotchas

- **The 202-on-silent-drop trap.** Because a failed insert still returns `202`, a misconfigured worker (wrong/missing `SUPABASE_SERVICE_ROLE_KEY`) looks perfectly healthy while storing *nothing*. Verify writes by querying the table, not by the HTTP status. This was proven during Phase 7 via the deliberate `42501` anon-insert test.
- **`captcha_block` has no client call-site yet.** It exists in the enum, table check, and health numerator, but no Phase-8 detector emits it — captcha/interstitial detection inside the WebView is unbuilt.
- **`videasy`-only coverage.** Post Phase-6 cutover only `videasy` has an OTA bridge, so `scriptVersion` is populated (and bind/success/stall signals are meaningful) only there; the other 8 hijackable providers inject nothing and won't produce clean bind telemetry until the core+delta refactor (see [OTA scripts](#ota-scripts)).
- **No consumer of `provider_health` yet.** The view exists but nothing reads it back to *order* providers or auto-disable a sick one — fallback today is user-driven (the banner + exclusion list). Automated health-driven provider ordering is deferred.
- **`REPORT_LIMITER` is best-effort.** If the ratelimit binding is unset the per-IP gate silently no-ops; distinct-client weighting in the view is the real backstop.
- **iOS/web telemetry is nominal only.** The platform enum accepts all three, but the Phase-8 detectors and the player are Android-first.


## 10. Player UX, silent memory & the safety net {#player-ux}

How the solo player feels instant, remembers the viewer's taste without ever nagging them, and refuses to strand them on a dead source — plus the four session fixes that make switches and exits behave.

### 10.1 What it is & responsibilities

[PlayerScreen.tsx](src/screens/PlayerScreen.tsx) is the SOLO playback surface, and it is the *same* native stack the watch party uses — [HijackPlayer](components/player/HijackPlayer.tsx) (a WebView with an injected JS bridge that binds the provider's `<video>`), the Bearoom-skinned [PlayerControls](components/player/PlayerControls.tsx) overlay, [PlayerSettingsSheet](components/player/PlayerSettingsSheet.tsx), [EpisodeSheet](components/player/EpisodeSheet.tsx), and [ProviderSheet](components/player/ProviderSheet.tsx) — driven *locally* instead of by a room authority. Its jobs: start playback with zero perceived wait; apply the viewer's saved audio/quality invisibly; drive fullscreen/rotation; keep the fallback [Telemetry](#telemetry) signals fed; and never lose the user to an accidental back-press or a corpse provider.

### 10.2 How it works — the real mechanism

**Zero-wait Play.** There is no `/scrape` trip on the play path. [providerRegistry.buildEmbedUrl()](components/player/providerRegistry.ts) fills a client-side URL template (`${id}/${season}/${episode}`) synchronously, and [HijackPlayer](components/player/HijackPlayer.tsx#L243) hands that straight to the WebView `source={{ uri }}`. The DOM-hijack script is already in MMKV — `getCachedScript(providerId)` feeds `injectedJavaScriptBeforeContentLoaded` — so nothing blocks on the network before the provider page loads. The worker `/scrape` route exists but is off the hot path.

**Silent memory.** Prefs live in MMKV via [prefs.ts](utils/prefs.ts): `getPreferredAudio`/`setPreferredAudio`, `getPreferredQuality`/`setPreferredQuality`, `getDataSaver`. When the user hand-picks in the settings sheet, the handler persists first (`setPreferredQuality(label)`) then applies. On the *next* stream, [PlayerScreen.tsx:159](src/screens/PlayerScreen.tsx#L159) passively kicks `playerRef.current?.readQuality()` (900 ms) and `readAudio()` (1600 ms) once bound — the user never opens settings. The bridge answers via `onEvent`, and the pref is resolved through [trackMatch.ts](utils/trackMatch.ts):

- `matchAudio(pref, tracks)` canonicalizes each label through a **curated synonym map** (`LANG_SYNONYMS`: `hi → ["hindi","hin"]`, …) plus a word-boundary 2-letter ISO fallback — deliberately **NOT Levenshtein**, because edit-distance collapses the exact short codes we care about (`hi↔de = 2`, `en↔es = 1`).
- `matchQuality(pref, tracks, {dataSaver})` parses a vertical height (`parseHeight`: `FHD/1080 → 1080`, `Auto → null`) and picks the highest rung **at or below** the cap; a `dataSaver` cap of `480` applies **only when no explicit pref exists**, and when nothing qualifies it leaves the provider on adaptive Auto rather than forcing one high rung.

Application is doubly guarded: `if (ql && !q.find((t) => t.label === ql)?.active) applyQuality(ql)` — a pref already active causes no re-buffer, and a provider lacking the language/rung silently no-ops.

**The safety net (Phase 8).** Two independent timers count from provider mount ([PlayerScreen.tsx:173](src/screens/PlayerScreen.tsx#L173)): a **10 s soft banner** and a **25 s hard fallback**, both gated on `userGesturedRef` (a WebView gesture = play-intent). A separate 5 s interval detects a **mid-stream stall** (currentTime frozen >20 s while playing) and reports `playback_stall` independent of an earlier `success`. `triggerFallback()` adds the dead provider to `excludedIds` and opens the ProviderSheet so it can never re-offer the corpse. See [Telemetry](#telemetry) for `no_bind`/`playback_stall`/`manual_switch`/`success` outcomes.

**Error recovery & resilience (latest).** A *fatal* WebView error is now handled in [HijackPlayer](components/player/HijackPlayer.tsx) itself: it covers the raw `net::ERR` page with a branded overlay (**Retry** / **Try another source**) and **auto-retries** with backoff (5/10/15 s, capped at 3) plus on `AppState` 'active' — self-healing a transient outage without a NetInfo dependency (which would force a native rebuild). `onFatalError` is now report-only; the overlay's "Try another source" calls `triggerFallback` (exclude + open the picker), and a successful reload after an error fires `onRecovered` so PlayerScreen **un-excludes** the provider. Recently-failed providers are no longer hidden from the [ProviderSheet](components/player/ProviderSheet.tsx) — they sink dimmed to the bottom ("Recently failed · tap to retry") and stay pickable, so failures are recoverable rather than dead-until-remount. Two more resilience wins shipped alongside: **per-title failure memory** ([failureMemory.ts](utils/failureMemory.ts), MMKV 4 h TTL) biases the default source away from a provider that recently failed for *this* title (cross-session), and the worker's **health-aware ordering** demotes chronically-failing providers in `/config`. See [Decision log #39–#43](#decision-log).

**This session's four fixes.**

1. **Resume-seek after a switch.** A dub/quality/provider switch makes the provider reload from 0:00. `armResume()` ([PlayerScreen.tsx:327](src/screens/PlayerScreen.tsx#L327)) snapshots `posRef` into `resumeSeekRef = { at, until: Date.now()+12000 }` — but only if `at > 8`. `applyAudio`/`applyQuality`/`onSelectProvider` all arm it. In `onEvent`, once the reloaded stream is playable (`playing`/`canplay`/`readyState≥3`) **and has visibly restarted** (`currentTime < at-2`), it seeks back once and clears. The `>8` start-threshold plus `<at-2` restart-check plus 12 s expiry mean it can *never* fire on an ordinary buffer or a position-preserving switch. App-layer only — the OTA legacy bridge is untouched.

2. **Gesture-gated soft banner.** The 10 s banner now fires only `if (!playerBound && userGesturedRef.current)` — the `gesture` event sets `userGesturedRef`. Previously it popped while the user idled at the provider's pre-play/ad gate, which is normal, not a failure.

3. **Hardware-back exits fullscreen first.** [useMediaCloseGuard](hooks/useMediaCloseGuard.ts) gained a `beforeClose?: () => boolean` interceptor, read live per press. `backInterceptRef` is re-assigned every render ([PlayerScreen.tsx:454](src/screens/PlayerScreen.tsx#L454)): in fullscreen it calls `toggleFullscreen()` and returns `true` (handled, no confirm); otherwise `false` → the "Stop watching?" `bearAlert`. This mirrors the overlay back button so hardware back never skips a step.

4. **ProviderSheet dismiss-race.** A `present()` fired while `@gorhom/bottom-sheet` is mid-dismiss (pick → instant-fail) is swallowed. `presentSheet()` arms `pendingPresentRef.current = true`; the sheet's `onDismiss` flushes it (`sheetRef.current?.present()` once fully closed) and `onChange(index>=0)` clears it when the sheet actually opens ([PlayerScreen.tsx:647](src/screens/PlayerScreen.tsx#L647)).

### 10.3 Why this approach

Streaming is cat-and-mouse: providers rename tracks, expire tokens mid-stream, and 8 of 9 hijackable sources currently inject nothing. So every mechanism here is **best-effort and non-blocking** — silent memory *never* guesses wrong or blocks Play, the banner *never* auto-navigates, and the resume-seek is fenced so many ways it cannot misfire. Persisting the manual pick *before* applying it means a crash mid-switch still keeps the user's taste. Solo reusing the party's exact player kills a whole class of "works in party, broken solo" drift.

### 10.4 Alternatives considered & rejected

- **Levenshtein / edit-distance track matching** — mis-matches the short ISO codes that matter (`en↔es = 1`); curated synonyms + containment are exact where it counts.
- **A `/scrape` round-trip before Play** — adds a visible network wait; client-side `buildEmbedUrl` + MMKV-cached bridge is instant.
- **Auto-jumping to the next source on timeout** — hostile if the user is mid-ad-gate; the gesture-gated banner lets *them* choose.
- **Popping settings to apply a saved pref** — defeats "silent"; passive `readQuality`/`readAudio` + guarded auto-apply keeps it invisible.
- **A single close confirm with no fullscreen step** — hardware back would skip straight past fullscreen; the `beforeClose` interceptor makes back contextual.
- **Retrying the swallowed `present()` on a timer** — races the animation; keying off the sheet's own `onDismiss`/`onChange` is deterministic.
- **Live-blur sheet/overlay backgrounds** — device-proven to re-sample the video every frame and stutter it; all sheets use a solid `SheetBackground`, controls use `GlassCard blur={false}`.

### 10.5 Key files & entry points

- [src/screens/PlayerScreen.tsx](src/screens/PlayerScreen.tsx) — orchestrates the whole solo surface; owns all four fixes, resume-seek, silent-memory wiring, safety-net timers.
- [utils/prefs.ts](utils/prefs.ts) — MMKV pref getters/setters (`Audio`, `Quality`, `DataSaver`, `AutoplayNext`).
- [utils/trackMatch.ts](utils/trackMatch.ts) — `matchAudio`, `matchQuality`, `canonLang`, `parseHeight`.
- [hooks/useMediaCloseGuard.ts](hooks/useMediaCloseGuard.ts) — hardware-back close guard + `beforeClose` interceptor.
- [components/player/ProviderSheet.tsx](components/player/ProviderSheet.tsx) — source picker; `onDismiss`/`onChange`/`excludeIds`.
- [components/player/PlayerControls.tsx](components/player/PlayerControls.tsx) — overlay, scrubber commit-hold, buffering spinner.
- [components/player/PlayerSettingsSheet.tsx](components/player/PlayerSettingsSheet.tsx) — speed/audio/quality; persists picks.
- [components/player/EpisodeSheet.tsx](components/player/EpisodeSheet.tsx) — season/episode switcher (TMDB-preloaded).
- [components/player/providerRegistry.ts](components/player/providerRegistry.ts) — `buildEmbedUrl`, `isHijackable`, `isUnstable`.

### 10.6 Open items / backlog / gotchas

- **`autoplayNext` pref is stored but unused** — `getAutoplayNext()` has no consumer in the player yet; the "autoplay next episode" flow is not wired.
- **Non-videasy party lie** — 8 hijackable providers still inject no OTA script; the party badge shows on them (accepted, deferred to the core+delta refactor).
- **Solo-vs-party unification / RN-level rotation** — the smooth transform-based rotation + one-controls-layer work from `player-controls-unification.md` is *not* built; today fullscreen uses OS `ScreenOrientation.lockAsync` masked by a fade cover. `expo-sensors` is not installed (`hooks/useDeviceOrientationSensor.ts` orphaned).
- **Provider fallback ranking / per-media failure memory** — `excludedIds` is session-scoped only; no persisted per-title failure memory yet (queued follow-up).
- **iOS back** — the close guard is Android-only (`BackHandler`); iOS swipe-back needs `beforeRemove` when iOS is stood up.
- **Gotcha:** resume-seek is app-layer and fenced to `at > 8` and `currentTime < at-2` — deliberately conservative; a switch under 8 s in will restart at 0:00 by design.


## 11. Watch party (synced playback) {#watch-party}

Bearoom's watch party keeps everyone in a room on the **same frame at the same time**, driven by a leased host and a Postgres-authoritative timeline anchor, layered with an ephemeral chat/reactions surface — all rendered through the very same WebView `HijackPlayer` used for solo playback.

### 11.1 What it is & responsibilities

One `Party` screen ([PartyScreen.tsx](src/screens/PartyScreen.tsx)) serves both host and guest (chosen by the `role` nav param). It owns: room lifecycle (create/join/leave, reclaim), rendering the room's media through `HijackPlayer`, forwarding player events to the sync engine, exposing host transport + admin (approve/kick/permissions/transfer/grab), and a self-contained social layer (chat, GIF/sticker, floating reactions, media-timestamp seek links). Playback authority, membership guard, and lease/election live entirely in Postgres RPCs; the client is a thin pilot. **Today the timeline is only truly synced on the `videasy` provider** — the F1 defer (see §11.6).

### 11.2 How it works — the real mechanism

**Entry.** A host launches from a details/player screen: [MovieDetailsScreen.tsx:143](src/screens/MovieDetailsScreen.tsx#L143) `handleWatchTogether` and [PlayerScreen.tsx:463](src/screens/PlayerScreen.tsx#L463) `startWatchParty` both call `openPartyHost({ role:"host", room: genRoomCode(), provider, id, type, season?, ep?, title })` ([actions.ts:35](src/navigation/actions.ts#L35)). `genRoomCode()` ([roomCode.ts](utils/roomCode.ts)) picks 6 chars from an ambiguity-free alphabet (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`). A guest reaches [JoinPartyScreen.tsx](src/screens/JoinPartyScreen.tsx), types a code (`normalizeRoomCode`, 4–8 chars), and `navigation.replace("Party", { role:"guest", room })`. On the host, nav params become the room's `hostMedia` (`PartyMedia`: `tmdbId/type/season/episode/title/providerId`); a guest passes no media and receives it from the snapshot.

**Authority = Postgres single writer.** `PartyScreen` calls `useParty()` ([useParty.ts](services/party/useParty.ts)), which wires a `PartyClient` (transport/authority) and a `PartySyncEngine` (local pilot), documented in depth in [Watch-Party Authority](docs/architecture/watch-party-sync.md). Every mutation is a `SECURITY DEFINER` RPC that does `SELECT … FOR UPDATE` on the room row, bumps `seq`, re-anchors, and returns the canonical `party_snapshot(code)`. Two RLS tables (`party_rooms`, `party_members`) are **SELECT-only**; there are **no write policies** — writes exist only as RPCs granted to `authenticated`. Playback is a **timeline anchor**, not a ticking position:

```ts
function effectivePositionMs(a, serverNowMs) {   // protocol.ts
  if (a.status === "paused") return a.positionMs;
  return Math.max(0, a.positionMs + (serverNowMs - a.anchorServerTimeMs) * a.rate);
}
```

`epoch` = leadership generation (bumped only on host change), `seq` = command order; the client applies snapshots **newest-wins** by `(epoch, seq)` (accepting equal `seq` so a heartbeat re-anchors). Supabase **Realtime broadcast** (`party:<code>` channel, event `"snap"`, `self:false`) is a fan-out hint only; the RPC return is the truth. `PartyClient.pingClock` estimates a min-RTT-filtered offset to `party_server_time()` so "server now" is locally computable.

**Sync authority — host drives, guests follow.** `PartySyncEngine` ([PartySyncEngine.ts](services/party/PartySyncEngine.ts)) has two jobs: `setAnchor()` applies an anchor (only when `${epoch}:${seq}` changed) via a **redundant-seek guard** (`|lastCt − target| > 1.5s`) plus rate-nudge / hard-seek drift correction on `tick`; and `handleUserControl()` routes genuine `play`/`pause`/`seeked`. Host mirrors to the authority (`client.play/pause/seek`); a **guest pause detaches** (stops following), a guest play while detached `jumpToLive()`, and **guest scrubs are ignored**. `useParty.onPlayerEvent` also calls `client.renewLeaseIfDue()` on every `tick`, so an actively-playing host keeps its lease alive even backgrounded.

**Guest transport hidden.** The player bridge exposes `window.__vlSetGuest(on)` (injected via `HijackPlayer`'s `hideTransportControls` prop, [HijackPlayer.tsx:190](components/player/HijackPlayer.tsx#L190)) to CSS-hide the provider's seek bar / play-pause / ±10s for non-controllers — selectors defined in [legacy-videasy.ts:227](src/scripts/legacy-videasy.ts#L227). In the party, `PartyScreen` additionally passes `nativeControls={playerBound}` → `__vlChromeOff` to hide **all** provider chrome once the `<video>` binds, so the RN `PlayerControls` overlay (gated on `canControl={canSeek}`) is the only surface.

**Echo-suppression.** The engine drives `play/pause/seek/setRate` almost every tick; the *player* (not the engine) must suppress the resulting echoed events (`HijackPlayer`'s `markApplying`, ~500ms) so they aren't misread as user actions — otherwise guests detach on every anchor and hosts echo RPCs back to the server.

**Lease & failover.** The host is a **6s lease**, renewed every 2s (`LEASE_RENEW_INTERVAL_MS`) plus implicitly on each mutation. Guests run an election in `PartyClient.checkHost` (watchdog 1.5s): if the lease lapsed or the last snap is stale (>7s), rank by `joined_at` and `party_claim_host` at `rank*700ms` backoff — the row lock guarantees one winner and bumps `epoch`. `party_transfer_host` (host → member), `party_grab_control` (guest self-takeover, gated on `guestControlDefault` + approved), and `party_create`'s reclaim path all bump `epoch` and re-anchor.

**Membership guard & creator reclaim.** Migration [0005](supabase/migrations/0005_party_create_membership_guard.sql) closed a hole where `party_create`'s `ON CONFLICT` reclaim let a non-member who knew the code seize host of a locked/password room during a lease gap; it now requires approved membership (also hardening `party_claim_host`). Migration [0006](supabase/migrations/0006_party_create_creator_reclaim.sql) fixes the regression that broke legitimate host *reconnect* (since `party_leave` deletes membership) by also allowing the original `created_by` creator to reclaim a **free** host slot. `approveGuests` inserts new guests `approved=false` into a waiting room; the UI shows "Waiting for the host to let you in…".

**Chat, GIF/sticker, reactions.** `usePartyChat` ([usePartyChat.ts](services/party/usePartyChat.ts)) runs on a **separate** `party-chat:<code>` broadcast channel so a chat storm can never perturb sync. It is **ephemeral** (nothing persisted; buffer capped at last 200), `self:false` with optimistic local echo. GIFs/stickers come from **KLIPY called directly from the device** (proxying is ToS-forbidden), via [GifPicker.tsx](components/party/GifPicker.tsx) → `chat.sendGif(g, k==="stickers")`. Floating emoji (`QUICK_REACTIONS`) animate over 2800ms. The headline **media-timestamp** feature isn't a message field — `TS_RE`/`parseClock` make inline tokens like `1:27` tappable; `seekToMoment` routes controllers through `party.seekTo` (moves the whole room) and spectators to a local `playerRef.seek`. Full detail in [Chat & Reactions](docs/architecture/chat-and-reactions.md).

**Presence/avatars.** Member avatars (`BearAvatar`, host-ringed) come from `snap.members`, not chat; `AvatarStack` caps at 4 with an overflow bubble. Realtime presence is keyed by `userId`.

**Same player as solo.** `PartyScreen` renders the identical `HijackPlayer` (`ref`, `providerId`, `tmdbId/type/season/episode`, `onPlayerEvent`, `onBound`, `nativeControls`) — the RN overlay `PlayerControls` mounts **only after `onBound`** (past videasy's pre-play gate), and background-audio/lock-screen (`startBackgroundPlaybackSession`) is shared with solo (see [Player & injection](#player-bridge)).

### 11.3 Why this approach

- **Anchor, not tick-streaming:** streaming positions over the wire drifts and floods; an anchor + shared server clock lets each device extrapolate locally and re-sync only on real events — robust to jitter and cheap on Realtime.
- **Postgres as single writer:** `FOR UPDATE` serialization + `epoch/seq` gives correct ordering and a clean handoff without a stateful server; RLS SELECT-only + RPC-only writes is the security boundary.
- **Lease + election over a persistent host connection:** survives the host backgrounding/dropping without a central coordinator; the 6s lease renewed from player ticks keeps Android-Home audio alive.
- **Isolated chat channel:** guarantees the social layer can never destabilize playback authority.
- **Reuse the solo player:** one `HijackPlayer` means one hijack/injection/echo-suppression code path to maintain, and party inherits PiP/background-audio for free.

### 11.4 Alternatives considered & rejected

- **Cloudflare Durable-Object + WebSocket authority** — the *original* design still visible as vestigial types in `protocol.ts` (`ClientIntent`/`ServerEvent`/`connectionId`); replaced by Supabase-only because Postgres already provided auth, RLS, Realtime, and durable locking with no extra service to run. Don't wire against those types.
- **Streaming raw playback position tick-by-tick** — rejected for drift/flood; the timeline anchor extrapolates instead.
- **Persistent single host socket (no lease)** — rejected: a host disconnect would freeze the room; the 6s lease + `joined_at`-ranked election recovers automatically.
- **Native player for the party** — rejected project-wide (deterministic WAF tokens defeat native stream-sniffing); WebView stays primary, native features ride through it. See [Native player](#player-bridge).
- **Persisted chat history / server-relayed GIFs** — deferred (ephemeral is free and lightweight); KLIPY relay is additionally ToS-prohibited.

### 11.5 Key files & entry points

- [src/screens/PartyScreen.tsx](src/screens/PartyScreen.tsx) — the single host/guest party screen (player, controls, chat, admin sheets)
- [src/screens/JoinPartyScreen.tsx](src/screens/JoinPartyScreen.tsx) — 6-cell room-code entry, `navigation.replace("Party", …)`
- [services/party/useParty.ts](services/party/useParty.ts) — React glue: builds `PlayerControl`, feeds `PlayerEvent`s to the engine, exposes host/admin actions
- [services/party/PartyClient.ts](services/party/PartyClient.ts) — transport: RPC calls, Realtime channel, clock offset, lease renew, election
- [services/party/PartySyncEngine.ts](services/party/PartySyncEngine.ts) — local pilot: apply anchors, drift correction, route user controls
- [services/party/protocol.ts](services/party/protocol.ts) — shared types + `effectivePositionMs` (plus vestigial DO types — ignore)
- [services/party/usePartyChat.ts](services/party/usePartyChat.ts) — ephemeral chat/reactions on the isolated `party-chat:<code>` channel
- [components/party/GifPicker.tsx](components/party/GifPicker.tsx) · [components/party/RoomSettingsSheet.tsx](components/party/RoomSettingsSheet.tsx) — GIF/sticker picker; host admin sheet
- [src/navigation/actions.ts](src/navigation/actions.ts) — `openPartyHost` / `enterParty` / `replaceWithParty`
- [utils/roomCode.ts](utils/roomCode.ts) — `genRoomCode` / `normalizeRoomCode`
- [supabase/migrations/0001…0006_party*.sql](supabase/migrations/) — tables, RLS, the whole RPC surface (`0005` membership guard, `0006` creator reclaim)
- [docs/architecture/watch-party-sync.md](docs/architecture/watch-party-sync.md) · [docs/architecture/chat-and-reactions.md](docs/architecture/chat-and-reactions.md) — the authoritative deep-dives

### 11.6 Open items / backlog / gotchas

- **F1 defer — sync is videasy-only.** Post-cutover, only `videasy` has an OTA injection script; the other hijackable providers inject nothing, so their timeline never binds and the party badge is a known lie until the core+delta refactor lands. See [Injection scripts](#ota-scripts).
- **Group-pause-on-buffer not wired** (explicit TODO): needs a guest→host buffering signal; `expo-video`'s `bufferedPosition` would enable it for a v2 native player.
- **`locked` vs `private` are identical** in `party_join` SQL (no distinct behavior encoded).
- **`party_transfer_host` doesn't require the target to be `approved`** — asymmetric with claim/grab.
- **`effectivePositionMs` has no upper clamp** — can exceed media duration near the end (harmless).
- **Ephemeral chat** — a late joiner sees no backscroll; no persisted history, delivery receipts, typing indicator, or moderation surface.
- **Future social features (in memory, not built):** slash-commands → room polls (`/request-replay`, `/skip-to`); reply/quoted-threads + @-mention tagging; play-next queue, per-guest control matrices, mute/disable-chat toggles ("all customizable & toggleable, later phase").
- **`protocol.ts` vestigial DO types** (`ClientIntent`, `ServerEvent`, `Poll`, `DEFAULT_ROOM_CONFIG`, etc.) are declared but unused by the shipped path — do not build against them.


## 12. UI & rendering — the blur/stutter rule, navigation & orientation {#ui-rendering}

How Bearoom keeps a WebView-composited video smooth while still delivering a frosted "cozy cinema-lounge" look — and how it rotates, masks, and locks orientation without ever software-rotating the player.

### 12.1 What it is & responsibilities

This domain owns three tightly-coupled concerns: (1) the **glass rule** — real glass only through `<Glass>` (`src/ui/glass`), never a window-capturing blur, never a WebView as a backdrop, no elevation over the video; (2) **orientation** — a portrait-locked app that lets only the Player/Party screens rotate, driven by the real OS via `expo-screen-orientation`, plus a state-driven black mask that hides the reflow; and (3) the **design-token system** (`theme/bearoom.ts`) and the glass component library (`GlassButton`/`GlassCard`/`GlassChip`/`Frost`) that render the honey-on-warm-charcoal look, gated by a `check:theme` CI guard. It exists because playback is a WebView embed (see [Playback / hijack player](#player-bridge)) and a full-screen GPU compositor competes with video decode — so the UI must actively step out of the video's way.

### 12.2 How it works — the real mechanism

**Glass (2026-10-11, spec [2026-10-11-glass-design](docs/superpowers/specs/2026-10-11-glass-design.md)).** Every glassy surface draws a `<Glass material=…>` layer; one pure function (`selectGlassEngine`, [engine.ts](src/ui/glass/engine.ts)) picks the engine:

- **iOS** — Liquid Glass (`expo-glass-effect`) for `control`/`bar` on iOS 26+, system blur (`expo-blur`) for `chrome`/`sheet` and older iOS. Both are composited by the OS, so they are fine over the video. `visible={false}` switches Liquid Glass to `none` while a parent fades (it must not sit at alpha 0).
- **Android 12+** — live blur **only on floating bars** (tab bar, party bar) via our module [modules/bearoom-glass](modules/bearoom-glass): a `<GlassBackdrop>` records what may be blurred into a `RenderNode` during its normal draw; each `BearoomGlassView` draws its own patch of it at quarter resolution into a tiny `RenderNode` with a `RenderEffect` blur, over an opaque base (the backdrop records content, not the background behind it). Focused screens register their backdrop ([registry.ts](src/ui/glass/registry.ts)); a glass never blurs a backdrop it sits inside (the render tree would contain itself — a `libhwui` recursion crash).
- **Crafted glass everywhere else** — tint + warm lift + top highlight: Android headers, buttons, sheets, Android < 12, Reduce Transparency, and anything inside a `Modal` (`backdrop="none"`).
- **Over the video** the players use a `GlassLayer` with **no** backdrop: blurring the WebView makes Chromium draw the film again every frame (36–50 % janky on the Nothing Phone 1) and a scaled draw renders it black. Android controls are crafted; iOS gets Liquid Glass. `elevation`/`glow.*` stay off the controls.

History: `expo-blur`'s old `dimezisBlurView` and then `@sbaiahmed1/react-native-blur` both hooked the window's `OnPreDrawListener`; the latter re-drew the **whole window in software for every blurred surface, every frame** (Home scrolled at ~26 fps, 100 % janky). Both are gone.

**Test contamination — release/cold-launch only.** A dev-menu JS reload (`reload_app`/shake) **leaks native blur views** and stacks a fresh set each reload → a *second, fake* stutter. Every A/B test done via reload was contaminated (same code → "smooth" then "stutter"). Only trust `npx expo run:android --variant release` (release is debug-signed here, so it builds) or a force-stop → cold launch. Bump a visible marker to confirm the new build installed.

**Orientation — real OS rotation, not software.** [app.json](app.json) sets `orientation: "default"`. [App.tsx:86](App.tsx#L86) locks `PORTRAIT_UP` on mount, and `handleNavStateChange` ([App.tsx:92](App.tsx#L92)) re-locks portrait on every route whose name is not `Player` or `Party`. The Player unlocks itself on focus ([PlayerScreen.tsx:236](src/screens/PlayerScreen.tsx#L236) `ScreenOrientation.unlockAsync()`) and re-locks `PORTRAIT_UP` on unmount. `toggleFullscreen` ([PlayerScreen.tsx:429](src/screens/PlayerScreen.tsx#L429)) calls `ScreenOrientation.lockAsync(LANDSCAPE)` entering fullscreen and `unlockAsync()` leaving it. So Home always stays portrait; only Player/Party (and their alerts) rotate.

**Immersive derivation & masking.** [useResponsive.ts](hooks/useResponsive.ts) is *pure* — derived only from `useWindowDimensions()`, no sensor — so under real OS rotation width/height flip and `isLandscapeMobile = isLandscape && Math.min(w,h) < 600` is reliable. Both Player and Party compute `isImmersive = fullscreen || isLandscapeMobile`, which drives `StatusBar hidden`, full-bleed `playerFs` (absolute, `zIndex:50`), and hiding the expand button when already landscape.

The rotation flash is hidden by a **state-driven black mask**: `toggleFullscreen` sets `masking=true` and `maskFade=1` in the *same commit* as the layout change (so it mounts opaque, no one-frame leak), applies the orientation lock, then after 560ms fades `maskFade` to 0 over 300ms and unmounts. It renders as a sibling of the whole screen ([PlayerScreen.tsx:601](src/screens/PlayerScreen.tsx#L601), `StyleSheet.absoluteFill`, `colors.black`, `zIndex:1000`) so it covers the WebView reflow, the OS rotation, and the UI that reappears on collapse. Known gotcha: the mask fires only on the *button* path, so a physical-rotate (accelerometer-driven OS rotation) may still flash — it may need an orientation-change listener.

**Theme tokens + CI guard.** [theme/bearoom.ts](theme/bearoom.ts) is the single source of truth: `colors` (bg `#100D0A` warm charcoal, `honey #F0A93C`, `onHoney`), `radius`, `spacing`, `font` (Outfit headlines / Inter body), `ms()`/`scale()` responsive primitives (411dp baseline, clamped 0.82–1.12), `glow`, and `glassMaterials`/`glassHighlight`/`glassLift`. [scripts/check-theme-tokens.js](scripts/check-theme-tokens.js) (npm `check:theme`) `rg`-greps for raw `#hex`/`rgba(` outside `theme/` and exits 1 if any feature file hardcodes a color.

### 12.3 Why this approach

Live glass on Android has a per-frame cost on the render thread for every blurred surface (the renderer re-renders each glass layer from the screen's drawing list), so it goes where it reads most — bars floating over moving content — and measured A/B the bars-only setup scrolls like no blur. Over the WebView video there is no cheap live blur until the native player (Phase 1B, `TextureView`). Real OS rotation is chosen over software rotation because `useWindowDimensions()` then reports true landscape (making layout trivially correct) and the OS handles the surface transform natively instead of the JS thread transforming a live WebView.

### 12.4 Alternatives considered & rejected

- **Software rotation (accelerometer + 90° canvas transform + rotate-suggestion overlay)** — the 08-18 orientation cluster used a `useDeviceOrientationSensor` hook over `expo-sensors` plus a 90° transform on the WebView; it stuttered badly (transforming a live compositing surface) and depended on `expo-sensors`, which is not installed. Deleted; replaced by `ScreenOrientation` OS rotation. The *feature* was kept, its impl scrapped.
- **`Frost` static-tint everywhere (the `Frost` component tinting all 9 blur surfaces on Android)** — built as a release and smooth, but the user rejected it: "without that glass blur it lost its feel." Real blur is wanted for the look; the decision became per-surface (blur off only over/near video).
- **Keeping expo-blur `dimezisBlurView`** — the original stutter root cause; disabling every instance made a release build smooth.
- **Chasing the stutter as a network bug** — an earlier hypothesis ([player-stutter-is-network](docs/investigations/playback-stutter.md)) blamed videasy segment starvation. Real but separate and milder; the *render* stutter is the blur. The buffering spinner from that work stays valid — see [Playback](#player-bridge).
- **Native (non-WebView) player** — rejected; deterministic WAF tokens defeat native stream-sniffing, so the WebView stays primary and native features are added through it.

### 12.5 Key files & entry points

- [theme/bearoom.ts](theme/bearoom.ts) — design tokens: `colors`, `radius`, `spacing`, `font`, `type`, `glow`, `glassMaterials`, `ms()`/`scale()`.
- [scripts/check-theme-tokens.js](scripts/check-theme-tokens.js) — CI guard (`npm run check:theme`) banning raw hex/rgba outside `theme/`.
- [src/ui/glass](src/ui/glass) — `Glass`, `GlassBackdrop`, `GlassLayer`, the engine choice and the backdrop registry.
- [modules/bearoom-glass](modules/bearoom-glass) — the Android 12+ backdrop blur (Kotlin, local Expo module).
- [src/ui/GlassButton.tsx](src/ui/GlassButton.tsx), [GlassCard](src/ui/GlassCard.tsx), [GlassChip](src/ui/GlassChip.tsx), [IconButton](src/ui/IconButton.tsx) — primitives that draw `<Glass>`; [Frost.tsx](src/ui/Frost.tsx) is kept for BearAlert (sheet, no backdrop).
- [src/screens/PlayerScreen.tsx](src/screens/PlayerScreen.tsx) — `toggleFullscreen`, state-driven mask, orientation lock/unlock, `isImmersive`.
- [components/player/PlayerControls.tsx](components/player/PlayerControls.tsx) — glass bottom bar and ±10 s buttons that hide their glass with the controls; no glow/elevation.
- [hooks/useResponsive.ts](hooks/useResponsive.ts) — pure `isLandscapeMobile`/`isImmersive` derivation, no sensor.
- [App.tsx](App.tsx) — global `PORTRAIT_UP` lock + `handleNavStateChange` per-route re-lock.

### 12.6 Open items / backlog / gotchas

- **Physical-rotate flash**: the black mask covers only the `toggleFullscreen` button path; an accelerometer-driven OS rotation may still leak one WebView frame — likely needs an orientation-change listener.
- **Glass follow-ups (deferred)**: iOS 27 simulator check of Liquid Glass + fades; Android lens/refraction shader (AGSL, API 33+) chained on the blur; a remote kill switch via `/config`; live glass over video once the native player renders into a `TextureView`; a low-end Android device check of the bar blur.
- **Atmospheric background (shelved)**: a future living-background phase (Skia/Reanimated, device-adaptive tiers) that MUST hard-freeze/unmount on Player + Party screens — do not build yet.
- **UI-rework saga**: HEAD's ~4-day "gemini" UI (the `src/features/*` shell refactor) was judged off/ugly; branch `ui-rework` was cut from the good-UI base `7eb71b5` to cherry-pick useful feats (React Navigation, background playback, avatars, rebrand, orientation lock) and scrap the rest. Durable, branch-proof plan: `~/Downloads/bearoom-stutter-and-ui-rework-plan.md`.
- **Two GlassButton paths** (`src/ui` real + `components/ui` re-export) — edit the `src/ui` source.


## 13. QA & verification methodology {#qa}

How Bearoom is verified end-to-end: a two-debugger model spanning the React Native shell and the in-WebView bridge, a fixed Suite A0–G checklist, and the recorded Phase-6 cutover findings that define what is proven vs. still blocked.

### 13.1 What it is & responsibilities

Bearoom has no automated device test harness. Verification is a **skeptical, human-plus-agent manual pass** driven from a physical Android device: an MCP QA agent works a written checklist top-to-bottom, records each failure inline (what was seen + a screenshot), and is treated as *the* verification layer — the human does not re-check. The QA docs are living artifacts: [phase6-cutover-qa.md](docs/qa/phase6-cutover-qa.md) (the current cutover pass, with a Result log and Findings) and [milestone-qa.md](docs/qa/milestone-qa.md) (the dynamic-providers / RTK Query / zero-wait-Play / silent-memory milestone). Responsibilities: prove the OTA bridge still binds and preserves its subsystems, prove the server-driven config/killswitch behaves, catch **selector rot** (the provider renaming a DOM node) before it reaches users, and record precisely what could *not* be checked so the next session inherits the gaps rather than re-discovering them.

### 13.2 How it works — the real mechanism

**Two layers, two debuggers.** The RN shell and the playback surface are separate runtimes and need separate tools:

- **execbro → the React Native layer.** Drives the device and the JS/Redux shell: `get_network_requests` (confirm `/config`, `/scripts`, `/report`, TMDB proxy, `api.klipy.com` fire), `redux_get_state` (the `providers` slice), `get_logs`/`search_logs`, `tap`/`input_text`, `android_screenshot`. execbro **cannot** see inside the WebView.
- **Chrome DevTools remote (CDP over adb) → the WebView layer.** The injected bridge, the provider DOM, and the `<video>` all live inside the WebView. On New-Arch / Bridgeless, RN `console.log` often does **not** reach `adb logcat`, so CDP is the only reliable window into the served script at runtime. Attach:
  ```bash
  PID=$(adb shell cat /proc/net/unix | grep -oE 'webview_devtools_remote_[0-9]+' | head -1)
  adb forward tcp:9222 localabstract:$PID
  # open chrome://inspect (or: curl localhost:9222/json/list) → Inspect the videasy WebView
  ```
  In the WebView console verify the legacy bridge installed: `window.__vlBridge === true`, and `typeof window.__vlCmd/__soloCmd/__vlSetGuest/__vlChromeOff === "function"`; `document.querySelector('video')` has a `currentSrc`; the Radix triggers `[id*="trigger-Quality"]` / `[id*="trigger-Servers"]` are non-null; `__vlCmd({action:"pause"})` and `{action:"readAudio"}` behave.
- **Playwright → the public DOM (no device).** An independent, desktop-browser check of the *served* script string against the live provider DOM (`player.videasy.to/movie/550`), stubbing `window.ReactNativeWebView.postMessage` to capture emits. Catches selector rot early; kept for CI/rot-watch even when the on-device CDP pass supersedes it.

**The injection under test.** The WebView hijack script is served **over-the-air**, not bundled. On boot the app diffs each provider's `script_version` (from `/config`) against an MMKV cache keyed `bridge.scripts.v1` ([bridgeCache.ts](src/scripts/bridgeCache.ts)), fetches changed bodies from `/scripts`, caches them, and injects the cached string via `injectedJavaScriptBeforeContentLoaded={getCachedScript(providerId) ?? ""}` at [HijackPlayer.tsx:272](components/player/HijackPlayer.tsx#L272). The served body is the proven legacy bridge verbatim ([legacy-videasy.ts](src/scripts/legacy-videasy.ts)), uploaded by [upload-bridge.ts](scripts/upload-bridge.ts) whose `SCRIPTS` map currently holds **videasy only**. See [Bridge / OTA scripts](#player-bridge) and [Worker & config](#edge-worker).

**Suite structure (A0–G):**
- **A0** — validate the served script at the DOM level (A0-A on-device CDP = primary; A0-B Playwright = supplementary rot-watch).
- **A** — OTA bridge cutover (**priority**): A1 loads/binds; A2 the **8 preserved subsystems** (party echo-suppression, background audio `keepAlive`, lock-screen `__soloCmd`, guest transport hiding `__vlSetGuest`, native-chrome `__vlChromeOff`, quality/dub switching, fullscreen, collapsed control-bar fix); A3 cat-and-mouse OTA update with no rebuild; A4 `scriptVersion` telemetry lands in `provider_reports`; A5 no-script degradation.
- **B** dynamic providers + config (incl. the dumb-app killswitch), **C** zero-wait Play, **D** silent memory (audio/quality prefs), **E** Phase-8 fallback, **F** TMDB & KLIPY (RTK Query), **G** regression (release-build stutter, 2-device party, orientation, watchlist).

**This session's on-device verification (debug build, HEAD 7123d67 → committed 8fbd13b).** Four player fixes were confirmed:
- **Fix 1 — resume-seek after a switch (CONFIRMED).** A dub/quality/provider switch used to restart at 0:00. `armResume()` snapshots `posRef` when the app triggers a switch; `onEvent` seeks back once the reloaded stream restarts from ~0 — guarded by an `at > 8` threshold and a 12 s expiry so it can never fire on an ordinary buffer ([PlayerScreen.tsx:326](src/screens/PlayerScreen.tsx#L326)).
- **Fix 3 — hardware back exits fullscreen first (CONFIRMED).** `backInterceptRef` is live-assigned each render; the guard calls it via `beforeClose` and, while `fullscreen`, `toggleFullscreen()`s and returns `true` instead of prompting "Stop watching?" ([PlayerScreen.tsx:454](src/screens/PlayerScreen.tsx#L454), [useMediaCloseGuard.ts:51](hooks/useMediaCloseGuard.ts#L51)).
- **Fix 2 — idle no-bind banner (CONFIRMED).** The 10 s soft banner and 25 s hard fallback are gated on `userGesturedRef` (a WebView `gesture` event = play-intent), so an idle pre-play/ad gate never pops ([PlayerScreen.tsx:173](src/screens/PlayerScreen.tsx#L173)).
- **gorhom rotation redbox (FIXED).** `patches/@gorhom+bottom-sheet+5.2.14.patch` aliases a worklet-captured `window` var ("Property 'window' doesn't exist" on rotation) + adds listener cleanup (upstream PR #2679).
- **Fix 4 — fallback ProviderSheet dismiss-race** is coded (`pendingPresentRef` flushed in `onDismiss`, [PlayerScreen.tsx:650](src/screens/PlayerScreen.tsx#L650)) but the underlying race (F2) was only partially exercised.

### 13.3 Why this approach

The player is a WebView hijack, so a bug can silently drop one of 8 subsystems **without a crash** — a red-box-only or logcat-only strategy would miss all of it. The two-debugger split exists because execbro literally cannot see into the WebView and Bridgeless swallows WebView `console.log`; CDP is the only truthful runtime view. Selector rot is the #1 cat-and-mouse failure and is invisible from RN until playback breaks, so A0 checks the DOM directly, twice. And because the user was previously **scarred by losing work** (`capture-deferred-items-durably.md`), the methodology mandates recording every blocked item and every "observed but not a defect" question durably in the Result log and memory rather than leaving them in conversation.

### 13.4 Alternatives considered & rejected

- **execbro/logcat only (skip CDP)** — cannot see the injected bridge, the bound `<video>`, or provider DOM; Bridgeless drops WebView console output, so a script-level regression would read as a mysterious "no bind" with no diagnosis.
- **Playwright-only (public DOM) as the source of truth** — tests the served *string* against the *public* site, not the actual served+cached script in the device runtime; skipped as primary this pass because on-device CDP is strictly stronger signal. Retained only as a cheap CI rot-watch.
- **Automated device E2E (Detox/Maestro)** — not adopted; the failure surface (a live provider's shifting DOM, WAF gates, real party sync across 2 devices) is exactly what a scripted emulator run reproduces poorly, and the value is in skeptical human observation.
- **Trusting memory/docs over the code** — explicitly rejected: memory can go stale vs. the code (e.g. the "restarts at 0:00" note is now fixed by Fix 1), so QA reads the current source.

### 13.5 Key files & entry points

- [docs/qa/phase6-cutover-qa.md](docs/qa/phase6-cutover-qa.md) — the Phase-6 cutover pass: Suite A0–G checklist, Result log, and Findings F1–F4.
- [docs/qa/milestone-qa.md](docs/qa/milestone-qa.md) — the dynamic-providers / RTK Query / zero-wait-Play / silent-memory milestone checklist.
- [components/player/HijackPlayer.tsx](components/player/HijackPlayer.tsx) — the WebView; `injectedJavaScriptBeforeContentLoaded` is the exact line under test.
- [src/scripts/bridgeCache.ts](src/scripts/bridgeCache.ts) — MMKV `bridge.scripts.v1` cache; `getCachedScript`/`getCachedVersion`/`syncScripts`.
- [scripts/upload-bridge.ts](scripts/upload-bridge.ts) — the `SCRIPTS` map + upload CLI (`upload-bridge.ts videasy [--dry-run]`); requires `SUPABASE_SERVICE_ROLE_KEY`.
- [src/screens/PlayerScreen.tsx](src/screens/PlayerScreen.tsx) — the four verified fixes (resume-seek, back-intercept, idle banner, dismiss-race).
- Memory: `phase6-qa-bridge-gap.md` — the F1 decision record.

### 13.6 Open items / backlog / gotchas

- **F1 · CRITICAL (DECIDED = defer).** Only `videasy` has a served script; VidFast, VixSrc, VidLink, VidCore, 111Movies, VidNest, VidPhantom, MyCineBy inject `""` — no bind, no party sync, no background/lock-screen — while the sheet still shows their 🐾 Party badge (an **accepted lie**). Videasy is the only party-capable provider until the core+delta refactor. A ~1-line honesty fix (gate the badge on `script_version != null`) is offered but not taken. See [Bridge / OTA scripts](#player-bridge).
- **F2 · fallback sheet dismiss race.** A pick that fails instantly can call `present()` while the sheet is still dismissing → swallowed; coded fix present (F.4 above) but not fully re-verified on device.
- **F3 · WebView hard-error UX gaps — ADDRESSED (error recovery).** Was: raw unbranded "net::ERR_…" chrome, no auto-reload, excluded-until-remount. Now: HijackPlayer covers the raw error page with a branded overlay (Retry / Try another source), auto-retries with backoff (5/10/15s) + on foreground (no NetInfo dep), and excluded providers are dimmed-but-pickable and un-excluded on recovery. See [Decision log #43](#decision-log).
- **F4 · first `readAudio` can return `audios:[]`.** The Servers panel renders lazily; the 360 ms timeout in `__vlReadAudio` can fire before buttons exist. Byte-identical legacy behavior, not a cutover regression; a bounded retry-on-empty would remove it.
- **Blocked — needs the service key / Supabase MCP:** A3 (OTA re-upload cat-and-mouse loop), A4 DB-row persistence in `provider_reports`, Suite B live-edit + dumb-app killswitch, Suite E dead-domain edit, A5 cache-wipe first launch. All require `SUPABASE_SERVICE_ROLE_KEY`.
- **Blocked — needs 2 devices:** true party echo-suppression and guest transport hiding were verified at the CSS/DOM level only (single device).
- **Blocked — needs a release build:** playback-smoothness / stutter must be tested **only** on a release/cold-launch build (a dev-menu reload leaks blur views = fake stutter); the installed build was debug. See the no-blur/no-elevation rendering rule in [Playback & rendering](#player-bridge).
- **Gotcha:** `EXPO_PUBLIC_WORKER_URL` is inlined at bundle time — a hot reload will not pick it up; rebuild with `--clear`, or the empty (fallback-free) provider list looks like a bug when it is not.


## 14. Roadmap, phases & deferred backlog {#roadmap}

The single source of truth for what has shipped, what is in flight, and every feature deliberately parked — the anti-loss backlog index that survives branch churn.

### 14.1 What it is & responsibilities

Bearoom's build is tracked as ten numbered phases in [docs/project-board.md](docs/project-board.md) (the in-repo living checklist), mirrored by decision-record memories and a branch-proof prose plan at `~/Downloads/bearoom-stutter-and-ui-rework-plan.md`. This section carries two jobs: (1) record the **phase status** — what is `[x]` closed, `[/]` active, or `[ ]` pending — and (2) hold the **full deferred backlog**, grouped A–I, where every item states *why* it was parked. The backlog exists because the user lost days of work to a prior agent ("antigravity gemini") and explicitly does not want deferred ideas lost again; nothing in it may be started until asked.

### 14.2 How it works — phase ledger & backlog mechanism

**Phase ledger** (status legend: `[ ]` pending, `[/]` active, `[x]` closed):

| # | Phase | Status |
|---|-------|--------|
| 1 | Architecture & deep research (Two-Tier Hybrid OMSS: edge fast-path + `SnifferWebView` heavy tank) | `[x]` |
| 2 | DB strategy & seeding (Supabase Postgres, top-10 providers, videasy forced Priority 1) | `[x]` |
| 3 | Tier-1 edge server (Cloudflare Worker + Hono + Zod, Swagger `/docs`) | `[x]` |
| 4 | RN bootstrapping (RTK + RTK Query `workerApi`, `ConfigBootstrap` hydrates `providersSlice`) | `[x]` |
| 5 / 5.5 | Zero-wait pre-play UI; silent MMKV prefs (`utils/prefs.ts`, `utils/trackMatch.ts` fuzzy dub matcher) | `[x]` |
| 6 | Cloudflare-served injection scripts (the Bridge) | `[/]` active |
| 7 | Telemetry & failure memory (`POST /report`, session exclusion list) | `[/]` active |
| 8 | Lazy fallback & safety net (hard-error auto-pop, 10s no-bind / 25s hard / stall detectors) | `[x]` (device QA) |
| 9 | Server-side scrape caching (`title_provider_cache`) | `[ ]` pending |
| 10 | App-Store review mode & web parity | `[ ]` pending |

**Phase 6** shipped via "Option 1": a red-team found the legacy `BRIDGE_JS` runs **8 subsystems** the clean skeleton lacks (watch-party echo-suppression, background `keepAlive`, lock-screen `__soloCmd`, guest `__vlSetGuest`, `nativeControls`, iframe-walking finder, fullscreen, videasy control-bar CSS fix), so it is served **byte-for-byte** over-the-air from [src/scripts/legacy-videasy.ts](src/scripts/legacy-videasy.ts) (not bundled). The Worker split into a lean `GET /config` (sends `script_version` only) and `GET /scripts` (heavy bodies, own edge cache); [scripts/upload-bridge.ts](scripts/upload-bridge.ts) concats → `new Function()` smoke-test → content-hash version → service-role PATCH → `/cache/purge`. On-device, [src/scripts/bridgeCache.ts](src/scripts/bridgeCache.ts) diffs the cached `script_version` (MMKV) against `/config` at boot and fetches `/scripts` only on change; `HijackPlayer` injects `getCachedScript(providerId)`. The clean [src/scripts/universal-core.ts](src/scripts/universal-core.ts) + `videasy.delta.ts` remain in-repo as a **future refactor target**, not shipped.

Device QA (2026-08-20, HEAD `7123d67`) passed all 8 subsystems on videasy. See [Phase 6 & the Bridge](#player-bridge) and [Telemetry](#telemetry) for mechanism detail; QA log in [docs/qa/phase6-cutover-qa.md](docs/qa/phase6-cutover-qa.md).

**Backlog mechanism:** each parked idea lives in a per-topic memory under `/.claude/projects/.../memory/*.md`, is indexed in `deferred-backlog.md` (groups A–I), and mirrored in the out-of-repo durable doc §6 so a branch reset cannot wipe it.

### 14.3 Why this approach

The phase board lives **in the repo** (not a tracker) so it scales with the code and every agent/dev reads the same checklist. Phases are closed only with a written summary, giving an auditable decision trail. The deferred backlog is triple-persisted (per-topic memory + master index + out-of-repo doc) precisely because prior work was lost; the redundancy is deliberate. Phase 6's "serve the proven bridge verbatim" choice separates a **deployment change** (delivery moves OTA) from a **behavior change** (rewriting execution logic) so party-sync + background-audio can't silently regress while the cat-and-mouse update loop is unlocked.

### 14.4 Alternatives considered & rejected

- **Rewrite hijack logic into `universal-core` during the OTA cutover** — would have changed execution and delivery at once, risking silent regression of the 8 subsystems; deferred to an incremental post-cutover refactor.
- **Upload the legacy bridge under all 9 hijackable provider ids** — its generic core is provider-agnostic and this would restore exact pre-cutover behavior, but F1 (2026-08-20) chose to **defer**: accept videasy-only party rather than touch the bridge before the clean refactor.
- **Gate the 🐾 party badge on `script_version != null`** — offered as a ~1-line honesty fix for the 8 script-less providers; not taken, the "badge lies" risk is accepted.
- **External project tracker (GitHub Projects/Jira)** — rejected; the in-repo Markdown board keeps status beside the code and inside agent context.
- **Native `expo-video` player fed by a sniffed stream** — rejected: videasy serves HLS behind a deterministic, ephemeral, WAF-gated token (two headless sessions resolved the *identical* token; a URL dead at 403 hours later), so a native player can't self-heal on expiry. WebView stays primary → [Player & injection](#player-bridge).

### 14.5 Key files & entry points

- [docs/project-board.md](docs/project-board.md) — the phase 1–10 ledger with per-phase summaries.
- `deferred-backlog.md` — master A–I backlog index.
- `~/Downloads/bearoom-stutter-and-ui-rework-plan.md` §6 — out-of-repo, branch-proof mirror of the full backlog.
- [docs/qa/phase6-cutover-qa.md](docs/qa/phase6-cutover-qa.md) — Phase 6 device-QA result log + findings.
- `phase6-qa-bridge-gap.md`, `native-player-rejected.md`, `player-controls-unification.md`, `party-room-controls-toggles.md`, `providers-bottomsheet-and-proxy.md`, `low-end-blur-capability-gate.md`, `atmospheric-background-phase.md` — per-topic decision records (memory dir).

### 14.6 Open items / backlog / gotchas

**Active/pending phases:** Phase 6 & 7 remain `[/]` (blocked QA items A3/A4-DB, Suite B live-edit, 2-device party, release-stutter need `SUPABASE_SERVICE_ROLE_KEY` / Supabase-MCP auth / a release build / a second device). Phase 9 (scrape caching: `title_provider_cache`, metadata-only — never cache `.m3u8` for IP-locked providers, no 4h negative-cache) and Phase 10 (review-mode "Listing Only" UI wired to `enabledProviders: []`; web cross-origin-iframe parity story) are `[ ]` not started.

**Deferred backlog (do NOT build until asked):**

- **A · Party room controls & host toggles** — deferred: play-next queue; polling system; per-guest individual control; mute-chat / mute-a-guest / disable-chat toggles; GIF-loading polish + stickers; a unified "customizable & toggleable" host-settings surface. All host-authoritative, enforce at the Supabase RPC chokepoint (`services/party/protocol.ts`). *Why:* batched as one "later phase" of settings; access modes, global guest control, GIF+reactions already shipped.
- **B · Party chat** — slash-commands → room polls (`/request-replay`, `/skip-to`, apply via `party.seekTo`); reply/quoted-thread + @-mention tagging (`ChatMessage.replyTo`); per-message send-timestamp; send-with-current-media-timestamp; persisted history/GIFs/moderation. *Why:* chat is intentionally ephemeral today (broadcast-only, capped ~200); poll UI + command parser are the missing pieces, Poll types already exist in `protocol.ts`.
- **C · Player controls unification** — one controls layer (web OR native overlay, working collapsed + fullscreen) with subs/quality/speed/dub parity across providers; **solo player == party player** (solo `app/(player)/player.tsx` is a plain WebView with no bridge — add the bridge first); episode selector for shows (dropped in rebuild); smooth fullscreen↔collapsed **RN-transform rotation + orientation lock** (WANTED, re-add cleanly — the gemini impl stuttered); seek/control feedback; quality "stuck loading" fix; responsive tablet/TV. *Why:* large surface; the gemini rotation was a stutter-regression suspect and pulled out.
- **D · Native features via the WebView** — PiP / AirPlay / background audio / lock-screen media-session, added *around* the WebView ([docs/plans/webview-native-features.md](docs/plans/webview-native-features.md)). *Why:* native stream-sniffing rejected (deterministic WAF tokens); features hang off the WebView instead.
- **E · Providers / sources** — filterable providers bottomsheet with rich UI ("add as much as you can"); hijack more providers + QA to robustness; optionally proxy more providers for ISP-block resilience (DoH left alone; a Worker proxy already exists for TMDB). *Why:* post-cutover only videasy has an OTA script — the other 8 hijackable providers (VidFast/VixSrc/VidLink/VidCore/111Movies/VidNest/VidPhantom/MyCineBy) inject `""`, so the badge shows but never syncs (accepted lie); `SCRIPTS` map in `upload-bridge.ts` holds videasy only. Broadening providers waits on the core+delta refactor.
- **F · UI polish** — a "perfect UI" pass via Stitch/gemini (Stitch MCP connected, reserved); sticky/persistent top header; broader UI rework. *Why:* deferred until after the stutter/blur decisions settle.
- **G · Glass / performance** — done 2026-10-11 (§12.2): `<Glass>` + `modules/bearoom-glass`, live blur only on Android's floating bars, crafted glass elsewhere and over the WebView video. Open: iOS simulator check, Android lens shader, remote kill switch, low-end Android check, live video glass with the native player. *Rule:* never a window-capturing blur, never a WebView backdrop, no elevation over the video; measure only on release/cold-launch.
- **H · Atmospheric background (shelved)** — a device-adaptive "living" background (slow drifting soft-blurred forms) behind the UI, adaptive renderer (Skia preferred), **must hard-freeze/unmount on video screens** so decode wins. *Why:* explicitly shelved; Skia not installed (needs prebuild).
- **I · Housekeeping** — *still open:* dead-file cleanup (`components/player/EmbedWebView.old.tsx`, `SnifferWebView.old.tsx`). *Resolved since the memory was written (stale in `deferred-backlog.md`):* GitHub remote is connected (`origin` set); the `·Q` debug marker is gone from [PlayerScreen.tsx](src/screens/PlayerScreen.tsx); `expo-sensors` / `useDeviceOrientationSensor.ts` and the rejected native-player POC (`expo-video`, `NativePlayer.tsx`) were removed.

**Gotcha:** the memories carry point-in-time citations — several housekeeping items are already done in-code, so verify against the tree before asserting. The `universal-core.ts`/`videasy.delta.ts` skeleton is a *target*, not live behavior.


# Appendices

These appendices are reference material for the body sections (§3–§14). Every decision row links back to the section that owns the full argument.

---

## 15. Decision log (ADR index) {#decision-log}

Every significant architectural and product decision, most-load-bearing first within each area. "Where" links to the owning body section.

| # | Decision | Chosen approach | Alternatives rejected (and why) | Where |
|---|----------|-----------------|---------------------------------|-------|
| 1 | Two-tier hybrid OMSS | Tier-1 Cloudflare Worker fast-path (config/scrape) in front of a Tier-2 `react-native-webview` **HijackPlayer** that both plays and drives the provider's own `<video>` via an injected JS bridge — a real browser engine runs the provider's JS/decryption on the user's residential IP. | Pure server scraper (CinePro-style Node fetch → AES decrypt): brittle, breaks weekly on AES key rotations, WAF-blocked from datacenter IPs. Reverse-proxy hub (iMayhem-style segment proxying): proxying video bytes ≈ **$500/mo** bandwidth, defeats the $0-infra goal. | [§3](#architecture) |
| 2 | WebView stays the playback engine; native stream-sniffing rejected | Keep the WebView; add native features (PiP/AirPlay/background-audio/lock-screen) **around** it, not by re-hosting the stream. | Native `expo-video` fed by a sniffed `.m3u8` ("Snatch and Kill"): deterministic ephemeral WAF/IP-locked tokens re-resolve to the *same dead URL* hours later — no self-heal, a full movie can't play. On-device OSS extraction (`@movie-web/providers`, p-stream fork): abandoned/DMCA'd, all sources return null. Uninstalled. | [§3](#architecture) · [§7](#player-bridge) |
| 3 | Full-dynamic Supabase providers, **NO baked-in fallback** (killswitch) | `providersSlice` starts `[]`, filled only from `GET /config` (server-filtered `enabled=eq.true`); `providers.json` survives only as the Supabase *seed* source, never imported at runtime. Clearing/disabling rows yields a genuinely empty app. | Bundled `providers.json` fallback in the binary: leaks the catalog exactly during App-Store review or a global kill; any fallback defeats the review killswitch — empty must mean empty even when the worker is unreachable. | [§3](#architecture) · [§6](#providers) |
| 4 | Registry reads the live store, no mirror | `providerRegistry` (`getActiveProviders`/`getProvider`/`defaultHijackProvider`) calls `store.getState()` on demand for imperative code; React uses the reactive `useProviders()` hook. Type-only store import keeps it one-way and cycle-free. | Module-holder array kept in sync via `store.subscribe`: extra lifecycle + staleness risk the on-demand read eliminates. | [§5](#data-layer) · [§6](#providers) |
| 5 | Hono + `@hono/zod-openapi` on Cloudflare Workers | One `OpenAPIHono` Worker where Zod schemas drive validation, TS types, and the auto-generated `/docs` + `/openapi.json` — spec can never drift from what's enforced. | Express/Node runtime: Workers have no Node `http` server, loses `request.cf` + edge Cache API. Hand-written OpenAPI: drifts from code. | [§4](#edge-worker) |
| 6 | Edge Cache API with synthetic stable keys, 60s TTL, config/scripts split | Cache Supabase reads under fixed synthetic Request keys (`https://internal.cache/providers`, `/scripts`), `s-maxage=60`; `/config` and `/scrape` share the providers key, the heavy `bridge_script` bodies serve only via version-gated `/scripts`. | Per-request-URL cache keys: `/config` and `/scrape` never share a hit → double Supabase fetch. Ship `bridge_script` inside `/config`: bloats every launch (~12KB/provider). | [§4](#edge-worker) · [§8](#ota-scripts) |
| 7 | OTA injection scripts, **Option 1** — serve the legacy bridge verbatim | Move the proven `BRIDGE_JS` byte-for-byte to `src/scripts/legacy-videasy.ts` (not bundled), serve as `videasy@<hash>` via `GET /scripts`; `/config` carries only `script_version`; `ConfigBootstrap` boot-diffs it and caches bodies in MMKV (`bridge.scripts.v1`); `HijackPlayer` injects the cached copy in `injectedJavaScriptBeforeContentLoaded`. Decouples cat-and-mouse DOM fixes from app releases with **zero behaviour change**. | Ship the clean `universal-core` + `*.delta` rewrite now: the skeleton lacks ~8 subsystems (echo-suppression, keepAlive, `__soloCmd`, `__vlSetGuest`, `__vlChromeOff`, iframe `findVideo`, fullscreen, control-bar CSS) and uses a new event contract (`ready`/`timeupdate`/`state`) RN `onMessage` doesn't key on → silent party/background regression. Keep it bundled: every DOM break needs a store rebuild. | [§8](#ota-scripts) · [§7](#player-bridge) |
| 8 | OTA publish gate: parse smoke-test + content-hash + purge | `scripts/upload-bridge.ts` concatenates, runs `new Function(script)` as a strict parse gate (one bad string breaks every user on that provider), content-hashes into `script_version`, service-role `PATCH`es the row, then `POST /cache/purge`. | Skip the `new Function()` gate: a syntax error breaks every user with no local catch. Manual SQL update: no parse validation, no version hash, no cache purge. | [§8](#ota-scripts) |
| 9 | No bundled fallback script | App bundles **no** bridge; if nothing is cached the provider loads uncontrollable (no crash). Preserves the killswitch — empty config yields a dumb app. | Ship a bundled fallback bridge: leaks hijack capability during a kill/review and risks a decompilable copy. | [§8](#ota-scripts) |
| 10 | F1 — accept **videasy-only party**, don't touch the bridge (2026-08-20) | Ship the OTA cutover with a served script for **videasy only**; the other 8 hijackable providers inject `""` and never bind. Party badge on them is an accepted lie until the core+delta refactor. User's explicit call to leave the proven bridge untouched. | Upload the generic legacy bridge under each hijackable id (its bind/tick/cmd core is provider-agnostic): deferred to the refactor. Gate the badge on `script_version != null` (~1-line honesty fix): offered, not taken. | [§13](#qa) · [§14](#roadmap) |
| 11 | RTK Query as the data architecture | Model all remote reads as three RTK Query APIs — `workerApi`/`tmdbApi`/`klipyApi` behind one `configureStore`, `setupListeners` for `refetchOnReconnect`. Replaces the dead pre-RTKQ scaffolding of ad-hoc per-screen fetches. | Plain thunks / ad-hoc `fetch`: no caching or dedupe. Keep bespoke `tmdbCache.ts`: no dedupe/reconnect, flashed the Home skeleton on tab focus. | [§5](#data-layer) |
| 12 | `fakeBaseQuery` + `queryFn` for TMDB & KLIPY | `tmdbApi`/`klipyApi` endpoints use `fakeBaseQuery()` + `queryFn` calling existing utils (`tmdbLists`/`tmdbDetails`, `services/gifs`) — proven transforms stay byte-identical and KLIPY's no-proxy ToS is honored, while gaining cache + generated hooks. | `fetchBaseQuery`: would force rewriting proven transforms; KLIPY forbids proxying so its URL-building must stay in `services/gifs.ts`. | [§5](#data-layer) |
| 13 | `/config` → `providersSlice` via `matchFulfilled`, no fallback | `providersSlice` `extraReducers` matches `workerApi.getConfig.matchFulfilled` to derive providers (`remoteToProviders`) + `maintenanceMode` from one `/config` fetch — one fetch keeps the whole app in sync; empty response must yield an empty list. | Baked-in fallback list: defeats the killswitch. Independent fetch inside the slice: duplicates the request, desyncs subsystems. | [§5](#data-layer) · [§6](#providers) |
| 14 | Drive the `<video>` via an injected bridge, not `postMessage` | Walk same-origin iframes with `findVideo()`, bind listeners, expose `window.__vlCmd`/`__soloCmd` for two-way control. Only videasy exposes play/pause+position over `postMessage` and inbound commands aren't reliable. | `postMessage`-only: most providers post metadata/UI-visibility only, no reliable inbound pause/seek. Cross-origin iframe video: unreachable by `findVideo`, marked `supported:false` (solo-only). | [§7](#player-bridge) |
| 15 | Main-frame-filtered WebView failure → provider fallback | `onError`/`onHttpError` compare the errored URL to the embed `uri` (renderer crash always counts) before `onFatalError`; provider pages throw constant ad/tracker sub-resource 404s. | Fall back on *any* WebView error: sub-resource 404s trigger spurious fallbacks. | [§7](#player-bridge) · [§10](#player-ux) |
| 16 | Zero-wait Play: client-side embed URL, no `/scrape` trip | `buildEmbedUrl()` fills a URL template synchronously; the WebView loads it directly with the bridge pre-cached in MMKV (`getCachedScript`) and injected before content load. Nothing blocks on the network before the page loads. | A `/scrape` round-trip before Play: adds a visible network wait; the `/scrape` route stays off the hot path. | [§10](#player-ux) |
| 17 | Silent memory via curated synonym matcher, not edit-distance | `trackMatch.matchAudio`/`matchQuality` resolve saved MMKV prefs through a curated `LANG_SYNONYMS` map + word-boundary ISO fallback + height parse, auto-applied passively once the bridge binds. Never guesses wrong, never blocks Play. | Levenshtein/edit-distance: collapses the exact short ISO codes that matter (`hi` vs `de` = 2, `en` vs `es` = 1). Open the settings sheet to apply: defeats "silent". | [§10](#player-ux) |
| 18 | **Recent fix** — resume-seek after a dub/quality/provider switch | `armResume()` snapshots `posRef` into `resumeSeekRef {at, until:+12s}` only if `at>8`; `onEvent` seeks back once the reloaded stream restarts (`playing`/`canplay`/`readyState≥3` **and** `currentTime < at-2`), then clears. Fenced so it can't fire on an ordinary buffer or a position-preserving switch. Was restarting at 0:00. | Patch the OTA legacy bridge to preserve position: rejected — kept app-layer so the proven bridge is untouched. | [§10](#player-ux) |
| 19 | **Recent fix** — gesture-gated, non-auto-navigating fallback safety net | 10s soft banner + 25s hard fallback both gated on `userGesturedRef` (one-shot play-intent post), plus a >20s mid-stream stall detector; `triggerFallback` adds the dead provider to `excludedIds` and opens the picker. Was popping the banner while idling at the pre-play gate. | Auto-jump to the next source on timeout: hostile mid-ad-gate. Fire the banner on any unbound timeout: pops during normal pre-play idling. | [§10](#player-ux) · [§7](#player-bridge) |
| 20 | **Recent fix** — hardware-back exits fullscreen before confirming close | `useMediaCloseGuard` gained a live-read `beforeClose()` interceptor; `backInterceptRef` re-assigned each render returns `true` (`toggleFullscreen`) in fullscreen, else `false` to show the *Stop watching?* confirm. Mirrors the overlay back button. | Single close confirm with no fullscreen step: hardware back would skip past fullscreen exit. | [§10](#player-ux) |
| 21 | **Recent fix** — ProviderSheet dismiss-race flush | `presentSheet()` arms `pendingPresentRef`; the sheet's `onDismiss` flushes a swallowed `present()` once fully closed, `onChange(index≥0)` clears it when open. A `present()` fired while `@gorhom/bottom-sheet` is mid-dismiss (pick-then-instant-fail) is otherwise swallowed. | Retry the swallowed `present()` on a timer: races the dismiss animation; keying off the sheet's own `onDismiss`/`onChange` is deterministic. | [§10](#player-ux) · [§13](#qa) |
| 22 | **Recent fix** — `@gorhom/bottom-sheet` window-worklet patch | `patches/@gorhom+bottom-sheet+5.2.14.patch`: `useAnimatedLayout`'s `Dimensions.addEventListener` worklet captured a var literally named `window` → *"Property 'window' doesn't exist"* on rotation. Aliased to `win` + added `subscription.remove()` cleanup; matches upstream PR gorhom/react-native-bottom-sheet#2679. | Leave unpatched: crashes on rotation while a sheet is open. | [§10](#player-ux) · [§12](#ui-rendering) |
| 23 | Postgres as single-writer authority (Supabase-only party) | Every playback/admin action is a `SECURITY DEFINER` RPC that row-locks the room (`SELECT … FOR UPDATE`), bumps `seq`, re-anchors, returns `party_snapshot`; two RLS SELECT-only tables with no write policies. Postgres already gives auth, RLS, Realtime, durable locking. | Cloudflare Durable-Object + WebSocket authority (original design, now vestigial `protocol.ts` types): needs a separate stateful service Supabase supplies natively. | [§11](#watch-party) |
| 24 | Timeline anchor + shared server clock, not tick-streaming | Store playback once as `{status,positionMs,rate,anchorServerTimeMs,epoch,seq}`; each client extrapolates via `effectivePositionMs` against a min-RTT-filtered clock offset. Realtime broadcast is only a fan-out hint. | Stream raw position tick-by-tick over Realtime: drifts, floods the channel. | [§11](#watch-party) |
| 25 | Host is a 6s lease with `joined_at`-ranked failover | Host renews every 2s (and implicitly on each mutation / player tick); if it lapses, guests run a staggered `party_claim_host` election won by the Postgres row lock, bumping `epoch`. | Persistent single host socket, no lease: a host disconnect freezes the room. | [§11](#watch-party) |
| 26 | Reuse the solo HijackPlayer for the party | `PartyScreen` renders the identical WebView HijackPlayer; RN `PlayerControls` overlay mounts only after `onBound`; guest transport hidden via `__vlSetGuest`/`__vlChromeOff`; background-audio/lock-screen shared with solo. One code path; party inherits PiP/bg-audio free. | A native player for the party: rejected project-wide (WAF tokens defeat native sniffing). | [§11](#watch-party) |
| 27 | Isolated ephemeral chat channel | `usePartyChat` runs on a separate `party-chat:<code>` Realtime broadcast channel, `self:false` + optimistic echo, capped at 200, nothing persisted; GIFs/stickers via KLIPY called directly from the device. A chat storm can't destabilize playback authority; direct KLIPY satisfies ToS. | Persisted history + server-relayed/proxied GIFs on the sync channel: heavier than needed; KLIPY relay is ToS-forbidden; sharing the sync channel risks perturbing playback. | [§11](#watch-party) |
| 28 | Health = distinct-client-weighted failure **RATE**, not a raw count | `provider_health` view divides `hard_failures` by `(successes + hard_failures)` and counts distinct `client_hash`; `not_found`/`manual_switch` excluded from the numerator. Providers degrade unevenly by title/region; distinct-client weighting stops one spammer tanking a provider. | Raw counts / fixed thresholds: one bad title or abusive client condemns a provider. Rate without distinct-client weighting: a NAT'd/abusive client still dominates the numerator. | [§9](#telemetry) |
| 29 | Service-role-only writes to an RLS-locked, policy-less table | `provider_reports` has RLS **on** with **no** policies; only the worker writes it with `SUPABASE_SERVICE_ROLE_KEY`; anon/publishable key is hard-blocked (proven with a live `42501` anon-insert denial). The health signal drives fallback, so it must be unforgeable. | Client writes Supabase directly with the anon key: RLS-blocked by design and forgeable — poisons the signal. | [§9](#telemetry) |
| 30 | Fire-and-forget ingestion: `waitUntil` + unconditional 202 | Worker inserts via `ctx.waitUntil` and returns **202** regardless of the DB result; RTK Query `reportOutcome` carries no cache tags. Telemetry is strictly subordinate to playback — a slow/failing Supabase must never stall the player. | Await/block the insert before responding: a slow DB stalls playback. | [§9](#telemetry) |
| 31 | Server-derived geo + hashed client id (never trusted from client) | `country` from `request.cf`; `client_hash` = truncated SHA-256 of `cf-connecting-ip`; `ReportRequestSchema` deliberately omits both. Client geo/identity is spoofable and the raw IP is a privacy liability. | Accept `country`/`client id` in the body: spoofable, corrupts weighting. Store the raw IP: privacy — a 32-char hash suffices. | [§9](#telemetry) |
| 32 | Two independent per-session outcome locks | Startup verdict (success XOR startup-failure XOR `manual_switch`) uses `initialOutcomeRef`; a mid-stream `playback_stall` uses `stallReportedRef` and can fire even after a success. A stream that plays 30s then dies at 20min on token expiry is the highest-value signal. | One outcome lock per session: swallows a mid-stream stall that follows an early success. | [§9](#telemetry) |
| 33 | Gate every Phase-8 detector so it never fires on a guess | `no_bind` timers (10s soft / 25s hard) gated on gesture-intent + focus + no-playback; stall gated on bound+playing+focused; `manual_switch` only if the old provider was bound. A false failure inflates `hard_failures` and corrupts the denominator. | Fire failure outcomes eagerly on any non-play event: idle pre-play/ad gates emit false `no_bind` and poison the rate. | [§9](#telemetry) · [§10](#player-ux) |
| 34 | **(Superseded 2026-10-11 by the glass rule in §12.2)** No blur AND no elevation on any screen that plays video | A `blur?: boolean` prop (default `true`) on the glass primitives; callers over/near the video pass `blur={false}` (solid tint) and all `glow.*` elevation is stripped from `PlayerControls`. Both `dimezisBlurView` and `@sbaiahmed1` hardware blur re-capture the WebView surface every frame (`OnPreDrawListener`); elevation de-optimizes it the same way — proven to stutter *even on pause* on release builds. | Keep `experimentalBlurMethod=dimezisBlurView`: the original stutter root cause. Frost static-tint globally: user rejected ("lost its feel"), so per-surface. Chase it as a network/buffering bug: buffering stalls are real but separate and milder. | [§12](#ui-rendering) |
| 35 | Real OS rotation for the player, app otherwise portrait-locked | `expo-screen-orientation`: `App.tsx` locks `PORTRAIT_UP` and re-locks per-route except Player/Party; Player unlocks on focus, `toggleFullscreen` → `lockAsync(LANDSCAPE)`; `useResponsive` derives `isLandscapeMobile` purely from `useWindowDimensions`. The OS transforms the surface natively instead of the JS thread transforming a live WebView. | Software rotation — accelerometer + 90° canvas transform: stuttered transforming a live compositing surface, needs `expo-sensors` (not installed). Feature kept, impl scrapped (`useDeviceOrientationSensor.ts` orphaned). | [§12](#ui-rendering) |
| 36 | Hide the rotation/reflow flash with a state-driven black mask | `toggleFullscreen` sets `masking=true` + `maskFade=1` in the *same commit* as the layout change (mounts opaque, no one-frame leak), rendered as a screen-level sibling, fading out 560ms later. | No mask / rely on native transition: leaves a visible WebView reflow + rotation flash. | [§12](#ui-rendering) |
| 37 | Centralized design tokens enforced by CI | `theme/bearoom.ts` is the single source of truth (colors, `ms()`/`scale()`, font, glow); `scripts/check-theme-tokens.js` (`npm run check:theme`) `rg`-bans raw hex/rgba outside `theme/`. | Inline colors per component: drifts from the design system; CI fails the build on any raw hex/rgba outside `theme/`. | [§12](#ui-rendering) |
| 38 | Two-debugger verification model | Split verification: **execbro** for the React Native shell, **Chrome DevTools remote (CDP over adb)** for the in-WebView bridge/DOM/video, **Playwright** against the public provider DOM. execbro can't see inside the WebView and Bridgeless swallows WebView `console.log`, so CDP is the only truthful runtime view. | execbro/logcat only: can't see the injected bridge/`<video>`. Playwright-only: tests the string vs the public site, not the device runtime. Automated E2E (Detox/Maestro): poorly reproduces live-DOM/WAF/2-device sync. | [§13](#qa) |
| 39 | Party-capability = hijackable AND has a served script | `isPartyCapable(p) = isHijackable(p) && p.scriptVersion`. The 🐾 badge/filter, `canParty` + Watch-Party launch, `defaultHijackProvider`, and the HijackHint copy all gate on it — so party is only offered where the bridge can actually sync (videasy today). | Gate on bare `isHijackable`: 8 script-less providers advertised a party that silently never synced (the F1 "badge lies" gap). | [§6](#providers) · [§8](#ota-scripts) |
| 40 | Health-aware provider ordering (server-owned) | The worker reads the rolling-24h `provider_health` view (service-role, best-effort) and DEMOTES chronically-failing providers (failure_rate ≥ 0.5 AND ≥ 3 distinct clients) below healthy ones; the client mapper stops re-sorting so the server order survives. Steers only the SOLO default (party picks party-capable explicitly). | Client-side reorder: needs health on-device (RLS-locked) + the client re-sort would undo it. Auto-DISABLE a sick provider: one bad title/region condemns it — demotion is safer, disabling stays the manual killswitch. | [§4](#edge-worker) · [§9](#telemetry) |
| 41 | Per-title failure memory (cross-session) | `utils/failureMemory.ts` (MMKV, 4h TTL, self-pruning): a hard-error/no-bind/stall records `(mediaKey, providerId)`, a sustained success clears it, and `pickInitialProvider` biases the default source away from a provider that recently failed for THIS title — never stranding (falls back to the top one). | Session-only `excludedIds`: forgets across sessions, re-defaults to the known-bad source next open. Permanent blacklist: a transient blip kills a provider for a title forever. | [§10](#player-ux) |
| 42 | Autoplay-next gates the provider's own param | `getAutoplayNext()` (default on, previously unused) now gates videasy's `nextEpisode`/`autoplayNextEpisode` URL params in `buildEmbedUrl`. | A JS `ended`-hook advancing episodes app-side: videasy already auto-advances internally and this would need episode-count data; gating its param is simpler and correct. | [§10](#player-ux) |
| 43 | Player error recovery: branded overlay + dependency-free auto-retry | HijackPlayer covers the raw `net::ERR` page with a Retry / "Try another source" overlay, auto-retries with backoff (5/10/15s, capped at 3) + on `AppState` 'active', and fires `onRecovered` so the host un-excludes; recently-failed providers are dimmed-but-pickable in the sheet (exclusion deferred to "user moves on"). | A NetInfo/expo-network reconnect listener: a new NATIVE dependency forcing a dev-client rebuild — a periodic WebView reload + foreground retry self-heals transient blips without it. Auto-open the sheet on error (old behavior): jarring vs. an in-place Retry. Hide excluded providers: not recoverable until a remount. | [§7](#player-bridge) · [§10](#player-ux) |

---

## 16. File & directory map {#file-map}

Repo root: the project root (`NetPrime-Party/`) (branch `feat/improvements`). Only the load-bearing paths are listed.

### The edge worker (Tier 1)

| Path | Role |
|------|------|
| `worker/src/index.ts` | The whole `OpenAPIHono` Worker: routes `/config`, `/scripts`, `/scrape`, `/report`, `/cache/purge`, `/health`, `/docs`, `/openapi.json`; edge-cache logic; `APP_VERSION`, `MAINTENANCE_MODE` constants. |
| `worker/src/schemas.ts` | Zod/`@hono/zod-openapi` request+response schemas (validation, TS types, and the generated OpenAPI spec all derive from these). |
| `worker/src/supabase.ts` | PostgREST helpers — `getProviders()` (server `enabled=eq.true` filter), telemetry insert via service-role key. |
| `worker/wrangler.toml` | Worker config: name `netprime-worker`, `[[ratelimits]] REPORT_LIMITER` (namespace 1001, 30/60s). |
| `worker/.dev.vars` → `../.env.local` | Symlink so local `wrangler dev` reads the same env. |

### App data layer (Redux Toolkit + RTK Query)

| Path | Role |
|------|------|
| `src/store/index.ts` | `configureStore`, `setupListeners`, `serializableCheck:false`. |
| `src/store/services/workerApi.ts` | RTK Query API for the edge worker (`getConfig`, `scrape`, `reportOutcome`, `getScripts`). |
| `src/store/services/tmdbApi.ts` · `klipyApi.ts` | `fakeBaseQuery` + `queryFn` wrappers over existing TMDB/KLIPY utils. |
| `src/store/features/providers/providersSlice.ts` | Provider list + `maintenanceMode`, filled by `getConfig.matchFulfilled`; starts empty (killswitch). |
| `src/store/features/providers/mappers.ts` · `hooks.ts` | `remoteToProviders` mapping; `useProviders`/`useHijackableProviders` hooks. |
| `src/store/features/watchParty/watchPartySlice.ts` · `player/playerSlice.ts` | Party + player Redux state. |
| `src/store/ConfigBootstrap.tsx` | Boots `/config`, diffs `script_version`, syncs `/scripts` into MMKV. |

### The hijack player & injection bridge (Tier 2)

| Path | Role |
|------|------|
| `components/player/HijackPlayer.tsx` | The `react-native-webview` playback engine; injects the cached bridge `injectedJavaScriptBeforeContentLoaded`; `onMessage`/`onError`/`onBound` handling. |
| `components/player/HijackPlayer.web.tsx` | Web platform variant. |
| `components/player/PlayerControls.tsx` | RN overlay transport (glow-stripped; no blur over video). |
| `components/player/ProviderSheet.tsx` | Fallback/source picker bottom-sheet (dismiss-race flush). |
| `components/player/PlayerSettingsSheet.tsx` · `EpisodeSheet.tsx` · `HijackHint.tsx` | Settings (dub/quality), episode selector, hijack hint UI. |
| `components/player/providerRegistry.ts` | Imperative provider lookups reading `store.getState()` live. |
| `components/player/hijackCapabilities.ts` | `HIJACK_CAPS` overlay (seed for the `hijack` jsonb) — which providers have a bridge-reachable `<video>`. |
| `components/player/backgroundPlayback.ts` | Background-audio wiring around the WebView. |
| `components/player/EmbedWebView.old.tsx` · `SnifferWebView.old.tsx` | **Dead** — pre-hijack sniffer era; housekeeping cleanup (backlog I). |

### Injection scripts (Phase 6, OTA)

| Path | Role |
|------|------|
| `src/scripts/legacy-videasy.ts` | The proven `BRIDGE_JS` verbatim (`LEGACY_VIDEASY_BRIDGE`, `LEGACY_VIDEASY_ID`) — **served OTA, not bundled**. The thing that actually ships. |
| `src/scripts/universal-core.ts` · `videasy.delta.ts` | The clean core+delta refactor **skeleton** — future target, not shipped (lacks ~8 subsystems). |
| `src/scripts/bridgeCache.ts` | MMKV script cache (`bridge.scripts.v1`), `getCachedScript(providerId)`. |
| `scripts/upload-bridge.ts` | CLI: concat → `new Function()` parse gate → content-hash `script_version` → service-role `PATCH` → `/cache/purge`. |
| `scripts/check-theme-tokens.js` | CI guard: `rg`-bans raw hex/rgba outside `theme/` (`npm run check:theme`). |

### Screens, hooks, utils

| Path | Role |
|------|------|
| `src/screens/PlayerScreen.tsx` | Solo player host: resume-seek, gesture-gated no-bind/stall safety net, `excludedIds` fallback, telemetry outcome locks. |
| `src/screens/PartyScreen.tsx` · `JoinPartyScreen.tsx` | Synced party player + join flow. |
| `src/screens/HomeScreen.tsx` · `Movie/TvDetailsScreen.tsx` · `SearchScreen.tsx` · `MyListScreen.tsx` · `WatchHistoryScreen.tsx` · `MoreScreen.tsx` · `OnboardingScreen.tsx` · `TrendingShowsScreen.tsx` | Content browse/detail/search/library screens. |
| `hooks/useMediaCloseGuard.ts` | Android `BackHandler` close-guard with the `beforeClose()` fullscreen-first interceptor. |
| `hooks/useResponsive.ts` | `isLandscapeMobile` etc. derived purely from `useWindowDimensions`. |
| `utils/trackMatch.ts` | `matchAudio`/`matchQuality` curated-synonym silent-memory matcher. |
| `utils/prefs.ts` | MMKV prefs (audio/quality, `getAutoplayNext` — no consumer yet). |
| `utils/tmdbLists.ts` · `tmdbDetails.ts` · `history.ts` · `watchlist.ts` · `roomCode.ts` | TMDB fetch/transform, watch history, watchlist, room codes. |
| `utils/streamResolver.old.ts` · `checkGithubRelease.ts` | Dead sniffer resolver; GitHub-release update check. |

### Party services

| Path | Role |
|------|------|
| `services/party/useParty.ts` | Party lifecycle hook (lease renewal, host election, snapshot). |
| `services/party/PartySyncEngine.ts` · `PartyClient.ts` | Timeline-anchor extrapolation + Realtime client. |
| `services/party/usePartyChat.ts` | Ephemeral `party-chat:<code>` broadcast channel (200-msg cap). |
| `services/party/protocol.ts` | Vestigial Durable-Object protocol types (unused authority path). |
| `services/party/identity.ts` · `services/gifs.ts` · `services/supabase.ts` | Guest identity, KLIPY GIF/sticker, Supabase client. |
| `services/storage/universalStorage*.ts` | MMKV/web storage abstraction. |

### Database & migrations

| Path | Role |
|------|------|
| `supabase/migrations/0001_party_core.sql` … `0006_*.sql` | Party tables + `SECURITY DEFINER` RPCs (create/join/admin/host-reclaim). |
| `supabase/migrations/20260819131319_create_providers_table.sql` | `providers` table. |
| `supabase/migrations/20260820055924_providers_full_dynamic_playback_columns.sql` | `url_movie`/`url_tv`/`allowed_domain`/`hijack` columns. |
| `supabase/migrations/20260820113012_providers_bridge_scripts.sql` | `bridge_script` + `script_version` columns. |
| `supabase/migrations/20260820101449_provider_reports_telemetry.sql` | `provider_reports` (RLS-locked) + `provider_health` view. |
| `supabase/seed.sql` · `database/seed_providers.json` · `providers.json` | Seed sources (not runtime-imported; `seed_providers.json` is the old marketing shape). |

### Patches, docs, config

| Path | Role |
|------|------|
| `patches/@gorhom+bottom-sheet+5.2.14.patch` | Fixes the `window`-worklet crash on rotation (aliased to `win` + listener cleanup). |
| `patches/react-native-webview+13.13.5.patch` | Adds `AlwaysVisibleRNCWebView.kt` — forces a non-empty (0×0) surface so background media keeps playing. |
| `docs/architecture/*.md` | Design docs (watch-party-sync, player-and-injection, streaming-strategy, native-player). |
| `docs/qa/phase6-cutover-qa.md` · `milestone-qa.md` | QA suites (the CDP/execbro/Playwright recipe lives here). |
| `docs/providers/videasy.md` · `README.md` | Provider DOM notes (`README.md` is stale re: bundled providers). |
| `docs/project-board.md` | Phase board (Phase 9 scrape-cache, Phase 10 review mode pending). |
| `App.tsx` · `app.json` · `metro.config.js` · `eas.json` · `theme/bearoom.ts` | App entry / Expo config / Metro / EAS / design tokens. |

---

## 17. Environment, secrets & operations runbook {#ops}

### Client env vars (`.env.local`, gitignored; template in `.env.example`)

All `EXPO_PUBLIC_*` vars are **build-time-inlined** into the Web and Native bundles by Expo — they are *not* secrets in the compiled app and must never hold anything that shouldn't ship to a device.

| Var | Purpose | Notes |
|-----|---------|-------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://kdcghbuknadvcmjctsqk.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase **publishable/anon** key | RLS-scoped; cannot write `provider_reports` (proven `42501` denial). Safe to ship. |
| `EXPO_PUBLIC_WORKER_URL` | Edge worker base | `https://netprime-worker.spiderfan-no1.workers.dev` |
| `EXPO_PUBLIC_TMDB_PROXY_URL` | TMDB rate-limit/token proxy Worker | `https://tmdb.spiderfan-no1.workers.dev/` |
| `EXPO_PUBLIC_KLIPY_KEY` | KLIPY GIF/sticker app key | Called directly from the device (KLIPY ToS forbids proxying). Not a high-value secret but not committed. |
| `EXPO_PUBLIC_STREAM_PROXY_URL` | Optional stream proxy | Local/dev only; part of the deferred proxy-all backlog. |

### Worker secrets (never committed)

Set as Cloudflare Worker secrets via `npx wrangler secret put <NAME>` (locally mirrored in `worker/.dev.vars` → `../.env.local`, gitignored):

| Secret | Purpose |
|--------|---------|
| `SUPABASE_URL` | Same project URL, server-side. |
| `SUPABASE_ANON_KEY` / publishable | Read path for `/config` etc. |
| `SUPABASE_SERVICE_ROLE_KEY` | **The user's secret. Never committed.** Bypasses RLS; the *only* key that can write `provider_reports` and PATCH `bridge_script`. |

The KLIPY key is likewise never committed. `SUPABASE_SERVICE_ROLE_KEY` is passed at call time to the upload CLI, never stored in the repo.

### Deploy the worker

```bash
cd worker
npm run typecheck        # tsc --noEmit
npm run deploy           # wrangler deploy → netprime-worker.spiderfan-no1.workers.dev
# one-time / on change of a secret:
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Purge the edge cache after a Supabase provider/config/script change (no auth on the route — a purge only forces a fresh Supabase read):

```bash
curl -X POST https://netprime-worker.spiderfan-no1.workers.dev/cache/purge
```

> Keep `APP_VERSION` in `worker/src/index.ts` in sync with `app.json` `expo.version` by hand (no automated sync).

### Publish / update an injection script (OTA)

Editing the bridge in `src/scripts/legacy-videasy.ts` changes nothing on devices **until it is re-uploaded** — a change *requires* a re-upload. The CLI parse-gates the script, content-hashes a new `script_version`, service-role-PATCHes the `providers` row, and purges the cache:

```bash
# dry run — compile + parse-gate only, no network:
npx tsx scripts/upload-bridge.ts videasy --dry-run

# publish (service-role key passed at call time, never committed):
SUPABASE_SERVICE_ROLE_KEY=sb_secret_… npx tsx scripts/upload-bridge.ts videasy
SUPABASE_SERVICE_ROLE_KEY=sb_secret_… npx tsx scripts/upload-bridge.ts all
```

Devices pick up the new `script_version` on next launch (`ConfigBootstrap` boot-diff → `/scripts` → MMKV `bridge.scripts.v1`); the edge cache is purged automatically so `/scripts` serves the new body within ~60s regardless. Only `videasy` is registered in the `SCRIPTS` map today (F1 defer).

### Dependency patching (patch-package)

```bash
npm install             # runs "postinstall": "patch-package" automatically
```

`postinstall` re-applies `patches/@gorhom+bottom-sheet+5.2.14.patch` and `patches/react-native-webview+13.13.5.patch` on every install. Both are required — dropping the webview patch breaks background media; dropping the gorhom patch crashes on rotation with a sheet open. The webview patch touches native Kotlin, so it needs a native rebuild (`expo run:android`) to take effect, not just Metro.

### Metro / running the app

```bash
npm start               # expo start
npx expo start --clear  # clear the Metro cache (use after dep/patch changes)
npm run android         # expo run:android — required for the native webview patch
npm run lint            # expo lint
npm run check:theme     # CI theme-token guard (no raw hex/rgba outside theme/)
```

### Device debug recipe (two-debugger model)

Stutter must be tested only on a **release / cold-launch** build — a dev-menu reload leaks blur views and produces a *fake* stutter that contaminates any A/B.

**RN layer — execbro** (physical Android device): `scan_metro` / `ensure_connection`, then `get_logs`, `get_network_requests`, `redux_get_state`, screenshots/tap.

**WebView layer — Chrome DevTools remote (CDP over adb).** Bridgeless swallows in-WebView `console.log`, so CDP is the only truthful view of the injected bridge:

```bash
# play a videasy title so the WebView is live (dev build), then:
PID=$(adb shell cat /proc/net/unix | grep -oE 'webview_devtools_remote_[0-9]+' | head -1)
adb forward tcp:9222 localabstract:$PID
# open chrome://inspect  (or: curl localhost:9222/json/list)  → Inspect the videasy WebView
# in the WebView console: window.__vlBridge === true; __vlCmd/__soloCmd/__vlSetGuest/__vlChromeOff exist
```

**Public DOM — Playwright** (no device): cheap selector-rot watch against the live provider site; keep for CI, weaker than the on-device CDP check.

**Gotcha — DNS ad-blockers break the app before any code runs.** A device on **Private DNS = an ad-blocker** (Android Settings → Private DNS = `dns.adguard.com`, NextDNS, etc.) can silently block the app's OWN Cloudflare worker (`*.workers.dev` → `/config` fails → providers EMPTY → "Failed to fetch movies") AND the TMDB image CDN (blank posters). It looks like "the app is broken" but it's DNS. Check `adb shell settings get global private_dns_mode` (→ `off`/`hostname`/`opportunistic`) + `... private_dns_specifier`; to A/B: `adb shell settings put global private_dns_mode off`, reload, then restore `hostname` + the specifier. Also don't trust the in-app data-rate number for bandwidth — it's *consumption*; measure real throughput with `adb shell curl -w '%{speed_download}' 'https://speed.cloudflare.com/__down?bytes=3000000'`. Confirmed on the primary test device 2026-08-21 (AdGuard DNS was the root cause of empty providers all session).

---

## 18. Glossary {#glossary}

**OMSS** — the project's two-tier "hybrid" playback model: a Tier-1 Cloudflare **O**pen **M**edia **S**treaming **S**ervice fast-path (config/scrape) in front of a Tier-2 WebView "heavy tank" that runs the provider's own JS on the user's residential IP. The WebView is the real playback engine.

**Hijack player** — the `react-native-webview` (`HijackPlayer`) that loads a provider's embed page *and* injects a JS bridge to observe and drive the provider's own `<video>` element. Named "hijack" because it commandeers a page it didn't write.

**The bridge / `BRIDGE_JS`** — the injected JavaScript (shipped as `LEGACY_VIDEASY_BRIDGE`) that walks same-origin iframes, finds the `<video>` (`findVideo`), binds listeners, and exposes command globals. Carries ~8 subsystems (echo-suppression, keepAlive, guest gating, chrome-off, fullscreen, control-bar CSS, iframe finder, native-controls). `window.__vlBridge === true` signals it's installed.

**`__vlCmd` / `__soloCmd`** — command globals the bridge exposes for RN → WebView control. `__vlCmd` drives party-synced playback (play/pause/seek/rate); `__soloCmd` drives solo playback. RN posts to them and the bridge applies them to the bound `<video>`.

**`__vlSetGuest`** — toggles guest mode in the party: hides the provider's own transport so a guest can't fight host authority.

**`__vlChromeOff`** — strips the provider's on-page player chrome (control bar etc.) so the RN `PlayerControls` overlay is the only visible transport.

**Bind / `onBound`** — the moment the bridge successfully finds and attaches to the `<video>`. Controls mount only after bind; a failure to bind within the timeout is a **no-bind**.

**no-bind / stall / success** — the three telemetry outcome shapes. **no-bind** = the bridge never bound (10s soft banner / 25s hard fallback, gesture-gated). **stall** = a bound+playing stream froze >20s mid-stream (a separate lock, can fire even after a success — the token-expiry signal). **success** = the stream played. Also `not_found`, `manual_switch`, `captcha_block` (enum-only, no emitter yet).

**script_version** — a content hash (`<id>@<8-hex>`, e.g. `videasy@a1b2c3d4`) of the injection script. `/config` ships only this; `ConfigBootstrap` boot-diffs it against the MMKV cache and fetches `/scripts` bodies only when it changed.

**Killswitch** — the deliberate no-fallback design: providers come *only* from Supabase, the app bundles no catalog and no bridge, so clearing/disabling DB rows makes the app genuinely show nothing (for App-Store review or a global kill). "Empty must mean empty."

**RLS** (Row-Level Security) — Postgres per-row access policies. `provider_reports` has RLS **on** with **zero** policies, so no client key can write it; the party tables are SELECT-only with write access only through `SECURITY DEFINER` RPCs.

**Service-role key vs publishable/anon key** — the **service-role** key bypasses RLS and is the user's secret (never committed; the only key that writes `provider_reports` or PATCHes `bridge_script`). The **publishable/anon** key is RLS-scoped, safe to ship inlined in the app, and is hard-blocked from writing telemetry (proven `42501`).

**Distinct-client rate** — the health metric: `hard_failures / (successes + hard_failures)` weighted by distinct `client_hash` (a truncated SHA-256 of the CF IP, derived server-side). A rate (not a raw count) so one bad title or one abusive/NAT'd client can't condemn a provider.

**WAF token** — the deterministic, ephemeral, IP-locked token a provider's WAF (Web Application Firewall) gates its HLS/`.m3u8` behind. Because two sessions resolve the *identical* token and it re-resolves to the same *dead* URL after expiry, a native player can't self-heal — the core reason the WebView (which re-runs the provider's own WAF handshake) stays primary.

**`dimezisBlurView`** — expo-blur's `experimentalBlurMethod` on Android (a `RealtimeBlurView` fork). It re-samples the view behind it every frame; over a live WebView that means re-capturing the video surface continuously → stutter. Root cause of the playback-stutter investigation.

**`OnPreDrawListener`** — the Android pre-draw callback. The old blurs (`dimezisBlurView`, `@sbaiahmed1`) re-captured the window from it every frame; `modules/bearoom-glass` uses it only to check its offset and mark its own tiny layer for re-render on frames already being drawn — it never schedules a frame.

**Anchor / `effectivePositionMs`** — the party sync primitive: playback stored once as `{status, positionMs, rate, anchorServerTimeMs, epoch, seq}`; each client extrapolates the live position locally against a min-RTT-filtered server-clock offset, instead of streaming raw position ticks.

**Host lease / epoch / seq** — party authority: the host holds a 6s **lease** (renewed every 2s); if it lapses guests run a `joined_at`-ranked `party_claim_host` election won by the Postgres row lock. **epoch** bumps on a host handover; **seq** is the monotonic per-mutation counter for ordering.

**F1** — the 2026-08-20 decision to **defer** multi-provider bridges: post-cutover only videasy ships an OTA injection script, the other 8 hijackable providers inject `""` and never bind, and the party badge showing on them is an accepted lie until the clean core+delta refactor lands. (Videasy-only party.)


## 19. Future scope & deferred features (complete) {#future-scope}

The single, exhaustive registry of everything parked, planned-for-later, or half-built — one bullet per item, each with a source reference so nothing is ever lost to branch churn again. It merges the master `deferred-backlog.md` (groups A–I), every topic memory, the branch-proof durable plan (`~/Downloads/bearoom-stutter-and-ui-rework-plan.md` §6), the per-section "x.6 Open items" backlogs (§§3–14), the pending phases on [docs/project-board.md](docs/project-board.md), and in-tree code markers. Nothing here is built until the user explicitly asks. See also the condensed [§14 Roadmap](#roadmap).

### 19.1 Watch-party — room controls & host toggles

- **Play-next queue** — queue upcoming media for the room; host-authoritative. Deferred as part of the "all customizable & toggleable, later phase" batch. _Ref:_ `party-room-controls-toggles.md`; deferred-backlog §A; §11.6.
- **Polling system (room polls)** — room-wide votes; ties into the chat slash-commands path. Poll types (`pollCreate`/`pollVote`/`pollClose`) + `Permissions.canVote` already exist in `services/party/protocol.ts` but the UI is unbuilt. _Ref:_ `party-room-controls-toggles.md`; `party-chat-commands-polls.md`; §11.6.
- **Per-guest individual control** — granular per-member playback-control grant, beyond today's global `party_grab_control` / `canControlPlayback` toggle. _Ref:_ `party-room-controls-toggles.md`; deferred-backlog §A.
- **Chat moderation toggles** — mute chat entirely / mute a specific guest / disable chat; host-authoritative, enforced at the Supabase RPC chokepoint. _Ref:_ `party-room-controls-toggles.md`; deferred-backlog §A.
- **GIF / sticker polish** — better GIF loading effect, stickers (`sticker:boolean` on `kind:"gif"`), more functionality (GIF send + emoji reactions already shipped). _Ref:_ `party-room-controls-toggles.md`; deferred-backlog §A (`[PARTIAL]`).
- **Unified "customizable & toggleable" host-settings surface** — one settings screen exposing all of the above room controls. _Ref:_ `party-room-controls-toggles.md`; §14.6 group A.
- **Group-pause-on-buffer** — auto-pause the room when a guest buffers; explicitly deferred from the old sync engine (needs a guest→host buffering signal; `expo-video`'s `bufferedPosition` would enable it for a v2 native player). _Ref:_ `services/party/PartySyncEngine.ts:18` ("intentionally deferred to a later"); §11.6.

### 19.2 Watch-party — chat features

- **Slash-commands → room polls** — guest quick-actions like `/request-replay {timestamp}` and `/skip-to {timestamp}` that open a room poll; on pass the action applies via `party.seekTo(sec)`; host/admin applies directly (no poll). Command parser in `usePartyChat`/party screen + poll UI are the missing pieces. _Ref:_ `party-chat-commands-polls.md`; §11.6; deferred-backlog §B.
- **Reply / quoted threads** — WhatsApp/Telegram-style reply-to-message rendered as a quoted stub, tap-to-scroll to original; needs `ChatMessage.replyTo` (message id + snippet) in the broadcast payload. _Ref:_ `party-chat-reply-tagging.md`; §11.6.
- **@-mention tagging** — tag a member (and/or a message); mentioned user gets a highlight; mention metadata on the chat payload. _Ref:_ `party-chat-reply-tagging.md`; deferred-backlog §B.
- **Per-message send-timestamp on each bubble** — show the wall-clock send time on every message bubble. _Ref:_ `party-chat-commands-polls.md`; deferred-backlog §B (`[PARTIAL]`).
- **Send-with-current-media-timestamp** — an input option to stamp an outgoing message with the currently-playing media position (builds on the shipped clickable-timestamp feature). _Ref:_ `party-chat-commands-polls.md`; deferred-backlog §B.
- **Persisted chat history / GIFs / moderation** — chat is ephemeral today (broadcast-only, capped to the last ~200, no persistence). Persist history, GIFs, and add a moderation surface. _Ref:_ `services/party/usePartyChat.ts:6`; `party-chat-commands-polls.md`; §11.6.
- **Late-joiner backscroll / delivery receipts / typing indicator** — consequences of ephemeral chat: a late joiner sees no backscroll, and there is no read receipt or typing indicator. _Ref:_ §11.6 ("Ephemeral chat" gotcha).

### 19.3 Player, controls & playback UX

- **One unified controls layer** — show EITHER the provider's web controls OR our native overlay, and whichever shows must work in BOTH collapsed and fullscreen, with subtitle / quality / speed / dub-server switches functional and consistent across every provider. _Ref:_ `player-controls-unification.md`; §14.6 group C.
- **Solo player == party player** — unify the two; solo (`app/(player)/player.tsx` / the solo `PlayerScreen`) is a plain WebView with NO hijack bridge today, so add the bridge there first, then share one player everywhere. _Ref:_ `player-controls-unification.md`; `player-and-streaming-followups.md`; §10.6.
- **Read-only scrubber for guests** — progress visibility for non-controllers (the overlay currently mounts only when `canSeek`/`canControlPlayback`). _Ref:_ `player-and-streaming-followups.md`.
- **Episode selector for shows** — the original WebView player had it; dropped in the rebuild. Re-add. _Ref:_ `player-controls-unification.md`; deferred-backlog §C.
- **Smooth fullscreen↔collapsed RN-transform rotation + orientation lock** — WANTED feature: RN-level (transform-based, NOT OS) rotation for the smooth transition, plus orientation LOCK (portrait at rest / landscape fullscreen). Re-add cleanly; the gemini accelerometer + 90° canvas-transform impl stuttered and was scrapped. Today fullscreen uses OS `ScreenOrientation.lockAsync` masked by a fade cover. _Ref:_ `player-controls-unification.md`; §10.6; §14.6 group C.
- **Seek / control-button visual feedback** — visible feedback on seek and control taps. _Ref:_ `player-controls-unification.md`; deferred-backlog §C.
- **Quality picker "stuck on loading" fix** — the quality selector can hang on a loading state. _Ref:_ `player-controls-unification.md`; deferred-backlog §C.
- **Responsive tablet / big-screen / TV layout** — both portrait and landscape. _Ref:_ `player-controls-unification.md`; deferred-backlog §C.
- **Autoplay-next episode — DONE (videasy).** `getAutoplayNext()` (MMKV, default on) now gates videasy's `nextEpisode`/`autoplayNextEpisode` URL params (`buildEmbedUrl`, resilience batch), with a toggle in `PlayerSettingsSheet` (TV only). videasy advances internally; non-videasy providers have no autoplay-next path (would need an `ended`-event hook per provider). _Ref:_ §10.6; `providerRegistry.ts` `buildEmbedUrl`; `utils/prefs.ts` (`autoplayNext`).
- **iOS back / close-guard** — the media close guard is Android-only (`BackHandler`); iOS swipe-back needs a `beforeRemove` handler when iOS is stood up. _Ref:_ §10.6; `hooks/useMediaCloseGuard.ts`.
- **Native player controls (bridge-driven sheets)** — the Bearoom-skinned overlay plan's later phases: subtitle read/set via pointer-dispatch, server/dub sheets, "dub-not-synced" flag — driven through `HijackPlayer` bridge extensions. _Ref:_ [docs/plans/native-player-controls.md](docs/plans/native-player-controls.md) (Phase P3).
- **Overlay visual polish on a real device** — scrim / spacing / thumb were verified functionally only; the emulator returns an all-black `screencap` once the provider `<video>` binds (hardware overlay), so the overlay's actual pixels were never seen. _Ref:_ `player-and-streaming-followups.md`.
- **Auto-recovery from a dead stream** — videasy remembers position, so a gated WebView reload could resume after a chronic stall; must be hard-gated against reload loops, and videasy's pre-play gate reappears on reload (needs an auto-play-gate click). Not built (needs a decision). _Ref:_ [docs/investigations/playback-stutter.md](docs/investigations/playback-stutter.md) ("Follow-ups"); `player-stutter-is-network.md`.
- **Bitrate resilience (auto-drop quality on repeated stalls)** — videasy does NOT adapt down under a bandwidth limit (stays 1080p and starves); `hls.js` isn't reachable in its scope, so this needs videasy-DOM quality control that drops quality on repeated stalls. Not built. _Ref:_ [docs/investigations/playback-stutter.md](docs/investigations/playback-stutter.md) ("Follow-ups"); `player-stutter-is-network.md`.
- **Provider fallback on chronic stalls** — trigger the fallback path when a stream stalls persistently (distinct from the manual/error-triggered fallback shipped in Phase 8). Not built. _Ref:_ [docs/investigations/playback-stutter.md](docs/investigations/playback-stutter.md) ("Follow-ups").
- **Buffering-spinner follow-ups** — the `readyState`-driven buffering spinner (commit `7c7e6d9`) resolved the perceived "regression" from `__vlChromeOff` hiding videasy's own spinner; remaining resilience (auto-recovery / bitrate / fallback above) is the open work. _Ref:_ `player-stutter-is-network.md`; [docs/investigations/playback-stutter.md](docs/investigations/playback-stutter.md).
- **Slow-start poster overlap — STILL OPEN (a first-frame-gate attempt was reverted).** On a slow start videasy's own in-WebView poster splash shows *behind* our native controls (video "playing" but no frame decoded yet; `__vlChromeOff` hides videasy's control *bar*, not its poster splash). A fix that held the branded cover + delayed `PlayerControls` until the first painted frame (`playing`/`readyState≥3` + 6s backstop, via `playerReady`/`onReady`/`markReady`) was **reverted** — when the first-frame signal didn't latch (iOS simulator) it masked the whole player behind "Loading" forever. The cover + controls now gate on `playerBound` (bind) and the cover lifts at the 30s bind-timeout so a stuck stream reveals the provider's own UI. A correct fix must hide the poster WITHOUT gating playback on a signal that can fail to arrive (e.g. reliable autoplay, or a dismissible/timed poster-hide). _Ref:_ `docs/project-board.md` (Branded loading cover); the branded loading VISUAL (blurred poster + thumb + spinner) shipped and stays.

### 19.4 Providers, sources & scraping

- **Filterable providers bottom-sheet** — encapsulate the provider list in a @gorhom bottom-sheet with a filter and rich UI ("add as much as you can"). _Ref:_ `providers-bottomsheet-and-proxy.md`; §6.6; §14.6 group E.
- **Hijack more providers + QA to robustness** — bring the other 8 hijackable providers (VidFast, VixSrc, VidLink, VidCore, 111Movies, VidNest, VidPhantom, MyCineBy) to real party-sync; blocked on the universal core+delta bridge refactor (post-cutover only videasy injects a script). _Ref:_ `phase6-qa-bridge-gap.md`; `providers-bottomsheet-and-proxy.md`; §6.6; §14.6 group E.
- **Proxy more providers (ISP-block resilience)** — optionally route more providers through a proxy for ISP-block resilience (considered, deferred; DoH was "leave it"; a Cloudflare Worker proxy already exists for TMDB). _Ref:_ `providers-bottomsheet-and-proxy.md`; deferred-backlog §E.
- **Universal core+delta bridge refactor** — the clean `universal-core.ts` + `videasy.delta.ts` skeleton (missing ~8 subsystems the legacy monolith has) is the future baseline; the deferred event-rename (`timeupdate`/`state` vs legacy `tick`/`playing`/`pause`) and folding echo-suppression into `np.cmd` belong to THIS refactor, not the shipped Option-1 cutover. _Ref:_ §8.6; `worker-config-rtk-architecture.md`; `phase6-qa-bridge-gap.md`.
- **Party-badge honesty gate** — gate the 🐾 Party badge on `script_version != null` so it stops showing on the 8 script-less providers (a ~1-line fix, offered but not taken; accepted lie today). _Ref:_ `phase6-qa-bridge-gap.md`; §6.6; §8.6.
- **Real `/scrape` (existence check + extraction)** — the Tier-1 aggregator is a mock: `titleExists = true` is hardcoded and `success` returns a fabricated `master.m3u8`; real HTML parse / AES decrypt / existence check is TODO. _Ref:_ `worker/src/index.ts:160` (`// TODO: real existence check`); §2.6; §4.6.
- **Provider fallback + per-media failure memory** — port p-stream's fallback/ranking around `resolveNativeStream` (iterate sources by rank, remember failures per media key in MMKV, retry next source); `excludedIds` is session-scoped only today, no persisted per-title memory. _Ref:_ `player-and-streaming-followups.md`; [docs/research/streaming-integration-research.md](docs/research/streaming-integration-research.md) §2; §10.6.
- **TMDB concurrency limiter + in-memory cache** — adopt p-stream's 6-request concurrency limiter (avoid 429s) plus a `SimpleCache`. _Ref:_ [docs/research/streaming-integration-research.md](docs/research/streaming-integration-research.md) §5; `player-and-streaming-followups.md`.
- **Skip-Intro** — intro/credit skip-timing UX via TheIntroDB / SkipDB JSON. _Ref:_ [docs/research/streaming-integration-research.md](docs/research/streaming-integration-research.md) §2; `player-and-streaming-followups.md`.
- **Wyzie external subtitles** — external-subtitle scraping (npm `wyzie-lib`, docs.wyzie.ru) as an optional add-on. _Ref:_ [docs/research/streaming-integration-research.md](docs/research/streaming-integration-research.md) §2; `player-and-streaming-followups.md`.
- **Streaming-source catalog to mine** — a large research catalog (p-stream, CoorenLabs, vidcore resolver, FMHY, rentry API-sites) to source more embeds/providers from. _Ref:_ `streaming-sources-2026.md`; [docs/research/streaming-integration-research.md](docs/research/streaming-integration-research.md); [docs/research/github-references.md](docs/research/github-references.md).

### 19.5 Rendering, UI & theming

- **Per-surface blur decision** — after the UI rework, decide surface-by-surface which of the 9 blur surfaces keep real blur (aesthetic) vs drop it (over/near the playing video). PROVEN RULE: on any screen that plays video, nothing over/around the player may use blur OR elevation (both blur backends re-capture the WebView every frame → stutter); test stutter only on release/cold-launch. _Ref:_ `playback-stutter-is-dimezis-blur.md`; `~/Downloads/bearoom-stutter-and-ui-rework-plan.md` §1; §12.6.
- **Low-end glass check** — the gate exists now (live blur only on Android 12+ floating bars; crafted elsewhere; Reduce Transparency honoured on iOS); what remains is a run on a genuinely weak Android 12+ device. _Ref:_ §12.6.
- **Glass follow-ups** — iOS 27 simulator check; Android lens shader; `/config` kill switch; low-end Android check of the bar blur; live video glass with the native player. _Ref:_ §12.6; spec `docs/superpowers/specs/2026-10-11-glass-design.md`.
- **Atmospheric background phase (shelved)** — a subtly living, device-adaptive animated background (slow drifting soft-blurred forms; Skia preferred, Reanimated/SVG or LinearGradient as lower tiers) behind the UI; adaptive renderer keyed on device tier / memory / low-power / reduced-motion. MUST hard-freeze/unmount on Player + Party screens so video decode wins; Skia not installed (needs a prebuild). A Stitch WebGL shader prototype exists as visual reference. _Ref:_ `atmospheric-background-phase.md`; §12.6; deferred-backlog §H.
- **UI-rework saga (cherry-pick from gemini HEAD)** — HEAD's ~4-day "antigravity gemini" `src/features/*` shell refactor was judged off/ugly; branch `ui-rework` was cut from the good-UI base `7eb71b5` to cherry-pick the useful feats (React Navigation, background playback, web/responsive, avatars, rebrand, orientation-lock+RN-rotation feature) and scrap the rest. In progress; durable branch-proof plan lives outside the repo. _Ref:_ `bearoom-ui-rework-plan.md`; `~/Downloads/bearoom-stutter-and-ui-rework-plan.md` §3; §12.6.
- **"Perfect UI" polish pass via Stitch/gemini** — a later UI-polish pass using the connected Stitch MCP ("connect it, we will pick it later"); Stitch project `9821378598804634936`. _Ref:_ `providers-bottomsheet-and-proxy.md`; deferred-backlog §F.
- **Sticky / persistent top header** — a persistent top header across screens. _Ref:_ `providers-bottomsheet-and-proxy.md`; deferred-backlog §F.
- **Physical-rotate WebView flash fix** — the black anti-flash mask covers only the `toggleFullscreen` button path; an accelerometer-driven OS rotation may still leak one WebView frame — likely needs an orientation-change listener. _Ref:_ §12.6; `bearoom-ui-rework-plan.md`.
- **Polished empty-state UI** — when `/config` returns zero providers (the deliberate store-review killswitch), the app is null-safe but the polished empty-state screen is a later phase. _Ref:_ `worker-config-rtk-architecture.md`; §1.6.

### 19.6 Native & platform features (via the WebView)

Native features are added *around* the WebView, not by re-hosting the stream (native stream-sniffing was rejected — see §19.9). Implementation plan: [docs/plans/webview-native-features.md](docs/plans/webview-native-features.md).

- **iOS PiP + AirPlay + inline (Phase 1)** — WebView props (`allowsPictureInPictureMediaPlayback`, `allowsAirPlayForMediaPlayback`, `allowsInlineMediaPlayback`) + `UIBackgroundModes: ["audio"]` + a PiP button on the overlay. _Ref:_ [docs/plans/webview-native-features.md](docs/plans/webview-native-features.md) Phase 1; `native-player-rejected.md`.
- **Background audio (iOS)** — keep audio playing when backgrounded, via `UIBackgroundModes: ["audio"]` + audio-session category. _Ref:_ [docs/plans/webview-native-features.md](docs/plans/webview-native-features.md) Phase 1.
- **Background audio (Android)** — Android WebView media pauses when the Activity backgrounds; needs the `AlwaysVisibleRNCWebView` visibility hack (solo done & verified on a real device; party pending). _Ref:_ [docs/plans/webview-native-features.md](docs/plans/webview-native-features.md) Phase 2; [docs/plans/party-background-audio.md](docs/plans/party-background-audio.md); §7.6.
- **Lock-screen / media-session controls (both platforms)** — bridge the WebView `<video>` ↔ a native media session so the lock screen shows play/pause/seek and remote commands drive the video via `injectJavaScript`. _Ref:_ [docs/plans/webview-native-features.md](docs/plans/webview-native-features.md) Phase 2; §7.6.
- **Party background audio + lock-screen (extend solo → party)** — fold keep-alive + echo-suppression + hooks INTO the bridge (not a `SOLO_BG_JS` import), and route lock-screen buttons through the room authority, NOT `party.pause()` (a server no-op for guests). _Ref:_ [docs/plans/party-background-audio.md](docs/plans/party-background-audio.md).
- **Android Picture-in-Picture (research)** — Activity-based (`enterPictureInPictureMode()` on MainActivity + keep the WebView video rendering in PiP), not a WebView prop; treat as research. _Ref:_ [docs/plans/webview-native-features.md](docs/plans/webview-native-features.md) Phase 2 (item 5).
- **Chromecast / cast (out of scope, noted)** — full Chromecast without the provider's own cast support is deferred; iOS AirPlay in Phase 1 is the achievable "cast." _Ref:_ [docs/plans/webview-native-features.md](docs/plans/webview-native-features.md) ("Out of scope").

### 19.7 Backend, worker & telemetry (Phases 9–10)

- **Phase 9 — server-side scrape caching** — a `title_provider_cache` table to protect the Worker from rate limits; cache ONLY metadata (dubs/qualities), NEVER `.m3u8` URLs for IP-locked providers, and no 4h negative-caching of failures. Not started. _Ref:_ [docs/project-board.md](docs/project-board.md) Phase 9; §14.6.
- **Phase 10 — store-review "Listing Only" mode** — wire the Supabase `enabledProviders: []` state to a benign "Listing Only" UI for App Store / Play review. Not started. _Ref:_ [docs/project-board.md](docs/project-board.md) Phase 10; §14.6; §19.8.
- **Phase 10 — web parity story** — acknowledge cross-origin iframe limits on web; provide a simplified web-only fallback. Not started. _Ref:_ [docs/project-board.md](docs/project-board.md) Phase 10; §14.6.
- **`maintenanceMode` real listing-mode flag** — currently a hardcoded `false` placeholder wired through the slice/hook; becomes the real store-review "listing mode" flag under its own flag (not wired to Supabase yet). _Ref:_ `worker/src/index.ts:51`; §1.6; §2.6; §4.6; `worker-config-rtk-architecture.md`.
- **`provider_health` consumer (auto-ordering / auto-disable)** — the rolling-24h health view exists but nothing reads it back to order providers or auto-disable a sick one; fallback is user-driven today (banner + session exclusion list). _Ref:_ §9.6; `worker-config-rtk-architecture.md`.
- **`captcha_block` client detector** — the outcome exists in the enum, table check, and health numerator, but no Phase-8 detector emits it (captcha/interstitial detection inside the WebView is unbuilt). _Ref:_ §9.6; `worker-config-rtk-architecture.md`.
- **`not_found` telemetry trigger** — blocked until the Phase-6 bridge broadens; no client call-site fires it yet. _Ref:_ [docs/project-board.md](docs/project-board.md) Phase 8 note.
- **`REPORT_LIMITER` hardening** — placeholder `namespace_id = "1001"`, IP-keyed (coarse on NAT/mobile), best-effort (silently no-ops if the binding is unset); distinct-client weighting in the view is the real backstop. _Ref:_ §2.6; §9.6.
- **`APP_VERSION` auto-sync** — the worker's version constant is kept in sync with `app.json` `expo.version` by hand. _Ref:_ §2.6.
- **`/cache/purge` auth** — no auth on the purge route (any caller can purge); acceptable only because a purge just forces a fresh Supabase read. _Ref:_ §2.6.
- **Shared retry/backoff + error surface** — the three RTK Query APIs rethrow raw `Error`s with no shared retry/backoff; `/report` is fire-and-forget (202 regardless). _Ref:_ §5.6.
- **`serializableCheck: false` review** — a blanket disable "for later" non-serializable payloads that nothing currently needs; it hides genuine non-serializable state bugs. _Ref:_ §5.6.
- **`getConfig` cache-window review** — `keepUnusedDataFor: 18000` (5 h) contradicts its "keep 5 min" docstring; a party can run on provider data hours old unless a reconnect/`purgeCache` refetches. Verify intended; also `refetchOnFocus` is wired via `setupListeners` but not opted-in per-endpoint (candidate for the config query). _Ref:_ §5.6.
- **iOS / web telemetry & detectors** — the platform enum accepts all three but the Phase-8 detectors and player are Android-first; iOS/web telemetry is nominal only. _Ref:_ §9.6.

### 19.8 Housekeeping / tech-debt / dead code

- **Dead files awaiting cleanup** — `utils/streamResolver.old.ts`, `components/player/EmbedWebView.old.tsx`, `components/player/SnifferWebView.old.tsx` (delete or resurrect if reusable). _Ref:_ §14.6 group I; deferred-backlog §I; repo `find *.old.*`.
- **`expo-sensors` install-or-delete** — `hooks/useDeviceOrientationSensor.ts` was orphaned (imports uninstalled `expo-sensors`); install & wire if the RN-rotation feature is kept, else delete. §14.6 reports it already removed in-tree — verify against the working tree. _Ref:_ deferred-backlog §I; `~/Downloads/bearoom-stutter-and-ui-rework-plan.md` §5; §14.6 (marked resolved).
- **`·Q` debug marker** — a debug marker in `src/screens/PlayerScreen.tsx` to remove before final; §14.6 reports it already gone — verify. _Ref:_ deferred-backlog §I; §14.6 (marked resolved).
- **GitHub remote** — "connect GitHub remote" was on the backlog; §14.6 reports `origin` now set — verify. _Ref:_ deferred-backlog §I; §14.6 (marked resolved).
- **Stale docs to rewrite** — [docs/providers/README.md](docs/providers/README.md) still describes the removed bundled-`providers.json` model; rewrite when touched. _Ref:_ §6.6.
- **Seed drift** — [database/seed_providers.json](database/seed_providers.json) is the OLD shape (`url_template`/`capabilities`/`*_description`), missing `url_movie`/`url_tv`/`allowed_domain`/`hijack`; not a faithful seed for the full-dynamic columns. _Ref:_ §6.6.
- **Vestigial protocol types** — `protocol.ts` declares Durable-Object-era types (`ClientIntent`, `ServerEvent`, `Poll`, `DEFAULT_ROOM_CONFIG`) unused by the shipped Supabase path; do not build against them. _Ref:_ §11.6.
- **`locked` vs `private` identical** — the two room access modes encode no distinct behavior in `party_join` SQL. _Ref:_ §11.6.
- **`party_transfer_host` doesn't require an `approved` target** — asymmetric with claim/grab; a correctness nit. _Ref:_ §11.6.
- **`effectivePositionMs` has no upper clamp** — can exceed media duration near the end (harmless today). _Ref:_ §11.6.
- **Two `GlassButton` paths** — a `src/ui` real component + a `components/ui` re-export; edit the `src/ui` source. _Ref:_ §12.6.
- **First `readAudio` can return `audios:[]`** — the Servers panel renders lazily and the 360 ms `__vlReadAudio` timeout can fire before buttons exist (byte-identical legacy behavior, not a cutover regression); a bounded retry-on-empty would remove it. _Ref:_ §13.6 (F4).
- **WebView hard-error UX — DONE.** Branded error overlay (Retry / Try another source) + bounded auto-retry (5/10/15s) + retry-on-foreground (no NetInfo dependency) + recoverable exclusions (dimmed-but-pickable in the sheet; un-excluded on recovery). _Ref:_ HijackPlayer error overlay; [Decision log #43](#decision-log).
- **Fallback-sheet dismiss race** — a pick that fails instantly can call `present()` while the sheet is still dismissing → swallowed; coded fix present but not fully re-verified on device. _Ref:_ §13.6 (F2).
- **Blocked QA items (need service key / 2 devices / release build)** — A3 OTA re-upload loop, A4 `provider_reports` DB persistence, Suite B live-edit killswitch, Suite E dead-domain edit, A5 cache-wipe first launch (need `SUPABASE_SERVICE_ROLE_KEY` / Supabase-MCP auth); true 2-device party echo-suppression + guest transport hiding (need a second device); playback stutter (needs a release/cold-launch build). _Ref:_ §13.6; §14.6; `phase6-qa-bridge-gap.md`.

### Explicitly rejected (not deferred — decided against)

These were considered and killed — do NOT revive without a new decision.

- **Native `expo-video` player fed by a sniffed stream** — REJECTED: videasy serves HLS via a deterministic, ephemeral, WAF-gated token, so a native player cannot self-heal on token expiry (re-resolve returns the same dead URL). The WebView stays the primary playback engine. _Ref:_ `native-player-rejected.md`; [Decision log](#decision-log).
- **On-device open-source stream extraction (`@movie-web/providers` / p-stream)** — REJECTED / dead end: `@movie-web/providers@2.4.13` returns null for all sources (abandoned), and the maintained `p-stream/providers` fork is DMCA-taken-down on GitHub with the reliable scrapers moved to a closed hosted backend. _Ref:_ `native-player-migration.md`; `provider-postmessage-events.md`; [Decision log](#decision-log).
- **The gemini software-rotation impl (accelerometer + 90° canvas transform)** — REJECTED as shipped: it stuttered and was a stutter-regression suspect. NOTE: the *feature* (smooth RN-transform rotation + orientation lock) is still WANTED and deferred (§19.3) — only this implementation was scrapped. _Ref:_ `player-controls-unification.md`; `~/Downloads/bearoom-stutter-and-ui-rework-plan.md` §3; [Decision log](#decision-log).
- **Global static-tint blur replacement (`Frost` everywhere)** — REJECTED: replacing all 9 blur surfaces with a static Android tint was smooth but the user rejected it ("without that glass blur it lost its feel"). Real blur is wanted; the actual rule is per-surface (no blur/elevation only over/near video). _Ref:_ `playback-stutter-is-dimezis-blur.md`; [Decision log](#decision-log).
- **$500/mo reverse-proxy architecture** — REJECTED in Phase 1 in favor of the Two-Tier Hybrid (edge Worker + WebView). _Ref:_ [docs/project-board.md](docs/project-board.md) Phase 1; [Decision log](#decision-log).
- **`dimezisBlurView` / any per-frame blur or elevation over the player** — REJECTED as the proven root cause of playback stutter (re-captures the WebView every frame, even on pause). _Ref:_ `playback-stutter-is-dimezis-blur.md`; [Decision log](#decision-log).


## 20. References & sources {#references}

Every claim in this handbook traces back to one of the sources below: the in-repo design docs, the QA/research corpus, the durable project memory (decision records + the deferred-work backlog), the branch-proof plan kept outside git, and the external libraries/services and upstream fixes the app depends on. Repo files link repo-root-relative (from `docs/HANDBOOK.md`). A **status** note flags whether a source is authoritative for current code, partially stale, or fully superseded/archival — trust the handbook body over any source marked stale.

### Internal design docs (docs/)

| Doc | What it covers | Status |
|---|---|---|
| [docs/architecture/README.md](docs/architecture/README.md) | The architecture map + stack summary; entry point that links every subsystem doc. | Authoritative as a map; its **data/nav prose is partially stale** (self-flagged) — predates the React-Navigation + RTK-Query + full-dynamic-providers branch. |
| [docs/architecture/app-shell-and-data.md](docs/architecture/app-shell-and-data.md) | Navigation, root provider stack, TMDB data, MMKV storage, theming, Supabase client, dev tooling. | **Partially stale** — the "Data & backend layer (current)" block is live; the older expo-router + `fetchDetails()` prose below it is historical. |
| [docs/architecture/player-and-injection.md](docs/architecture/player-and-injection.md) | The WebView "hijack": how the bridge observes/drives the provider `<video>`, JS/CSS injection, solo background-audio, CDP-over-adb debugging. | Authoritative for the current bridge mechanism. |
| [docs/architecture/watch-party-sync.md](docs/architecture/watch-party-sync.md) | Playback authority + sync: Postgres single-writer RPCs, timeline anchor + server clock, 6s host lease + election. | Authoritative — "verified against current code + migrations `0001`–`0006`". |
| [docs/architecture/chat-and-reactions.md](docs/architecture/chat-and-reactions.md) | Party social layer: ephemeral text/GIF/sticker chat on its own Realtime channel, floating reactions, tappable media-timestamps. | Authoritative — "verified against the current code". |
| [docs/architecture/native-player.md](docs/architecture/native-player.md) | Design/plan for a native `expo-video` player fed by a hidden resolver WebView + dub picker ("Re-Sniff Loop", OMSS models). | **Superseded / aspirational** — native stream-sniffing was ultimately rejected (WAF tokens); designed, not built. |
| [docs/architecture/native-streaming-master-plan.md](docs/architecture/native-streaming-master-plan.md) | The "$0 native streaming + watch party" master blueprint (edge resolvers, M3U8 proxy, web+mobile native players, dubs). | **Superseded / aspirational** — the native-playback direction was rejected; not built. |
| [docs/architecture/streaming-strategy-v2.md](docs/architecture/streaming-strategy-v2.md) | The "Two-Tier Hybrid" model: fast serverless scrape first, hidden-WebView fallback → native ExoPlayer/AVPlayer. | **Superseded** — marked "Approved & Ready" but the native-sniff tier was rejected; the shipped app is WebView-primary. |
| [docs/providers/README.md](docs/providers/README.md) | Provider model, per-provider hijack capabilities, the hijackable vs cross-iframe distinction, `buildEmbedUrl`. | **Stale** — describes the removed bundled-`providers.json` runtime import; providers are now full-dynamic from Supabase. |
| [docs/providers/videasy.md](docs/providers/videasy.md) | The deep reverse-engineering of the primary provider (`player.videasy.to`, branded "NetPrime"): DOM targets, sniffing, guest-transport-hide selectors. | Authoritative — "verified on-device"; the one provider with a served OTA bridge. |

### QA, investigations & research

| Doc | What it covers | Status |
|---|---|---|
| [docs/project-board.md](docs/project-board.md) | The living master implementation plan / phase checklist (Phase 1–10, closed vs active vs pending). | Authoritative current-state roadmap. |
| [docs/qa/phase6-cutover-qa.md](docs/qa/phase6-cutover-qa.md) | Device-QA script for the Phase 6 OTA-bridge cutover + full backend-era regression (dynamic providers, RTK Query, telemetry). | Authoritative / current (this branch's active QA). |
| [docs/qa/milestone-qa.md](docs/qa/milestone-qa.md) | Earlier-session QA: dynamic providers + RTK Query + zero-wait Play + silent memory (commits `313939c→3d46b53`). | Largely **superseded** by the Phase 6 QA; historical. |
| [docs/investigations/playback-stutter.md](docs/investigations/playback-stutter.md) | On-device (CDP/gfxinfo) stutter investigation: buffered data plays clean, so buffering + render are separate causes. | Authoritative on method; the "network" root-cause conclusion is **partially superseded** by the dimezis-blur finding (see memory). |
| [docs/research/scraper-poc-postmortem.md](docs/research/scraper-poc-postmortem.md) | The ADR that **rejected** direct scraping/native playback and standardized on the WebView hijack (XSalsa20/VixSrc POC results). | Authoritative decision record; the POC code itself is **archived**. |
| [docs/research/architecture-case-studies-summary.md](docs/research/architecture-case-studies-summary.md) | The "master thesis" on why the Two-Tier Hybrid was chosen — iMayhem/CinePro/StreamGrabber case studies, the arms race. | Research/reference; historical rationale (predates the WebView-primary simplification). |
| [docs/research/streaming-integration-research.md](docs/research/streaming-integration-research.md) | Deep dive on p-stream, the rentry "API Sites" list, CoorenLabs; techniques vs target-list, ToS/legal caveats. | **Historical** — self-flagged; predates dropping on-device extraction (`@movie-web/providers` uninstalled). |
| [docs/research/github-references.md](docs/research/github-references.md) | Annotated archive of scraper/extractor GitHub repos evaluated (vidsrc.ts, movie-scraper, etc.), tiered by adaptability. | **Archived for reference only — not used in production** (self-flagged). |

### Plans (implementation direction)

| Doc | What it covers | Status |
|---|---|---|
| [docs/plans/webview-native-features.md](docs/plans/webview-native-features.md) | The decision doc: WebView stays primary (native-sniff rejected over WAF tokens); add PiP/AirPlay/bg-audio/lock-screen *around* it. | Authoritative decision; parts implemented. |
| [docs/plans/party-background-audio.md](docs/plans/party-background-audio.md) | Extending solo background-audio + lock-screen to the watch party (FGS, lease renewal, guest transport-hide). | **Implemented** (2026-08-16, device-verified); now a design record, not a to-do. |
| [docs/plans/native-player-controls.md](docs/plans/native-player-controls.md) | Live phased plan for Bearoom-skinned native controls over the hijacked WebView + close-guard + orientation. | Live implementation plan (in progress). |

### Project memory (decision records & backlog)

Project memory lives under `~/.claude/projects/-Users-essence-ReactNative-NetPrime-Party/memory/`. It is the durable store of decisions and — critically — the anti-loss backlog of every deferred idea.

| Memory file | Hook | Status |
|---|---|---|
| `MEMORY.md` | **The index** — one-line links to every memory below; read first. | Authoritative index. |
| `deferred-backlog.md` | ⭐ **Master index of every "look later" item**, grouped A–I; the anti-loss anchor (mirrored in the Downloads doc §6). | Authoritative backlog. |
| `capture-deferred-items-durably.md` | Working rule: proactively persist every deferred idea to memory + the branch-proof doc (user is scarred by lost work). | Authoritative process note. |
| `worker-config-rtk-architecture.md` | The deployed Cloudflare/Hono worker (config/scrape/report), full-dynamic Supabase providers, RTK Query, provider-health telemetry. | Authoritative / current. |
| `phase6-qa-bridge-gap.md` | 🚨 Cutover passes on videasy but the other 8 hijackable providers inject **no** script (party badge lies); F1 = defer. | Authoritative / current. |
| `playback-stutter-is-dimezis-blur.md` | **Proven** root cause: live `dimezisBlurView`/hardware blur re-captures every frame → the stutter. Rule: no blur/elevation on any video screen. | Authoritative (supersedes the "network" note). |
| `player-stutter-is-network.md` | Earlier theory that the stutter was buffering, not render. | **Partially superseded** by the dimezis-blur finding (buffering spinner still valid). |
| `native-player-rejected.md` | Decision: WebView stays primary; native-sniff killed by deterministic WAF tokens; add native features via the WebView. | Authoritative decision record. |
| `native-player-migration.md` | State of the abandoned `native-video-player` branch and why on-device sniffing didn't pan out. | Historical (superseded by `native-player-rejected`). |
| `provider-postmessage-events.md` | On-device probe of what each embed exposes via `postMessage` — feasibility input for sync. | Historical reference (early-session, 3-provider era). |
| `streaming-sources-2026.md` | Landscape of working vs dead movie/TV stream sources (mid-2026), multi-engine research. | Reference / historical. |
| `atmospheric-background-phase.md` | Future device-adaptive living-background phase; do **not** build yet (must freeze on video screens). | Deferred (shelved). |
| `low-end-blur-capability-gate.md` | Low-end glass gate — now covered by the API-31 + bars-only rule (§12.2); a weak-device check remains. | Mostly resolved 2026-10-11. |
| `bearoom-ui-rework-plan.md` | Memory pointer to the UI-rework plan: HEAD's gemini UI is mostly to scrap; bisect → branch → cherry-pick → decide blur per-surface. | Deferred plan (full prose in the Downloads doc). |
| `party-room-controls-toggles.md` | Future: play-next queue, polls, per-guest control, mute/disable chat, GIF/sticker polish ("all toggleable, later phase"). | Deferred. |
| `party-chat-commands-polls.md` | Future: guest slash-commands (`/request-replay`, `/skip-to`) that become room polls; host applies. | Deferred. |
| `party-chat-reply-tagging.md` | Future: reply-to-message (quoted threads) + `@`-mentions in party chat. | Deferred. |
| `player-controls-unification.md` | Future: one controls layer (web/native, solo==party), episode selector, rotation/orientation lock, responsive TV, seek feedback. | Deferred. |
| `player-and-streaming-followups.md` | Future: native controls overlay (solo + guest scrubber, visual QA) + provider fallback/failure-memory. | Deferred. |
| `providers-bottomsheet-and-proxy.md` | Future: filterable providers bottomsheet, more providers, optional proxy-all; Stitch reserved for UI polish. | Deferred. |

### Durable plans

| Doc | What it covers | Status |
|---|---|---|
| `~/Downloads/bearoom-stutter-and-ui-rework-plan.md` | The **branch-proof** prose plan kept outside the git repo (survives checkouts/resets): the solved playback-stutter root cause, the UI-rework strategy, and §6 the full mirror of the deferred backlog. | Authoritative durable copy (last updated 2026-08-18/19). |

### External references & upstream

| Reference | Why it matters here | Note |
|---|---|---|
| [gorhom/react-native-bottom-sheet#2679](https://github.com/gorhom/react-native-bottom-sheet/pull/2679) | Upstream fix for the `useAnimatedLayout` worklet capturing a var literally named `window` → *"Property 'window' doesn't exist"* redbox on rotation. | Applied locally as `patches/@gorhom+bottom-sheet+5.2.14.patch` (aliases to `win` + adds listener cleanup) — see §10/§12. |
| [gorhom/react-native-bottom-sheet#2734](https://github.com/gorhom/react-native-bottom-sheet/issues/2734) | The upstream bug report for the same rotation crash. | Context for the patch above. |
| [`@gorhom/bottom-sheet`](https://github.com/gorhom/react-native-bottom-sheet) (v5.2.14) | The provider/settings/GIF bottom sheets; the `presentSheet` dismiss-race flush (§10) works around its `present()`-during-dismiss swallow. | Patched dependency. |
| [TMDB API](https://developer.themoviedb.org/docs) | Catalog metadata, images, and search — the `tmdbApi` RTK Query surface (`fakeBaseQuery` + `queryFn` over existing `tmdbLists`/`tmdbDetails`). | Third-party API. |
| [KLIPY API](https://docs.klipy.com/) | GIFs + stickers for party chat, **called directly from the device** (its ToS forbids proxying/relaying), preserved in `services/gifs.ts`. | ToS constraint — no worker proxy. |
| [Supabase](https://supabase.com/docs) | Postgres single-writer party authority (`SECURITY DEFINER` RPCs, RLS, row locks), Realtime broadcast fan-out, anon auth, and the provider/config/telemetry store behind the worker. | Backend platform. |
| [Cloudflare Workers](https://developers.cloudflare.com/workers/) + [Hono](https://hono.dev/) + [`@hono/zod-openapi`](https://github.com/honojs/middleware/tree/main/packages/zod-openapi) | The `$0` edge worker (`netprime-worker.spiderfan-no1.workers.dev`): config/scrape/report + OTA scripts, Zod-driven validation → auto `/docs`, edge Cache API with synthetic keys. | Deployed backend. |
| [`react-native-webview`](https://github.com/react-native-webview/react-native-webview) (13.13.5) | The primary playback engine — the hijack player mounts the provider embed and injects the bridge (`injectedJavaScriptBeforeContentLoaded`). | Core dependency. |
| [`react-native-reanimated`](https://docs.swmansion.com/react-native-reanimated/) | Overlay/controls animation and the worklet that triggered the gorhom rotation patch. | Core dependency. |
| [`react-native-mmkv`](https://github.com/mrousavy/react-native-mmkv) (v4) | Local persistence: cached OTA bridge bodies (`bridge.scripts.v1`), silent dub/quality prefs, misc app state. | Core dependency. |
| [`@movie-web/providers`](https://github.com/movie-web/providers) + the p-stream fork ([`xp-technologies-dev/p-stream`](https://github.com/xp-technologies-dev/p-stream)) | The abandoned/DMCA'd on-device OSS stream-extraction path — evaluated, resolved nothing, **uninstalled**; the reason native extraction was dropped. | Rejected/removed — reference only. |
| [`expo-screen-orientation`](https://docs.expo.dev/versions/latest/sdk/screen-orientation/) | Dynamic orientation control + fullscreen/rotation handling in the player. | Expo SDK 53 module. |
| [`expo-blur`](https://docs.expo.dev/versions/latest/sdk/blur-view/) (`dimezisBlurView`) | The glass look — and the **proven stutter cause** on video screens; kept off any surface over/near playing video (§12). | Expo SDK 53 module (usage gated). |
| [`expo-video`](https://docs.expo.dev/versions/latest/sdk/video/) | The native player evaluated for the sniff/"Re-Sniff Loop" direction — **not shipped** (WAF tokens defeat self-heal). | Evaluated, rejected. |


---

## Document provenance & maintenance

This handbook is a **living document**. It was assembled on 2026-08-20 from the codebase, the `docs/` design notes, and the project memory, reflecting branch `feat/improvements` @ `8fbd13b`. It narrates the system; it does not replace the authoritative machine-readable records (the Supabase schema, `worker/src/schemas.ts` → OpenAPI at `/openapi.json`, and `docs/project-board.md`).

**Keeping it current** — it is meant to scale with the code:

- Each body section (§3–§14) is self-contained: extend or correct a subsystem **in place**, keeping the fixed shape (what → how → why → alternatives → files → open items).
- When a decision is made or reversed, add/update a row in the [Decision log](#decision-log) and link it from the owning section. Decisions are the spine of this document — never change *how* without recording *why* and *what-else-was-considered*.
- New deferred work goes in the exhaustive [§19 Future scope & deferred features](#future-scope) (with a source reference) **and** the durable project memory (`deferred-backlog.md`) — never leave a "look later" item only in a branch. [§14 Roadmap](#roadmap) stays the condensed phase view.
- Every source cited anywhere in the handbook is enumerated in [§20 References & sources](#references); add new docs/memory there.
- Update the status line and branch/HEAD at the top, and add the new `{#anchor}` to the [Index](#overview) when a section is added.
- Anchors must resolve: every `](#…)` cross-reference points to a defined `{#…}` heading; repo file links are root-relative from `docs/HANDBOOK.md`; project-memory records (outside the repo) are named as `` `filename.md` ``, not linked.


