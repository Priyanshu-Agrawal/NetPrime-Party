# Bearoom — Roadmap

**Sequencing view** — what ships in what order. Complements [project-board](project-board.md) (active status)
and [BACKLOG](BACKLOG.md) (exhaustive inventory). This is about *order & priority*, not a full item list.

**Status:** working branch `feat/improvements`. Distribution is **off-store** (GitHub Releases + Obtainium).

---

## ✅ Recently shipped (this session)
videasy iOS bind → resume-after-pause → relay reach → duplicate-event de-dupe → poster polish · watch-party
realtime security (C1) · loader/badge polish · **entire backend-hardening plan** (C1 · H1/M1/M7 · H2/H3, live).
Full list in [BACKLOG PART 3](BACKLOG.md#part-3--shipped-record-so-this-is-a-full-history).

## 🎯 Next up (candidates — pick one)
Small, high-value, well-scoped:
1. **Episode selector for shows** — concrete, fills a real gap, folds into the queue program. *(Recommended first.)*
2. **Chat typography + emoji** — plan written ([chat-typography-and-emoji](plans/chat-typography-and-emoji.md)).
3. **Housekeeping sweep** — remove `·Q` marker, resolve orphaned `expo-sensors`, dead files, connect GitHub remote.

*Bigger commitment:* kick off **Program 1 Phase 0/1** (below).

---

## 🚀 Program 1 — Watch-Together, Multi-Source & Queue
The pivot to Rave-style watch-together. Full design: [watch-together-multi-source-queue](plans/watch-together-multi-source-queue.md).
Dependency-ordered, each phase independently shippable:

| Phase | Scope | Notes |
|---|---|---|
| **P0** | TMDB-utilization deltas | ✅ `collection/{id}`, `search/collection` (Discovery D2), **genre list** (`genreList`) + **region-popular discover** (`with_origin_country`, "Popular in your region" rail) (Discovery D3 · 2026-08-28); next-episode helper + recommendations/similar into "Up Next" still open. Small, unblocks queue sources. |
| **P1** | Queue + medialess room + floating tray | The spine. Party schema single-media → queue. Provable with today's TMDB playback. Absorbs "play-next queue" + "episode selector". |
| **P2** | Unified native player + `direct` source | `expo-video` behind the player interface; paste a direct link → queue → play → sync. |
| **P3** | YouTube source + playlists + TMDB-videos bridge | Extractor adapter (or IFrame — open decision); playlists expand into items. |
| **P4** | In-app browser + media sniffer + popup-gating | Hardest, most fragile; honest IP-lock sync handling. |
| **P5** | Self-curated collections | Editorial (Supabase, server-driven) + personal; heterogeneous items (movie+TV+links). |
| **Far-future** | Community editorial "blog" pages | Admin/moderator rich pages per collection. No timeline. |

**Open decisions gating build** (see plan §13): YouTube extractor-vs-IFrame · queue authority (host vs collab) ·
curated-collection storage · web-sniffed non-syncable handling · Phase-1 start (queue-first vs direct-link slice).

## 🎨 Program 2 — Chat typography + cross-platform emoji
Dedicated chat font (Nunito lead) + Twemoji/OpenMoji image emoji for iOS↔Android parity.
Plan: [chat-typography-and-emoji](plans/chat-typography-and-emoji.md). Can slot in independently.

---

## 🅿️ Parked / deferred (build only when asked)
Grouped inventory in [BACKLOG PART 1](BACKLOG.md#part-1--open-deferred--pending):
**A** party controls (polls, per-guest control, mute/disable chat, stickers) · **B** chat (slash→polls,
reply/@-mention, persisted history) · **C** player (unified controls, rotation+lock, seek feedback, quality-stuck,
tablet/TV, stall/bitrate resilience) · **D** native (PiP/AirPlay/bg-audio/lock-screen) · **E** providers
(bottomsheet, more providers, proxy) · **F** UI polish (Stitch pass, sticky header, rework) · **G** blur/perf
(per-surface decision, capability gate) · **H** atmospheric background (shelved) · **I** backend (Phase 9 scrape
caching, Phase 6 QA/refactor) · **J** housekeeping.

## 🧭 Strategic decisions (fixed constraints)
Off-store distribution · security plan closed · native stream-player rejected (WebView primary) · Cooren NO-GO ·
no blur/elevation on video screens · no baked-in provider fallback (killswitch). Details in
[BACKLOG PART 4](BACKLOG.md#part-4--strategic-decisions-that-constrain-the-backlog).
