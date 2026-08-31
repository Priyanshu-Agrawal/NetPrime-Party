# Plugin provider shortlist — measured, not declared

**Audited 2026-08-29.** Every number here came from executing the scrapers, not from reading their
manifests. Declared capability proved worthless: `anikototv` declares `en,ja` and returns a 13-minute clip
for *every* title.

Method and raw findings: [`../research/nuvio-plugin-architecture.md`](../research/nuvio-plugin-architecture.md) §6.5.3e.
This file exists so the shortlist is not buried in a 900-line study.

---

## Funnel

| Stage | Count |
|---|---|
| Repos in the Nuvio plugin library | 19 (17 live, 2 × 404: Nvmindl, Fenix) |
| Unique scraper ids across all repos | **227** |
| Declaring Hindi and/or English → downloaded + executed | **152** |
| **Returned nothing on any of 3 probe titles** | **111** |
| Survivors, re-run against 9 titles | **41** |

The 9 titles: Jawan, Pathaan, Stree 2, Animal (Hindi originals) · Endgame, Oppenheimer, Deadpool & Wolverine
(Hollywood, dub targets) · Mirzapur S1E1, Breaking Bad S1E1 (TV, with real season/episode).

---

## The lock-in set

| Provider | Hits | Streams | iOS-native | Avg ms | Notes |
|---|---|---|---|---|---|
| **`evyrith`** | **9/9** | 40 | 83 % | 9 488 | **Use this one.** A cleaner wrapper over the same backend as `vidrock`, labelling streams `Vidrock • Hindi / Tamil / Telugu` instead of opaque codenames. |
| **`vidrock`** | **9/9** | 44 | 84 % | 9 247 | Same upstream as `evyrith` — **count them as one point of failure, not two.** |
| **`playimdb`** | **9/9** | 27 | **100 %** | **701** | Fastest by ~5×. Single "Original-Audio" stream; no language variants. |

### Fast fill (cheap breadth, all 100 % HLS)
`movix` (5/9, 698 ms) · `zevran` (4/9, 768 ms) · `castle` (4/9, 1 399 ms, + Tamil/Telugu) ·
`nuvio-movix` (8/9, 3 530 ms)

### Quality tier — **requires libVLC** (all 0 % iOS-native, MKV)
`1shows` (5/9, 55 streams) · `movieshunt` (3/9) — this is where the 4K HEVC multi-audio Hindi DD5.1 lives.

### Blacklist — returns confidently *wrong* content
- **`anikototv`** — 0/5 correct. Serves a **13-minute clip** regardless of the title requested.
- **`animekai`** — 55 min returned for a 201-minute film.

Content correctness was checked by comparing stream duration against the TMDB runtime (±8 min).
`videasy` 6/6 ✓ · `playimdb` 7/7 ✓ · `castle` 3/3 ✓ · `cineby` 3/3 ✓ · `vidrock` 3/4.

### Ignore
`torrentio`, `uhdmovies`, `hindmoviez` — magnet links or auth-gated file hosts. Useless without a debrid
account.

---

## Hindi & English dubs — what is actually delivered

**Verified by `ffprobe`, not by label.** Avengers: Endgame via `evyrith`:

```
Vidrock • Hindi    dur=10869s   audio = aac,2,hin     ← real Hindi
Vidrock • Lyra     dur=10869s   audio = aac,2,eng
Vidrock • Tamil    dur=10894s   audio = aac,2,tam
Vidrock • Telugu   dur=10894s   audio = aac,2,tel
```

10 869 s = 181 min = Endgame's exact runtime, so this is the right film. Critically these are **HLS/AAC
stereo — 100 % iOS-native**, which means **Hindi dubs of Hollywood titles play on plain `expo-video`.**
libVLC is only needed for the 4K MKV tier.

### Two caveats that must shape the UX

1. **Manifest language tags are inconsistent.** Endgame's streams carried `hin`/`eng`/`tam`/`tel` tags; the
   *same provider's* Jawan and Oppenheimer streams carried **no language tag at all** — only the stream
   *name* said "Hindi". **Trust the provider's label for selection; treat manifest tags as a bonus.** The
   authoritative answer only arrives after the player opens the stream (`onESAdded`), so the flow must be
   resolve → open → read tracks → offer the picker, never resolve → promise Hindi → discover otherwise.
2. **Hindi is per-title, not guaranteed.** Oppenheimer offered Bengali/Tamil/Telugu but **no Hindi**.
   Measured Hindi-named coverage across the 9 titles: `evyrith` 4/9 · `nuvio-4khdhub` 2/2 · `mavonyx` 2/2 ·
   `karnis` 1/3.

For Hindi-*original* films the question is moot — the original audio *is* Hindi, so any provider works.
`vidrock`/`evyrith` and `einthusan` additionally expose each dub as its **own stream**, so language
selection is stream selection and needs no audio-track API at all.

---

## Operational notes

- **Latency:** median 2.2 s, p90 11.7 s, max 24.2 s across 87 successful resolves. **Race providers and
  render the first hit** — `playimdb` at 0.7 s covers the common case while `evyrith` is still working.
- **Pin to commit SHAs, never `refs/heads/main`.** These are obfuscated third-party scripts that
  auto-refresh; an unpinned repo is an unreviewed code push into your app.
- **Providers die.** `videasy`'s upstream (`api.speedracelight.com`) was fully unreachable for ~30 minutes
  during this audit — DNS resolved, TCP connected, no HTTP response in 20 s — then recovered. Design for
  provider outage as normal, not exceptional.
- **Two measurement traps** that made healthy sources look dead, both hit during this audit:
  running 8 `ffprobe` processes in parallel against one CDN got throttled into a wall of failures, and a
  zsh `${ref:+-headers "..."}` expansion word-split the header argument and silently broke every probe.
  **Re-probe serially by hand before concluding a source is dead.**
