# GitHub stream-resolver landscape — October 2026 (for Bearoom P3)

**Date:** 2026-10-10 · **Method:** Playwright on github.com (repo / issue search, sorted by updated), plus
unauthenticated `api.github.com`, `raw.githubusercontent.com` and Codeberg API reads. Plugin sources were
downloaded **as text only** to the scratchpad (`src_untrusted/*.txt`) and grepped — nothing was executed.
**Baseline:** `docs/research/nuvio-plugin-architecture.md` (2026-08-29/31), `docs/providers/plugin-provider-shortlist.md`,
`docs/research/github-references.md`. Already-known items (Nuvio library, All-in-One-Nuvio, evyrith / vidrock /
playimdb, CinePro / OMSS, vidsrc.ts, walterwhite-69, consumet) are covered only where something has changed.

Labelling: anything not seen directly is marked **(inferred)**. Every claim has a URL.

---

## 1. Executive summary

1. **videasy is not "blocked", it is being wound down — and so are cineby and cineplay, which share its backend.**
   Kunai's forensic tracking shows a one-shot-403 CDN from 2026-09-10, DNS A-records deleted on 2026-09-21, a
   partial revival on 09-26, and a catalog move to `db.wingsdatabase.com`. NiakVIO auto-disabled it; Streambert
   (6.2k★) removed it. **Do not rebuild Bearoom around videasy, cineby or cineplay.**
2. **The P3 shortlist mostly survives.** `evyrith` (Vidrock) is alive and actively maintained, but it now lives on
   **Codeberg** (`eclipsia/nuvio-plugin`, daily commits), not GitHub. It is **plain, unobfuscated, fetch-only JS**
   with a pure-JS AES-GCM, which is the best possible fit for the hidden-WebView sandbox. An independent daily
   census, run today, rates `playimdb` and `castle` **FULL OK** and `vidrock` **PARTIAL** (movies OK, TV zero
   results).
3. **New best lead for replacing videasy: Movy** (`movy.sx` → `api.wecollege.net`). It speaks the *same*
   seed + `enc=2` + `mvm1` STREAMCRYPTO protocol as videasy (inferred to be a sibling deployment). It has 16 lanes,
   including **Hindi/Tamil lanes**. An MIT-licensed, dependency-free TypeScript port exists in `KitsuneKode/kunai`.
   No Nuvio plugin for it exists yet, so Bearoom would write it.
4. **Hindi breadth lives in MovieBox** (`mavonyx` / AIO `moviebox`: Hindi Dub on by default, plus Tamil, Telugu,
   Malayalam and others, up to 2160p). The catch: it ships **DASH plus signed cookies**. That is fine on Android
   ExoPlayer, but needs libVLC on iOS, so it fits P2/P5 rather than plain `expo-video`.
5. **Ecosystem risk rose.** `p-stream/providers` is DMCA-disabled (HTTP 451), the P-Stream org is archived, and
   `tapframe/NuvioStreamsAddon` and `webstreamr` are archived. Several popular plugins now depend on a
   **closed-source remote oracle** (`enc-dec.app`). Pin, mirror and allowlist; never hot-load.

---

## 2. Ranked candidates (fit for Bearoom P3: on-device, hidden-WebView sandbox, Hermes host)

| # | Repo | ★ | Last push | License | What it is | P3 fit |
|---|---|---|---|---|---|---|
| 1 | [codeberg.org/eclipsia/nuvio-plugin](https://codeberg.org/eclipsia/nuvio-plugin) (Eclipsia) | 0 | 2026-10-09 | none stated | 38 Nuvio scrapers incl. **evyrith**, karnis, zevran, mavonyx; **unobfuscated** | **Plug-in-able as-is** (pin SHA) |
| 2 | [NuvioPlugin/All-in-One-Nuvio](https://github.com/NuvioPlugin/All-in-One-Nuvio) | 166 | 2026-10-02 | none | 66 scrapers; **playimdb**, castle, moviebox, netmirror, many Hindi sites; mostly obfuscated | **As-is for allowlisted few** (pin SHA) |
| 3 | [KitsuneKode/kunai](https://github.com/KitsuneKode/kunai) | 41 | 2026-10-09 | MIT | TS terminal client; direct-HTTP resolvers (vidlink, rivestream, **movy**, vidrock, videasy) + provider dossiers + daily upstream sweep | **Needs adaptation** (port modules to plugin contract); best *knowledge* source |
| 4 | [niakw/NiakVIO](https://github.com/niakw/NiakVIO) | 10 | 2026-10-10 | GPL-3.0 | Automated Nuvio provider layer + **daily census / health reports** (46 providers, FR-leaning) | **Use as external health feed**, not as code |
| 5 | [coveninja/cove](https://github.com/coveninja/cove) | 146 | 2026-10-09 | AGPL-3.0 | KMP app that runs Nuvio scrapers in isolation | **Architecture reference** for the sandbox |
| 6 | [fvaha/nuvio-tizen-providers](https://github.com/fvaha/nuvio-tizen-providers) | 1 | 2026-10-09 | none | Daily CI that transpiles *all* Nuvio providers to Chromium 47 and publishes a single `providers.json` | **Pattern to copy** (CI transpile + bundle), not a runtime source |
| 7 | [phisher98/phisher-nuvio-providers](https://github.com/phisher98/phisher-nuvio-providers) | 82 | 2026-09-03 | GPL-3.0 | 51 scrapers, many Indian sites (movierulz, desicinemas, hindmoviez, movies4u, dudefilms) | Needs adaptation; MKV/file-host heavy; untrustworthy manifest |
| 8 | [smy778/EncDecEndpoints](https://github.com/smy778/EncDecEndpoints) (`enc-dec.app`) | 103 | 2026-10-03 | MIT (code closed) | Hosted enc/dec oracle for vidlink, vidfast, vidcore, vidup, cinejoy, peachify, yflix… | **Avoid as a hard dependency**; risk flag |
| 9 | [sharoon7171](https://github.com/sharoon7171?tab=repositories) resolvers (e.g. [vidrock-stream-resolver](https://github.com/sharoon7171/vidrock-stream-resolver)) | 0–2 | 2026-09-10 (vidrock) | none | Per-site Node resolvers (vidrock, vidcore, vidup, vidfast-pro, 111movies, cinesrc) | Reference only (Node `vm` / JSDOM / PoW in some) |
| 10 | [yoruix/nuvio-providers](https://github.com/yoruix/nuvio-providers) | 241 | 2026-06-07 | GPL-3.0 | 29 scrapers; most-starred repo, but stale | Stale — monitor only |
| 11 | [cinepro-org/core](https://github.com/cinepro-org/core) | 178 | 2026-05-27 | NOASSERTION | Server-side OMSS aggregator (17 providers) | Not usable (server-side, stale) |
| 12 | [D3adlyRocket/Hindi-Nuvio](https://github.com/D3adlyRocket/Hindi-Nuvio) | 12 | 2026-05-27 | none | 14 Hindi scrapers | Stale; superseded by AIO / Eclipsia |
| — | [truelockmc/streambert](https://github.com/truelockmc/streambert) | 6 189 | 2026-09-11 | GPL-3.0 | Electron embed-iframe app (same shape as Bearoom today) | Signal only |
| — | [mhdzumair/MediaFusion](https://github.com/mhdzumair/MediaFusion) | 951 | 2026-09-09 | MIT | Stremio, debrid / P2P / indexers | Not usable (needs debrid) |
| ✗ | [p-stream/providers](https://github.com/p-stream/providers) | — | — | — | movie-web lineage | **DMCA-disabled (HTTP 451)** |

---

## 3. Per-repo notes

### 3.1 Eclipsia — `codeberg.org/eclipsia/nuvio-plugin` (home of `evyrith`) ★ top fit
- **Where:** the Nuvio plugin library resolves the "Eclipsia" card to
  `https://codeberg.org/api/v1/repos/eclipsia/nuvio-plugin/raw/manifest.json`. I observed this as a network request
  on <https://nuvio-plugin-library.vercel.app/>. **It is not on GitHub**, which is why GitHub search for `evyrith`
  returns nothing.
- **Metadata** ([Codeberg API](https://codeberg.org/api/v1/repos/eclipsia/nuvio-plugin)): created 2026-07-22,
  updated 2026-10-09, 0 stars, 0 open issues, site `eclipsia.dpdns.org`. Manifest v11.5.0 with **38 scrapers**
  that use codenames (evyrith = Vidrock, karnis = Castle, zevran = VAplayer, mavonyx = MovieBox, nyxora = VidFast,
  haylox = Vidlink, soryn = NetMirror, svartok = CinemaCity…).
- **Cadence:** 20+ commits from 2026-10-03 to 10-09, all with the opaque message "Update"
  ([commits](https://codeberg.org/api/v1/repos/eclipsia/nuvio-plugin/commits)). `providers/evyrith.js` was last
  changed on 2026-09-15 (history: 08-11, 08-20, 09-06, 09-13, 09-15).
- **`evyrith.js` mechanics** (read as text, 366 lines, **0 obfuscation markers**):
  - `GET https://vidrock.net/api/{movie/{id} | tv/{id}/{s}/{e}}` returns a JSON map of servers, each with an
    encrypted `url`.
  - That URL is decrypted with a **hand-written AES-GCM** (S-box, GHASH, GCTR) and a hard-coded 256-bit key
    `STREAM_KEY = "7f3e9c2a…"`.
  - The scraper then fetches the HLS master, picks the top variant and labels it `Vidrock • <server>`.
  - It returns `headers` (a Chrome 151 UA, `Referer` / `Origin: https://vidrock.net`). Concurrency is 4. There is
    no `require`. `try`/`catch` returns `[]`.
- **Fit:** ideal for the hidden-WebView sandbox: plain `fetch`, no crypto-js and no cheerio. All of Eclipsia's
  sampled scrapers are unobfuscated (karnis 11 KB, zevran 3 KB, mavonyx 29 KB, soryn 10 KB), so code review
  before pinning is feasible.
- **Risks:**
  - Opaque commit messages; one anonymous maintainer.
  - Codeberg hosting could be removed for ToS reasons (inferred).
  - `haylox` (Vidlink) and `nyxora` (VidFast) call **`https://enc-dec.app`** (grep hits 1 and 2).
  - **Header-replay conflict (verify on device):** kunai's vidrock dossier (reviewed 2026-09-21) says the
    `ngcorp` segment hosts **drop any request with a real User-Agent or a `vidrock.net` Referer**; only
    `User-Agent: " "` and no Referer work. evyrith returns exactly the headers kunai says break segments.
    Source: [kunai vidrock dossier](https://raw.githubusercontent.com/KitsuneKode/kunai/main/.docs/provider-dossiers/vidrock.md).
    The Aug audit played evyrith streams fine, so this may be lane- or time-dependent.

### 3.2 NuvioPlugin/All-in-One-Nuvio (formerly D3adlyRocket/All-in-One-Nuvio)
- `D3adlyRocket/All-in-One-Nuvio` now **301-redirects** to `NuvioPlugin/All-in-One-Nuvio`. The API reports "Moved
  Permanently"; the browser landed on <https://github.com/NuvioPlugin/All-in-One-Nuvio>. The library index still
  fetches the old D3adlyRocket raw URL.
- 166★ / 83 forks, license none, last push 2026-10-02. **66 scrapers** in the
  [manifest](https://raw.githubusercontent.com/NuvioPlugin/All-in-One-Nuvio/refs/heads/main/manifest.json), up
  from 61. New entries include fibwatch, anizone, anikoto, animedekho, animesalt, peachify, desiflix, moonflix,
  zinkmovies, xpass, vidlove and mapple.
- **Cadence:** `main` is bot-synced from `dev` via a workflow added on 2026-09-25. On `dev`, user `paregi12`
  committed almost daily from Sep 22 to Oct 2, for example "Update NetMirror to CNC Verse mobile flow", "fix(anizone):
  … fix quickjs compatibility", "Filter embed URLs and verify real streaming links", and "Improve 4KHDHub and
  HDHub4u extraction" ([dev commits](https://github.com/NuvioPlugin/All-in-One-Nuvio/commits/dev)).
- **Issue response:** VixSrc #49 took 3 days (08-02 → 08-05); 4kHDHub #35 took 25 days. Many issues are still open
  (Netmirror #33/#39/#47, Dahmer/4KHDHUB #40, "Scraper not working" #56)
  ([issues API](https://api.github.com/repos/NuvioPlugin/All-in-One-Nuvio/issues?state=all&sort=updated)).
- **videasy is still `enabled: true`.** `providers/videasy.js` was last edited 2026-07-30 and its only visible host
  string is `www.vidking.net`, which kunai reports as NXDOMAIN. So this entry is stale and dead
  ([file history](https://api.github.com/repos/NuvioPlugin/All-in-One-Nuvio/commits?path=providers/videasy.js)).
- **Status of the shortlisted scrapers:**
  - `playimdb` is v2.0.0, last edited 2026-06-13. It is obfuscated (594 `_0x` markers) and its hosts are
    `nextgencloudfabric.com` and `streamdata.vaplayer.ru`.
  - `vidrock` was last edited 2026-08-11.
  - Eclipsia's `zevran` (VAplayer) uses **the same two hosts** as playimdb, so they share an upstream (inferred).
    They are not interchangeable: the Aug audit measured playimdb 9/9 against zevran 4/9.
- **Risk:** most scrapers are javascript-obfuscator bundles (castle 1 012, vidlink 716, vidfast 626 `_0x` markers).
  `peachify.js` is a **720 KB obfuscated blob** with 41 318 markers; treat it as unreviewable.
  `moviebox.js`, `netmirror.js` and `mapple.js` are readable.

### 3.3 KitsuneKode/kunai — the best public *knowledge* base right now
- 41★, MIT, TypeScript (Bun), 2 848 commits, last push 2026-10-09 ([repo](https://github.com/KitsuneKode/kunai)).
  It is a terminal client that resolves to mpv, not a plugin repo. But its `.docs/provider-dossiers/*.md` files
  are dated, wire-level contracts:
  - **vidlink** ([dossier](https://raw.githubusercontent.com/KitsuneKode/kunai/main/.docs/provider-dossiers/vidlink.md),
    reviewed 2026-09-29): the TMDB id is encrypted through `enc-dec.app`, then
    `vidlink.pro/api/b/<type>/<encId>` is called with `x-playback-environment: webkit`. It returns **DASH on
    `sacdn.hakunaymatata.com` with CloudFront signed cookies** that must reach the player, plus 9–15 subtitle
    languages.
  - **movy** ([dossier](https://raw.githubusercontent.com/KitsuneKode/kunai/main/.docs/provider-dossiers/movy.md),
    reviewed 2026-09-21): the flow is `api.wecollege.net/seed?mediaId=` → `{seed, ttlMs:30000}`, then
    `/{lane}/sources?…&enc=2&seed=`, then an XOR keystream with an `mvm1` magic.
    - It has 16 lanes, and the **austin and delhi lanes carry `Hindi` / `English` / `Tamil` labels**.
    - It returns real MP4 and HLS with `Referer: https://www.movy.sx/`; 11 of 16 lanes were alive on 2026-09-21.
    - The port (`streamcrypto.ts`) is dependency-free.
  - **vidrock** (reviewed 2026-09-21): AES-256-GCM with the site-wide key `7f3e9c…` (same as evyrith); about 5
    lanes (Nova, Atlas, Luna, Orion, Astra). It uses the `User-Agent: " "` trick, and the Luna / Orion lanes are
    TLS-fingerprint gated (browser-only).
  - **rivestream** (reviewed 2026-06-03): MurmurHash plus a rotating `cArray` salt; 6 servers.
  - **videasy** ([dossier](https://raw.githubusercontent.com/KitsuneKode/kunai/main/.docs/provider-dossiers/videasy.md)):
    see §4. It also states `api.speedracelight.com` was the **sole seed host for player.videasy.to, cineby.at and
    cineplay.to**.
- **Health / fix speed:**
  - Vidrock id-scheme rotation: issue [#427](https://github.com/KitsuneKode/kunai/issues/427) opened 09-21,
    closed 09-30 via the "revive vidrock on its rotated API scheme" PR.
  - Daily upstream status sweep added in #437 ([#422](https://github.com/KitsuneKode/kunai/issues/422)).
- **Fit:** needs adaptation. The modules are TS against kunai's own provider SDK; port the crypto and request
  contracts into Nuvio-shaped `getStreams()` plugins. MIT allows this with attribution.

### 3.4 niakw/NiakVIO — automated census / health feed
- 10★, GPL-3.0, 13 947 commits (mostly CI), pushed 2026-10-10 ([repo](https://github.com/niakw/NiakVIO)).
- It describes provider JS as "untrusted input" handled with "bounded workers, SSRF/network controls, sandboxing,
  identity checks… fail-closed publication". It has "Native Labs" for NuvioTV, NuvioMobile Android/iOS and
  NuvioDesktop.
- **[PROVIDER_CENSUS_STATUS.md](https://raw.githubusercontent.com/niakw/NiakVIO/refs/heads/main/PROVIDER_CENSUS_STATUS.md)**
  was regenerated 2026-10-10 ([history](https://github.com/niakw/NiakVIO/commits/main/PROVIDER_CENSUS_STATUS.md)).
  Of 46 providers: 21 FULL OK, 3 PARTIAL, 5 DISABLED. Relevant rows:
  - `playimdb` 🟢 FULL OK (movie + tv)
  - `castle` 🟢 FULL OK
  - `hindmoviez` 🟢 FULL OK
  - `movieshunt` 🟢 FULL OK
  - `vidrock` 🟡 PARTIAL: movie OK; tv `provider_network_zero_result`
  - `vidlove` 🟡 PARTIAL: **movie = wrong content**
  - `vidfast` 🟪 route proven: `provider_network_http_error`
  - `moviebox` 🟪 route proven: `provider_network_exception`
  - `moviesmod`, `mallumv`: WAF challenge
  - `uhdmovies` 🔴 regression
  - **`videasy` ⚫ DISABLED**: `provider_network_http_error`, "keep disabled until a new authoritative provider
    address/backend is qualified"
- Videasy history ([provider-disabled commits](https://github.com/niakw/NiakVIO/commits/main/provider-disabled)):
  "remove legacy Videasy CodeQL hazards" (10-05), "prune stale Videasy disabled snapshots" (10-06).
- **Fit:** don't execute its bundles (GPL, French-leaning catalogue, heavy CI churn). Read its census JSON as a
  free, independent early-warning signal for the providers Bearoom allowlists.

### 3.5 coveninja/cove — sandbox reference
- 146★, AGPL-3.0, Kotlin Multiplatform, pushed 2026-10-09. The README advertises "Opt-in Nuvio-compatible scrapers
  executed behind platform-specific isolation" ([repo](https://github.com/coveninja/cove)).
- From [ARCHITECTURE.md](https://raw.githubusercontent.com/coveninja/cove/master/ARCHITECTURE.md) §"Nuvio isolation":
  - Desktop: a disposable child JVM with a 128 MiB heap, a parent-enforced timeout, and GraalJS with no host
    access.
  - Android: **QuickJS in an `isolatedProcess` service, with "bounded, public-address-only fetches" brokered
    through the main process.**
- **Fit:** validates Bearoom's hidden-WebView + native-fetch-proxy design and adds one requirement worth copying:
  an **SSRF guard** (the proxy refuses private / loopback addresses).

### 3.6 fvaha/nuvio-tizen-providers — CI pattern
- Daily GitHub Action (04:00 UTC) that transpiles every provider from several Nuvio repos to **Chromium 47** and
  publishes one `providers.json` (`{repoId, id, types, needsCheerio, code}`). Consumers run each entry with
  `new Function("module","exports","require", code)`. Latest build 2026-10-09
  ([repo](https://github.com/fvaha/nuvio-tizen-providers)).
- **Fit:** don't consume it. It is unpinned, third-party and re-publishes code daily. Copy the *pattern* in
  Bearoom's own CI: pinned SHA → transpile to the oldest WebView target Bearoom supports → hash → publish to
  Bearoom-owned storage. A side benefit (inferred): a low transpile target protects against old Android System
  WebViews in the sandbox.

### 3.7 phisher98/phisher-nuvio-providers
- 82★, GPL-3.0, last push 2026-09-03. The whole repo was restructured in one burst: "transpile providers for Nuvio
  compatibility", "implement centralized extractors… iframe embeds", "disable dead scrapers causing infinite loads"
  ([commits](https://api.github.com/repos/phisher98/phisher-nuvio-providers/commits)).
- The manifest is **boilerplate**: all 51 entries declare `contentLanguage: ["en"]` and `formats: ["mp4","mkv"]`,
  including Indian sites like Desicinemas, Movierulzhd, Fivemovierulz and Animedubhindi. Its metadata can't be
  trusted.
- **Fit:** needs adaptation; mostly HTML-site → file-host chains (MKV), so it's a poor fit for iOS without libVLC.
  Treat it as a breadth source to audit later, not P3-first.

### 3.8 smy778/EncDecEndpoints (`enc-dec.app`)
- 103★, last commit "vidfast/vidcore/vidup: fix for latest" (push 2026-10-03). The README says the enc/dec code
  "has been made closed-source"; it is a VPS-hosted API rate-limited to 40 req/s
  ([repo](https://github.com/smy778/EncDecEndpoints)).
- Per-site "Last Update" dates: videasy 07/29/2026, vidfast / vidcore / vidup / cinejoy 08/21/2026, peachify
  07/12/2026, vidlink 10/02/2025.
- **Consumers seen:** Eclipsia `haylox` and `nyxora` (grep), kunai's vidlink.
- **Risk flag:** a closed-source remote oracle in the resolve path means a single point of failure. Every resolve
  also discloses the title id and the user's IP to a third party, and the operator can change behaviour at will.
  Don't put an enc-dec-dependent provider in the core set.

### 3.9 sharoon7171 resolvers
- One author, a burst of per-site Node/TS resolvers ([profile](https://github.com/sharoon7171?tab=repositories&sort=updated)):
  vidrock (AES-GCM, created and pushed 2026-09-10, 0★), vidcore.io, vidup, vidfast-pro ("replaying the site
  player in Node"), 111movies ("sandboxed VM executes obfuscated player bytecode"), and cinesrc ("two-stage JSDOM
  challenge with PoW workers").
- **Fit:** reference only. Several depend on Node `vm` / JSDOM and run as local proxy servers. The sophistication
  of 111movies / cinesrc shows where those sites have hardened.

### 3.10 Stale or not usable (brief)
- **yoruix/nuvio-providers:** most-starred (241★) but last pushed 2026-06-07; its manifest ships `videasy` disabled
  ([manifest](https://raw.githubusercontent.com/yoruix/nuvio-providers/refs/heads/main/manifest.json)).
- **cinepro-org/core:** last commit 2026-05-27 ("chore: sunset 02"). It is a server-side OMSS aggregator whose
  providers include videasy, vidrock, vidzee, vixsrc and peachify
  ([providers dir](https://github.com/cinepro-org/core/tree/main/src/providers)). It is still forked heavily
  (166 forks; many fresh "cinepro-core" clones in search). It conflicts with the on-device decision.
- **D3adlyRocket/Hindi-Nuvio:** last pushed 2026-05-27; content superseded by AIO and Eclipsia.
- **MediaFusion:** "Debrid & P2P streaming… Prowlarr, Jackett, Torrentio" ([README](https://github.com/mhdzumair/MediaFusion)).
  Bollywood catalogues, but it needs debrid.
- **walterwhite-69/Videasy.net-Decryptor:** 28★, last pushed 2026-06-13; moot now that videasy is winding down.
  Trixjustbetter/videasy-nuvio (2026-08-23) is likewise moot.
- **mintugoud21/streamflow-stremio-nuvio:** created 2026-10-08, 0★, 3 commits, mostly TPB / Torrentio and old
  embeds, with a "native Hermes provider" claim. Unproven and low-credibility; avoid.
- **Archived / taken down:**
  - `p-stream/providers`: HTTP 451 "Repository unavailable due to DMCA takedown". The notice date is unverified;
    the `github/dmca` tree didn't render.
  - The [P-Stream org](https://github.com/p-stream) has p-stream, backend and docs archived.
  - [tapframe/NuvioStreamsAddon](https://github.com/tapframe/NuvioStreamsAddon) is archived (340★).
  - `webstreamr/webstreamr` is a public archive.

---

## 4. What changed since ~2026-09-01

### 4.1 videasy — the timeline other projects recorded
| Date | Observation | Source |
|---|---|---|
| 2026-09-10/11 | Deterministic stream URLs (`moon.peakstorm.top/…/playlist.m3u8`) return 200 once, then **403 to every client** (curl, curl_chrome150, mpv); "CDN grants one fetch per window" (hypothesis) | [kunai #361](https://github.com/KitsuneKode/kunai/issues/361) |
| 2026-09-10 | Streambert: "Apparently videasy has shut down"; removed (closed 09-29) | [streambert #180](https://github.com/truelockmc/streambert/issues/180) |
| 2026-09-18 | Streambert users: "Videasy and Vidking no longer exist" | [streambert #183](https://github.com/truelockmc/streambert/issues/183) |
| 2026-09-21 | `api.speedracelight.com` CF 502; `api.videasy.to` ENOTFOUND; later: videasy.to / api / www A-records **deleted** (zone still on `ns*.ddos-guard.net`), player.videasy.to 502, speedracelight A-record gone. Verdict: "operator wind-down… likely DMCA-class" | [kunai #422](https://github.com/KitsuneKode/kunai/issues/422), [videasy dossier](https://raw.githubusercontent.com/KitsuneKode/kunai/main/.docs/provider-dossiers/videasy.md) |
| 2026-09-26 | Re-probe: speedracelight **HTTP 200 (recovered)**, player.videasy.to 200; `api.videasy.to`, `videasy.to`, `www.vidking.net` NXDOMAIN | [kunai #463](https://github.com/KitsuneKode/kunai/issues/463), [#422](https://github.com/KitsuneKode/kunai/issues/422) |
| by 2026-09-29 | Catalog host "moved to `db.wingsdatabase.com/3`"; `db.speedracelight.com` 429s; "They resurfaced on a new domain" (the entry is labelled "2026-11" but was committed 2026-09-29) | [videasy dossier](https://raw.githubusercontent.com/KitsuneKode/kunai/main/.docs/provider-dossiers/videasy.md), [commits](https://api.github.com/repos/KitsuneKode/kunai/commits?path=.docs/provider-dossiers/videasy.md) |
| 2026-10-05 | Automated monitor: `player.videasy.net` "fetch failed" (also iframe.pstream.org dead, autoembed dead, multiembed 403) | [movie-zone #22](https://github.com/Kizitofahad-rgb/movie-zone/issues/22) |
| 2026-10-05/06 | NiakVIO keeps videasy DISABLED; Videasy CodeQL cleanup and pruning | [NiakVIO commits](https://github.com/niakw/NiakVIO/commits/main/provider-disabled) |
| 2026-10-10 | Bearoom's own measurement: player 403 except `sec-fetch-dest: iframe`; speedracelight CF 502 | (brief) |

**Reading:** the stream backend has flapped (dead 09-21, alive 09-26, dead today) while the brand domains are gone.
Even if videasy "resurfaces on a new domain", it does so as an unannounced moving target. The **same backend fed
cineby.at and cineplay.to**, so those are not independent fallbacks.

### 4.2 Everything else
- **The Movy / videasy relationship (inferred):** Movy uses the identical `seed?mediaId` → `enc=2` → `mvm1`
  STREAMCRYPTO on its own host `api.wecollege.net`. It was verified live on 2026-09-21 (11 of 16 lanes, Hindi /
  Tamil lanes included). No Nuvio plugin exists yet (searches for `movy.sx`, `wecollege` and `movy nuvio` found
  only a WebView wrapper, [kerv/movy](https://github.com/kerv/movy)).
- **Vidrock rotated its id scheme** (kunai #427, 09-21) and was revived 09-30. evyrith (09-15) and kunai's current
  dossier both use the plain-id path plus AES-GCM decrypt. NiakVIO today shows vidrock TV returning zero results.
- **Nuvio library:** now **18 repos / 347 "scrapers listed"**. The Fenix, Nvmindl and Easystreams manifests 404;
  Eclipsia is on Codeberg ([library](https://nuvio-plugin-library.vercel.app/)).
- **All-in-One-Nuvio** moved org, added the dev→main sync (09-25), grew to 66 scrapers, and is fixing QuickJS
  compatibility. That is relevant because it shows plugins are being tuned for a non-Node runtime.
- **MovieBox decoys (inferred from code):** Eclipsia's `mavonyx` rejects streams whose URL contains
  `/other/2026/09/` as "placeholder", which suggests MovieBox began serving decoy media in Sept 2026.
- **Takedowns and archives:** p-stream/providers is DMCA-disabled; P-Stream, NuvioStreamsAddon and webstreamr are
  archived.
- **Unverified signal:** a repo description claims "sora is officially dead 9/8/26"
  ([Stephkillzu/sora-modules-im-hosting](https://github.com/Stephkillzu/sora-modules-im-hosting)). The iOS Sora
  JS-module ecosystem may be fragmenting; I did not verify this.

---

## 5. Recommendation for Bearoom P3

### Adopt first (in this order)
1. **Eclipsia `evyrith` (Vidrock) + AIO `playimdb` + Eclipsia `karnis` (Castle) as the core three.** Pin each to a
   commit SHA (Codeberg: `/raw/commit/<sha>/providers/<id>.js`) and **mirror the pinned bytes into Bearoom-owned
   storage**; never fetch upstream at runtime.
   - **Why:** evyrith is readable, fetch-only and pure-JS crypto, and carries Hindi / Tamil / Telugu as separate
     streams (Aug audit). playimdb and castle are FULL OK on today's independent census.
   - **Caveat to test first:** per-host header replay for Vidrock segments (kunai's `User-Agent: " "` / no-Referer
     finding contradicts the headers evyrith returns).
   - Treat evyrith and vidrock as one failure domain, and playimdb and zevran as one (shared hosts).
2. **Write a Bearoom-owned `movy` plugin, ported from kunai's MIT `movy` module.** This is the most direct videasy
   replacement found: the same protocol family Bearoom already deobfuscated (§3 of the Nuvio study), multi-lane,
   with Hindi / Tamil lanes, and no third-party plugin to trust. Verify the lane outputs and the
   `Referer: movy.sx` playback on device before relying on it. Attribute kunai (MIT).
3. **MovieBox (`mavonyx`) as the Hindi-dub breadth source, but Android-first.** It returns DASH with signed cookies
   and needs crypto-js plus HMAC signing. ExoPlayer handles DASH; iOS needs the deferred libVLC tier (P5). Gate it
   by platform and ship it after the core three.

### Avoid
- **videasy / cineby / cineplay / vidking:** the same wound-down backend. Keep at most a health-checked, disabled
  stub, and do not keep shipping AIO's `videasy.js` (it targets an NXDOMAIN host).
- **Providers that require `enc-dec.app`** (Eclipsia `haylox` / `nyxora`, kunai-style vidlink) as core: a
  closed-source remote oracle, a privacy leak, and a single point of failure. Fallback tier only, if at all.
- **`peachify`** (720 KB obfuscated) and any plugin you can't read before pinning. Also avoid aggregator mirrors as
  runtime sources (fvaha bundle, `ktsevents/nuvio` "auto-synced mirror").
- **Server-side stacks** (CinePro, MediaFusion, sharoon7171 Node `vm` / JSDOM resolvers): they contradict the
  on-device decision and/or need debrid.
- **NetMirror for now:** it needs `Set-Cookie` read access (`headers.getSetCookie()`) and up to 7×10 s
  verification waits ([AIO netmirror.js](https://raw.githubusercontent.com/NuvioPlugin/All-in-One-Nuvio/refs/heads/main/providers/netmirror.js)).
  A WebView `fetch` can't read `Set-Cookie`, and the wait exceeds a 60 s timeout.

### Sandbox / proxy requirements surfaced by this survey
- Expose `Set-Cookie` and support `redirect: 'manual'` in the native fetch proxy.
- Apply **per-host header policy** (the Vidrock UA quirk).
- Add an **SSRF guard** (public addresses only, as Cove does).
- Keep a host-side per-plugin timeout.
- Plugins are being tuned for QuickJS, so keep the WebView target conservative and transpile in CI (fvaha pattern).

### Monitoring
Subscribe read-only to NiakVIO's daily `PROVIDER_CENSUS_STATUS.md` / `health-report.json` and kunai's upstream
tracking issues as free early-warning signals. Keep running Bearoom's own duration-vs-TMDB correctness check;
NiakVIO already flags `vidlove` for wrong content.
