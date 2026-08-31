# Watch-Together, Multi-Source & Queue — Grand Design

**Status:** DESIGN (not started). Living plan. Written 2026-08-26.
**Owner decision gate:** review this doc → then per-phase `writing-plans` → implement. Nothing here is built yet.

This document captures the full product direction discussed on 2026-08-26: pivoting Bearoom from a
*TMDB-scraper, single-title* player into a **Rave-style watch-together app** where a **queue** of
**heterogeneous media sources** (TMDB titles, direct links, YouTube, web-detected media, collections,
playlists) is played through **one unified player** and synced to a room. It also records the TMDB-API
research, the collections design, the compliance/distribution decision, and a dependency-ordered phase plan.

---

## 0. Context & non-negotiables

- **Distribution decision (settled):** the full app is **NOT** going to the Play Store or App Store.
  It ships **off-store** to a private circle via **GitHub Releases + Obtainium** (auto-updating) — see §10.
  This removes store content-review as a constraint; the remaining constraints are legal posture (keep the
  tool neutral, sources user-provided) and third-party ToS (YouTube extraction).
- **Neutral-tool posture:** media sources are **user-provided** (a pasted link, a YouTube URL, a web page the
  user opens). The app is a player + sync layer, not a content index. No baked-in piracy funnel.
- **Reuse, don't rebuild:** the party sync engine (Supabase Realtime + RLS, private channels — shipped C1),
  `PlayerControls`, the `HijackPlayer` WebView/injection patterns, the Supabase provider-config +
  RTK-Query pattern, `utils/failureMemory.ts`, and the OTA bridge pipeline are all foundations we build on.
- **YAGNI:** every feature below is scoped to what the vision needs; alternatives considered are recorded so
  we don't re-litigate.

---

## 1. The one idea that unifies everything: **the queue is the spine**

Every playable thing — a TMDB movie, a TMDB episode, a whole season, a TMDB collection, a curated collection,
a direct `.mp4`/`.m3u8`, a YouTube video, a YouTube playlist, a web page we sniff a stream out of, a
recommendation — is just a **queue item with a source-type**. The player plays the *current* item through the
right **source adapter**; the existing sync engine drives whatever is playing; "add a playlist / collection /
season" simply **expands into multiple queue items**.

```
QUEUE (spine) ─► current item ─► SOURCE ADAPTER ─► UNIFIED PLAYER ─► SYNC ENGINE (existing)
  items[]:                        (per source-type)   (one interface)   (Supabase realtime)
   tmdb-movie / tmdb-episode        tmdb   → HijackPlayer (WebView + OTA bridge)
   direct-link (mp4/m3u8/…)         direct → NativeVideoPlayer (expo-video)
   youtube                          youtube→ extractor adapter → NativeVideoPlayer  (or IFrame; see §6.2)
   web-page                         web    → in-app browser + sniffer → direct URL → NativeVideoPlayer
   [collection|playlist|season]     EXPAND at add-time into N of the above item types
   [recommendation|similar|next-ep] auto-appended to the queue tail on `ended` (§5)
```

**Design consequence:** we need exactly two new abstractions — a **QueueItem model** (§12) and a **unified
player interface** (§6.0). Everything else is adapters + UI hanging off those.

---

## 2. Source-type taxonomy (the QueueItem `type`)

| `type` | `ref` payload | Player | Syncable to guests? (see §8) |
|---|---|---|---|
| `tmdb-movie` | `{ tmdbId, providerId? }` | HijackPlayer (WebView) | Yes — share tmdbId + provider; each client hijacks on its own IP |
| `tmdb-episode` | `{ tmdbId, season, episode, providerId? }` | HijackPlayer | Yes — same |
| `direct` | `{ url, headers?, title? }` | NativeVideoPlayer | Yes **iff** the URL is public / not IP-locked |
| `youtube` | `{ videoId, title? }` | extractor → Native (or IFrame) | Yes — share videoId; each client resolves independently |
| `web` | `{ pageUrl }` → resolves to a `direct` at play-time | browser+sniffer → Native | **Often NO** — sniffed streams are frequently IP/token-locked (host-only) |
| *(expanders, not stored as-is)* | `collection` / `playlist` / `season` | — | expands into the above at add-time |

The `type` is recorded so the player picks the right adapter **and** so the sync layer knows whether the item
can play for everyone or only the host (§8).

---

## 3. TMDB API utilization — current vs available vs planned

Researched against live TMDB docs (2026-08-26). **Key finding: the app already *fetches* most rich data;
the gap is mostly *utilization* (features) plus a few genuinely-missing endpoints.**

### 3.1 Already fetched (via `utils/tmdbDetails.ts` `append_to_response`)
`fetchDetails` pulls in one call:
`credits, aggregate_credits (tv), videos, images, recommendations, similar, reviews, keywords,
external_ids, release_dates (movie) / content_ratings (tv), watch/providers`.
Current endpoints in `tmdbApi.ts`: `list, hero, listPage, details, season, personDetails, personCredits,
searchMulti/Movie/Tv/Person, discoverByProvider, trendingAllDay`.

### 3.2 Fetched but UNDER-USED → feature opportunities (no new fetching needed)
- **`recommendations` + `similar`** → "Up Next" rail + auto-next when a title ends (§5).
- **`videos`** (YouTube trailer/clip/featurette IDs) → **a fully-legit YouTube source**: TMDB hands us YouTube
  video IDs, so "watch the trailer together" / a trailer reel works *before* touching YouTube extraction. The
  compliant on-ramp to the YouTube feature. Today only ONE trailer is used (`pickTrailer`).
- **`watch/providers`** → the compliant "where to watch." **TMDB nuance (from their docs):** they deliberately
  do **not** provide per-provider deep links; they provide a JustWatch-backed **TMDB `link`** and *encourage
  linking to that URL*. So where-to-watch = show provider logos + open TMDB's `link`, not hand-rolled Netflix
  deep links.
- **`images`** (title `logos`, multiple backdrops) → richer player/hero UI (title logo instead of text).

### 3.3 Genuinely missing → add these endpoints
- **Collections:** `GET /collection/{id}` → `parts[]` (movies). Movie details already carry
  `belongs_to_collection` (id/name/poster/backdrop) but NOT the parts. (§4)
- **Collection search:** `GET /search/collection` — **separate from `search/multi`** (which returns
  movie/tv/person ONLY, never collections). To surface collections in a search you must call this in parallel
  and merge. (§4)
- **Next-episode navigation:** the *data* exists (`tv/{id}/season/{n}` → `episodes[]` with `episode_number` +
  `episode_type` for finale flags; show `seasons[]` to roll into the next season). The **logic** is missing.
  Optional refinement: **`tv/{id}/episode_groups`** for alternate orderings (anime aired-vs-DVD, Netflix
  groupings).
- **Genre list** (`genre/movie|tv/list`) + deeper **`discover`** filters (`with_genres`, `with_keywords`,
  `sort_by`) for richer discovery + "more like this."

### 3.4 Cross-cutting improvements
- `watch_region` is hardcoded `IN`, `language=en-US`. Fine now; recs/where-to-watch/discovery are
  locale-sensitive → parameterize by user locale eventually.
- Consider `configuration` for image base/sizes instead of the hardcoded `IMG_BASE` (low priority).

---

## 4. Collections (discovery + curated)

### 4.1 TMDB collection discovery (near-term)
- **Search:** add `searchCollection` (`/search/collection`); render a **Collections** section in results,
  parallel to Titles/People (from `search/multi`). Merge = one extra parallel call.
- **Title → collection:** movie details' `belongs_to_collection` → "Part of *The X Collection*" chip → tap →
  collection view.
- **Collection view:** `collection/{id}` → `parts[]` → poster grid, "play in order" (release-date sorted),
  **"Add all to queue"** or pick individually. A collection is a pure **queue expander** (§1).
- **No browse-all:** TMDB has no "list all collections" endpoint — discovery is search + title-links only.
  Do NOT design a collections *feed* expecting an API for it.

### 4.2 TMDB collection limitations (these justify §4.3)
1. **Movie-only** — a collection's `parts[]` are movies; **TV shows are never in a TMDB collection**.
2. **Fragmented** — "Spider-Man" is *several* TMDB collections (Raimi / Amazing / MCU / Spider-Verse), not one.
3. **No browse-all** — only search or reach-via-title.
4. IMDb has no open API; TMDB ≠ IMDb. TMDB is the practical comprehensive source; its gaps → curated (§4.3).

### 4.3 Self-curated collections (the real unlock; mid-term)
Solves every limitation above and is the home for editorial curation.
- **Model:** `curated_collection { id, title, description, cover, items[] }` where `items` are **heterogeneous
  refs** — `{ type: tmdb-movie | tmdb-tv | direct | youtube, ref }`. So "All Marvel" spans **movies AND
  series** (and even a YouTube featurette) — which TMDB literally cannot represent.
- **Two flavors, one model:**
  - **Editorial** (operator-curated, e.g. "Marvel — Movies & Series, in order") → served from **Supabase**,
    exactly like the provider registry (server-driven, killswitch-able, same RTK-Query treatment).
  - **Personal** (a user builds their own) → Supabase per-user (local-first acceptable to start).
- **Queue-native:** a curated collection is just another "expand into queue items" source — identical mechanism
  to a TMDB collection / season / playlist.

### 4.4 FAR-FUTURE (not soon) — community editorial pages
Admin/moderator-authored **rich "blog-style" pages** attached to a collection/topic — full write-ups, curation
notes, images, ordering rationale — a lightweight CMS/community layer. **Explicitly deferred, no timeline.**
Recorded so it informs the `curated_collection` schema (leave room for an optional `article`/`page` body +
author + role), but NOT designed or built now.

---

## 5. Auto-next & recommendations

- **Trigger:** the player's **`ended`** event → advance the queue. (videasy's OTA bridge already emits `ended`;
  `expo-video` emits an end signal. Unify both behind the player interface, §6.0.)
- **Next-episode (TV):** compute from `season.episodes[]` (current index → +1); at season end, roll to
  `seasons[]` next season's E1. `episode_type` gives "season finale" UX. `episode_groups` optionally corrects
  ordering for shows that need it.
- **Recommendation auto-queue:** when a TMDB item ends and the queue tail is empty, append a
  `recommendations`/`similar` candidate (both already fetched), **deduped** against watched + already-queued
  (recs repeat fast). Offer an "Up Next" card with a "Next in 10s…" countdown (cancelable).
- **Generalize the existing flag:** today `getAutoplayNext()` gates videasy's *episode* param only. Promote it
  to a **queue-level "autoplay next item"** pref covering episodes, collections, and recs uniformly.
- **Scope:** recommendations only exist for TMDB items — direct/YouTube/web items have no TMDB "up next," so
  auto-next-recommendation is a TMDB-item behavior; other types just advance to the next explicit queue item.

---

## 6. Players & source adapters (detailed)

### 6.0 Unified player interface (the second new abstraction)
One TS interface all players implement, consumed identically by the sync engine + `PlayerControls`:
`play() · pause() · seek(s) · setRate(r) · getState()` and events `ready · play · pause · seeking · seeked ·
tick(currentTime,duration,paused,readyState) · ended · error`. Implementations:
- **HijackPlayer** (existing) — WebView + OTA bridge for `tmdb-*` items.
- **NativeVideoPlayer** (new) — `expo-video` for `direct` + resolved `youtube`/`web` items.
- (Optional) **YouTubeIFramePlayer** — WebView + YouTube IFrame API (see 6.2 trade-off).
The sync engine already speaks this shape (it drives `HijackPlayer` today) — so adding native players is
"implement the interface," not "rewire sync."

### 6.1 Direct-link source (native) — *simplest; the Phase-2 thin slice*
Paste `https://…/video.mp4|.m3u8` → detect it's a direct media URL (extension / `Content-Type` HEAD probe) →
`direct` QueueItem → `expo-video` (HLS for m3u8) → drive via the interface → sync. Handle optional `headers`
(some links need a `Referer`). Public URLs sync to everyone (§8).

### 6.2 YouTube source
- **Your instinct (recommended for off-store):** an **extractor "pipe" adapter** turns a YouTube URL into a
  direct stream URL → play in the SAME `NativeVideoPlayer`. Gives a clean native player + full sync control.
  Candidates: a NewPipeExtractor-style / yt-dlp-style resolver (client-side JS extractor, or a self-hosted
  resolver endpoint). **Trade-offs:** violates YouTube ToS + is *fragile* (breaks when YouTube changes) — but
  off-store removes the store-policy angle; ToS/fragility remain.
- **Alternative:** **YouTube IFrame Player API** in a WebView — compliant + stable + syncable (the IFrame API
  exposes play/pause/seek/time), but it's the YouTube-branded player (ads/chrome), not a "native" feel.
- **Playlists:** don't need a special player — **expand** a playlist into N `youtube` QueueItems (playlist
  items via the extractor or YouTube Data API).
- **Compliant on-ramp:** TMDB `videos` (§3.2) are legit YouTube IDs → trailer/clip watch-together works with
  either approach and *no* extraction risk.
- **OPEN DECISION:** extractor (native, fragile, ToS) vs IFrame (branded, stable, compliant). Likely
  **extractor** given the off-store posture — confirm.

### 6.3 TMDB hijack (existing) — unchanged
Keep `HijackPlayer` + OTA bridge for `tmdb-*` items. It already implements the interface.

### 6.4 In-app browser + media sniffer + popup-gating — *hardest; lands last (Phase 4)*
For a pasted link that is **neither** YouTube **nor** a direct media URL:
- **Open in an in-app WebView browser** (not a redirect out).
- **Non-interrupting popups:** intercept new-window/`onOpenWindow` + top-frame nav to unexpected hosts; do NOT
  auto-open. Show a small "This page tried to open `host` — Open once / Block this site / Allow this site"
  control. Persist per-domain allow/block lists. (Generalizes `HijackPlayer`'s `onOpenWindow`/`isAllowedTopNav`.)
- **Media sniffing (two signals):**
  1. **Network interception** — catch requests whose URL/`Content-Type` is `.m3u8`/`.mp4`/media (via the
     WebView's request hooks / an injected `fetch`/`XHR` shim + `<video>`/HLS `src` observers).
  2. **DOM detection** — injected JS finds `<video>` elements + `currentSrc`/`<source>` + hls.js instances.
- **"Stream this" overlay:** when ≥1 media is detected, float an option over the page listing detected sources
  (a page can have several); pick one → build a `direct` QueueItem (url + captured headers) → hand to
  `NativeVideoPlayer`. If a **YouTube** URL is detected on the page, offer "use this as a YouTube item" instead.
- **Reality check (from the old scraper post-mortem):** many sniffed streams are **IP/token-locked** → they
  play for the host but **not** for guests (§8). Handle gracefully: label such items "host-only source," and
  either keep the host as the origin (not room-syncable) or fail with a clear message. This is the same wall
  that killed the server-side scraper; we surface it honestly rather than pretend.

  > **⚠ AMENDED 2026-08-31 — this premise did not reproduce and must be re-measured, not assumed.**
  > The on-device plugin research ([../research/nuvio-plugin-architecture.md](../research/nuvio-plugin-architecture.md))
  > tested exactly this and found **no IP-lock**: 2 MB of media was served **HTTP 206 to a foreign Tor exit
  > IP, with no headers at all**, from a URL resolved ~20 minutes earlier on a different continent. Resolved
  > URLs also re-resolved **deterministically** (identical bytes under a rotated seed), so a guest can derive
  > the same URL locally instead of being handed the host's.
  >
  > The post-mortem's IP-lock finding was real but was measured against **server-side** resolution, where the
  > CDN token is minted for the *resolver's* IP and the phone is a different IP. Sniffing happens on the
  > viewer's own device, so that mismatch does not arise by construction.
  >
  > **Keep this graceful-degradation design as the fallback** — some CDNs certainly do bind tokens, and
  > `syncable: false` remains the right escape hatch. But **measure per-provider before labelling anything
  > host-only**, and prefer "guests re-resolve locally" over "host streams to guests" wherever the source
  > allows it.

  > **Prior art exists — do not start from scratch.** `components/player/SnifferWebView.old.tsx` (153 lines)
  > already implements the offscreen-WebView `fetch`/`XHR` hook and posts back the first `.m3u8`/`.mp4` with
  > synthesized headers. Its documented blocker — *"injected JS runs in the top frame only… if a provider
  > fetches its stream from inside a CROSS-ORIGIN iframe, that request is invisible here"* — **has since been
  > solved elsewhere in this repo**: `HijackPlayer.tsx:663` sets
  > `injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}` (all-frames injection, with a nonce-gated
  > frame relay). Porting that one prop is most of the gap. Phase 4 is therefore **cheaper than its "hardest,
  > most fragile" label** suggests.

---

## 7. Party UX rebuild (the "existing UX improvements" you want first)

- **Medialess room:** "Host a Party" from **any** screen (incl. home/non-title) creates an **empty room** with
  no media. (Today a party is created *with* a title.)
- **Floating island / now-playing tray:** a persistent, draggable mini-tray that lives **around the discovery
  screens** — shows current item + queue count + quick controls, like a music app's now-playing bar. Tap →
  full player; the room context follows you while you browse.
- **Add-to-queue flows:**
  - Tap a **title** → play now *or* "Add to queue."
  - **Series** → episode picker (select S/E) → add one / a range / whole season.
  - **Collection** (TMDB or curated) → quick-pick / "Add all."
  - **Related** (recommendations/similar) → add.
  - **Discovery module extras:** paste a **direct** / **web** / **YouTube** link; add a **YouTube playlist**, a
    **TMDB collection**, or a **season** — all resolve to queue items.
- **Queue management:** reorder, remove, see who-added; **host controls** (who can add / reorder / skip) tie
  into the existing party access/guest-control model.
- **Discovery entry points:** a clear "stream from a link / YouTube / web" affordance in discovery.

---

## 8. Sync model per source (the honest constraint)

The **source-type dictates syncability**:
- **`youtube` (videoId)** and **`tmdb-*` (id + provider)** — share the *reference*; **each client resolves on
  its own IP** → everyone plays. ✅
- **`direct` public URL** — share the URL; everyone fetches it. ✅ (Fails if the host pasted a private/expiring
  URL — detect + warn.)
- **`web`-sniffed / IP-locked** — resolves on the **host's IP only**; guests get 403. ❌ room-sync. Options:
  (a) mark "host-only," play solo-in-room (host streams, others see "host is watching X" but can't mirror), or
  (b) reject with a clear message. **This limitation is inherent** (proven by the scraper post-mortem) and must
  be surfaced in the UI, not hidden.
- **Authority:** host-authoritative **queue** (host's queue + current index is the source of truth; guests
  mirror), consistent with the current host-drives-playback sync. Per-guest "add to queue" is a request the
  host/room policy accepts (like chat, RLS-gated).

---

## 9. Where-to-watch (compliant; ties to a possible "Lite")
`watch/providers` (already fetched) + the TMDB `link` (the JustWatch-sanctioned URL). Show provider logos +
"Where to watch" → open TMDB's `link`. This is the compliant discovery affordance and would be the core of a
clean **Bearoom Lite** *if* a public build is ever wanted (not currently planned — see §10).

---

## 10. Distribution & compliance (settled)
- **Off-store only:** GitHub **Releases** (APK, consistent EAS keystore, bump `version`+`versionCode`) +
  **Obtainium** for managed auto-updates. **Firebase App Distribution** is the alternative for truly-private
  email-gated delivery. **Not Play, not App Store** (cost + content policy).
- **No runtime "flip to piracy" flag, no gateway/funnel** — those are review-evasion patterns that risk account
  termination; irrelevant here because we're not on a store. If a public **Bearoom Lite** is ever wanted, it's a
  **build-time-separated** clean build (discovery + where-to-watch + direct-link party), with the hijack code
  **compiled out** — never a remote toggle.

---

## 11. Phased delivery (dependency-ordered)

Each phase is independently shippable and testable end-to-end.

- **Phase 0 — TMDB utilization deltas (small, data-only):** add `collection/{id}`, `search/collection`,
  next-episode helper, genre list; wire recommendations/similar into an "Up Next" surface. Low risk, unblocks
  queue sources. *Verifies:* new endpoints return + render.
- **Phase 1 — Queue + medialess room + floating tray (with existing TMDB playback):** the spine. Party schema:
  single-media → **queue**. Floating now-playing tray across discovery. Add TMDB titles/episodes/seasons/
  collections to a queue; auto-next episode + recommendation. **Provable with today's hijack playback.**
- **Phase 2 — Unified native player + `direct` source:** `NativeVideoPlayer` (`expo-video`) behind the player
  interface; paste a direct link → queue → play → sync. Thin end-to-end slice proving multi-source.
- **Phase 3 — YouTube source + playlist expansion + TMDB-videos bridge:** extractor adapter (or IFrame — §6.2
  decision) → reuse `NativeVideoPlayer`; playlists expand; TMDB trailers become YouTube items.
- **Phase 4 — In-app browser + media sniffer + popup-gating:** the hardest, most fragile; honest IP-lock
  handling (§8).
- **Phase 5 — Self-curated collections:** editorial (Supabase, server-driven) + personal; heterogeneous items;
  builder UI. Auto-next/recommendation polish.
- **Far-future — community editorial "blog" pages (§4.4):** no timeline.

---

## 12. Data model & schema changes

- **QueueItem:** `{ id, type (§2), ref, title, poster?, addedBy (userId), addedAt, status: queued|playing|done|failed, syncable: bool }`.
  > **Refined 2026-08-31 for implementation.** `type` becomes a **discriminator on `ref` itself**
  > (`QueueRef = { source: "tmdb" | "direct" | "plugin" | "youtube", … }`) so the item and its reference
  > cannot disagree. Field names settled as `posterPath` (a TMDB *path*, never a full URL),
  > `addedByUserId`, `runtimeMs`, `subtitle`. `status` drops `playing` — the current item is identified by
  > the room's `queue_current_id`, so a per-item `playing` flag would be a second source of truth.
  > **`id` is exactly `mediaKey()`** from `utils/failureMemory.ts:31-35` (`movie:<id>` / `tv:<id>:<s>:<e>`) —
  > keep the two formulas in lockstep so failure memory and queue identity agree.
  >
  > Critically, **no ref carries a resolved URL except `direct`**. `plugin` carries the identifier tuple
  > (`tmdbId + pluginId + streamId? + language?`) because plugin resolution is deterministic, so each guest
  > resolves locally rather than being handed the host's URL. That is what keeps plugin items syncable.
- **Party state:** replace single `media` with `{ queue: QueueItem[], currentIndex, playback }`. New/changed
  Supabase: a `party_queue` representation (table or snapshot field) + RPCs for add/remove/reorder/advance,
  RLS-gated to room members (mirrors the chat/party RLS from C1). **Migration:** existing single-media rooms map
  to a 1-item queue.
  > **Settled 2026-08-31:** a **`queue jsonb` column on `party_rooms`**, not a `party_queue` table — every
  > queue RPC already has to `SELECT … FOR UPDATE` the room row to bump `seq` and re-anchor, so the room lock
  > already serialises queue mutations; `party_snapshot()` stays a single-table `language sql` function; and
  > it needs **zero new RLS policy** (inherits `party_rooms_select`). Identity is `queue_current_id`, **not**
  > `currentIndex` — an index breaks under reorder.
  >
  > **`party_rooms.media` is NOT removed.** It stays as a derived mirror of the current item, so an
  > already-installed v1 client in the same room keeps playing correctly. That removes the flag day and makes
  > the risky migration provable by running the *current unmodified build* against the migrated database.
- **`curated_collection`** (Phase 5): `{ id, title, description, cover, author?, role?, article? (far-future),
  items: HeterogeneousRef[], visibility: editorial|personal|shared }`.
- **Per-domain browser allow/block** (Phase 4): local persisted list.

---

## 13. Risks, gaps & open decisions

**Risks / gaps:**
- **IP-locked sync wall (§8)** — inherent; web-sniffed/some-direct items won't sync to guests. Must be surfaced.
- **YouTube extraction fragility + ToS (§6.2)** — breaks on YouTube changes; needs a maintainable resolver.
- **Sniffer reliability (§6.4)** — arbitrary pages are messy; detection won't be 100%.
- **Recommendation repetition** — dedup + watched-filter required or "Up Next" gets stale.
- **Party schema migration** — single-media → queue touches the sync engine + RLS; do carefully with a
  2-device test (like C1).
- **`ended` signal reliability** — auto-next depends on every player emitting a clean `ended`.

**Open decisions (confirm before the relevant phase):**
1. **YouTube:** extractor (native, fragile, ToS) vs IFrame (branded, stable). *Leaning extractor* (off-store). — **still open**
2. ~~**Queue authority:** host-authoritative vs shared/collaborative editing.~~
   **RESOLVED 2026-08-31 → host-authoritative.** Ordering and current-item are host-only (same lease
   predicate as `party_set_media`); *adds* are gated by the already-provisioned per-member `canQueue`
   permission (`0001_party_core.sql:143,167`) and the room-level `queueEnabled` flag (`:37`). Rationale:
   choosing what plays *is* playback control, and the existing sync model is already host-authoritative,
   so a collaborative current-item would need a second authority model for no user-visible gain.
3. **Curated-collection storage:** Supabase editorial + personal, or local-first personal to start. — **still open**
4. **Web-sniffed non-syncable items:** "host-only in-room" playback vs reject-with-message.
   — **still open, but its premise changed** — see the amendment in §6.4; re-measure before deciding.
5. ~~**Phase-1 start:** queue-first vs a direct-link thin slice first.~~
   **RESOLVED 2026-08-31 → queue-first.** The queue is the socket every later source plugs into; doing the
   direct-link slice first would mean building the player interface *and* reworking party sync twice.

---

## 14. Reused existing infrastructure (so we're not starting cold)
Party sync engine + private-channel RLS (C1) · `PlayerControls` (already speaks the player interface) ·
`HijackPlayer` WebView/injection/relay patterns (reused for the browser/sniffer) · Supabase provider-config +
RTK-Query pattern (reused for editorial collections) · `utils/failureMemory.ts` · OTA bridge pipeline ·
`tmdbApi`/`tmdbDetails` (extend, don't replace).
