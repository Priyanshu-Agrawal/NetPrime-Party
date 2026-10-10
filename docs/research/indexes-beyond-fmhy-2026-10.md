# Indexes beyond FMHY: Bearoom research, 2026-10-10

**Scope.** This is read-only information gathering across the public indexes, wikis, catalogs and status trackers other than FMHY. It complements `docs/research/fmhy-github-index-2026-10.md` (the "FMHY report"; I read §1, §3a, §3b and §5 first).

**What I did not do.** I did not visit or probe any streaming site, embed player or addon endpoint. I ran no code and installed nothing. I did not get past any protection: Reddit returned 403 or a login wall, and the Redlib mirror showed an Anubis JS challenge, so I left both alone.

**Method.**
- **Rentry pages.** I read them as rendered HTML. `/raw` now needs an access code.
- **GitHub.** I used `raw.githubusercontent.com`, repo web pages and `commits/<branch>.atom` feeds for dates. The unauthenticated GitHub API was already rate-limited by other agents, so I made one call and it failed.
- **CloudStream and Nuvio repos.** I read the `repo.json`, `plugins.json` and `manifest.json` files as JSON text only.
- **Health data.** PopcornDen and IbbyLabs data came from their own published JSON or embedded page data.
- **Embed-API docs.** Information came from search-engine summaries of the provider docs, not from loading the provider sites. Every such row is marked *(search summary, unverified)*.

**Labels.**
- **(inferred)** marks my reasoning.
- **(unverified)** marks a claim I could not confirm from a primary page.
- "Status" means what the cited index or tracker reported on 2026-10-10. It is never my own probe.

---

## 0. The indexes covered (inventory)

| Index | URL | What it is | Last updated | Hindi / Indian coverage | Use for Bearoom |
|---|---|---|---|---|---|
| r/Piracy Megathread (Rentry mirror of the Reddit wiki) | [rentry.org/megathread](https://rentry.org/megathread) · [Movies & TV](https://rentry.org/megathread-movies-and-tv) · [Unsafe](https://rentry.org/megathread-unsafe-sites) · [Mobile](https://rentry.org/megathread-mobile) | Moderator-curated; 🐐 = top tier, 💩 = avoided | Main page 2026-08-06; Movies & TV **2026-10-06**; Unsafe 2026-05-13; Mobile 2026-08-31 | TamilMV, Vegamovies, Einthusan; Screenopps ("Bollywood"); Cinesu ("multiple audio languages") | Second opinion on sites and an unsafe-clone list. Reddit itself was unreachable (403 / login wall; Redlib mirror behind an Anubis challenge, not bypassed) |
| privateersclub/wiki | [github.com/privateersclub/wiki](https://github.com/privateersclub/wiki) ([site](https://megathread.pages.dev/)) | **Game** piracy megathread (r/PiratedGames) | 2026-09-28 | none | **Out of scope.** It is not the r/Piracy megathread |
| The Index | [theindex.moe](https://theindex.moe/) | Anime / manga / VN index with structured columns (Dub language, etc.) | items modified up to 2026-09-23 | One item tagged Hindi dub: **9ime** ([dub filter](https://theindex.moe/column/dubs?v=hin)) | Anime only |
| Wotaku | [wotaku.wiki](https://wotaku.wiki/) ([repo](https://github.com/wotakumoe/Wotaku)) | Otaku index | 2026-10-10 | none found (spot check of `/websites`) | none |
| EverythingMoe | [everythingmoe.com](https://everythingmoe.com/) | Anime-first curator; "Western Streaming (11)" section; [Downtime Detector](https://everythingmoe.com/monitor) | data current 2026-10-10 | **Anime World India** entry with Hindi alt sites ([data](https://everythingmoe.com/data/cache/main.json), id `animeworldin`) | Hindi-dub anime mirror list; small JSON health feed (§4) |
| PopcornDen | [popcornden.me/india](https://popcornden.me/india) | Region-filtered directory (16 regions, 280 sites); **every link HTTP-checked every 6 h** | checked **2026-10-10 05:51 UTC** | **India: 69 sites** (20 movies, 16 anime, 10 apps, …), 50 "confirmed up" | **New.** The best free Indian-site health and domain-move signal found (§4). Not on FMHY |
| Stremio Addons (community catalog) | [stremio-addons.net](https://stremio-addons.net/) | 622 addons, community-upvoted, has a **`bollywood` category (94 addons)** ([list](https://stremio-addons.net/addons?categories=bollywood)) | live | ~15 Indian stream or catalog addons (§3c) | Hindi Stremio addons and per-addon "Manifest Status / Problem Reports" |
| Stremio official addon collection | [api.strem.io/addonscollection.json](https://api.strem.io/addonscollection.json) | Stremio's own curated list (96) | live | **no Hindi stream addon** | none |
| stremio-addons.com / stremio-addons.netlify.app | — | The old community list (taken down per [docs](https://docs.stremio-addons.net/about)) | dead (no response / 404) | — | — |
| awesome-stremio | [doingodswork/awesome-stremio](https://github.com/doingodswork/awesome-stremio) | Awesome list | **2021-05-16** (stale) | none | none |
| awesome-piracy (Igglybuff) | [Igglybuff/awesome-piracy](https://github.com/Igglybuff/awesome-piracy) | Awesome list | **2023-06-18** (stale) | Einthusan only | none |
| awesome-piracy (Shakil fork) | [shakil-shahadat.github.io/awesome-piracy](https://shakil-shahadat.github.io/awesome-piracy/) ([readme](https://github.com/Shakil-Shahadat/awesome-piracy)) | Maintained fork | date not retrieved (API limit); contains 2025–26 entries | none | Pointed me to **PopcornDen** and Best Free Streaming |
| "awesome-streaming" | — | No such maintained list found | — | — | — |
| CloudStream repo directory | [recloudstream/cs-repos `repos-db.json`](https://raw.githubusercontent.com/recloudstream/cs-repos/master/repos-db.json) = [rentry.org/cs3-repos](https://rentry.org/cs3-repos) | Official directory, 31 repos | **2026-09-26** (both) | 8 repos with Indian-language plugins (§3a) | Biggest Hindi plugin census |
| Nuvio Plugin Library | [nuvio-plugin-library.vercel.app](https://nuvio-plugin-library.vercel.app/) (data: [Notion API proxy](https://nuvio-plugin-library.vercel.app/api/notion/326981dcb87e80f6b9f6f23469a00fd3)) | 18 community repos with a language column | live | 6 repos with Indian scrapers (§3b) | Repo directory |
| Nuvio Wiki | [nuvio.wiki/integrations/plugins](https://nuvio.wiki/integrations/plugins) | Docs | live | none; says to find repos on Discord | Notes that Nuvio plugins run in **embedded QuickJS** |
| NiakVIO census | [PROVIDER_CENSUS_STATUS.md](https://raw.githubusercontent.com/niakw/NiakVIO/refs/heads/main/PROVIDER_CENSUS_STATUS.md) / [JSON](https://raw.githubusercontent.com/niakw/NiakVIO/refs/heads/main/automation/provider-census-status.json) | Playback-level census of 46 Nuvio providers | JSON commits ~every 30 min (latest 2026-10-10 11:54 UTC) | hindmoviez, movieshunt, castle, mallumv, moviesmod, uhdmovies, desiflix | Already in the landscape report; restated in §4 and §5 |
| IbbyLabs Uptime Tracker | [uptime.ibbylabs.dev](https://uptime.ibbylabs.dev/) | Stremio / Nuvio service health, **including stream-level checks** | generated 2026-10-10 11:58 UTC | monitors **HdHub** (Hindi) | JSON API and RSS (§4) |
| THE-OMEGATHREAD | [dwongdev/THE-OMEGATHREAD](https://github.com/dwongdev/THE-OMEGATHREAD) | Index of indexes | 2026-01-07 | none | Led me to the r/Piracy Rentry mirror and PopcornDen-era lists |
| Piracy Megathreads Wiki | [rentry.co/wikiwiki](https://rentry.co/wikiwiki) | Index of indexes | 2026-03-16 | links the **Indian Piracy Index** | — |
| Indian Piracy Index | [anymeofu/Indian-Piracy-Index](https://github.com/anymeofu/Indian-Piracy-Index) | India-specific index | **2021-12-01** (wikiwiki: "no longer maintained") | yes, stale | none |
| Other meta-indexes | [ripped.guide](https://ripped.guide/TV/Shows), [champagne.pages.dev](https://champagne.pages.dev/), [mediasavvy.pages.dev](https://mediasavvy.pages.dev/), [piracy.vercel.app](https://piracy.vercel.app/), [wiki.dbzer0.com/piracy](https://wiki.dbzer0.com/piracy/), [list.vidpop.xyz](https://list.vidpop.xyz/), [bestfreestreaming.org](https://www.bestfreestreaming.org/) | Small curated lists | various | essentially none (ripped.guide mentions OlaMovies for Bollywood) | none |
| wiki-index.pages.dev | [non-english](https://wiki-index.pages.dev/non-english) | FMHY-derived mirror (same row format) | — | Same as FMHY | Use FMHY directly |
| Kodi | — | No maintained Kodi index with Hindi sources found. FMHY lists only Greek / Italian / Polish Kodi addons. Search engines refused or returned spam | — | none | Skip |

---

## 1. Hindi / Indian-language sources: merged, de-duplicated table

Abbreviations:
- **CS** = CloudStream repos (§3a). Plugin `status` is maintainer-declared: 1 = ok, 0 = down.
- **NV** = Nuvio repos (§3b).
- **SA** = stremio-addons.net (§3c).
- **PD** = PopcornDen. Its "ok / blocked(403) / redirected / down" is a homepage HTTP check from a datacenter, so 403 often means a WAF, not a dead site.
- **FMHY** = as recorded in the FMHY report or the current `non-english.md`.

Hindi capability is always **the index's claim**; nothing was played. Bearoom's own measured data lives in `plugin-catalog-measurement-2026-10.md`.

### 1a. Movie / TV sources (TMDB-catalog relevant)

| Source | Type | Indexes listing it (domain each uses) | Claimed Hindi capability | Last-known status (source) | Notes |
|---|---|---|---|---|---|
| **VegaMovies** (+ LuxMovies / RogMovies) | DDL / MKV host chain | FMHY ⭐ `vegamovies.market`; [r/Piracy](https://rentry.org/megathread-movies-and-tv) `1vegamovies.cc`; [PD](https://popcornden.me/india/movies) `vegamovies.market`; CS [Megix](https://raw.githubusercontent.com/SaurabhKaperwan/CSX/builds/plugins.json) + [Desi](https://raw.githubusercontent.com/Faisal0786/Desi/builds/plugins.json); NV AIO, CENSORED, Kabir | "Dual Audio, Bollywood and Hollywood" (CS Desi) | PD: **blocked 403**; CS status 1 | **r/Piracy flags `vegamovies.ist` as a fake clone** ([unsafe](https://rentry.org/megathread-unsafe-sites)). Four domains across indexes |
| **HDHub4u** / **4KHDHub** | DDL | FMHY ⭐ `hdhub4u.bi`; PD `new2.hdhub4u.free`; CS [phisher](https://raw.githubusercontent.com/phisher98/cloudstream-extensions-phisher/refs/heads/builds/plugins.json) (HDhub4u `hi`, FourKHDHub); NV CENSORED, Kabir; SA **HdHub** addon | Hindi-tagged (CS `hi`, NV `hi`) | PD ok (200); **IbbyLabs: HdHub addon UP**; NiakVIO 4khdhub = route proven, no media | Stremio "HdHub" (229★, [page](https://stremio-addons.net/addons/hdhub)) presumably scrapes HDHub4u **(inferred)** |
| **UHDMovies** | DDL (4K) | FMHY ⭐ (`modlist.in`); PD `uhdmovies.autos`; CS phisher ("Indian Multi-language 4K"); NV CENSORED | multi-language | PD **redirected → `uhdmovies.my`**; CS 1; **NiakVIO 🔴 REGRESSION** | Disagreement (§5) |
| **MoviesMod** (+ TopMovies) | DDL | FMHY ⭐ (`mmodlist.org`); PD `moviesmod.ai.in`; CS Megix; NV CENSORED | Hindi / dub | PD ok; NiakVIO route proven | — |
| **MoviesDrive** | DDL | FMHY `new2.moviesdrive.christmas`; CS Megix + Desi ("Hindi Dubbed Hollywood & Bollywood"); NV Kabir | Hindi dubbed | CS 1 | — |
| **Bollyflix** | DDL | FMHY `bollyflix.bi`; PD `new.bollyflix.vote`; CS Megix | Hindi | PD ok | — |
| **HindMoviez** | DDL | FMHY `hindmoviez.cafe`; CS phisher; NV AIO, CENSORED, Kabir | Hindi | **NiakVIO 🟢 FULL OK** | The best-verified Hindi DDL source |
| **KMMovies** | DDL | FMHY `kmmovies.life`; PD `kmmovies.baby`; CS Desi | "Hindi, English & Dub" | PD ok | — |
| **Movies4u** | DDL | PD `movies4u.kg`; CS phisher; NV AIO, Spidey | Hindi / Tamil | PD blocked 403 | Not in FMHY |
| **MultiMovies** | Streaming | FMHY ⭐ `multimovies.wtf`; PD same; CS phisher ("Indian Multi-language HD") | multi-language | PD blocked 403 | — |
| **Desicinemas / BollyZone** | Streaming | FMHY `desicinemas.to`; PD `desicinemas.pk`; CS phisher; NV CENSORED (`hi,pa`), phisher-nuvio | Hindi / Punjabi | PD ok | Domain disagreement |
| **TamilMV** | Torrent / DDL | FMHY ⭐ `1tamilmv.lease`; r/Piracy `1tamilmv.fi`; NV Spidey; SA [TorrentsDB](https://stremio-addons.net/addons/torrentsdb) (1TamilMV) | Tamil / Telugu / Hindi | — | — |
| **TamilBlasters** | Torrent / DDL | FMHY; PD `1tamilblasters.tech`; CS phisher, Cinephile; NV Spidey; SA TorrentsDB | Tamil-first | PD ok | — |
| **5Movierulz** | Streaming / DDL | FMHY `5movierulz.fitness`; PD `5movierulz.academy`; CS phisher (`hi`); SA "M_Rulz Scraper (Telugu)" | Telugu / Hindi | PD ok | — |
| **Einthusan** | Streaming (HD Indian films) | FMHY ("VPN required"); r/Piracy; Igglybuff awesome-piracy; CS [CNC](https://raw.githubusercontent.com/NivinCNC/CNCVerse-Cloud-Stream-Extension/builds/plugins.json); NV AIO; SA [EinthusanTV](https://stremio-addons.net/addons/einthusantv) (asaddon) | Hindi / Tamil / Telugu / Malayalam originals | CS 1 | Geo-restricted per FMHY |
| **HydraHD** | Streaming aggregator | FMHY (Indian section, unstarred, `hydrahd.com`, status `hydrahd.info`); **r/Piracy 🐐** `hydrahd.io` / `.info`; EverythingMoe Western (`.com/.ru/.me`) | not stated | — | Rated much higher by r/Piracy than by FMHY |
| **MovieBox** family | App API (multi-audio) | FMHY (Multi-Server, mirrors); PD apps `moviesbox.com.co` (**APK-mirror domain (inferred)**); CS phisher (`hi`), CNC MovieBoxProvider / MovieBoxProviderIN, AllForU, Desi ("Pure API Provider with Crypto Bypass"); NV CENSORED, Eclipsia (mavonyx); SA [MovieBox](https://stremio-addons.net/addons/moviebox) ([mesamirh/stremio-moviebox](https://github.com/mesamirh/stremio-moviebox), pushed 2026-07-19) | multi-language audio (Hindi incl.) | CS 1 (×4); **NiakVIO: route proven, no verified media** | Measured by Bearoom: Hindi DASH is Cookie-gated (plugin-catalog report) |
| **NetMirror** family (Netflix / Prime / Hotstar mirrors; "OttSource", "CNC Verse") | App API | PD apps `netmirror.gg`; CS CNC ("CNC Verse", "CNC Verse Mobile"), Desi (OttSource), [AllForU](https://raw.githubusercontent.com/RVRBEAST76/allforu-repo/builds/plugins.json) ("Tamil, English, Hindi, Telugu"); NV Eclipsia (soryn); Vega (FMHY report) | OTT multi-audio claimed | PD blocked 403 | — |
| **Castle TV** | App API | CS CNC; NV [Yoru](https://raw.githubusercontent.com/yoruix/nuvio-providers/refs/heads/main/manifest.json) (`hi,ta,te,ml,kn`), Eclipsia (karnis); SkyStream ext (castletv) | multi-track AAC (Bearoom measured 5 tracks) | **NiakVIO 🟢 FULL OK** | — |
| **AllMovieLand** | Streaming | CS phisher ("Indian MultiLanguage, Mostly Hindi"); NV AIO, Yoru | Hindi | CS 1 | Not in FMHY |
| **CinemaCity** | Streaming | CS phisher ("Multi-Lang/Audio"); NV AIO, Yoru (`hi`), Eclipsia (svartok); PD `cinemacity.cc` | multi-audio | PD blocked 403 | — |
| **DudeFilms**, **ZinkMovies**, **Hdmovie2**, **CineFreak** (Bangla / Hindi), **MoviesHunt**, **MovieBlast**, **CTGMovies**, **GramCinema**, **HDGharTV**, **XPass**, **MoonFlix** | Streaming / DDL | CS phisher (first 4); NV AIO / Kabir / Yoru / CENSORED (rest) | Hindi-tagged | MoviesHunt **NiakVIO 🟢 FULL OK**; others no tracker | Long tail, mostly not in FMHY |
| **MalluMV** | DDL | NV Yoru (`ta,te,hi,ml,kn`) | Malayalam / Hindi | NiakVIO 🟣 chain reached | — |
| **DooFlix** | App API | NV Yoru (`en,hi`); CS CNC DoFlixProvider | Hindi | **CS CNC status 0 (down)**; Vega: disabled | Disagreement (§5) |
| **DesiFlix** | Streaming | NV [AIO](https://raw.githubusercontent.com/D3adlyRocket/All-in-One-Nuvio/refs/heads/main/manifest.json) (enabled); SA [DesiFlix](https://stremio-addons.net/addons/desiflix-indian-serials-movies-and-web-series) (Indian serials, `desitvhub.eu.org`, may be a different source) | Hindi | **NiakVIO ⚫ DISABLED** | Disagreement (§5) |
| **Desi Serials / ZDKSerials / Microtv** (Indian TV serials, vertical dramas) | Streaming | FMHY `desi-serials.to`; CS CNC DesiSerialsProvider, phisher ZDKSerials, Microtv | Hindi TV | CS 1 | TV-serial coverage TMDB rarely has **(inferred)** |
| **PikaShow**, **HDO Box**, **YouCine**, **BeeTV** | Android apps | PD apps (`pikashowtv.in`, `hdobox.net`, `youcineapkpro.com`, `beetvs.com.co`); CS CNC Pikashow (1), HDO (**0**) | Hindi claimed (inferred from India listing) | PD ok (homepage only) | **Risk:** these look like third-party APK-download domains **(inferred)**. FMHY lists none of them (BeeTV only via modded-APK search) |
| **PopcornDen-only India movie sites**: alooytv (`fitnur.com`), Movies Bazar (`moviesbazar.su`), hindilinks4u (`hindilinks4u.cafe`), yupflix (`yupflix.com`), thenextplanet (`thenextplanet.surf`), cinephile (`cinephile.live`); plus PRMovies `prmovies.farm` and WorldFree4u `worldfree4u.blog` (FMHY uses `.exchange` / `.expert`) | Streaming / DDL | [PD India movies](https://popcornden.me/india/movies) | Hindi implied by region | PD: ok, except thenextplanet / prmovies blocked 403 | **Not in FMHY.** Unvetted for safety (PopcornDen does no safety review; see §5) |
| **Screenopps**, **Cinesu**, **ApexMovies** | Streaming aggregators | [r/Piracy](https://rentry.org/megathread-movies-and-tv) only | Screenopps "Hollywood and Bollywood"; Cinesu "multiple audio languages"; ApexMovies runs its own server "ApexPlay" | — | Not in FMHY |
| **Legal / paid** (aha, Hotstar, YuppTV, Tarang Plus, MX Player) | Licensed OTT | PD India "Paid" / "Live TV"; FMHY (MX Player) | yes | PD ok | Listed for completeness; not embeddable |

### 1b. Hindi-dub anime / cartoons (one cluster, many mirrors)

| Source | Indexes (domain) | Claim | Status | Notes |
|---|---|---|---|---|
| **Anime World India** (watchanimeworld) | FMHY ⭐ `watchanimeworld.one` (+ `animesalt.cx`); [EverythingMoe](https://everythingmoe.com/s/animeworldin) (same; ex-domains `anime-world.to/.co/.cc/.in/.app`, `theanimeworld.in`); PD; CS [raghav](https://raw.githubusercontent.com/KSHITIJ8473/raghav/builds/plugins.json) AnimeWorldIndia; NV AIO | EverythingMoe: "multi audio and multi subtitles… default audio language is not English… often changes domain"; CS: "Hindi, Tamil, Telugu" | PD blocked 403 | — |
| **AnimeSalt** | FMHY `animesalt.cx`; PD `animesalt.me`; EverythingMoe alt; CS phisher; NV AIO (`hi,ta,te,en,ja`) | Hindi / Tamil / Telugu | PD ok | Domain disagreement |
| **ToonStream** | FMHY ⭐ `toonstream.vip`; EverythingMoe `toonstream.dad`; CS phisher | "Multi Language" | — | Domain disagreement |
| **PirateXPlay**, **AnimeDekho**, **Kartoons**, **ToonHub / ToonWorld4All**, **Desi Dub Anime**, **AnimeJoker** | FMHY (most); PD (`kartoons.to` vs FMHY `kartoons.me`; AnimeDekho blocked 403; ToonWorld4All blocked 403; desidubanime ok; animejoker ok); CS phisher; NV AIO / Spidey | Hindi dub | mixed | — |
| **New, not in FMHY:** hindianimeverse.org ([EverythingMoe](https://everythingmoe.com/s/animeworldin)); **9ime** (`9ime.live`, [The Index](https://theindex.moe/column/dubs?v=hin): Dub English + Hindi); animelok.cc, anime4u.site, animeflix.dad, animesogo.to, subdubanime.site (blakiteanime), ag48anime.fun ([PD India anime](https://popcornden.me/india/anime)); **AniVortex** (PD apps `anivortex.in`; CS phisher + AllForU) | various | Hindi dub (implied) | PD: all ok except ag48 (429) | Anime is outside TMDB-first scope but often requested for Hindi dubs |
| **Rare Toons India** (`rareanimes.mov`) | EverythingMoe; PD; CS raghav ("unstable and many dead links") | Hindi cartoons | PD ok | — |

---

## 2. Embed / developer APIs not in FMHY's list

FMHY's API list ([rentry.co/onbksdgu](https://rentry.co/onbksdgu), 2026-10-09) and the FMHY report's §3a are the baseline. The table below covers what the other indexes and the docs search surfaced. **None of these pages was loaded by me.** Details come from search-engine summaries of each provider's docs, so treat every row as **unverified**.

| API | Docs | IDs | Player events out | **Commands in** (watch-party relevant) | Language / Hindi | Index / source | Notes |
|---|---|---|---|---|---|---|---|
| **MoviesAPI** (`moviesapi.to`) | [moviesapi.to](https://moviesapi.to/) | TMDB / IMDb (per summary) | `play, pause, ended, seeked (>3 s jumps), timeupdate (~1/s), playerstatus`; messages tagged `source:'moviesapi-player'` | **seek, setVolume (0–1), getStatus, togglePlay, mute/unmute, setSpeed, fullscreen enter/exit**. The docs include a **`WatchPartyController`** example | not stated | Search summary | **FMHY dropped moviesapi from its list.** Bearoom's DB seed still has `moviesapi.to` (FMHY report §2.0). Example posts with `'*'` target origin. **The strongest new watch-party API** |
| **APIPlayer** (`apiplayer.ru`) | [apiplayer.ru/docs](https://apiplayer.ru/docs) | TMDB / IMDb; `/embed/movie/{id}` or `?tmdb=` | events tagged `type:'mplayer'`, `e.data.event` (names not captured) | **play, pause, seek(s), volume(0–1), mute, setSpeed(0.5–3), setChapters, setSleepTimer, load(url), getStat…** | **`lang` / `ds_lang` accepts `hi`**, but the documented effect is a **subtitle track + UI language**, not a dub audio track | Search summary | Command set is comparable to VidFast's. Hindi audio unproven |
| **VidPhantom** (`vidphantom.com`) | [vidphantom.com](https://vidphantom.com/) | TMDB | `PLAYER_EVENT` play / pause / seeked / ended / timeupdate with `currentTime, duration, tmdbId, mediaType`; origin-checked example | none found | — | Search summary | Events-only (Tier 2 equivalent) |
| **YapGrid** (`yapgrid.com`) | [enikqi/yapgrid](https://gitblind.noratr.app/enikqi/yapgrid) (docs-only repo) | TMDB, no key | none documented | none | — | Search summary | — |
| **Embed-API** (`embed-api.stream`), **VidSpark** (`vidspark.to`) | [embed-api.stream](https://embed-api.stream/), [vidspark.to](https://vidspark.to/) | ? | ? | ? | ? | Search hits only, no docs found | Unknown |
| **Megavid** (`megavid.buzz`) | [megavid.buzz](https://megavid.buzz/) | anime | events (per summary) | ? | — | Search summary | Anime only |
| **Autoembed via Stremio** | [SA Autoembed Strem](https://stremio-addons.net/addons/autoembed-strem) (`vidsrc-api-stremio.vercel.app`) | IMDb (Stremio) | — | — | — | stremio-addons.net | Wraps AutoEmbed (already on FMHY) |
| **hindi-dub-api** | [M4X1MUS07/hindi-dub-api](https://github.com/M4X1MUS07/hindi-dub-api) | ? | — | — | "Hindi, Tamil, Telugu and Bengali" dubbed | GitHub (via search) | 3★, single commit, Vercel demo. **Low credibility** |
| Historic list | [LetMeWatch issue #4](https://github.com/AdvithGopinath/LetMeWatch/issues/4) | IMDb / TMDB | — | — | — | GitHub | A 2021 embed list (gomo, fsapi, apimdb, superembed…); repo archived 2026-04-10. **Stale** |

**Corrections to check against the FMHY report** *(search summary, unverified)*: one search summary said the docs at **vidcore.org** ([video-player-api-documentation](https://www.vidcore.org/docs/video-player-api-documentation)) and **vidapi.ru** ([/api](https://vidapi.ru/api)) describe `PLAYER_EVENT` postMessage events. vidapi.ru's payload was given as `player_status, player_progress, player_duration`. The FMHY report put both in Tier 3 ("no event API"). A follow-up search could not reconfirm either. Re-read both docs pages before relying on either reading.

**Watch-party usage seen in the wild:** r/Piracy describes **Reelix** (FMHY ⭐) as "Playback via vidcore. Watch parties…" ([r/Piracy](https://rentry.org/megathread-movies-and-tv)). That suggests at least one consumer site runs parties on VidCore-family players **(inferred)**. It supports the FMHY report's Tier-1 finding.

---

## 3. Plugin / addon ecosystems and repo directories with Hindi coverage

### 3a. CloudStream (directory: [recloudstream/cs-repos](https://raw.githubusercontent.com/recloudstream/cs-repos/master/repos-db.json) = [rentry.org/cs3-repos](https://rentry.org/cs3-repos), 31 repos, edited 2026-09-26)

Counts come from each repo's `plugins.json` `language` field. That field is **unreliable**: CNC tags Castle and MovieBox as `ta`, and AllForU tags its Hindi OTT mirrors `en`.

| Repo (directory name) | Repo / plugin list | Last build push | Plugins (Indian-tagged) | Hindi-relevant plugins (status) |
|---|---|---|---|---|
| **Phisher Repo** | [phisher98/cloudstream-extensions-phisher](https://github.com/phisher98/cloudstream-extensions-phisher) · [plugins.json](https://raw.githubusercontent.com/phisher98/cloudstream-extensions-phisher/refs/heads/builds/plugins.json) | **2026-10-10** | 85 (28 `hi`, 3 `bn`, 2 `ta`) | AllMovieLand, Desicinemas, DudeFilms, HDhub4u, FourKHDHub, Hindmoviez, Hdmovie2, Movies4u, MultiMovies, MovieBox, MPlayer (MX), Fivemovierulz, Zinkmovies, ZDKSerials, Microtv, IStreamFlare, UHDmovies, Cinemacity; anime: Animesalt, AnimeDekho, Animedubhindi, Toonstream, Piratexplay, Kartoons, ToonHub, AniVortex; aggregators **StreamPlay / TorraStream** ("MultiAPI"), **StremioX / StremioAddon** (run Stremio addons inside CS). All status 1 |
| **Desi Extensions** | [Faisal0786/Desi](https://github.com/Faisal0786/Desi) · [plugins.json](https://raw.githubusercontent.com/Faisal0786/Desi/builds/plugins.json) | 2026-10-09 | 17 (14 `hi`) | OttSource (NetMirror), MovieBox ("Crypto Bypass"), vegamovies, MoviesDrive, KmMovies, FilmyFly, The Movie Flix, SDmovies, StreamHubOne, NetMovie, AnimeDubHindi, AnimeVilla, TamilToon. All 1 |
| **CNC Repo (All Language)** | [NivinCNC/CNCVerse-Cloud-Stream-Extension](https://github.com/NivinCNC/CNCVerse-Cloud-Stream-Extension) · [plugins.json](https://raw.githubusercontent.com/NivinCNC/CNCVerse-Cloud-Stream-Extension/builds/plugins.json) | 2026-10-09 | 36 (mostly tagged `ta`) | CNC Verse / Mobile (NetMirror), CastleTv, MovieBox / IN, StreamFlix, Einthusan, DesiSerials, Moviezwap (te), Pikashow, Rtally, Xon (Tamil / Hindi / Telugu cartoons), plus live TV (Cricify, PlayFy, SKTech…). **DoFlix 0, HDO 0** |
| **Megix Repo (Hindi & English)** | [SaurabhKaperwan/CSX](https://github.com/SaurabhKaperwan/CSX) · [plugins.json](https://raw.githubusercontent.com/SaurabhKaperwan/CSX/builds/plugins.json) | builds 2026-09-08 (master 10-02) | 5 | VegaMovies (incl. Lux / Rog), MoviesDrive, Bollyflix, Moviesmod, **CineStream** (v487, "one stop solution…") |
| **AllForU** | [RVRBEAST76/allforu-repo](https://github.com/RVRBEAST76/allforu-repo) · [plugins.json](https://raw.githubusercontent.com/RVRBEAST76/allforu-repo/builds/plugins.json) | 2026-10-10 | 16 | MovieBox / Netflix / Hotstar / PrimeVideo / Disney+ "in Tamil, English, Hindi, Telugu", JioTV, AniVortex |
| **Redowan's BDIX** | [redowan99/Redowan-CloudStream](https://github.com/redowan99/Redowan-CloudStream) | 2026-09-10 | 18 (4 `hi`, 10 `bn`) | 9kMovies, Mp4Moviez (1); **TheMoviesFlix 0, WatchMoviesPk 0** |
| **raghav repo** | [KSHITIJ8473/raghav](https://github.com/KSHITIJ8473/raghav) | 2026-10-10 | 31 (2 `hi`) | AnimeWorldIndia, RareAnimesIndia ("unstable"), TheMoviesFlix |
| **Cinephile** | [rockhero1234/cinephile](https://github.com/rockhero1234/cinephile) | **2026-02-10** (stale) | 5 | Cinevood ("unstable"), Mp4Moviez, Tamilblasters |

### 3b. Nuvio (directory: [Nuvio Plugin Library](https://nuvio-plugin-library.vercel.app/), 18 repos; data via [`/api/notion/…`](https://nuvio-plugin-library.vercel.app/api/notion/326981dcb87e80f6b9f6f23469a00fd3))

| Repo (library name) | Manifest | Last push | Scrapers (Indian) | Indian scrapers |
|---|---|---|---|---|
| **Eclipsia** | [codeberg manifest](https://codeberg.org/api/v1/repos/eclipsia/nuvio-plugin/raw/manifest.json) | 2026-10-09 | 38 (22 with `hi`) | codenamed (karnis = Castle, mavonyx = MovieBox, soryn = NetMirror, …), already in the landscape report. **Also published as a Stremio addon** ([SA](https://stremio-addons.net/addons/eclipsia), `js.eclipsia.dpdns.org`) |
| **D3adlyRocket (AIO)** | [manifest](https://raw.githubusercontent.com/D3adlyRocket/All-in-One-Nuvio/refs/heads/main/manifest.json) | 2026-10-02 | 66 (28) | 1Shows, AllMovieLand, DesiFlix, CineFreak, MoonFlix, CinemaCity, CTGMovies, Einthusan, FibWatch, GramCinema, HDGharTV, HindMoviez, MovieBlast, MoviesHunt, Movies4u, Peachify, PlayIMDb, VegaMovies, XPass, ZinkMovies; anime AnimeSalt / AnimeDekho / AnimeWorld |
| **CENSORED's Repo** (new) | [codeberg manifest](https://codeberg.org/CENSORED/Nuvio-Plugin/raw/branch/main/manifest.json) | 2026-09-18 (created 08-24) | 15 (**11**) | HDhub4u, UHDmovies, Desicinemas (`hi,pa`), DudeFilms, 4KHDHub, Hindmoviez, Vegamovies, MoviesMod, RogMovies, Vidrock, MovieBox. **The most Hindi-dense Nuvio repo** |
| **Kabir / "Asura Synthesis"** (new) | [PirateZoro9/asura-providers](https://raw.githubusercontent.com/PirateZoro9/asura-providers/refs/heads/main/manifest.json) | 2026-07-18 | 17 (9) | VegaMovies, MoviesHunt, MoviesDrive, ZinkMovies, CineFreak, 4KHDHub, HindMovie, HDHub4u |
| **Yoru** (new) | [yoruix/nuvio-providers](https://raw.githubusercontent.com/yoruix/nuvio-providers/refs/heads/main/manifest.json) | **2026-06-07** (stale) | 29 (9) | MalluMV, CinemaCity, Castle (`hi,ta,te,ml,kn`), AllMovieLand, DooFlix, MovieBlast, VidnestAnime (`hi`); VIDEASY **disabled** |
| **Spidey** (Tamil, new) | [Abinanthankv/NuvioRepo](https://raw.githubusercontent.com/Abinanthankv/NuvioRepo/refs/heads/master/manifest.json) | 2026-01-20 (stale) | 10 (9) | TamilMV, Tamilblasters, Tamilian, Moviesda, Isaidub, Movies4u, ToonHub, Animelok, XDmovies |
| **Phisher (Nuvio)** | [phisher98/phisher-nuvio-providers](https://raw.githubusercontent.com/phisher98/phisher-nuvio-providers/refs/heads/main/manifest.json) | 2026-09-03 | 51 (3) | Animedubhindi, Desicinemas; Masstamilan disabled |
| Michat88 | [manifest](https://raw.githubusercontent.com/michat88/nuvio-providers/refs/heads/main/manifest.json) | 2025-12-30 | 30 (0) | — |

### 3c. Stremio ([stremio-addons.net `bollywood` category](https://stremio-addons.net/addons?categories=bollywood), 94 tagged. Most tags are loose; these are the India-specific ones)

| Addon | Kind | Stars / version | Host | Repo / last push | Hindi claim |
|---|---|---|---|---|---|
| [HdHub](https://stremio-addons.net/addons/hdhub) | streams (HTTP) | 229 / 1.0.7 | `hdhub.thevolecitor.qzz.io` | not found | "Multilingual". **IbbyLabs: UP** |
| [WatchNow](https://stremio-addons.net/addons/watchnow) (DevStreams) | streams | 55 / 1.14.0 | `sword-watch.vercel.app` | — | "Gujarati, Hindi, Malayalam, Punjabi, Tamil, Telugu" |
| [WatchFlix DevStreamz](https://stremio-addons.net/addons/watchflix-devstreamz) | streams | 25 / 0.5.18 | `dev-streamz-navy.vercel.app` | — | (same DevStreams family, inferred) |
| [MovieBox](https://stremio-addons.net/addons/moviebox) | streams | 54 / 1.0.0 | `moviebox-cfa7.onrender.com` | [mesamirh/stremio-moviebox](https://github.com/mesamirh/stremio-moviebox) 2026-07-19 | "multiple… audio languages" |
| [CNCVerse Bridge](https://stremio-addons.net/addons/cncverse-bridge) | **CloudStream plugins exposed as a Stremio addon** | 39 / 1.0.43 | `cncverse.dpdns.org` | [NivinCNC/CNCVerse-Bridge](https://github.com/NivinCNC/CNCVerse-Bridge) **2026-10-10** | Inherits CS Indian plugins. Alpha; Android / desktop app runs a local server at `127.0.0.1:8080/manifest.json`; Nuvio auto-detects it |
| [InMax](https://stremio-addons.net/addons/inmax) | torrents | 19 / 1.1.3 | `inmax-tmv.onrender.com` | — | "multi-language streams (Tamil, Malayalam, Telugu, Kannada, Hindi)". TamilMV-sourced **(inferred from host name)** |
| [EinthusanTV](https://stremio-addons.net/addons/einthusantv) | streams | 22 / 6.0.1 | `einthusan.asaddon.com` | — | Indian originals |
| [IndTorrents](https://stremio-addons.net/addons/indtorrents) | torrents | 8 / 1.3.0 | `indtorrents.codecrafts.workers.dev` | vjdev1212 | South Indian |
| [TorrentsDB](https://stremio-addons.net/addons/torrentsdb) | torrents | 363 / 1.0.0 | — | — | includes 1TamilBlasters, 1TamilMV |
| [Advanced Hindi Streams Pro](https://stremio-addons.net/addons/advanced-hindi-results) | aggregator | 3 / 2.0.0 | Replit | — | "Hindi (India)" |
| [M_Rulz Scraper](https://stremio-addons.net/addons/m_rulz-scraper) | torrents | 3 / 10.6.1 | Vercel | — | Telugu |
| [BanglaPlex](https://stremio-addons.net/addons/banglaplex) | streams | 5 / 1.7.4 | Render | — | "Bangla / Hindi / Hollywood" |
| Catalog-only: [Bharat Binge](https://stremio-addons.net/addons/bharat-binge) (47), [IndiaStreams](https://stremio-addons.net/addons/indiastreams) (30), [Indian Regional Catalog](https://stremio-addons.net/addons/indian-regional-catalog) (26), [DesiFlix](https://stremio-addons.net/addons/desiflix-indian-serials-movies-and-web-series) (20), Indian Cinema (6) | catalogs | — | — | — | Regional catalogs. These are ideas for Bearoom's own Discovery rails, not sources |

The official Stremio collection ([addonscollection.json](https://api.strem.io/addonscollection.json), 96 addons) contains **no Hindi stream addon**.

### 3d. New cross-ecosystem hosts

- **SkyStream** ([akashdh11/skystream](https://github.com/akashdh11/skystream), page shows ~612★, last push 2026-09-28):
  - Flutter, "inspired by CloudStream", with **JavaScript extensions on `quick_js_ng`** (`.sky` / `.js`).
  - Android, iOS (sideload, unsigned IPA) and desktop.
  - The Hindi-relevant extension repo is [NivinCNC/CNCVerse-Sky-Stream-Extension](https://github.com/NivinCNC/CNCVerse-Sky-Stream-Extension) (last push 2026-06-01): castletv, cncverse (NetMirror), moviebox, cricfy, sktech.
  - It is a **third JS-plugin format** after Nuvio and Vega **(inferred: potentially portable to Hermes; unverified)**.
- **CNCVerse Bridge** (see 3c): runs Kotlin CloudStream `.cs3` plugins in a local Android / desktop server, so it is **not usable on iOS** **(inferred)**.
- **CloudStream ⇄ Stremio inside CS:** phisher's `StremioX` / `StremioAddon` plugins.
- **Vega:** covered in the FMHY report (§3b, §3c).

---

## 4. Status trackers usable as a free health feed

| Tracker | URL | What it monitors | Depth | Cadence | Machine-readable | Fit for Bearoom |
|---|---|---|---|---|---|---|
| **IbbyLabs Uptime Tracker** | [uptime.ibbylabs.dev](https://uptime.ibbylabs.dev/) | 125 Stremio-ecosystem services in 22 groups, including Content Scrapers (HdHub, PenguPlay, WebStreamr MBG, Stremify…) and the Nuvio app | **Stream-level** for scrapers ("Failed while asking for streams: the addon returned no streams for the test title") | ~5 min (`staleAfterSeconds: 360`) | **JSON: [`/v1/status`](https://uptime.ibbylabs.dev/v1/status)** (per-service `last.state / status / latency / error / checkedAt`) + **RSS: [`/feed.xml`](https://uptime.ibbylabs.dev/feed.xml)** (incidents) | Good model of a stream-level probe. Hindi coverage is HdHub only. Usable as-is only if Bearoom adds Stremio addons |
| **PopcornDen** | [popcornden.me/india](https://popcornden.me/india) · [method](https://popcornden.me/about) | 280 sites / 16 regions; **India 69** | Homepage HTTP only. Records `http_status`, `latency_ms`, **`final_domain` (domain-move detection)**, `consecutive_failures`, `demoted`. Demotes after 3 failures over more than 24 h. A datacenter 403 is shown as "blocked" | every 6 h | **No public API** (`/api` 404). Per-site JSON is embedded in each page's Next.js payload, plus `sitemap.xml`. Scraping it is unofficial | **The best Indian-site domain-rotation signal** (e.g. `uhdmovies.autos → uhdmovies.my`). Not a playability signal |
| **NiakVIO census** | [MD](https://raw.githubusercontent.com/niakw/NiakVIO/refs/heads/main/PROVIDER_CENSUS_STATUS.md) / [JSON](https://raw.githubusercontent.com/niakw/NiakVIO/refs/heads/main/automation/provider-census-status.json) | 46 Nuvio providers | **Playback-level** (FULL / PARTIAL / ROUTE PROVEN / REGRESSION / DISABLED) | JSON commits about every 30 min | raw JSON | Already recommended in the landscape report. Covers hindmoviez, movieshunt, castle, moviebox, moviesmod, uhdmovies, desiflix, mallumv, vidfast, vidrock, playimdb |
| **EverythingMoe Downtime Detector** | [everythingmoe.com/monitor](https://everythingmoe.com/monitor) | 48 anime / manga sites (keyword check) | page-content keyword | `freq: 1800` s | **JSON: [`/data/cache/isdown.json`](https://everythingmoe.com/data/cache/isdown.json)** + [`history.json`](https://everythingmoe.com/data/cache/isdown/history.json) | No Hindi sites among the 48. Pattern reference only |
| **stremio-addons.net** per-addon | e.g. [HdHub page](https://stremio-addons.net/addons/hdhub) | Manifest Status + user "Problem Reports" (24 h / 7 d / 30 d) | manifest reachability + crowd reports | live | Client-rendered; **no documented public API** (unverified whether an internal one exists) | Manual check only |
| **vidsrc.domains** | [vidsrc.domains](https://vidsrc.domains/) | Official VidSrc domain list: Live / Use New / Dead | operator-declared | manual | HTML | Use to prune vidsrc domains (see §5) |
| CloudStream `plugins.json` `status` | e.g. [phisher](https://raw.githubusercontent.com/phisher98/cloudstream-extensions-phisher/refs/heads/builds/plugins.json) | per plugin | **maintainer-declared** (1 ok / 0 down / 2 slow / 3 beta, per CS schema) | each build (phisher: daily) | JSON | Cheap "maintainer gave up" signal (status 0) |
| Per-site domain rentries | [rentry.co/rivestream](https://rentry.co/rivestream) (Rive Domains, 2026-10-01); FMHY "Status" links (`rentry.co/aetherdomains`, `kdesadomains`, `peestream`, `hydrahd.info`, `nomorflix.com`, `bingebang.club`, `rar.to`) | one site each | operator-declared | manual | HTML | Domain-rotation inputs |
| status.fmhy.net | [status.fmhy.net](https://status.fmhy.net/) | **FMHY's own infra only** (website, SearX, Whoogle, API) | — | hourly | — | **Not a streaming health feed** |
| Generic "is X down" | [isitdownorjustme.net](https://isitdownorjustme.net/status/vidlink-pro/), [updownradar.com](https://updownradar.com/status/vidsrc.to), [notopening.com](https://notopening.com/site/vidsrc.cc) | arbitrary domains | homepage, single location / crowd reports | varies | no | Low value. They disagree with each other |

---

## 5. Disagreements between indexes (risk signals)

1. **VidSrc domains.**
   - FMHY's API list (2026-10-09) gives VidSrc.me as `vidsrcme.ru/.su`, `vidsrc-me.ru/.su`, `vidsrc-embed.ru/.su`, `vsrc.su` and `vsembed.ru`.
   - The official [vidsrc.domains](https://vidsrc.domains/) marks `vidsrcme.ru`, `vidsrcme.su`, `vidsrc-me.ru`, `vidsrc-me.su` and `vsrc.su` **Dead**, and `vidsrc-embed.*` "Use New".
   - Its active domains are **`vidsrc.sh` (primary), `vidsrc2.ru`, `vidsrc.ir`**. It also says "any VidSrc site that is not listed above is fake", which by its account would include `vidsrc.to` and `vidsrc.cc`.
   - Any vidsrc entry in Bearoom's catalog should be re-pointed or pruned.
2. **Vegamovies clones.** There are four domains across indexes: FMHY `vegamovies.market` (PopcornDen gets 403), r/Piracy `1vegamovies.cc`, plus a CS plugin "VegaMovies includes LuxMovies, Rogmovies". **r/Piracy's unsafe list names `vegamovies.ist` as a fake clone.**
3. **PopcornDen does no safety vetting.** Its India page lists **SteamUnlocked (`steamunlocked.org`)**. FMHY's [unsafe page](https://github.com/fmhy/edit/blob/main/docs/unsafe.md) and filterlist (`steamunlocked.*`) and r/Piracy's unsafe list (💩) both flag that site.
   - Its "Apps" links go to APK-download domains (`pikashowtv.in`, `youcineapkpro.com`, `moviesbox.com.co`, `beetvs.com.co`) **(inferred unofficial)**.
   - It lists `fmovies-hd.to`. The original FMovies was shut down in 2024, so this is likely a name-squatter **(inferred, background knowledge)**.
   - Use PopcornDen for reachability and domain moves, never as an endorsement.
4. **UHDMovies:**
   - FMHY ⭐ and CS phisher status 1.
   - **NiakVIO 🔴 REGRESSION.**
   - PopcornDen shows a redirect to `uhdmovies.my`.
5. **DesiFlix:** NiakVIO ⚫ DISABLED, while AIO Nuvio ships it enabled.
6. **DooFlix:** CS CNC status 0 (down) and Vega disabled (FMHY report), while Yoru Nuvio ships it enabled. Yoru's repo has been stale since June.
7. **TheMoviesFlix:** status 0 in Redowan's repo, status 1 in Desi and raghav. **HDO:** CNC status 0, while PopcornDen's homepage check says ok.
8. **MovieBox:**
   - Four CS repos say status 1 and SA / NV ship it.
   - **NiakVIO says "route proven, no verified media"**.
   - IbbyLabs shows "WebStreamr MBG" DOWN; what "MBG" means is unconfirmed.
   - Bearoom's own measurement says the Hindi DASH is Cookie-gated.
9. **Embed endpoints FMHY found dead but r/Piracy still lists:**
   - Smashystream: r/Piracy lists `smashystream.xyz`; FMHY's API host `api.smashystream.top` was NXDOMAIN.
   - Mapple: r/Piracy lists `mapple.tv`; FMHY's `mappletv.uk` returned 522.
   - Stellar: r/Piracy 🐐 is `stellar.gdn`; FMHY's API is `stellar.rip`.
   - Cinezo: r/Piracy lists `cinezo.net`; FMHY lists `cinezo.live`.
   - These are different fronts or eras, so do not assume the API host follows the site domain.
10. **Ranking:** HydraHD is 🐐 on r/Piracy and in EverythingMoe's Western list, but unstarred in FMHY's Indian section. Reelix is ⭐ on FMHY, and r/Piracy adds "Watch parties, playback via vidcore".
11. **Domain splits on Indian sites (FMHY vs PopcornDen / r/Piracy / EverythingMoe):**

    | Site | FMHY | Other index |
    |---|---|---|
    | TamilMV | `.lease` | `.fi` (r/Piracy) |
    | 1Shows | `.bz` | `.org` |
    | PRMovies | `.exchange` | `.farm` |
    | WorldFree4u | `.expert` | `.blog` |
    | Desicinemas | `.to` | `.pk` |
    | Kartoons | `.me` | `.to` |
    | ToonStream | `.vip` | `.dad` (EverythingMoe) |
    | AnimeSalt | `.cx` | `.me` |
    | HDHub4u | `.bi` | `new2.hdhub4u.free` |
    | Bollyflix | `.bi` | `new.bollyflix.vote` |
    | KMMovies | `.life` | `.baby` |
    | 5movierulz | `.fitness` | `.academy` |

    Each split is a clone-risk point **(inferred)**. A hard-coded domain will drift. PopcornDen's `final_domain` is the cheapest drift detector.
12. **vidcore.org / vidapi.ru events:** the FMHY report says there is no event API; a search summary says `PLAYER_EVENT` is documented (§2). Unresolved.
13. **Language tags are unreliable across ecosystems.** CNC tags Castle and MovieBox `ta`. AllForU tags Hindi OTT mirrors `en`. Phisher's Nuvio repo tags Desicinemas `en`. Filtering by tag alone would miss most Hindi sources.

---

## 6. What's new vs the FMHY report

1. **PopcornDen.** A region-filtered index (India: 69 sites) with **6-hourly reachability and domain-move detection**. It is not on FMHY. It surfaced about 15 Indian movie and anime sites FMHY doesn't list: hindilinks4u, yupflix, Movies Bazar, alooytv, thenextplanet, cinephile.live, animelok, anime4u, animeflix, animesogo, subdubanime, ag48, AniVortex, and others. Its domain data shows FMHY's Indian domains already diverging (§5.11).
2. **IbbyLabs has a JSON API and RSS** (`/v1/status`, `/feed.xml`) and does **stream-level** checks of scrapers. It monitors **HdHub**, a Hindi Stremio addon that is UP today. FMHY lists IbbyLabs; the FMHY report didn't capture the API.
3. **Census of CloudStream's official directory.** Indian-language plugins are concentrated in **phisher (28 `hi`)**, **Desi Extensions (14 `hi`)**, CNC, Megix, AllForU, Redowan and raghav. Plugin `status` 0 marks maintainer-acknowledged dead sources (DoFlix, HDO, TheMoviesFlix, WatchMoviesPk).
4. **Nuvio Plugin Library's 18-repo directory**, with Indian-heavy repos absent from the FMHY report: **CENSORED (Codeberg; 11 of 15 Indian)**, **Asura Synthesis / Kabir (9 of 17)**, **Spidey (Tamil)**, **Yoru** (stale) and phisher-nuvio. Eclipsia also ships as a **Stremio addon**.
5. **The Hindi Stremio layer** (stremio-addons.net `bollywood` category):
   - Stream addons: HdHub (229★), WatchNow / DevStreams (Indian languages), MovieBox (mesamirh), CNCVerse Bridge, InMax, EinthusanTV, IndTorrents, M_Rulz, Advanced Hindi Streams Pro, BanglaPlex.
   - Catalogs: Bharat Binge, IndiaStreams, Indian Regional Catalog, DesiFlix.
   - The official Stremio collection has none.
6. **Bridges:**
   - **CNCVerse Bridge** runs CloudStream extensions as a local Stremio / Nuvio addon (Android / desktop, alpha, pushed today).
   - **SkyStream** is a Flutter app with **JS extensions on QuickJS**, on Android and iOS, with a CNCVerse extension repo. It is a third JS-plugin format beside Nuvio and Vega.
7. **More watch-party-capable embed APIs off FMHY's list** *(search summary, unverified)*:
   - **MoviesAPI.to** has a full command set plus a `WatchPartyController` example. FMHY dropped it, but Bearoom's seed still has it.
   - **APIPlayer.ru** has the `mplayer` command set, and `lang` / `ds_lang` accepts `hi` (subtitles / UI, not proven audio).
   - **VidPhantom** is events-only.
8. **The VidSrc official domain page contradicts FMHY's VidSrc domain list** (§5.1).
9. **More Hindi-dub anime mirrors:** hindianimeverse.org (EverythingMoe), **9ime** (The Index), and the PopcornDen India anime set.
10. **Several requested indexes turned out stale or off-topic.** Don't spend more time on these:
    - privateersclub/wiki is games-only.
    - The Indian Piracy Index dates from 2021.
    - Igglybuff awesome-piracy dates from 2023 and awesome-stremio from 2021.
    - No "awesome-streaming" list exists.
    - The Index and Wotaku are anime-only, with almost no Hindi.
    - status.fmhy.net monitors only FMHY itself.
    - Kodi has no maintained Hindi index.

## Caveats

- Being listed in any index is not a safety or legality endorsement. Almost everything here is an unlicensed aggregator; the legal note in `streaming-integration-research.md` applies.
- PopcornDen, IbbyLabs and EverythingMoe statuses are each one tracker's view from its own network. A 403 "blocked" often means a WAF against datacenter checkers, not a dead site.
- CloudStream `status` and Nuvio `enabled` flags are self-declared by maintainers.
- §2 rows come from search-engine summaries of docs pages I did not load. Verify before acting.
- I could not read the Reddit originals (403 / login wall / Anubis); the r/Piracy content is from its official Rentry mirror.
- GitHub dates come from commit Atom feeds (latest commit on the named branch). Stars were not collected for most repos (API rate limit).
