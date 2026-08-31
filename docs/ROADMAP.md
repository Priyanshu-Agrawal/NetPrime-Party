# Bearoom — Roadmap

**Sequencing view** — what ships in what order. Complements [project-board](project-board.md) (active status)
and [BACKLOG](BACKLOG.md) (exhaustive inventory). This is about *order & priority*, not a full item list.

**Status:** working branch `feat/improvements`. Distribution is **off-store** (GitHub Releases + Obtainium).

---

## ✅ Recently shipped (this session)
videasy iOS bind → resume-after-pause → relay reach → duplicate-event de-dupe → poster polish · watch-party
realtime security (C1) · loader/badge polish · **entire backend-hardening plan** (C1 · H1/M1/M7 · H2/H3, live).
Full list in [BACKLOG PART 3](BACKLOG.md#part-3--shipped-record-so-this-is-a-full-history).

## 🎯 Next up — **decided: Program 1 · P1 (queue spine)**
Sequencing settled 2026-08-31 after the on-device plugin research landed
([nuvio-plugin-architecture](research/nuvio-plugin-architecture.md)). P1 is first because it is the **socket
every later source plugs into** and it needs nothing from that research — it is provable with today's
hijack playback. Plan: `~/.claude/plans/flickering-sniffing-squid.md`.

- ~~Episode selector for shows~~ — **absorbed by P1** (queue covers it); no longer a standalone item.
- **Chat typography + emoji** — still available as an independent slot ([plan](plans/chat-typography-and-emoji.md)).
- **Housekeeping sweep** — `·Q` marker, orphaned `expo-sensors`, dead `.old` files. *(GitHub remote: done.)*

---

## 🚀 Program 1 — Watch-Together, Multi-Source & Queue
The pivot to Rave-style watch-together. Full design: [watch-together-multi-source-queue](plans/watch-together-multi-source-queue.md).
Dependency-ordered, each phase independently shippable:

| Phase | Scope | Notes |
|---|---|---|
| **P0** | TMDB-utilization deltas | ✅ `collection/{id}`, `search/collection` (Discovery D2), **genre list** (`genreList`) + **region-popular discover** (`with_origin_country`, "Popular in your region" rail) (Discovery D3 · 2026-08-28); next-episode helper + recommendations/similar into "Up Next" still open. Small, unblocks queue sources. |
| **P1** | Queue + medialess room + floating tray | **NEXT.** The spine. Party schema single-media → queue. Provable with today's hijack playback. Absorbs "play-next queue" + "episode selector". Now also carries a **source discriminator** (`tmdb \| direct \| plugin \| youtube`) from day one, because P3/P4 sources are no longer hypothetical. |
| **P2** | Native player lane + `direct` source | **Smaller than previously scoped.** `PlayerHandle` (`components/player/HijackPlayer.tsx:92-111`) is *already* the lane-agnostic contract — proven by `HijackPlayer.web.tsx` implementing it independently — and [native-player](architecture/native-player.md) already specifies `NativePlayer` as a drop-in `forwardRef<PlayerHandle>`. `PlayerControls.tsx` is already decoupled (imperative `setPlayback()`). Mostly wiring, not design. |
| **P3** | **On-device plugin source** *(new)* | Hidden-WebView sandbox + a pinned 3-provider set → stream URL + headers + audio-track id, fed into P2's player. Design + measurements: [nuvio-plugin-architecture](research/nuvio-plugin-architecture.md); shortlist: [plugin-provider-shortlist](providers/plugin-provider-shortlist.md). Replaces the per-provider OTA-bridge treadmill rather than extending it. |
| **P4** | In-app browser + media sniffer + popup-gating | **Re-scoped cheaper.** Prior art exists (`components/player/SnifferWebView.old.tsx`), and its documented blocker — *"injected JS runs in the top frame only… cross-origin iframe requests are invisible"* — is already solved in-repo by `injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}` (`HijackPlayer.tsx:663`). Its IP-lock pessimism (plan §6.4) must be **re-tested, not assumed** — see below. Note this is *user browses a site → we sniff its media*, which is orthogonal to P3, not replaced by it. |
| **P5** | YouTube source + playlists + TMDB-videos bridge | Extractor adapter (or IFrame — open decision); playlists expand into items. *(Was P3.)* |
| **P6** | Self-curated collections | Editorial (Supabase, server-driven) + personal; heterogeneous items (movie+TV+links). *(Was P5.)* |
| **Optional** | libVLC upgrade | `expo-libvlc-player@3.4.25` unlocks the 4K HEVC + E-AC3 multi-audio MKV tier on both platforms (runtime-verified). **Deferred, not a gate** — the Hindi *dubs* are HLS/AAC and play on plain `expo-video`. Cost: **35 MB** + an LGPL-2.1 review. Take it only if that tier proves worth it. |
| **Far-future** | Community editorial "blog" pages | Admin/moderator rich pages per collection. No timeline. |

**Open decisions gating build** (see plan §13): YouTube extractor-vs-IFrame · curated-collection storage ·
web-sniffed non-syncable handling *(premise now in doubt — see below)*.
**Resolved 2026-08-31:** queue authority → **host-authoritative** ordering/current-item with `canQueue`-gated
adds · Phase-1 start → **queue-first**.

> **P4's core premise needs retesting.** Plan §6.4 assumes sniffed streams are IP/token-locked and therefore
> host-only and non-syncable — the same wall that killed the server-side scraper. The plugin research did
> **not reproduce it**: 2 MB of media was served HTTP 206 to a foreign Tor exit with no headers at all, and
> resolved URLs re-resolved deterministically. Keep the graceful-degradation design as a fallback, but
> measure before assuming.

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
Off-store distribution · security plan closed · no blur/elevation on video screens · no baked-in provider
fallback (killswitch). Details in
[BACKLOG PART 4](BACKLOG.md#part-4--strategic-decisions-that-constrain-the-backlog).

**Amended 2026-08-31** — two long-standing constraints were re-tested and no longer hold as written:
- ~~*native stream-player rejected (WebView primary)*~~ → **WebView stays primary; a native lane is now
  additive, not rejected.** The rejection rested on server-side resolution (IP-locked CDN tokens, WAF/JA3,
  non-self-healing tokens). Resolution on-device voids all three, measured. The WebView hijack is kept as a
  fallback lane — it is not being removed.
- ~~*Cooren NO-GO*~~ → **still NO-GO, but for a narrower reason.** Its bandwidth/proxy model was rejected to
  hold the \$0 goal; on-device resolution reaches the same outcome with no server at all, so the question is
  moot rather than merely unfavourable. See [cooren-fit-adr](research/cooren-fit-adr.md).

**Standing risk if P3 is adopted:** the plugin ecosystem is obfuscated third-party JS with unrestricted
network access, auto-refreshed on a timer. **Pin providers to commit SHAs, never `refs/heads/main`**, and
keep the allowlist to the measured shortlist — 111 of 152 audited scrapers returned nothing and two return
confidently *wrong* content.
