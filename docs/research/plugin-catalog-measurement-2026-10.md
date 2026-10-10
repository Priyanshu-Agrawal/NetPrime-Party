# On-device scraper output — Hindi-first benchmark, measured 2026-10-10


> **Sampling caveat.** Only the 13 plugins fetched by the 2026-10-10 landscape survey were run
> (`docs/research/github-scraper-landscape-2026-10.md`). The August MKV / E-AC-3 / 4K tier came from other
> repos (1shows, movieshunt, 4khdhub) that were **not** in this run. "No MKV" below describes this set, not
> the whole ecosystem.

## 1. Summary
1. 156 sandboxed runs (13 plugins × 12 titles), 0 timeouts. 8 plugins returned 247 streams; 219 live when probed. 5 returned nothing.
2. HLS 130 · DASH 54 · MP4 35 · dead 28. No MKV, no magnets. All HLS/MP4 = H.264 + stereo AAC; all DASH = HEVC (`hev1`) + AAC.
3. Referer + User-Agent only: **154/219 live streams play (70 %)** — confirmed on real libVLC 3.0.23 for every plugin and container family.
4. **65/219 (30 %) need a header libVLC cannot send:** Cookie (54 MovieBox DASH) and Origin (11 Vidrock HLS) — each isolated by testing header subsets against fresh URLs.
5. Hindi-labelled: 31 streams. Only **12 (39 %)** play with Referer/UA; the other **19 (61 %) are the Cookie-gated DASH**. Hindi-first playback needs either a player that accepts arbitrary headers or a local header-injecting proxy.
6. Hindi exists for all 12 titles. For Hollywood titles it comes almost only from the MovieBox servers (MP4 copy playable without Cookie, DASH needs it).
7. Multi-audio in ONE stream: only the Castle servers (Mirzapur S1E1: one HLS stream, 5 tagged AAC tracks hin/kan/mal/tam/tel). Zero HLS audio renditions anywhere.
8. ~10 % of duration-checkable streams are wrong content → the host needs its own duration check.

## Method
- Sandbox: each run `node --experimental-permission` with read-only access to harness + plugins (Node 20 needs one `--allow-fs-read=<dir>/*` flag per folder — a comma list silently dropped the second). fs-write, child processes, workers blocked (negative-tested). 60 s timeout + 65 s hard kill.
- Shims: `cheerio` → `cheerio/slim` 1.2.0; crypto-js 4.2.0. Plugins also needed globals `TMDB_API_KEY`, `SCRAPER_SETTINGS`, `CryptoJS`, and TMDB calls rewritten to the app's TMDB proxy.
- Probing: first 1 KB of each stream + HLS/DASH manifest parse; ffprobe 8.1.2 strictly serial on a 54-stream sample in modes A (plugin headers) / B (Referer+UA only) / C (none); an A-failure was re-resolved and re-probed once. Real libVLC 3.0.23 played 12 streams × 14 s with Referer+UA only (pass = video + audio decoders started). This ffmpeg build has no DASH reader → DASH facts come from manifests, libVLC and header tests.
- Titles (TMDB id, runtime min): Jawan 872906 (169), Pathaan 864692 (146), Animal 781732 (201), Stree 2 1112426 (143), Pushpa 2 857598 (225), Endgame 299534 (181), Oppenheimer 872585 (181), The Godfather 238 (175), Spider-Man: Brand New Day 969681 (145), Breaking Bad S1E1 1396 (59), Mirzapur S1E1 84105 (53), Panchayat S1E1 101352 (35).

## 2. Hit matrix (stream counts; · = 0)
| plugin | Jaw | Path | Anim | Str2 | Push2 | Endg | Opp | Godf | SM-BND | BB | Mirz | Panch | hit | median ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| aio_castle | 6 | 6 | 3 | 3 | 2 | 5 | 8 | 2 | · | 3 | 3 | 2 | 11 | 759 |
| aio_moviebox | 7 | 2 | 10 | 1 | 1 | 4 | 11 | 3 | 8 | 2 | 2 | 3 | 12 | 4064 |
| ecl_karnis | 1 | 3 | 1 | 1 | 1 | 1 | 2 | 1 | · | 1 | 1 | 1 | 11 | 734 |
| ecl_mavonyx | 1 | · | 4 | · | 4 | 4 | 4 | 4 | 2 | 4 | 2 | 6 | 10 | 3003 |
| ecl_soryn | 2 | 2 | 1 | 1 | 1 | 2 | 1 | 2 | · | 2 | 2 | 2 | 11 | 2334 |
| ecl_zevran | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 12 | 530 |
| evyrith | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | · | 1 | 11 | 2143 |
| playimdb | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 12 | 684 |

Zero everywhere: aio_mapple (server 403), aio_vidfast (page 403), aio_vidlink ("no playlist"), aio_xpass ("0 servers"), ecl_svartok (server 403). Time to result: median 1.3 s, p90 4.0 s, max 47.7 s. Dead streams: 10 playimdb/zevran 404s; all 18 moviebox `[Fallback]` MP4s 429 every time (no Cookie carried).

## 3. Hindi by title
| Title | Hindi-labelled | ffprobe `hin` tag | Hindi with Referer/UA only? |
|---|---|---|---|
| Jawan (hi) | moviebox DASH | not sampled | yes, as original audio (duration ✓) |
| Pathaan (hi) | moviebox DASH, karnis HLS | karnis tagged `und`, 149 min ✓ | yes |
| Animal (hi) | moviebox DASH, mavonyx DASH+MP4 | evyrith HLS, mavonyx MP4 (201 ✓) | yes |
| Stree 2 (hi) | moviebox DASH | — | yes as original; 4/5 Castle streams are previews |
| Pushpa 2 (te) | mavonyx DASH+MP4 | — | only mavonyx MP4 (197 min — likely theatrical vs TMDB 225 "Reloaded") |
| Endgame | moviebox DASH, mavonyx DASH+MP4 | mavonyx MP4 ✓ | only mavonyx MP4 |
| Oppenheimer | castle HLS ×3, karnis HLS, moviebox DASH, mavonyx DASH+MP4 | castle + karnis HLS ✓ | yes |
| Godfather | moviebox DASH, mavonyx DASH+MP4 | mavonyx MP4 ✓ | only mavonyx MP4 |
| Spider-Man BND | moviebox DASH, mavonyx DASH | — | **no — Cookie-gated DASH only** |
| Breaking Bad | moviebox DASH, mavonyx DASH+MP4 | mavonyx MP4 ✓ | only mavonyx MP4 |
| Mirzapur (hi) | moviebox DASH (360p, 417 min — wrong) | castle + karnis HLS, 5-track ✓ | yes |
| Panchayat (hi) | moviebox DASH, mavonyx DASH+MP4 | castle, karnis, evyrith HLS + mavonyx MP4 ✓ | yes |

Probed Hindi labels carried a real Hindi tag (exception: karnis Pathaan `und`). playimdb/zevran/evyrith carry one original-language track — Hindi only for Hindi films.

## 4. Containers, codecs, playback with Referer + UA only
| family | live | format | video | audio | ffprobe B | libVLC B |
|---|---|---|---|---|---|---|
| castle / karnis | 43 / 14 | HLS media playlist (no master); `.jpg` segments on another host | H.264 720p | AAC 2.0, 1–5 tagged tracks | ✅ (none needed) | ✅ |
| zevran / playimdb | 31 / 31 | HLS master; `.html`/extensionless segments | H.264 360/720/1080 | AAC 2.0 untagged | ✅ (none needed) | ✅ |
| evyrith | 11 | HLS master 1080–360 | H.264 1080p | AAC 2.0 | ❌ 403 | ❌ 403 |
| soryn MP4 | 18 | MP4 | H.264 720p | AAC `und` | ✅ (none → 429) | ✅ |
| mavonyx MP4 | 17 | MP4 0.2–3.8 GB | H.264 1080p | AAC `hin`/`eng` | ✅ (none → 429) | ✅ |
| moviebox / mavonyx DASH | 36 / 18 | DASH 1080/720/480 | HEVC `hev1` | AAC, one audio set with `lang` | n/a | ❌ 403 |

No AC-3/E-AC-3/DTS, no fMP4 HLS, no encryption keys, no DRM in this set.

## 5. Headers beyond Referer + UA
| server family | streams | actually required | evidence |
|---|---|---|---|
| MovieBox DASH (moviebox, mavonyx) | 54 (19 Hindi) | **Cookie**, on manifest + every segment | Referer+UA ±Origin ±`x-*` → 403; Cookie alone → 200/206 |
| Vidrock HLS (evyrith) | 11 | **Origin**, on the master playlist | Referer+UA → 403; + Origin → 200; libVLC 403 ×3 |
| MovieBox MP4 | 35 | Referer and/or UA | none → 429 |
| Castle | 57 | none | — |
| playimdb / zevran | 62 | none (declared Origin unnecessary) | — |

Cookie is per resolve → must be carried for every segment request of that stream. Declared header lists overstate what servers need.

## 6. Multi-audio in one stream
Only the Castle servers (Mirzapur S1E1 castle `[Shared]` / karnis: 5 tagged AAC tracks in one HLS stream, plays on libVLC with Referer/UA). None found: HLS audio renditions (0/130), multi-AdaptationSet DASH audio, multi-track MP4. Normal pattern = one language per URL (MovieBox up to ~9 per title; Castle `[Tamil]`/`[Telugu]`/`[Hindi]`…). Subtitles never embedded — always a separate list (mavonyx 35/35, moviebox 33/54, soryn 18/18, castle 18/43, karnis 6/14, playimdb 3/36, zevran 3/36).

## 7. Quality
Adaptive HLS: playimdb/zevran 360/720/1080; evyrith 1080→360. Castle: one URL per quality, and "1080P" decodes at 720p. DASH: 1080/720/480 HEVC. MP4: single 1080p/720p file, byte-range seeked. No 4K, no HDR.

## 8. Per-plugin verdict
Omitted on purpose — plugin choice belongs to the operator.

## 9. Host requirements discovered
1. **Silent contract failures:** Eclipsia plugins need bare globals `TMDB_API_KEY`, `SCRAPER_SETTINGS`, `CryptoJS`; without them they return `[]` in 3–60 ms. Treat an empty result in < 100 ms as a failure.
2. **TMDB blocked** on Indian networks (`api.themoviedb.org` TLS handshake fails); 11/13 plugins call it directly → host rewrites to the TMDB proxy.
3. **Zero-width characters** (U+200B–U+FEFF) pad evyrith/karnis/mavonyx names → strip before display/matching.
4. **Disguised segments** (`.jpg`, `.html`, extensionless, other host). libVLC copes; ffmpeg needs `-allowed_extensions ALL -extension_picky 0`; a proxy must not filter by extension/MIME.
5. **429 = "denied"** on some servers (MovieBox MP4 when headers missing); playimdb/zevran's ~15 hostnames share one backend that 429s under parallel load → serialize per backend, not per hostname. playimdb and zevran return the same addresses.
6. **Wrong content / different cuts:** Castle Stree 2 previews (10 min ×3, one 127 min), mavonyx "Jawan" = 188 s trailer, moviebox Mirzapur S1E1 = 417 min, Pathaan Bengali dubs 10 min short, Pushpa 2 at 176/178/197 vs 225. Duration check mandatory; a party cannot assume dubs share a timeline.
7. **Quality labels overstate** (Castle "1080P" = 720p).
8. **Change since August:** in this set the blocker moved from containers/audio codecs (MKV, E-AC-3) to request headers (Cookie, Origin).
