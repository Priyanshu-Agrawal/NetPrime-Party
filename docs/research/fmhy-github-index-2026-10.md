# FMHY + GitHub index for Bearoom — 2026-10-10

**Scope:** read-only research. FMHY (freemediaheckyeah) streaming, app, Indian-language, sync and API sections, plus
logged-out GitHub repository search. Focus is what is **new** relative to
`docs/research/github-scraper-landscape-2026-10.md`, `plugin-catalog-measurement-2026-10.md`,
`streaming-integration-research.md`, `github-references.md` and the concurrent `similar-apps-architecture-2026-10.md`.

**Method.**
- FMHY content was read from its markdown source in [fmhy/edit](https://github.com/fmhy/edit/tree/main/docs). The
  last commit to `docs/video.md` was 2026-10-10 04:13 UTC ("updated 10 pages",
  [commits](https://github.com/fmhy/edit/commits/main/docs/video.md)).
- `video.md` was opened in the Playwright browser. The other pages (`non-english`, `mobile`, `video-tools`,
  `developer-tools`, `posts/*-2026`) came from `raw.githubusercontent.com`, as the brief allowed.
- The rendered site [fmhy.net/video](https://fmhy.net/video) was spot-checked in Playwright and matched the source.
- FMHY's "Streaming Site APIs" entry ([developer-tools#api-tools](https://fmhy.net/developer-tools#api-tools)) points
  to `rentry.co/FMHYB64#streaming-apis`, which base64-decodes to **[rentry.co/onbksdgu](https://rentry.co/onbksdgu)**
  ("API Sites", edited 2026-10-09 10:47 UTC, 28,828 views). That list was read in Playwright.
- For list (a), I opened **only the public docs/landing page** of each embed API that FMHY's API list links. I never
  loaded a title embed (`/movie/<id>`), and ad pop-ups were closed. One site showed a Cloudflare challenge
  (zxcstream); I did not try to get past it.
- GitHub repo search was run in Playwright, logged out, sorted by recently updated. Repo metadata came from the
  unauthenticated `api.github.com`. Nothing was cloned or executed. The Vega providers `manifest.json` and a few
  READMEs were read as text only.

**Labels:** **(inferred)** marks my reasoning. "Observed" means seen today from this machine's network (an Indian
ISP), which can differ by ISP. FMHY flags: 🌟 is FMHY's top tier (shown above ⭐ in Stream Aggregators;
**(inferred)** to be the poll-ranked top group, since FMHY re-ordered aggregators by community poll in Aug 2026 —
[post](https://github.com/fmhy/edit/blob/main/docs/posts/aug-2026.md)). ⭐ means starred/recommended, 🌐 an index,
and ↪ a cross-link.

---

## 1. Summary

1. **Watch-party control is now a documented, first-party feature of several TMDB-id embed APIs.** Bearoom
   wouldn't need its own injected bridge for these. Four docs pages describe the same inbound `postMessage` command
   set (`play`, `pause`, `seek{time}`, `volume{level}`, `mute{muted}`, `getStatus` → `playerstatus` event) and
   outbound `PLAYER_EVENT` (`play|pause|seeked|ended|timeupdate` with `currentTime` and `duration`):
   - **VidFast** ([vidfast.vc](https://vidfast.vc/), PostMessage tab): "Perfect for watch party features", with a
     `WatchPartyController` example.
   - **VidCore** ([vidcore.io](https://vidcore.io/)): same wording.
   - **VidZen** ([vidzen.fun](https://vidzen.fun/)): "build real-time synchronized Watch Party rooms".
   - **CinemaOS** ([cinemaos.tech/embed#postmessage](https://cinemaos.tech/embed)).

   Bearoom's bundled `providers.json` already lists `vidfast` as hijackable. `docs/providers/README.md` says it is
   "not yet reverse-engineered", and `docs/qa/phase6-cutover-qa.md` F1 records that bridge injection is lost on every
   hijackable provider except videasy. So VidFast's official API may be the cheapest second party-capable source,
   with no bridge needed **(inferred, untested)**.

   Two catches:
   - Bearoom's `vidcore` entry points at **vidcore.org**, a different site with no command API. The command API lives
     on **vidcore.io**.
   - The VidFast / VidCore.io / VidUP / VidZen docs share one template, so they may be one operator, i.e. one failure
     domain **(inferred)**.
2. **Videasy, Cineby and Cineplay are gone from FMHY.** None appears in the current `video.md`. `CinebyTV` is listed
   with a note that it is *not* affiliated with the original Cineby
   ([note](https://github.com/fmhy/edit/blob/main/docs/.vitepress/notes/cinebytv-note.md)). **Movy is FMHY's #1
   stream aggregator** (🌟, starred Sept 2026: "fast streams, high quality UI";
   [post](https://github.com/fmhy/edit/blob/main/docs/posts/sept-2026.md)). That matches the landscape report's
   "Movy is the best videasy replacement" lead.
3. **Hindi-specific knobs on embed APIs (new):**
   - **Nxsha** ([web.nxsha.app/embed](https://web.nxsha.app/embed)): `?lang=<ISO 639-1>` "attempts to bind the
     primary audio track to the requested language", plus a `server=MbPly-[Multi-Lang]` server. NontonGo redirects
     here.
   - **Cinezo** ([cinezo.live](https://cinezo.live/)): documents `server=hindi`.
   - **Cinetaro** ([cinextream.cc](https://cinextream.cc/)): FAQ says it collects "multiple audio sources (including
     Hindi…)".
   - **VidCore.org** ([vidcore.org](https://www.vidcore.org/)): "dubbed audio tracks".
   - **VidNest** ([vidnest.fun](https://vidnest.fun/)): anime `/anime/{anilist}/{ep}/hindi`.

   None of these has been measured. Treat them as claims to verify.
4. **A React Native peer exists, and FMHY lists it in its Indian section.**
   [vega-org/vega-app](https://github.com/vega-org/vega-app) (formerly Zenda-Cross/vega-app) has 1,521★ and was
   pushed today. It is built on **Expo SDK 57 + react-native-tvos 0.86 + react-native-video 6.19 + Google Cast**
   ([package.json](https://raw.githubusercontent.com/Zenda-Cross/vega-app/HEAD/package.json)). It loads providers
   from [Zenda-Cross/vega-providers](https://github.com/Zenda-Cross/vega-providers) (85★, 58 providers, India-heavy).
   A converter repo ports all 65 Nuvio providers to Vega's format
   ([PadhleYrr/nuvio-vega-providers](https://github.com/PadhleYrr/nuvio-vega-providers)).
5. **More takedowns.** `consumet/consumet.ts` and `consumet/api.consumet.org` now return **HTTP 451 (DMCA)**. The
   older `github-references.md` lists Consumet, and FMHY still links Consumet docs. `xp-technologies-dev/p-stream`,
   the GitHub repo FMHY links for Cinecat / Basement, is **archived**. `vyla-entertainment/stream-api` (Vyla's
   player API, which FMHY's API list links) is **archived**.
6. **The embed-API list churns.** 14 of the 51 FMHY-listed API sites failed to show docs when I loaded them today
   (NXDOMAIN, connection refused, Cloudflare 522/523, blank page or challenge); see §3a. FMHY's API list itself is
   edited weekly. Any embed-tier design needs health checks, not a hard-coded list (already Bearoom's design).

---

## 2. FMHY index

### 2.0 FMHY's "Streaming Site APIs" list (rentry.co/onbksdgu, edited 2026-10-09)

Linked from FMHY [developer-tools#api-tools](https://fmhy.net/developer-tools#api-tools) via `rentry.co/FMHYB64`.
Tags are as FMHY's list gives them. URL patterns, events and status are in §3a.

| # | Name (as listed) | URL as listed | Tags as listed |
|---|---|---|---|
| 1 | 111movies | https://111movies.com/ | Movies / TV / Anime |
| 2 | 2embed, 2 | https://www.2embed.cc/, https://2embed.skin/ | Movies / TV |
| 3 | 2embed.stream, 2 | https://2embed.stream/, https://2embed.skin/ | Movies / TV / Anime |
| 4 | AeonWatch | https://thisiscinema.pages.dev/ | Movies / TV / Anime |
| 5 | AutoEmbed | https://autoembed.app/ | Movies / TV / Anime / Drama / Telegram |
| 6 | Atlantic API | http://embed.atlantic.st/ | Movies / TV / Anime |
| 7 | Cinemaos | https://cinemaos.tech/embed | Movies / TV / Anime |
| 8 | CineSRC | https://cinesrc.st/ | Movies / TV / Anime |
| 9 | Cinextream API | https://cinextream.cc/ | Movies / TV / Anime |
| 10 | Cinezo API | https://cinezo.live/ | Movies / TV / Anime |
| 11 | Embed Icefy | https://embed.icefy.top/ | Movies / TV / Anime |
| 12 | Fmov | https://fmov.my/ | Movies / TV / Anime |
| 13 | frameXTV | https://framextv.tech/api | Movies / TV / Anime |
| 14 | Mapple Player | https://mappletv.uk/ | Movies / TV / Anime |
| 15 | Nxsha Embed | https://web.nxsha.app/embed | Movies / TV / Anime / Telegram |
| 16 | NontonGo | https://nontongo.win/ | Movies / TV / Anime |
| 17 | Peachify | https://peachify.top/ | Movies / TV / Anime |
| 18 | PrimeSRC | https://primesrc.me/ | Movies / TV / Anime |
| 19 | SmashyStream API | https://api.smashystream.top/ | Movies / TV / Anime |
| 20 | SpenEmbed | https://spencerdevs.xyz/ | Movies / TV / Anime |
| 21 | SuperEmbed | https://www.superembed.stream/ | Movies / TV |
| 22 | StreamVault Embed | https://streamvaultsrc.click/ | Movies / TV / Anime |
| 23 | Stellar API | https://stellar.rip/en/api | Movies / TV / Anime |
| 24 | TryEmbed | https://tryembed.us.cc/ | Movies / TV / Anime |
| 25 | Velarium | https://velarium.cc/ | Movies / TV / Anime |
| 26 | VidAPI.ru | https://vidapi.ru/ | Movies / TV / Anime |
| 27 | VidAPI | https://vidapi.xyz/ | Movies / TV / Anime |
| 28 | Viduki | https://www.viduki.net/ | Movies / TV / Anime / 4K (AI Upscaled) |
| 29 | VidCore | https://vidcore.net/ | Movies / TV / Anime |
| 30 | VidCore.org | https://www.vidcore.org/ | Movies / TV / Anime |
| 31 | Vidcorn | https://vidcorn.cfd/ | Movies / TV / Anime |
| 32 | VidFast, 2–7 | https://vidfast.pro/ (+ .xyz .pm .net .me .io .in) | Movies / TV / Anime / Discord |
| 33 | VidFlix | https://vidflix.club/ | Movies / TV / Anime |
| 34 | VidLink | https://vidlink.pro/ | Movies / TV |
| 35 | Vidlove | https://vidlove.cc/ | Movies / TV / Anime |
| 36 | VidHawk | https://vidhawk.buzz/ | (none) |
| 37 | VidNest | https://vidnest.fun/ | Movies / TV / Anime |
| 38 | vidrock | https://vidrock.net/ | Movies / TV / Anime |
| 39 | VidRift | https://vidrift.net/ | Movies / TV / Anime |
| 40 | VixSrc | https://vixsrc.to/ | Movies / TV / Anime |
| 41 | VidSrc.me, 2–8 | https://vidsrcme.ru/ (+ vidsrcme.su, vidsrc-me.ru/.su, vidsrc-embed.ru/.su, vsrc.su, vsembed.ru) / Status https://vidsrc.domains/ | Movies / TV / Anime |
| 42 | VidSrc.to | https://vidsrc.to/ | Movies / TV / Anime |
| 43 | VidUP | https://vidup.to/ | Movies / TV / Anime |
| 44 | VidStuck | https://vidstuck.xyz/ | Movies / TV / Anime |
| 45 | Vidy | https://www.vidy.st/ | Movies / TV / Anime / 4K |
| 46 | Vidzee | https://vidzee.wtf/ | Movies / TV / Anime |
| 47 | Vidzen | https://vidzen.fun/ | Movies / TV / Anime |
| 48 | Vyla | https://github.com/EndOverdosing/Vyla-Player-API / Docs https://vyla.mintlify.app/introduction | Movies / TV / Anime |
| 49 | Yenime | https://api.yenime.net/ | Anime |
| 50 | ZoryvaX API | https://zoryva.me/embed | Movies / TV / Anime |
| 51 | ZXCSTREAM | https://www.zxcstream.xyz/ | Movies / TV |
| — | *Self-hosted:* poprink nano | https://github.com/mohameodo/nano | Self-Hosted |
| — | *Self-hosted:* P-Stream | https://github.com/xp-technologies-dev/p-stream | Self-Hosted (repo now **archived**) |
| — | *Various:* TheIntroDB / SkipDB | https://theintrodb.org/ , https://skipdb.tv/ | Intro / credit skipping |
| — | *Various:* Wyzie Subs / Libre Subs | https://sub.wyzie.ru/ , https://libre-subs.fifthwit.net/ | Subtitle scraping API (npm `wyzie-lib`) |

Not on the list today: videasy, vidking, cineby, embed.su, moviesapi.
- Bearoom's bundled `providers.json` still contains `videasy`, `mycineby` (cineby family) and `111movies`
  (111movies.com was NXDOMAIN when loaded today).
- The DB seed `database/seed_providers.json` still contains `embed.su` and `moviesapi.to`.

### 2.1 FMHY section tables (generated from the markdown source)

Columns: name (with mirror count and "or" alternates), the first URL as listed, the FMHY section, the flag, FMHY's own
notes (Discord / Telegram links stripped), and any GitHub / Codeberg / GitLab link FMHY gives. Sections are filtered to
what the brief asks for: streaming sites, apps, Stremio / Nuvio, the Indian section, and sync. Anime-only sections are
omitted except where they carry Hindi dubs (Indian section).

#### Stream Aggregators — [https://fmhy.net/video#stream-aggregators](https://fmhy.net/video#stream-aggregators) (68 entries)

| Name | URL as listed | FMHY section | Flag | FMHY notes | Repo link(s) given |
|---|---|---|---|---|---|
| Movy | https://www.movy.sx/ | Stream Aggregators | 🌟 top | Movies / TV / Anime / 4K / Auto-Next |  |
| Cinejoy | https://cinejoy.pk/ | Stream Aggregators | 🌟 top | Movies / TV / Anime / Auto-Next |  |
| PopcornMovies / alt: BingeBox | https://popcornmovies.ac/ | Stream Aggregators | 🌟 top | Movies / TV / Anime / Auto-Next |  |
| P-Stream Forks | https://www.reddit.com/r/FREEMEDIAHECKYEAH/wiki/video#wiki_.25B7_p-stream_forks | Stream Aggregators | 🌟 top | Movies / TV / Anime / Auto-Next |  |
| 7Movies | https://7movies.ac/ | Stream Aggregators | 🌟 top | Movies / TV / Anime / Auto-Next |  |
| ShuttleTV (+2 mirrors) | https://shuttletv.su/ | Stream Aggregators | 🌟 top | Movies / TV / Anime / Auto-Next |  |
| Atlantic | https://atlantic.st/ | Stream Aggregators | 🌟 top | Movies / TV / Anime / Auto-Next / 4K |  |
| Rive (+4 mirrors) / alt: CorsFlix | https://www.rivestream.app/ | Stream Aggregators | 🌟 top | Movies / TV / Anime / Auto-Next / 4K / Status |  |
| Flixer (+2 mirrors) / alt: Hexa | https://flixer.gd | Stream Aggregators | 🌟 top | Movies / TV / Anime / Auto-Next |  |
| Stellar | https://stellar.gdn/ | Stream Aggregators | ⭐ starred | Movies / TV / Anime / Auto-Next / 4K |  |
| Vivarium | https://vivarium.su/ | Stream Aggregators | ⭐ starred | Movies / TV / Anime / Auto-Next |  |
| MeowTV | https://meowtv.ru/ | Stream Aggregators | ⭐ starred | Movies / TV / Anime / Auto-Next |  |
| Movie Night | https://movienig.ht/ | Stream Aggregators | ⭐ starred | Movies / TV / Anime / Auto-Next |  |
| Streamo | https://streamo.pro/ | Stream Aggregators | ⭐ starred | Movies / TV / Anime / Auto-Next |  |
| ArrowTV (+2 mirrors) / alt: Cinezo | https://arrowtv.net/ | Stream Aggregators | ⭐ starred | Movies / TV / Anime / Auto-Next |  |
| Way2Movies (+1 mirrors) | https://beta.way2movies.live/ | Stream Aggregators | ⭐ starred | Movies / TV / Anime / 4K |  |
| Reelix / alt: Coreflix | https://reelix.ac/ | Stream Aggregators | ⭐ starred | Movies / TV / Anime / Auto-Next |  |
| Spacedom | https://spacedom.live/ | Stream Aggregators | ⭐ starred | Movies / TV / Anime / Auto-Next |  |
| FlyStream | https://flystream.net/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next / 4K |  |
| Chillflix | https://chillflix.lol/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next |  |
| MovieBite | https://moviebite.org/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next |  |
| BingeBang | https://bingebang.st/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next / Status |  |
| Cinema (BZ) | https://cinema.army/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next |  |
| SvStream (+2 mirrors) | https://svstream.cc/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next / Status |  |
| bCine / alt: ZXCSTREAM | https://cineyz.com/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next |  |
| Movish / alt: LatestMovies | https://movish.to/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next |  |
| Cinetaro | https://cinetaro.to/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next |  |
| CinemaOS (+2 mirrors) / alt: NoirX | https://cinemaos.live/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next |  |
| moanatv. | https://lfmx.app/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next / 4K |  |
| Cinemove | https://cinemove.cc/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next / 4K |  |
| Nippleflix (+1 mirrors) / alt: Redflix, PantyFlix | https://nippleflix.com/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next |  |
| Vuflix | https://vuflix.co/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next |  |
| GaiaFlix | https://gaiaflix.live/ | Stream Aggregators |  | Movies / TV / Anime |  |
| dulo | https://dulo.mov/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next |  |
| VidPlay | https://vidplay.to/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next |  |
| Moonflix | https://moonflix.website/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next |  |
| Toflix | https://toflix.co/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next |  |
| Cinegram | https://cinegram.tv/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next |  |
| Willow | https://willow.arlen.icu/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next / 4K Guide |  |
| HiveX | https://hivex.stream/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next |  |
| Lightflix | https://lightflix.app/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next |  |
| Boomflix (+1 mirrors) | https://boomflix.pages.dev/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next |  |
| Overlook | https://overlook.cx/ | Stream Aggregators |  | Movies / TV / Anime |  |
| Stigstream | https://stigstream.ru/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next |  |
| Cineapse | https://www.cineapse.net/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next / 4K |  |
| Bingr | https://bingr.one/ | Stream Aggregators |  | Movies / TV / Anime |  |
| M-Zone (+1 mirrors) | https://m-zone.cc/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next |  |
| FRAME | https://www.framemovie.online/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next |  |
| Stellar (rip) | https://stellar.rip/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next |  |
| All You Can Watch | https://allyoucanwatch.net/ | Stream Aggregators |  | Movies / TV / Anime |  |
| 3eyedraven | https://3eyedraven.watch/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next |  |
| Flixtrz | https://flixtrz.com/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next |  |
| ThugTV | https://thugtv.online/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next |  |
| VaultPlayer | https://vaultplayer.co.uk/ | Stream Aggregators |  | Movies / TV / Auto-Next |  |
| Mapple | https://mapple.fun/ | Stream Aggregators |  | Movies / TV / Anime |  |
| MovieNerds (+2 mirrors) | https://movienerds.site/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next |  |
| Smashystream | https://smashystream.xyz/ | Stream Aggregators |  | Movies / TV / Anime |  |
| NOVA | https://novahd.cc/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next |  |
| Zoryva X | https://zoryva.me/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next |  |
| Youplex | https://youplex.site/ | Stream Aggregators |  | Movies / TV / Anime |  |
| PopcornTime | https://popwatch.to/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next |  |
| NetPlay / alt: Cinelove | https://netplayz.icu/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next |  |
| Screenscape | https://screenscape.me/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next |  |
| GreyBox | https://greywatchbox.pages.dev/ | Stream Aggregators |  | Movies / TV / Anime |  |
| Kofi | https://kofi.mov/ | Stream Aggregators |  | Movies / TV / Anime / Auto-Next |  |
| frameXTV | https://framextv.tech/ | Stream Aggregators |  | Movies / TV / Anime |  |
| StreamVaults / alt: ReelStream | https://streamvaults.ru/ | Stream Aggregators |  | Movies / TV / Anime |  |
| Nxsha | https://web.nxsha.app/ | Stream Aggregators |  | Movies / TV / Anime |  |

#### P-Stream Forks — [https://fmhy.net/video#p-stream-forks](https://fmhy.net/video#p-stream-forks) (11 entries)

| Name | URL as listed | FMHY section | Flag | FMHY notes | Repo link(s) given |
|---|---|---|---|---|---|
| Cinecat | https://cinecat.eu/ | P-Stream Forks | ⭐ starred | Movies / TV / Anime / Auto-Next / 4K / GitHub | https://github.com/xp-technologies-dev/p-stream |
| Aether (+2 mirrors) | https://aether.ist/ | P-Stream Forks | ⭐ starred | Movies / TV / Anime / Auto-Next / 4K / Status |  |
| kstream (+1 mirrors) | https://kdesa.stream/ | P-Stream Forks |  | Movies / TV / Anime / Auto-Next / Status |  |
| Cinefork | https://cinefork.net/ | P-Stream Forks |  | Movies / TV / Anime / Auto-Next |  |
| Basement | https://basementx.lol/ | P-Stream Forks |  | Movies / TV / Anime / Auto-Next / 4K / GitHub | https://github.com/xp-technologies-dev/p-stream |
| P-Stream Fork | https://pstream.cfd/ | P-Stream Forks |  | Movies / TV / Anime / Auto-Next / 4K / Docs / Status / Source Code | https://codeberg.org/pee |
| Rizz Stream | https://rizzking.org/ | P-Stream Forks |  | Movies / TV / Anime / Auto-Next / PW: `skibidi` |  |
| StreamWatch (+2 mirrors) | https://streamwatch.online/ | P-Stream Forks |  | Movies / TV / Anime / Auto-Next / GitHub | https://github.com/steveyout/streamwatch |
| FMFAU | https://fmfau.com/ | P-Stream Forks |  | Movies / TV / Anime / Auto-Next |  |
| IceFY | https://icefy.top/ | P-Stream Forks |  | Movies / TV / Anime / Auto-Next |  |
| peestream | https://peestream.in/ | P-Stream Forks |  | Movies / TV / Anime / Auto-Next |  |

#### Dedicated-Server — [https://fmhy.net/video#dedicated-server](https://fmhy.net/video#dedicated-server) (26 entries)

| Name | URL as listed | FMHY section | Flag | FMHY notes | Repo link(s) given |
|---|---|---|---|---|---|
| NEPU (+3 mirrors) | https://nepu.io/ | Dedicated-Server | ⭐ starred | Movies / TV / Anime / Auto-Next / 4K / Status |  |
| EE3 / alt: RIPS | https://ee3.me/ | Dedicated-Server | ⭐ starred | Movies / Invite Codes: `mpgh` or `1hack` / Requires Sign-Up |  |
| PressPlay | https://pressplayz.to/ | Dedicated-Server | ⭐ starred | Movies / TV / Anime |  |
| Streaming Unity | https://streamingunity.vip/ | Dedicated-Server |  | Movies / TV / Anime |  |
| Abibli | https://abibli.com/ | Dedicated-Server |  | Movies / TV |  |
| SoapGo | https://soapgo.to/ | Dedicated-Server |  | Movies / TV / Anime |  |
| CinemaCity | https://cinemacity.cc/ | Dedicated-Server |  | Movies / TV / Anime / Requires Sign-Up |  |
| arc018 | https://arc018.stream/ | Dedicated-Server |  | Movies / TV / Anime |  |
| RidoMovies | https://ridomovies.is/ | Dedicated-Server |  | Movies / TV |  |
| Filmo | https://filmo.to/ | Dedicated-Server |  | Movies / 3rd Party Host |  |
| AZMovies | https://azmovies.to/ | Dedicated-Server |  | Movies / TV / Anime / Some 3rd Party Hosts |  |
| OnionPlay | https://onionplay.st/ | Dedicated-Server |  | Movies / TV / Anime |  |
| ShowBox | https://www.showbox.media/ | Dedicated-Server |  | Movies / TV / Anime / Use Throwaway Gmail |  |
| UniqueStream | https://uniquestream.net/ | Dedicated-Server |  | Movies / TV / Anime / 720p |  |
| BFLIX | https://bbflix.one/ | Dedicated-Server |  | Movies / TV |  |
| FshareTV | https://fsharetv.co/ | Dedicated-Server |  | Movies |  |
| MovieNestBD | https://movienestbd.best/ | Dedicated-Server |  | Movies / TV / Anime |  |
| M4uHD | https://m4uhd.vip | Dedicated-Server |  | Movies / TV / Anime / Clones |  |
| Levidia (+2 mirrors) | https://www.levidia.ch/ | Dedicated-Server |  | Movies / TV / Anime |  |
| SubSL | https://subsl.top/ | Dedicated-Server |  | Movies / TV / 720p |  |
| PrimeWire (+2 mirrors) | https://www.primewire.mov/ | Dedicated-Server |  | Movies / TV / Anime / Mostly 3rd Party Hosts / Status / Mirrors |  |
| YesMovie | https://ww1.yesmovies.ag/ | Dedicated-Server |  | Movies / TV / 720p |  |
| HollyMovieHD (+3 mirrors) | https://hollymoviehd.cc/ | Dedicated-Server |  | Movies / TV / Anime |  |
| Downloads-Anymovies | https://www.downloads-anymovies.co/ | Dedicated-Server |  | Movies |  |
| MovieBox (+4 mirrors) | https://movieboxonline.net | Dedicated-Server |  | Movies / TV / Anime / Mirrors |  |
| LookMovie (+1 mirrors) | https://lookmovie2.to/ | Dedicated-Server |  | Movies / TV / Auto-Next / 480p |  |

#### Multi-Server — [https://fmhy.net/video#multi-server](https://fmhy.net/video#multi-server) (63 entries)

| Name | URL as listed | FMHY section | Flag | FMHY notes | Repo link(s) given |
|---|---|---|---|---|---|
| 1Shows / alt: 1Flex, 1Tube | http://1shows.bz | Multi-Server | ⭐ starred | Movies / TV / Anime / Auto-Next / 4K Note |  |
| AniCine | https://anicine.xyz/ | Multi-Server | ⭐ starred | Movies / TV / Anime / Auto-Next |  |
| ZetMoon | https://zetmoon.live/ | Multi-Server | ⭐ starred | Movies / TV / Anime |  |
| 67Movies / alt: PhantomFlix | https://67movies.st/ | Multi-Server | ⭐ starred | Movies / TV / Anime / Auto-Next |  |
| TonkaCine (+1 mirrors) | https://tonkacine.watch/ | Multi-Server | ⭐ starred | Movies / TV / Anime / Auto-Next |  |
| Primeshows / alt: NetShows, Youshows | https://www.primeshows.org/ | Multi-Server | ⭐ starred | Movies / TV / Anime |  |
| Moovie / alt: StreamAggregator | https://moovie.fun/ | Multi-Server | ⭐ starred | Movies / TV / Anime / Auto-Next |  |
| Anixtv (+2 mirrors) | https://anixx.fun/ | Multi-Server | ⭐ starred | Movies / TV / Anime / Auto-Next |  |
| AuroraScreen (+1 mirrors) | https://aurorascreen.org/ | Multi-Server | ⭐ starred | Movies / TV / Anime / Auto-Next |  |
| HydraHD (+1 mirrors) | https://hydrahd.ws/ | Multi-Server | ⭐ starred | Movies / TV / Anime / Auto-Next / Status |  |
| Fireflix | https://fireflix4.pages.dev/ | Multi-Server | ⭐ starred | Movies / TV / Anime / Auto-Next |  |
| Vidbox (+2 mirrors) | https://vidbox.vc/ | Multi-Server |  | Movies / TV / Anime / Auto-Next / Status |  |
| Zencine | https://zencine.org/ | Multi-Server |  | Movies / TV / Anime |  |
| CineWave | https://watch.cinewave.qzz.io/ | Multi-Server |  | Movies / TV / Anime / Auto-Next |  |
| CineStream | https://cinestream.kje.us/ | Multi-Server |  | Movies / TV / Anime |  |
| Youflex | https://youflex.top/ | Multi-Server |  | Movies / TV / Anime |  |
| Flixzy | https://flixzy.pages.dev/ | Multi-Server |  | Movies / TV / Anime |  |
| FilmCave / alt: Flixway | https://filmcave.ru/ | Multi-Server |  | Movies / TV / Anime / Auto-Next |  |
| Flixmix | https://flixmix.site/ | Multi-Server |  | Movies / TV / Anime |  |
| 321Movies | https://321movies.xyz/ | Multi-Server |  | Movies / TV / Anime |  |
| KiraStreams | https://kirastreams.pages.dev/ | Multi-Server |  | Movies / TV / Anime |  |
| Flyflix | https://flyflix.net/ | Multi-Server |  | Movies / TV / Anime |  |
| koddo | https://koddo.ch/ | Multi-Server |  | Movies / TV / Anime |  |
| FluxTV | https://fluxtv.co.uk/ | Multi-Server |  | Movies / TV / Anime / Status |  |
| CineVibe | https://cinevibe.cc/ | Multi-Server |  | Movies / TV / Anime |  |
| MovieFY | https://player.xtra.wtf/search | Multi-Server |  | Movies / TV / Anime |  |
| ReelZone | https://reelzone.icu/ | Multi-Server |  | Movies / TV / Anime / Auto-Next |  |
| Watchott / alt: EmnexMovies | https://watchott.org/ | Multi-Server |  | Movies / TV / Anime |  |
| Flixvo (+1 mirrors) | https://flixvo.live/ | Multi-Server |  | Movies / TV / Anime |  |
| All About Movies | https://allaboutmovies.xyz/ | Multi-Server |  | Movies / TV / Anime |  |
| CandleStream | https://candlestream.xyz/#home | Multi-Server |  | Movies / TV / Anime / Auto-Next |  |
| ZFlix | https://zflix.me/ | Multi-Server |  | Movies / TV / Anime |  |
| Flicker | https://flicker-mini.pages.dev/ | Multi-Server |  | Movies / TV / Anime / Proxy / Note |  |
| ONOFLIX (+1 mirrors) / alt: GGFlix | https://onoflix.live/ | Multi-Server |  | Movies / TV / Anime |  |
| Bingeflix | https://bingeflix.tv/ | Multi-Server |  | Movies / TV / Anime |  |
| 7REELS | https://7reels.cc/ | Multi-Server |  | Movies / TV / Anime |  |
| Ernax | https://ernax.pro/ | Multi-Server |  | Movies / TV / Anime |  |
| AmberFlix | https://www.amberflix.xyz/ | Multi-Server |  | Movies / TV / Anime |  |
| FLNK | https://flnk.fun/ | Multi-Server |  | Movies / TV / Anime |  |
| WatchSeries | https://watchseries.free/ | Multi-Server |  | Movies / TV / Anime |  |
| Pawflix | https://pawflix.foo.ng/ | Multi-Server |  | Movies / TV / Anime |  |
| KaitoVault | https://www.kaitovault.com/ | Multi-Server |  | Movies / TV / Anime |  |
| CinebyTV | https://cinebytv.com | Multi-Server |  | Movies / TV / Anime / Note |  |
| TVids (+3 mirrors) | https://www.tvids.to/ | Multi-Server |  | Movies / TV / Anime / Auto-Next |  |
| Movies To Watch | https://www.moviestowatch.top/ | Multi-Server |  | Movies / TV / Anime |  |
| MilkBox | https://milkbox.sytes.net/ | Multi-Server |  | Movies / TV / Anime |  |
| StreameX (+1 mirrors) | https://streamex.sh/ | Multi-Server |  | Movies / TV / Anime |  |
| Zerostream | https://zerostream.alwaysdata.net/ | Multi-Server |  | Movies / TV / Anime |  |
| FreeInterTV | http://www.freeintertv.com/ | Multi-Server |  | TV / Sports |  |
| FishyStream | https://fishystream-app.pages.dev/ | Multi-Server |  | Movies / TV / Anime / GitHub | https://github.com/FishyServices/FishyStream |
| Snowstream | https://snowstream.vercel.app/ | Multi-Server |  | Movies / TV / Anime |  |
| StreamGoblin | https://streamgoblin.cc/ | Multi-Server |  | Movies / TV / Anime |  |
| WatchOrbit | https://watchorbit.me/ | Multi-Server |  | Movies / TV / Anime |  |
| CineNest | https://cine-nest-nine.vercel.app/ | Multi-Server |  | Movies / TV / Anime |  |
| DuaFile (+1 mirrors) | https://download.duafile.com/ | Multi-Server |  | Movies / TV / Anime |  |
| FLIKER | https://fliker.freebuff.app/ | Multi-Server |  | Movies / TV / Anime |  |
| Meowly | https://meowly.qzz.io/ | Multi-Server |  | Movies / TV / Anime / GitHub | https://github.com/utkarshgupta188/meowly |
| RabbitMeow | https://rabbitmeow.online/ | Multi-Server |  | Movies / TV / Anime |  |
| Warflix | https://warflix.im/ | Multi-Server |  | Movies / TV / Anime / Mirrors |  |
| Heartive | https://heartivelovestv.pages.dev/ | Multi-Server |  | Movies / TV / Anime |  |
| CineGo | https://cinego.co/ | Multi-Server |  | Movies / TV |  |
| Moviepire (+1 mirrors) | https://moviepire.org/ | Multi-Server |  | Movies / TV / Anime |  |
| Streaming CSE (+3 mirrors) | https://cse.google.com/cse?cx=006516753008110874046:cfdhwy9o57g##gsc.tab=0 | Multi-Server |  | Multi-Site Search |  |

#### Streaming Apps — [https://fmhy.net/video#streaming-apps](https://fmhy.net/video#streaming-apps) (8 entries)

| Name | URL as listed | FMHY section | Flag | FMHY notes | Repo link(s) given |
|---|---|---|---|---|---|
| Torrent Streaming | https://www.reddit.com/r/FREEMEDIAHECKYEAH/wiki/video#wiki_.25BA_torrent_apps | Streaming Apps | ↪ redirect | Torrent Streaming Apps |  |
| PlayTorrio (+1 mirrors) | https://playtorrio.xyz/ | Streaming Apps | ⭐ starred | Streaming App / Use PlayTorrioHTTP Plugin / Windows, macOS, Linux / GitHub | https://github.com/ayman708-UX/PlayTorrioV3 |
| Vyla Home (+1 mirrors) | https://vyla.cc/products/home | Streaming Apps | ⭐ starred | Streaming App / Windows, macOS, Linux / GitLab | https://gitlab.com/vyla-entertainment/home |
| Atlas | https://atlas.hls.lol/ | Streaming Apps |  | Streaming App / Windows |  |
| Vega-Desktop | https://github.com/vega-org/vega-desktop | Streaming Apps |  | Streaming App / Windows, macOS, Linux | https://github.com/vega-org/vega-desktop |
| Showberry | https://github.com/Dackerie/showberry | Streaming Apps |  | Streaming App / Windows, macOS, Linux | https://github.com/Dackerie/showberry |
| mov-cli | https://mov-cli.github.io/ | Streaming Apps |  | Streaming CLI / Plugins / Windows, macOS, Linux / GitHub | https://github.com/mov-cli/mov-cli https://github.com/topics/mov-cli-plugin |
| Gir Society | https://discord.gg/WHxeZ3aTtb | Streaming Apps |  | Plex + Jellyfin Public Playlist / Windows, macOS, Linux |  |

#### Smart TV — [https://fmhy.net/video#smart-tv](https://fmhy.net/video#smart-tv) (5 entries)

| Name | URL as listed | FMHY section | Flag | FMHY notes | Repo link(s) given |
|---|---|---|---|---|---|
| Nuvio (+1 mirrors) / alt: Tools, Plugins, Wiki / Guides, GitHub, Stremio, Tools, WuPlay, RealStream | https://nuvio.tv/ | Smart TV | ⭐ starred | Streaming App / Stremio Support | https://github.com/NuvioMedia/NuvioTVSmart https://github.com/wuplayapp/wuplay-releases |
| SamsungTVPlus | https://www.samsungtvplus.com/ | Smart TV |  | Streaming App |  |
| Jellyfin Tizen | https://github.com/jellyfin/jellyfin-tizen | Smart TV |  | Media Server / Streaming App | https://github.com/jellyfin/jellyfin-tizen |
| Kodi | https://kodi.tv/ | Smart TV |  | Media Server / Streaming App |  |
| Luna | https://github.com/cranci1/Luna | Smart TV |  | Streaming App / tvOS / Extension-Based / Modules | https://github.com/cranci1/Luna |

#### Android TV / Firestick — [https://fmhy.net/video#android-tv-firestick](https://fmhy.net/video#android-tv-firestick) (10 entries)

| Name | URL as listed | FMHY section | Flag | FMHY notes | Repo link(s) given |
|---|---|---|---|---|---|
| NuvioTV / alt: Tools, Stremio Sync, Plugins, Wiki / Guides | https://github.com/NuvioMedia/NuvioTV | Android TV / Firestick | ⭐ starred | Streaming App / Stremio Support | https://github.com/NuvioMedia/NuvioTV |
| CloudStream | https://github.com/recloudstream/cloudstream | Android TV / Firestick |  | Streaming App / Docs / Resources | https://github.com/recloudstream/cloudstream |
| Vega-Desktop | https://github.com/vega-org/vega-desktop | Android TV / Firestick |  | Streaming App | https://github.com/vega-org/vega-desktop |
| Vyla TV | https://vyla.cc/products/tv | Android TV / Firestick |  | Streaming App / GitLab | https://gitlab.com/vyla-entertainment/TV |
| ARVIO | https://arvio.tv/ | Android TV / Firestick |  | TV Media Server w/ Stremio Addons + IPTV Support / GitHub | https://github.com/ProdigyV21/ARVIO |
| StrexoPlayer | https://strexoplayer.onrender.com/ | Android TV / Firestick |  | Video Player w/ Stremio Sync |  |
| Syncler | https://syncler.net/ | Android TV / Firestick |  | Streaming App / Providers |  |
| Hayase | https://hayase.watch/ | Android TV / Firestick |  | Torrent Streaming App / Extensions / Wiki |  |
| Sozo | https://sozo.azamov.me/ | Android TV / Firestick |  | Anime Streaming App |  |
| aDrama | https://adrama.app/ | Android TV / Firestick |  | Asian Drama Streaming App |  |

#### Torrent Apps — [https://fmhy.net/video#torrent-apps](https://fmhy.net/video#torrent-apps) (4 entries)

| Name | URL as listed | FMHY section | Flag | FMHY notes | Repo link(s) given |
|---|---|---|---|---|---|
| Stremio / alt: GitHub, Stremio Desktop, Harbor, GitHub, Stremio Kai, GitHub | https://www.stremio.com/ | Torrent Apps | ⭐ starred | Torrent Streaming App / WebUI / Tools | https://github.com/Stremio https://github.com/Zaarrg/stremio-community-v5 https://github.com/allecsc/Stremio-Kai https://github.com/harborstremio/harbor |
| PlayTorrio (+1 mirrors) | https://playtorrio.xyz/ | Torrent Apps | ⭐ starred | Torrent Streaming App / Stremio Addon Support / GitHub | https://github.com/ayman708-UX/PlayTorrioV3 |
| Nuvio Desktop / alt: Nuvio HTPC, NuvioLinux | https://github.com/NuvioMedia/NuvioDesktop | Torrent Apps |  | Torrent Streaming App / Tools / Stremio Sync / Plugins / Wiki / Guides | https://github.com/JJDizz1L/NuvioLinux https://github.com/NuvioMedia/NuvioDesktop https://github.com/UmbraProjects/NuvioDesktop |
| Wyzie Subs | https://sub.wyzie.io/ | Torrent Apps |  | Subtitle Scraping API / NPM Package / Docs |  |

#### Stremio Tools — [https://fmhy.net/video#stremio-tools](https://fmhy.net/video#stremio-tools) (11 entries)

| Name | URL as listed | FMHY section | Flag | FMHY notes | Repo link(s) given |
|---|---|---|---|---|---|
| Stremio Addons / alt: Midnight's Addons | https://stremio-addons.net/ | Stremio Tools | 🌐 index | Stremio Addons |  |
| Viren070's Guides / alt: GitHub, Bye Sudo, Streaming Perfect Setup, GitHub | https://guides.viren070.me/stremio | Stremio Tools | ⭐ starred | Stremio Guides | https://github.com/Viren070/guides https://github.com/luckynumb3rs/stremio-perfect-setup |
| Stremio Addon Manager | https://addon-manager.viren070.me/ | Stremio Tools |  | Addon Manager / GitHub | https://github.com/pancake3000/stremio-addon-manager |
| IbbyLabs Uptime Tracker | https://uptime.ibbylabs.dev/ | Stremio Tools |  | Stremio Addon Status |  |
| Stremio Account Bootstrapper | https://github.com/DryKillLogic/stremio-account-bootstrapper | Stremio Tools |  | Easy Stremio Setup | https://github.com/DryKillLogic/stremio-account-bootstrapper |
| AIOStreams | https://docs.aiostreams.viren070.me/ | Stremio Tools |  | Multi-Source Addon + Debrid Aggregator / GitHub | https://github.com/Viren070/AIOStreams |
| AIOMetadata | https://github.com/cedya77/aiometadata | Stremio Tools |  | Multi-Source Metadata & Catalogs Addon / Public Instances | https://github.com/cedya77/aiometadata |
| Up Next | https://up-next.dontwanttos.top/ | Stremio Tools |  | Stremio Catalogs |  |
| Anime Catalogs | https://1fe84bc728af-stremio-anime-catalogs.baby-beamup.club/configure | Stremio Tools |  | Stremio Anime Catalogs |  |
| Simkl Stremio | https://simkl.com/apps/stremio/ | Stremio Tools |  | Simkl for Stremio |  |
| Trakt Stremio | https://2ecbbd610840-trakt.baby-beamup.club/ | Stremio Tools |  | Trakt for Stremio |  |

#### Android Streaming — [https://fmhy.net/mobile#android-streaming](https://fmhy.net/mobile#android-streaming) (34 entries)

| Name | URL as listed | FMHY section | Flag | FMHY notes | Repo link(s) given |
|---|---|---|---|---|---|
| Android TV / Firestick | https://www.reddit.com/r/FREEMEDIAHECKYEAH/wiki/video#wiki_.25B7_android_tv_.2F_firestick | Android Streaming | ↪ redirect |  |  |
| Free w/ Ads Streaming | https://www.reddit.com/r/FREEMEDIAHECKYEAH/wiki/video#wiki_.25B7_free_w.2F_ads | Android Streaming | ↪ redirect |  |  |
| Nuvio (+1 mirrors) | https://github.com/NuvioMedia/NuvioTV | Android Streaming | ⭐ starred | Movies / TV / Tools / Plugins / Wiki / Guides | https://github.com/NuvioMedia/NuvioTV |
| Stremio | https://www.stremio.com/ | Android Streaming | ⭐ starred | Torrent Streaming / Tools |  |
| CloudStream | https://github.com/recloudstream/cloudstream | Android Streaming | ⭐ starred | Movies / TV / Anime | https://github.com/recloudstream/cloudstream |
| Docs (+3 mirrors) / alt: Plugins | https://cloudstream.miraheze.org/wiki/Main_Page | Android Streaming | ⭐ starred |  |  |
| PlayTorrio (+1 mirrors) | https://playtorrio.xyz/ | Android Streaming | ⭐ starred | Movies / TV / Anime / GitHub | https://github.com/ayman708-UX/PlayTorrioV3 |
| Kodi | https://kodi.tv/ | Android Streaming | ⭐ starred | r/Addons4Kodi / Tracker / Trending |  |
| BubblesUPNP / alt: Macast | https://play.google.com/store/apps/details?id=com.bubblesoft.android.bubbleupnp | Android Streaming | ⭐ starred | Media Servers |  |
| CineHD | https://cinehd.dev/ | Android Streaming |  | Movies / TV / Anime / Drama / Live TV |  |
| Shiopa Mobile | https://help.shiopa.com/docs/ | Android Streaming |  | Movies / TV / Anime |  |
| FlixQuest | https://flixquest.beamlak.dev/ | Android Streaming |  | Movies / TV / Live TV / GitHub | https://github.com/BeamlakAschalew/flixquest |
| Movie HD | https://www.reddit.com/r/FREEMEDIAHECKYEAH/wiki/android#wiki_.25B7_modded_apks | Android Streaming |  | Movies / TV / Requires AMPlayer |  |
| VivaTV | https://www.reddit.com/r/FREEMEDIAHECKYEAH/wiki/android#wiki_.25B7_modded_apks | Android Streaming |  | Movies / TV / Requires TPlayer |  |
| Vyla Go (+1 mirrors) | https://vyla.cc/products/go | Android Streaming |  | Movies / TV / Anime / GitLab | https://gitlab.com/vyla-entertainment/home |
| Zangetsu | https://zangetsu.online/ | Android Streaming |  | Movies / TV / Anime / GitHub | https://github.com/Spyou/Zangetsu |
| OnStream | https://www.reddit.com/r/FREEMEDIAHECKYEAH/wiki/android#wiki_.25B7_modded_apks | Android Streaming |  | Movies / TV / Requires SPlayer |  |
| FilmPlus | https://www.reddit.com/r/FREEMEDIAHECKYEAH/wiki/android#wiki_.25B7_modded_apks | Android Streaming |  | Movies / TV / Requires BPlayer |  |
| Syncler / alt: Syncler Beta | https://syncler.net/ | Android Streaming |  | Movies / TV / Providers |  |
| Flixclusive | https://github.com/flixclusiveorg/Flixclusive | Android Streaming |  | Movies / TV / Plugins | https://github.com/flixclusiveorg/Flixclusive |
| Vega App | https://github.com/Zenda-Cross/vega-app | Android Streaming |  | Movies / TV | https://github.com/Zenda-Cross/vega-app |
| Nxsha | https://nxsha.app/ | Android Streaming |  | Movies / TV |  |
| Uriel | https://uriel-app.vercel.app/ | Android Streaming |  | Movies / TV / Anime |  |
| Flixoid | https://rentry.co/FMHYB64#flixoid | Android Streaming |  | Movies / TV |  |
| BeeTV | https://www.reddit.com/r/FREEMEDIAHECKYEAH/wiki/android#wiki_.25B7_modded_apks | Android Streaming |  | Movies / TV |  |
| LokLok | https://loklok.com/download | Android Streaming |  | Movies / TV |  |
| DigilogTV | https://github.com/aldrinzigmundv/digilogtv | Android Streaming |  | News TV Channels | https://github.com/aldrinzigmundv/digilogtv |
| aDrama | https://adrama.app/ | Android Streaming |  | Asian Drama |  |
| Amnis | https://play.google.com/store/apps/details?id=com.amnis | Android Streaming |  | Stream Videos from Torrents |  |
| PiliPlus | https://github.com/bggRGjQaUbCoE/PiliPlus | Android Streaming |  | Improved Bilibili Client | https://github.com/bggRGjQaUbCoE/PiliPlus |
| GrayJay | https://grayjay.app/ | Android Streaming |  | YouTube, Twitch, Rumble, etc. / Guide / Plugins / Add Platforms, ,  / GitLab | https://github.com/grayjay-sources/grayjay-sources.github.io https://gitlab.futo.org/videostreaming/grayjay https://gitlab.futo.org/videostreaming/plugins |
| ShowCase | https://github.com/WirelessAlien/MovieDB | Android Streaming |  | TMDB App | https://github.com/WirelessAlien/MovieDB |
| Great Courses Plus Premium | https://www.reddit.com/r/FREEMEDIAHECKYEAH/wiki/android#wiki_.25B7_modded_apks | Android Streaming |  | Courses |  |
| Showly | https://github.com/trakt/showly | Android Streaming |  | TV Trackers | https://github.com/trakt/showly |

#### Android Video Players — [https://fmhy.net/mobile#android-video-players](https://fmhy.net/mobile#android-video-players) (6 entries)

| Name | URL as listed | FMHY section | Flag | FMHY notes | Repo link(s) given |
|---|---|---|---|---|---|
| mpvEx / alt: REX Player, mpvRx | https://github.com/marlboro-advance/mpvEx | Android Video Players | ⭐ starred | Free Open Source Video Players | https://github.com/Riteshp2001/mpvRx https://github.com/marlboro-advance/mpvEx https://github.com/mpvRex/REX-Player |
| mpv-android | https://github.com/mpv-android/mpv-android | Android Video Players | ⭐ starred |  | https://github.com/mpv-android/mpv-android |
| VLC | https://www.videolan.org/vlc/download-android.html | Android Video Players | ⭐ starred |  |  |
| Synkplay | https://github.com/yuroyami/syncplay-mobile | Android Video Players | ⭐ starred | Video Stream Sync | https://github.com/yuroyami/syncplay-mobile |
| Just Player | https://github.com/moneytoo/Player | Android Video Players |  |  | https://github.com/moneytoo/Player |
| Next Player | https://github.com/anilbeesetti/nextplayer | Android Video Players |  |  | https://github.com/anilbeesetti/nextplayer |

#### iOS Streaming — [https://fmhy.net/mobile#ios-streaming](https://fmhy.net/mobile#ios-streaming) (20 entries)

| Name | URL as listed | FMHY section | Flag | FMHY notes | Repo link(s) given |
|---|---|---|---|---|---|
| Free w/ Ads Streaming | https://www.reddit.com/r/FREEMEDIAHECKYEAH/wiki/video#wiki_.25B7_free_w.2F_ads | iOS Streaming | ↪ redirect |  |  |
| Kodi | https://kodi.tv/ | iOS Streaming | ⭐ starred | Movies / TV / Anime / r/Addons4Kodi / Tracker / Trending |  |
| Synkplay | https://github.com/yuroyami/syncplay-mobile | iOS Streaming | ⭐ starred | Video Stream Sync | https://github.com/yuroyami/syncplay-mobile |
| Nuvio (+1 mirrors) / alt: Tools, Plugins, Wiki / Guides, Stremio | https://github.com/NuvioMedia/NuvioMobile | iOS Streaming |  | Movies / TV / Anime / Tools | https://github.com/NuvioMedia/NuvioMobile |
| PlayTorrio (+1 mirrors) | https://playtorrio.xyz/ | iOS Streaming |  | Movies / TV / Anime / GitHub | https://github.com/ayman708-UX/PlayTorrioV3 |
| Shiopa Mobile | https://help.shiopa.com/docs/ | iOS Streaming |  | Movies / TV / Anime |  |
| OutPlayer / alt: VLC, FlickJot, Infuse | https://outplayer.app/ | iOS Streaming |  | Video Players | https://github.com/dayanch96/InfusePlus |
| StrexoPlayer | https://strexoplayer.onrender.com/ | iOS Streaming |  | Video Player w/ Stremio Sync |  |
| Web Video Cast | https://apps.apple.com/app/web-video-cast-browser-to-tv/id1400866497 | iOS Streaming |  | Browser Video to TV Casting App |  |
| Streamyfin / alt: Swiftfin | https://github.com/streamyfin/streamyfin | iOS Streaming |  | Jellyfin Client | https://github.com/streamyfin/streamyfin |
| Pluto | https://apps.apple.com/app/id751712884 | iOS Streaming |  | Movies / TV |  |
| Tubi | https://apps.apple.com/app/id886445756 | iOS Streaming |  | Movies / TV |  |
| Uriel | https://uriel-app.vercel.app/ | iOS Streaming |  | Movies / TV / Anime |  |
| Mometu | https://apps.apple.com/us/app/mometu/id1609138069 | iOS Streaming |  | Movies / TV |  |
| NebuloIPTV | https://github.com/mongoosemonke504/NebuloIPTV | iOS Streaming |  | Live Sports | https://github.com/mongoosemonke504/NebuloIPTV |
| Channels Pro | https://apps.apple.com/us/app/channels-pro-iptv-player/id1491605049 | iOS Streaming |  | Live Sports / Insert "veve.pro" |  |
| Found TV | https://apps.foundtv.com/ | iOS Streaming |  | Found Footage Movies / Requires Sign-Up |  |
| Viki / alt: aDrama | https://apps.apple.com/app/id445553058 | iOS Streaming |  | Asian Drama |  |
| TVBAnywhere | https://apps.apple.com/app/id1191642382 | iOS Streaming |  | Chinese Drama |  |
| Tunity | https://tunity.com/ | iOS Streaming |  | Hear Muted TVs / US Only |  |

#### Indian Languages — [https://fmhy.net/non-english#indian-languages](https://fmhy.net/non-english#indian-languages) (65 entries)

| Name | URL as listed | FMHY section | Flag | FMHY notes | Repo link(s) given |
|---|---|---|---|---|---|
| VegaMovies | https://vegamovies.market/ | Indian Languages › Downloading | ⭐ starred | Movies / TV / Anime / 4K / 1080p |  |
| UHDMovies | https://modlist.in/?type=uhdmovies | Indian Languages › Downloading | ⭐ starred | Movies / 4K |  |
| HDHub4u | https://hdhub4u.bi/ | Indian Languages › Downloading | ⭐ starred | Movies / TV / 1080p / 4K |  |
| XDMovies | https://top.xdmovies.wtf/ | Indian Languages › Downloading | ⭐ starred | Movies / TV / 4K / 1080p |  |
| MoviesMod | https://mmodlist.org/?type=hollywood | Indian Languages › Downloading | ⭐ starred | Movies / TV / Sub / Dub / 1080p / Bypass |  |
| ToonWorld4All | https://toonworld4all.me/ | Indian Languages › Downloading | ⭐ starred | Anime / Cartoon / Geoblocked |  |
| ToonsHub | https://www.toonshub.my.id/ | Indian Languages › Downloading | ⭐ starred | Anime / Dub / 1080p |  |
| TamilMV | https://www.1tamilmv.lease/ | Indian Languages › Downloading | ⭐ starred | Movies / TV / Anime / Sub / Dub / 4K / 1080p / Indian Languages |  |
| SSR Movies | https://ssrmovies.blue/ | Indian Languages › Downloading |  | Movies / TV / Sub / Dub / 1080p |  |
| TheMoviesBoss | https://themoviesboss.fans/ | Indian Languages › Downloading |  | Movies / TV |  |
| HindMoviez | https://hindmoviez.cafe/ | Indian Languages › Downloading |  | Movies / TV / Anime / 1080p |  |
| BollyMod | https://bollymod.study/ | Indian Languages › Downloading |  | Movies / TV / Anime / 1080p |  |
| MoviesDrive | https://new2.moviesdrive.christmas/ | Indian Languages › Downloading |  | Movies / TV / 1080p |  |
| Bollyflix | https://bollyflix.bi/ | Indian Languages › Downloading |  | Movies / TV / 1080p |  |
| KMMovies | https://kmmovies.life/ | Indian Languages › Downloading |  | Movies / TV / Anime / 1080p |  |
| DownloadHub | https://d10.downloadhub.food/ | Indian Languages › Downloading |  | Movies / TV / Sub / Dub / 1080p |  |
| MoviesLeech | https://moviesleech.club/ | Indian Languages › Downloading |  | Movies / TV / Sub |  |
| KatMovieHD | https://new.katmoviehd.top/ | Indian Languages › Downloading |  | Movies / TV / Anime / Sub / Dub / 1080p |  |
| GokuHD | https://www.gokuhd.com/ | Indian Languages › Downloading |  | Movies / TV / Anime / 1080p |  |
| OlaMovies | https://olamovies.dad/ | Indian Languages › Downloading |  | Movies / TV / Sub / Dub / 4K / 1080p / Use Adblock / Requests |  |
| DesireMovies | https://desiremovies.my/ | Indian Languages › Downloading |  | Movies / TV / Sub / Dub / 1080p |  |
| CloudMoviez | https://new.cloudmoviez.shop/ | Indian Languages › Downloading |  | Movies / TV / Anime / 1080p |  |
| Anime Dub Hindi | https://www.animedubhindi.link/ | Indian Languages › Downloading |  | Anime / Dub / 1080p |  |
| Toonhub4u | https://toonhub4u.co/ | Indian Languages › Downloading |  | Anime / Cartoon / Dub / 1080p / Geoblocked |  |
| Isaimini | https://isaimini.com.co/ | Indian Languages › Downloading |  | Movies Music |  |
| TamilMV | https://www.1tamilmv.lease/ | Indian Languages › Torrenting | ⭐ starred | Movies / TV / Anime / Sub / Dub / 4K / 1080p / Indian Languages |  |
| PirateXPlay | https://piratexplay.cc/ | Indian Languages › Streaming | ⭐ starred | Cartoons / Anime / Mirrors |  |
| ToonStream | https://toonstream.vip/ | Indian Languages › Streaming | ⭐ starred | Cartoons / Anime / 1080p |  |
| MultiMovies | https://multimovies.wtf/ | Indian Languages › Streaming | ⭐ starred | Movies / TV / .guru Always Redirects to Main |  |
| Anime World India (+1 mirrors) | https://watchanimeworld.one/ | Indian Languages › Streaming | ⭐ starred | Anime |  |
| TamilMV | https://www.1tamilmv.lease/ | Indian Languages › Streaming |  | Movies / TV / Anime / Sub / Dub / 4K / 1080p / Indian Languages |  |
| Einthusan | https://einthusan.tv/ | Indian Languages › Streaming |  | Movies / 1080p / VPN Required |  |
| saicord | https://saicord.com/hi/ | Indian Languages › Streaming |  | Movies / TV |  |
| PlayTorrio (+1 mirrors) | https://playtorrio.xyz/ | Indian Languages › Streaming |  | All Platforms / Use PlayTorrioHTTP Plugin / GitHub | https://github.com/ayman708-UX/PlayTorrioV2 |
| CinemaOS (+1 mirrors) | https://cinemaos.live/ | Indian Languages › Streaming |  | Movies / TV / Anime / Auto-Next / Watch Parties |  |
| TamilGun | https://tamilgun.now/ | Indian Languages › Streaming |  | Tamil Movies / TV / Dub / 1080p / 720p |  |
| TamilCrow | https://www.1tamilcrow.net/ | Indian Languages › Streaming |  | Tamil Movies |  |
| tamilbulb | https://tamilbulb.cc/ | Indian Languages › Streaming |  | Tamil Movies |  |
| tamilblasters | https://www.1tamilblasters.tech/ | Indian Languages › Streaming |  | Movies / TV / Anime |  |
| Desicinemas / alt: BollyZone | https://desicinemas.to/ | Indian Languages › Streaming |  | Movies / TV / 1080p |  |
| flixsix | https://flixsix.com/ | Indian Languages › Streaming |  | Movies / TV / Dub / 1080p |  |
| 1Tube | https://www.1tube.org/ | Indian Languages › Streaming |  | Movies / TV / Anime / 4K |  |
| HydraHD | https://hydrahd.com/ | Indian Languages › Streaming |  | Movies / TV / Anime / Auto-Next / Status |  |
| Anime Joker | https://animejoker.com/ | Indian Languages › Streaming |  | Movies / TV / Anime |  |
| Abibli | https://abibli.com/ | Indian Languages › Streaming |  | Movies / TV |  |
| myflixbd | https://myflixbd.to/ | Indian Languages › Streaming |  | Movies / TV / Anime |  |
| PRMovies | https://prmovies.exchange/ | Indian Languages › Streaming |  | Movies / TV / Anime |  |
| Screenscape | https://screenscape.me/ | Indian Languages › Streaming |  | Movies / TV / Anime |  |
| Movi | https://www.movi.pk/ | Indian Languages › Streaming |  | Movies / TV / Dub / 1080p |  |
| 1tamilyogi | https://1tamilyogi.ro/ | Indian Languages › Streaming |  | Movies / TV |  |
| 5movierulz | https://www.5movierulz.fitness/ | Indian Languages › Streaming |  | Movies / TV / Anime |  |
| Cloudy | https://cloudy.pk/ | Indian Languages › Streaming |  | Movies / TV / Cartoons / Sub / Dub / 720p |  |
| MX Player on Prime | https://www.primevideo.com/collection/streamfree?tr=in | Indian Languages › Streaming |  | Movies / TV / Free w/ Ads |  |
| IndianCine | https://indiancine.ma/ | Indian Languages › Streaming |  | Indian Short / Classic Movies |  |
| LuffyTV (+1 mirrors) | https://luffytv.live/ | Indian Languages › Streaming |  | Sub / Dub |  |
| 1XAnime | https://1xanimes.com/ | Indian Languages › Streaming |  | Anime |  |
| Aniflix | https://aniflix.uno/ | Indian Languages › Streaming |  | Anime |  |
| desidubanime | https://www.desidubanime.me/ | Indian Languages › Streaming |  | Anime |  |
| Kartoons | https://kartoons.me/ | Indian Languages › Streaming |  | Cartoons |  |
| mxplayer | https://www.mxplayer.in/ | Indian Languages › Streaming |  | Movies |  |
| Desi Serials | https://www.desi-serials.to/ | Indian Languages › Streaming |  | TV |  |
| desitv | https://www.desitv.to/ | Indian Languages › Streaming |  | TV |  |
| crickmail | https://crickmail.pages.dev/channel-13 | Indian Languages › Streaming |  | Live Cricket |  |
| Vega App | https://github.com/Zenda-Cross/vega-app | Indian Languages › Streaming |  | Movies / TV / Android App | https://github.com/Zenda-Cross/vega-app |
| Indian IPTV App | https://github.com/kananinirav/Indian-IPTV-App | Indian Languages › Streaming |  | IPTV Android App | https://github.com/kananinirav/Indian-IPTV-App |

#### Stream Sync — [https://fmhy.net/video-tools#stream-sync](https://fmhy.net/video-tools#stream-sync) (18 entries)

| Name | URL as listed | FMHY section | Flag | FMHY notes | Repo link(s) given |
|---|---|---|---|---|---|
| Syncplay | https://syncplay.pl/ | Stream Sync | ⭐ starred | App / GitHub | https://github.com/Syncplay/syncplay |
| Watch2Gether | https://w2g.tv/ | Stream Sync | ⭐ starred | Online Player |  |
| SyncWatch | https://github.com/Semro/syncwatch | Stream Sync | ⭐ starred | Online Extension | https://github.com/Semro/syncwatch |
| Kosmi | https://kosmi.io/ | Stream Sync | ⭐ starred | Online Player |  |
| WatchParty | https://www.watchparty.me/ | Stream Sync | ⭐ starred | Online / Virtual Browser / GitHub | https://github.com/howardchung/watchparty |
| neko | https://neko.m1k1o.net/ | Stream Sync | ⭐ starred | Docker Virtual Browser / GitHub | https://github.com/m1k1o/neko |
| HyperBeam / alt: VIP | https://hyperbeam.com/ | Stream Sync |  | Virtual Computer Embed |  |
| OpenTogetherTube / alt: TurtleTV | https://opentogethertube.com/ | Stream Sync |  | Online Player |  |
| Metastream | https://getmetastream.com/ | Stream Sync |  | Online Extension / GitHub | https://github.com/samuelmaddock/metastream |
| Caracal Club | https://caracal.club/ | Stream Sync |  | Online Player |  |
| Mzelo | https://mzelo.com/ | Stream Sync |  | Online Player |  |
| SyncUp | https://syncup.tv/ | Stream Sync |  | Online Player |  |
| CyTube | https://cytu.be/ | Stream Sync |  | Online Player |  |
| CinevoSync | https://sync.cinevo.us/ | Stream Sync |  | Online Player |  |
| VideoTogether | https://videotogether.github.io/ | Stream Sync |  | App |  |
| baked.live | https://baked.live/ | Stream Sync |  | Online Player |  |
| Rave.io | https://rave.io/ | Stream Sync |  | Online Extension |  |
| MovieNight | https://github.com/zorchenhimer/MovieNight | Stream Sync |  | Docker | https://github.com/zorchenhimer/MovieNight |

#### Plex Tools — [https://fmhy.net/video-tools#plex-tools](https://fmhy.net/video-tools#plex-tools) (1 entries)

| Name | URL as listed | FMHY section | Flag | FMHY notes | Repo link(s) given |
|---|---|---|---|---|---|
| SyncLounge | https://github.com/synclounge/synclounge | Plex Tools |  | Media Sync | https://github.com/synclounge/synclounge |

#### Kodi Tools — [https://fmhy.net/video-tools#kodi-tools](https://fmhy.net/video-tools#kodi-tools) (2 entries)

| Name | URL as listed | FMHY section | Flag | FMHY notes | Repo link(s) given |
|---|---|---|---|---|---|
| Elementum | https://elementum.surge.sh/ | Kodi Tools | ⭐ starred | Torrent Streaming / Trakt Sync / Similar to Stremio + Torrentio |  |
| Synko | https://github.com/Skaytacium/synko | Kodi Tools |  | Kodi Stream Sync | https://github.com/Skaytacium/synko |

#### API Tools — [https://fmhy.net/developer-tools#api-tools](https://fmhy.net/developer-tools#api-tools) (3 entries)

| Name | URL as listed | FMHY section | Flag | FMHY notes | Repo link(s) given |
|---|---|---|---|---|---|
| Streaming Site APIs | https://rentry.co/FMHYB64#streaming-apis | API Tools | 🌐 index |  |  |
| CoorenLabs / alt: GitHub, Consumet | https://coorenlabs.com/ | API Tools |  | Piracy Site Metadata APIs / Scraping | https://github.com/coorenlabs/cooren |
| Wyzie Subs | https://sub.wyzie.io/ | API Tools |  | Subtitle Scraping API / NPM Package / Docs |  |

---

## 3. Derived lists

### 3a. Embed / API providers addressable by TMDB or IMDb id

All entries come from FMHY's API list (§2.0); the patterns are quoted from each provider's own docs page (linked).
Column key:
- **IDs:** T = TMDB, I = IMDb.
- **Events out:** `postMessage` from player to parent.
- **Commands in:** `postMessage` from parent to player. This is what a watch party needs.
- **Bearoom:** whether the live catalog, the bundled `providers.json`, already lists the provider ("hijackable" per `docs/providers/README.md`).

**Tier 1: documented watch-party control (commands in)**

| Provider | Movie / TV URL pattern (from docs) | IDs | Events out | Commands in | Language / Hindi | Bearoom |
|---|---|---|---|---|---|---|
| [VidFast](https://vidfast.vc/) (vidfast.pro → vidfast.vc) | `https://vidfast.vc/movie/{id}` · `/tv/{id}/{season}/{episode}`; params `autoPlay, startAt, theme, server, hideServer, sub, title, poster, nextButton, autoNext, chromecast, fullscreenButton` | T, I | `PLAYER_EVENT` play / pause / seeked / ended / timeupdate / playerstatus `{currentTime, duration, tmdbId, mediaType, season, episode, playing, muted, volume}` + `MEDIA_DATA` | **play, pause, seek{time}, volume{level}, mute{muted}, getStatus**; "Perfect for watch party features", with a `WatchPartyController` example | `sub=` only | yes: `vidfast.pro/movie/${id}`, hijackable; vidfast.pro now redirects to vidfast.vc |
| [VidCore](https://vidcore.io/) (vidcore.net → vidcore.io) | `https://vidcore.io/movie/{id}?autoPlay=true` (same template as VidFast) | T, I | Events tab | **same command set**; "Perfect for watch party features" | `sub=` | **no**: Bearoom's `vidcore` is `vidcore.org/embed/movie/${id}`, a different site (Tier 3, no commands). The DB seed has `www.vidcore.net/embed/movie` with `watchParty:false`; vidcore.net now redirects to vidcore.io, whose path is `/movie/{id}` |
| [VidZen](https://vidzen.fun/) | `https://vidzen.fun/movie/{id}` (TMDB or `tt…`) | T, I | Events tab | **same command set**; "build real-time synchronized Watch Party rooms" | — | no |
| [CinemaOS](https://cinemaos.tech/embed) | `https://cinemaos.tech/player/{tmdb_id}` · `/player/{tmdb_id}/{season}/{episode}` | T | Events tab | **play, pause, seek, volume, mute, getStatus → playerstatus** | — (FMHY's Indian section lists CinemaOS with "Watch Parties") | no |
| [Vidlove](https://vidlove.cc/) | `https://player.vidlove.cc/embed/movie/{tmdb}` · `/embed/tv/{tmdb}/{s}/{e}` | T | `PLAYER_EVENT` play / pause / seeked / timeupdate / ended | **one command: `{type:'SET_TIME', time}`** (no play / pause) | `hideaudiotrack` param (an audio-track menu exists) | no; NiakVIO flags vidlove movies as wrong content (landscape §3.4) |
| [TryEmbed](https://tryembed.us.cc/) | anime only: `/embed/anime/{anilist}/{ep}/sub\|dub` | AniList, MAL | `PLAYER_EVENT` | play / pause / seek / volume | sub / dub | n/a (anime) |

**Tier 2: events out only (progress / analytics, no documented control)**

| Provider | Pattern (from docs) | IDs | Events out | Language / Hindi | Bearoom |
|---|---|---|---|---|---|
| [VidLink](https://vidlink.pro/) | `https://vidlink.pro/movie/{tmdbId}` · `/tv/{tmdbId}/{s}/{e}` · `/anime/{MALid}/{n}/{subOrDub}` | T | `MEDIA_DATA` (watch progress) + `PLAYER_EVENT` play / pause / seeked / ended / timeupdate | — | yes (hijackable) |
| [VixSrc](https://vixsrc.to/) (served with HTTP 403 but rendered) | `https://vixsrc.to/movie/{id}` · `/tv/{id}/{s}/{e}` | T, I | `PLAYER_EVENT {event, currentTime, duration, video_id}` | **`lang` = "preferred language for the audio track"** (example `lang=it`; Italian "StreamingUnity" catalogue) | yes (hijackable) |
| [Stellar](https://stellar.rip/en/api) | `https://stellar.rip/{locale}/watch/embed/movie/{tmdb_id}` · `/embed/tv/{tmdb}-{s}-{e}`; "ad-free, no API key" | T only | handshake `STELLAR_EMBED_READY` → parent sends `STELLAR_EMBED_INIT`; then `PLAYER_EVENT`, `MEDIA_DATA` | locale is the UI language (Hindi in the locale list; **inferred** not audio) | no |
| [Vidy](https://www.vidy.st/) | `/movie/{tmdbId}` · `/tv/{tmdbId}/{s}/{e}` (FMHY tag: 4K) | T | `PLAYER_EVENT` timeupdate / play / pause / ended + `MEDIA_DATA` ~1/s | — | no |
| [Cinetaro API](https://cinextream.cc/) (FMHY: "Cinextream API") | `/api/embed/movie/[ID]` · `/api/embed/tv/[ID]/[s]/[e]` · `/api/embed/anime/[lang]/[AniList]/[ep]` | T | `player_ready`, `time {time,duration}`, `complete`, `player_error {reason}`, `VIDEO_ENDED` | FAQ: "multiple audio sources (including **Hindi**, Japanese, and English)… movies and TV: English and Multi-language" | no |
| [Cinezo](https://cinezo.live/) | `https://player.cinezo.live/embed/movie/{tmdbId}` · `/embed/tv/{tmdbId}/{s}/{e}` | T | "Player Events": progress tracking (play, pause, seeked) | **`server=hindi`** documented; FAQ: "multiple languages with appropriate audio tracks" (FMHY's Spanish section lists Cinezo with "Watch Parties") | no |
| [VidUP](https://vidup.to/) | `https://vidup.to/movie/{id}` · `/tv/{id}/{s}/{e}` (VidFast template) | T, I | progress events | — | no |
| [VidHawk](https://vidhawk.buzz/) | anime only: `/embed/ani/{anilist}/{ep}/{audio}?server=` | AniList, MAL | progress `postMessage` | **Audio: Sub · Dub · Japanese · Hindi** | n/a |
| [ZoryvaX](https://zoryva.me/embed) | `https://zoryva.me/embed/movie/{tmdb_id}` · `/embed/tv/{tmdb_id}/{s}/{e}` | T | message listener shown | — | no |

**Tier 3: URL pattern only (no event API in the docs)**

| Provider | Pattern (from docs) | IDs | Language / Hindi |
|---|---|---|---|
| [Nxsha](https://web.nxsha.app/embed) (NontonGo redirects here) | `/embed/movie/{id}`; `?server=MbPly-[Multi-Lang]`, `?sub=hi`, **`?lang=<ISO 639-1>` "binds the primary audio track"** | T, I | **yes: request `lang=hi`** (claim only; MbPly = MovieBox, **inferred**) |
| [AutoEmbed](https://autoembed.app/) | `https://player.autoembed.app/embed/movie/{id}` · `/embed/tv/{id}/{s}/{e}` · `?server=N` | T, I (`tt`) | "original language" only |
| [Atlantic API](http://embed.atlantic.st/) | `https://atlantic.st/embed/movie/{tmdbId}` · `/embed/tv/{tmdbId}/{s}/{e}` | T | — (Atlantic is a 🌟 FMHY aggregator, 4K) |
| [VidCore.org](https://www.vidcore.org/) (different site from vidcore.io) | `https://vidcore.org/embed/movie/{tmdb_id}` | T | FAQ: "subtitles in 30+ languages along with available **dubbed audio tracks**"; also "Auto generated dub/sub". **This is the `vidcore` in Bearoom's `providers.json`** |
| [VidNest](https://vidnest.fun/) | `/movie/[TMDB]` · `/tv/[TMDB]/[S]/[E]` · `/anime/[AniList]/[ep]/[sub\|dub\|hindi]` | T | **anime `/hindi`** (in Bearoom's `providers.json`) |
| [PrimeSRC](https://primesrc.me/) | `https://primesrc.me/embed/movie?imdb=tt…` or `?tmdb=…` (TVMaze for TV) | T, I | — |
| [SuperEmbed](https://www.superembed.stream/) | `https://multiembed.mov/?video_id={id}[&tmdb=1][&s=&e=]` (+ `directstream.php`) | T, I | — (in Bearoom's `providers.json` as `multiembed`, non-hijackable) |
| [StreamVault](https://streamvaultsrc.click/) | `/embed/movie/{TMDB}` · `/embed/tv/{TMDB}/{s}/{e}` | T | — |
| [VidAPI.ru](https://vidapi.ru/) | `https://vaplayer.ru/embed/movie/{id}` · `/embed/tv/{id}/{s}/{e}` | T, I | `vaplayer.ru` is the upstream host of playimdb / zevran (landscape §3.2), so it is **the same backend (inferred)** |
| [VidAPI.xyz](https://vidapi.xyz/) | IMDb / TMDB (pattern not captured) | T, I | FAQ "multiple languages?" (answer not captured) |
| [Vidzee](https://vidzee.wtf/) | `https://player.vidzee.wtf/embed/movie/{tmdb}` · `/embed/tv/{tmdb}/{s}/{e}` (+ `/v2/`) | T | — |
| [VidRift](https://vidrift.net/) | `https://embed.vidrift.net/embed/movie/{id}` · `/embed/tv/{id}/{s}/{e}` | T | — |
| [2embed.stream](https://2embed.stream/) | `https://www.2embed.stream/embed/movie/{id}` · `/embed/tv/{id}/{s}/{e}` | T, I | — |
| [Embed Icefy](https://embed.icefy.top/) | `/movie?id={tmdb}` · `/tv?id=…&season=…&episode=…` | T | — |
| [Fmov](https://fmov.my/) | `https://fmov.my/embed/movie/{tmdb}` | T | — |
| [Vidrock](https://vidrock.net/) | `/movie/{tmdb_id\|imdb_id}` · `/tv/{id}/{s}/{e}`; catalogue `list/movie.json`, `list/tv.json` | T, I | (Hindi / Tamil / Telugu as separate streams per the Aug audit, via evyrith) |
| [Velarium](https://velarium.cc/) | `/en/watch/movie/{id}` | T, I | "16 player languages / Playback events" (UI) |
| [CineSRC](https://cinesrc.st/) | `cinesrc.st/embed/movie/…` | T | — (PoW-protected per the sharoon7171 resolver) |
| [VidSrc](https://vidsrc.domains/) (official-domains page) | example `https://vidsrc.sh/embed/movie/tt1300854` | I | — (vidsrc.to docs page is marketing only) |

**Did not show docs today (observed):**
- 111movies.com: NXDOMAIN.
- vidsrcme.ru: connection refused.
- 2embed.cc: error page plus an ad pop-up.
- api.smashystream.top and vidcorn.cfd: NXDOMAIN.
- peachify.top: Cloudflare 523. mappletv.uk: Cloudflare 522.
- framextv.tech/api, viduki.net and thisiscinema.pages.dev: blank page.
- zxcstream: Cloudflare challenge (not bypassed).
- spencerdevs.xyz: "Coming Soon".
- vidflix.club: blank. vidstuck.xyz: no docs text.
- Vyla's docs ([mintlify](https://vyla.mintlify.app/introduction)) show no pattern, and its API repo is archived (§4).

**Reading for Bearoom (inferred):**
- A documented command API is a cleaner watch-party path than the injected bridge. Commands are sent to an
  **iframe's** `contentWindow`, though, so Bearoom would need a tiny host page inside its WebView that iframes the
  embed and relays `__vlCmd` → `postMessage` (untested).
- The **room still needs one stream for every member**: the embed picks its own server and quality per client, so
  members can land on different cuts. Use Bearoom's duration check (the measurement found ~10% wrong content).

### 3b. Hindi / Indian-language sources FMHY lists

From [fmhy.net/non-english#indian-languages](https://fmhy.net/non-english#indian-languages) (full rows in §2.1):

- **Streaming (⭐ starred):**
  - [MultiMovies](https://multimovies.wtf/): Movies / TV.
  - [PirateXPlay](https://piratexplay.cc/), [ToonStream](https://toonstream.vip/): cartoons / anime, Hindi dub
    **(inferred from the section)**.
  - [Anime World India](https://watchanimeworld.one/) (mirror `animesalt.cx`).
- **Streaming (unstarred):**
  - [Einthusan](https://einthusan.tv/) (VPN required).
  - [CinemaOS](https://cinemaos.live/) ("Watch Parties"; has the command API, §3a).
  - [Desicinemas / BollyZone](https://desicinemas.to/), [flixsix](https://flixsix.com/) (Dub).
  - [1Tube](https://www.1tube.org/) (4K), [HydraHD](https://hydrahd.com/).
  - [Movi.pk](https://www.movi.pk/) (Dub), [Cloudy.pk](https://cloudy.pk/) (Sub / Dub).
  - [LuffyTV](https://luffytv.live/), [desidubanime](https://www.desidubanime.me/).
  - [Desi Serials](https://www.desi-serials.to/), [desitv](https://www.desitv.to/).
  - [MX Player](https://www.mxplayer.in/) and MX Player on Prime (legal, free with ads).
  - The Tamil sites (TamilMV ⭐, TamilGun, tamilblasters, 1tamilyogi, 5movierulz).
- **Download sites (⭐):** VegaMovies, UHDMovies, HDHub4u, XDMovies, MoviesMod, ToonWorld4All, ToonsHub, TamilMV.
  Unstarred: HindMoviez, MoviesDrive, Bollyflix, KatMovieHD, OlaMovies, Anime Dub Hindi and others. These are the
  sites the Nuvio and Vega Hindi plugins scrape (MKV / file-host chains, per the August study).
- **Apps:**
  - [Vega App](https://github.com/Zenda-Cross/vega-app) (now `vega-org/vega-app`, React Native).
  - [PlayTorrio](https://playtorrio.xyz/) (`ayman708-UX/PlayTorrioV2` link in this section; V3 elsewhere).
  - [Indian IPTV App](https://github.com/kananinirav/Indian-IPTV-App).
- **Embed APIs with Hindi knobs (from §3a, all unverified):**
  - Nxsha `?lang=hi`, Cinezo `server=hindi`, Cinetaro "Multi-language incl. Hindi", VidCore.org "dubbed audio tracks".
  - Anime: VidNest `/hindi`, VidHawk "Hindi" audio.
- **Plugin repos with Indian sources:**
  - [Zenda-Cross/vega-providers](https://github.com/Zenda-Cross/vega-providers)
    ([manifest](https://raw.githubusercontent.com/Zenda-Cross/vega-providers/HEAD/manifest.json), 58 providers):
    - **India-typed:** moviezwap, RogMovies (luxMovies), TopMovies, MovieLinkBD and MX Player are enabled; ogomovies,
      dooflix and Joya9tv are disabled.
    - **"Global" entries that are Indian sites:** VMovies (VegaMovies), MoviesDrive, 4khdHub, Cinewood, World4uFree,
      KatMoviesHd, MoviesMod, UHDMovies, Movies4U, KmMovies, HdHub4u, and NetflixMirror / PrimeMirror / DisneyMirror
      (NetMirror family).
    - **Also:** Castle TV, MovieBox Web, AnimeSalt and AnimeWorld (Hindi anime).
  - Nuvio side, already known: AIO, Eclipsia, phisher98. New since 09-01:
    [EhsanulHaqueSiam/nuvio-hindi-dub](https://github.com/EhsanulHaqueSiam/nuvio-hindi-dub) (a catalog only),
    [ravisf148/nuvio-hindi-addon](https://github.com/ravisf148/nuvio-hindi-addon),
    [PadhleYrr/nuvio-vega-providers](https://github.com/PadhleYrr/nuvio-vega-providers) and
    [ArabibZ/nuvio-providers](https://github.com/ArabibZ/nuvio-providers) (MovieBox beta).
  - Stremio side:
    - [RickyShen16/Ricky-Addon](https://github.com/RickyShen16/Ricky-Addon): "VidSrc Scraper… English/Tamil/Hindi".
    - [xre000001-ai/raretoons-stremio](https://github.com/xre000001-ai/raretoons-stremio): Hindi-dubbed cartoons.
    - [Ttrigan1/stremio-hindi-addon](https://github.com/Ttrigan1/stremio-hindi-addon).
  - Anime Hindi-dub resolvers:
    - [SH0MIK/Anivault-Scraper](https://github.com/SH0MIK/Anivault-Scraper) (desidubanime).
    - [faisaljs/AniKoKo](https://github.com/faisaljs/AniKoKo).
    - [aznayeemghost/luffytv-hls-proxy](https://github.com/aznayeemghost/luffytv-hls-proxy): AnimeSalt
      "Hindi/Tamil/Telugu/English audio natively". It describes a "signed-URL bypass"; reference only.

### 3c. Open-source streaming apps and addon / plugin ecosystems FMHY lists

| Ecosystem / app | FMHY section(s) | Repo | ★ / last push / license | Note for Bearoom |
|---|---|---|---|---|
| **Nuvio** (Mobile / TV / Desktop / HTPC / Linux / TVSmart) + [plugin library](https://nuvio-plugin-library.vercel.app/), [nuvio.wiki](https://nuvio.wiki/), [Stremio Sync](https://nuviosync.com/) | Android ⭐, Android TV ⭐, Smart TV ⭐, Torrent Apps, iOS | [NuvioMedia/NuvioMobile](https://github.com/NuvioMedia/NuvioMobile), [NuvioTV](https://github.com/NuvioMedia/NuvioTV), [NuvioDesktop](https://github.com/NuvioMedia/NuvioDesktop), [UmbraProjects/NuvioDesktop](https://github.com/UmbraProjects/NuvioDesktop), [JJDizz1L/NuvioLinux](https://github.com/JJDizz1L/NuvioLinux), [NuvioTVSmart](https://github.com/NuvioMedia/NuvioTVSmart) | Mobile 3,848★ / 2026-10-10 / GPL-3.0 (KMP + Compose, default branch `cmp-rewrite`, 0.5.8-beta on 10-08); TV 2,952★ | Known. `tapframe/NuvioStreaming` now redirects to NuvioMobile |
| **Stremio** + tools ([AIOStreams](https://github.com/Viren070/AIOStreams), [AIOMetadata](https://github.com/cedya77/aiometadata), [Addon Manager](https://github.com/pancake3000/stremio-addon-manager), [community v5](https://github.com/Zaarrg/stremio-community-v5), [Harbor](https://github.com/harborstremio/harbor), [Stremio Kai](https://github.com/allecsc/Stremio-Kai), [uptime tracker](https://uptime.ibbylabs.dev/)) | Torrent Apps ⭐, Stremio Tools | as linked | AIOStreams 2,839★ / 2026-10-06 / AGPL-3.0 | FMHY: "much of what is listed here will also be compatible with Nuvio" |
| **Vega App** + Vega-Desktop | Indian › Streaming, Android, Android TV, Streaming Apps | [vega-org/vega-app](https://github.com/vega-org/vega-app), [Zenda-Cross/vega-providers](https://github.com/Zenda-Cross/vega-providers), [vega-org/vega-desktop](https://github.com/vega-org/vega-desktop) | 1,521★ / 2026-10-10 / NOASSERTION; providers 85★ / 2026-10-10 / none; desktop 59★ | **New. The only RN / Expo peer**: Expo 57, RN-tvOS 0.86, `react-native-video` 6.19, Google Cast, MMKV, WebView. Provider contract: `catalog / posts / meta / stream / episodes` TS modules with a `providerContext`; `getStream({link,type,signal,providerContext,isDownload})` ([README](https://github.com/Zenda-Cross/vega-providers)) |
| **CloudStream** + extension repos ([cs3-repos](https://rentry.org/cs3-repos)) | Android ⭐, Android TV | [recloudstream/cloudstream](https://github.com/recloudstream/cloudstream) | 10,910★ / 2026-10-10 / GPL-3.0 | Kotlin; the biggest plugin ecosystem; not portable to RN |
| **PlayTorrio** (HTTP plugin + Stremio addons) | Streaming Apps ⭐, Android ⭐, Torrent ⭐, iOS, Indian | [ayman708-UX/PlayTorrioV3](https://github.com/ayman708-UX/PlayTorrioV3) | 389★ / 2026-10-05 / GPL-3.0 (Dart, created 2026-08-10) | New fast-growing cross-platform app |
| **Flixclusive** (plugins via Discord) | Android | [flixclusiveorg/Flixclusive](https://github.com/flixclusiveorg/Flixclusive) | 538★ / 2026-10-07 / MIT | Kotlin, Media3 |
| **Zangetsu** | Android | [Spyou/Zangetsu](https://github.com/Spyou/Zangetsu) | 388★ / 2026-10-09 / GPL-3.0 | Dart; Android, TV, iOS beta |
| **Vyla** (Home / Go / TV) + Player API | Streaming Apps ⭐, Android, Android TV, API list | [GitLab vyla-entertainment/home](https://gitlab.com/vyla-entertainment/home), [vyla-entertainment/stream-api](https://github.com/vyla-entertainment/stream-api) (from EndOverdosing/Vyla-Player-API) | API repo **archived**, last push 2026-08-04 | "Verified HLS streams… proxied, CORS-safe"; dead as code source |
| **P-Stream forks** (Cinecat ⭐, Aether ⭐, kstream, Basement, pstream.cfd, StreamWatch, …) + [extension](https://github.com/xp-technologies-dev/userscript) | P-Stream Forks | [xp-technologies-dev/p-stream](https://github.com/xp-technologies-dev/p-stream) (**archived**), [codeberg.org/pee](https://codeberg.org/pee) (backend / proxy / desktop / extension, updated 2026-08-30; no providers repo), [steveyout/streamwatch](https://github.com/steveyout/streamwatch) (27★, MIT) | — | The providers lineage is gone (p-stream/providers 451) |
| Others with repos | Streaming Apps / Android / Multi-Server | [Showberry](https://github.com/Dackerie/showberry) (GPL-3.0, created 09-07), [mov-cli](https://github.com/mov-cli/mov-cli), [ARVIO](https://github.com/ProdigyV21/ARVIO), [FlixQuest](https://github.com/BeamlakAschalew/flixquest), [Luna (tvOS)](https://github.com/cranci1/Luna) / [Shirox (iOS)](https://github.com/xibrox/Shirox) with JS modules at [library.cufiy.net](https://library.cufiy.net/library/), [FishyStream](https://github.com/FishyServices/FishyStream), [meowly](https://github.com/utkarshgupta188/meowly), [TypeType](https://github.com/TypeType-Video/TypeType) | various | Reference only |
| Dev / API (FMHY developer-tools) | API Tools | [CoorenLabs](https://github.com/coorenlabs/cooren), Consumet ([docs](https://docs.consumet.org/list-of-providers); **both repos HTTP 451**), [Wyzie Subs](https://docs.wyzie.io/) | — | Consumet is now DMCA'd |

### 3d. Watch-party / sync tools FMHY lists

From [video-tools#stream-sync](https://fmhy.net/video-tools#stream-sync), mobile players, Plex / Kodi tools and the new
"Stream Lounges" section. The sync algorithms of Syncplay, watchparty, Metastream, CyTube and Jellyfin SyncPlay are
analysed in `similar-apps-architecture-2026-10.md` §1.7–1.11, so they are not repeated here.

| Tool | FMHY flag / type | Open source? | ★ / last push / license | Relevance |
|---|---|---|---|---|
| [Synkplay](https://github.com/yuroyami/syncplay-mobile) (Syncplay Mobile) | ⭐ in Android Video Players and iOS Streaming | yes | 379★ / 2026-10-01 / AGPL-3.0 | **The only mobile (Android + iOS) open-source sync player FMHY lists**; speaks the Syncplay protocol; KMP **(inferred from language)** |
| [Syncplay](https://github.com/Syncplay/syncplay) | ⭐ App | yes | 2,693★ / 2026-09-13 / Apache-2.0 | mpv / VLC / MPC sync |
| [WatchParty](https://github.com/howardchung/watchparty) | ⭐ Online / virtual browser | yes | 1,245★ / 2026-10-10 / MIT | web |
| [neko](https://github.com/m1k1o/neko) | ⭐ Docker virtual browser | yes | 22,469★ / 2026-10-07 / Apache-2.0 | WebRTC screen-share model, not media sync |
| [SyncWatch](https://github.com/Semro/syncwatch) | ⭐ Extension | yes | 180★ / **2025-05-11** / MIT | stale |
| [Metastream](https://github.com/samuelmaddock/metastream) | Extension | yes | 2,646★ / 2026-07-08 / none | discontinued (per the similar-apps doc) |
| [VideoTogether](https://github.com/VideoTogether/VideoTogether) | App / extension | yes | 1,784★ / 2026-02-09 / MIT | syncs `<video>` on any site |
| [MovieNight](https://github.com/zorchenhimer/MovieNight) | Docker | yes | 726★ / 2026-08-24 / MIT | single-stream server + chat |
| [SyncLounge](https://github.com/synclounge/synclounge) | Plex Tools | yes | 1,133★ / 2026-10-10 / MIT | Plex sync |
| [Synko](https://github.com/Skaytacium/synko) | Kodi Tools | yes | 10★ / 2024-01-20 / MIT | stale |
| Watch2Gether ⭐, Kosmi ⭐, HyperBeam, OpenTogetherTube / TurtleTV, Caracal Club, Mzelo, SyncUp, CyTube, CinevoSync, baked.live, Rave | online players | mostly closed (CyTube / OpenTogetherTube are open, **inferred**) | — | product references |
| Stream Lounges (new Oct 2026): cytube, psp-tv (`sync.coconono.org`), Baked.live, TTN, React.tv | rooms + chat | — | — | [post](https://github.com/fmhy/edit/blob/main/docs/posts/oct-2026.md) |
| Streaming sites tagged "Watch Parties" by FMHY | CinemaOS (Indian section), Cinezo (Spanish section) | no | — | both are also embed APIs (§3a) |
| "Stremio Sync" ([nuviosync.com](https://nuviosync.com/)), StrexoPlayer "w/ Stremio Sync" | apps | — | — | **Not playback sync**: account / addon sync **(inferred from the names)** |
| New on GitHub (not on FMHY): [Sero01/watchparty](https://github.com/Sero01/watchparty) (HLS + WebRTC voice, mobile-first; 0★, 2026-09-22), [kutsibalci/watch-party-sync-engine](https://github.com/kutsibalci/watch-party-sync-engine), [jaupi-enrico/streamio](https://github.com/jaupi-enrico/streamio) | search "watch party hls sync" | yes | small | reference only |

---

## 4. GitHub table: most relevant repos pushed within ~90 days

Search: logged-out `github.com/search?type=repositories&s=updated` for the nine requested queries plus "nuvio hindi",
"vega app providers", "movy.sx", "hindi dub hls" and "watch party react native". Metadata comes from `api.github.com`.
No search hit references the VidFast-style command API ("vidfast watch party" and "nuvio watch party" returned no
repos).

| # | Repo | ★ | Last push | License | Kind | What it is | Hindi | New since 09-01 vs the landscape report? |
|---|---|---|---|---|---|---|---|---|
| 1 | [vega-org/vega-app](https://github.com/vega-org/vega-app) | 1,521 | 2026-10-10 | NOASSERTION | **App (React Native / Expo 57)** | Android-first stream / cast app; `react-native-video`, Google Cast, WebView; providers loaded from a separate repo | via providers (India-heavy) | **New** (not in any prior doc); moved from Zenda-Cross |
| 2 | [Zenda-Cross/vega-providers](https://github.com/Zenda-Cross/vega-providers) | 85 | 2026-10-10 | none | Plugin repo (TS) | 58 providers; contract `getPosts/getMeta/getStream/getEpisodes` | yes (VegaMovies, MoviesDrive, HDHub4u, 4khdHub, NetMirror family, Castle, AnimeSalt…) | **New** |
| 3 | [PadhleYrr/nuvio-vega-providers](https://github.com/PadhleYrr/nuvio-vega-providers) | 0 | 2026-09-29 | none | Plugin repo (converter output) | "All 65 Nuvio providers converted for Vega app" | inherits AIO's | **New**; shows Nuvio plugins port to a second host |
| 4 | [Inside4ndroid/TMDB-Embed-API](https://github.com/Inside4ndroid/TMDB-Embed-API) | 146 | 2026-08-19 | MIT | Resolver server (Node, Docker) | 13 providers (Showbox / FebBox, 4KHDHub, VixSrc, Videasy, Vidlink, VaPlayer, CastleTV, HDGharTV, NetMirror, OneTouchTV, ZXCStreams…), quality / codec filters, optional m3u8 / ts proxy that strips `headers` | inferred (HDGharTV, NetMirror, Castle) | **New to Bearoom docs**; server-side, so it conflicts with on-device; its proxy design is a reference |
| 5 | [sharoon7171/vidcore-io-stream-resolver](https://github.com/sharoon7171/vidcore-io-stream-resolver) | 14 | 2026-09-22 | none | Resolver library (TS) | vidcore.io TMDB → HLS; "seals and decrypts the catalog natively" | — | Partly known (the sharoon7171 family); relevant because VidCore documents watch-party commands |
| 6 | [ArabibZ/nuvio-providers](https://github.com/ArabibZ/nuvio-providers) | 0 | 2026-10-06 | none | Nuvio plugin repo | "Native Nuvio provider collection. MovieBox public beta" | MovieBox (inferred) | **New**, unproven |
| 7 | [wGodfather/BOAT](https://github.com/wGodfather/BOAT) | 4 | 2026-10-05 | none | Nuvio plugin | "B.O.A.T provider for Nuvio" (created 10-03) | unknown | **New**, unproven |
| 8 | [EhsanulHaqueSiam/nuvio-hindi-dub](https://github.com/EhsanulHaqueSiam/nuvio-hindi-dub) | 0 | 2026-10-05 | none | Nuvio / Stremio **catalog** addon | anime with an official Hindi dub, newest first | yes (catalog only, no streams) | **New** |
| 9 | [RickyShen16/Ricky-Addon](https://github.com/RickyShen16/Ricky-Addon) | 0 | 2026-10-02 | none | Stremio addon | "VidSrc Scraper… 4K/1080p, English/Tamil/Hindi" | claimed | **New**, low credibility |
| 10 | [xre000001-ai/raretoons-stremio](https://github.com/xre000001-ai/raretoons-stremio) | 3 | 2026-10-02 | none | Stremio addon (Python) | rare cartoons / anime, Hindi dubbed, index-only | yes | **New** |
| 11 | [SH0MIK/Anivault-Scraper](https://github.com/SH0MIK/Anivault-Scraper) | 24 | 2026-10-01 | none | Resolver API (TS) | anime m3u8 / MP4 from several sites, **desidubanime as the Hindi dub source** | yes (anime) | Listed in `github-references.md` (Tier 4) without the Hindi angle |
| 12 | [ayman708-UX/PlayTorrioV3](https://github.com/ayman708-UX/PlayTorrioV3) | 389 | 2026-10-05 | GPL-3.0 | App (Dart) | cross-platform streaming app, Stremio addon support, HTTP plugin; FMHY ⭐ | listed in FMHY's Indian section | **New** |
| 13 | [Spyou/Zangetsu](https://github.com/Spyou/Zangetsu) | 388 | 2026-10-09 | GPL-3.0 | App (Dart) | anime / movies / series app, Android / TV / iOS beta | — | **New** |
| 14 | [yuroyami/syncplay-mobile](https://github.com/yuroyami/syncplay-mobile) | 379 | 2026-10-01 | AGPL-3.0 | Sync app | Synkplay: Syncplay client for Android + iOS; FMHY ⭐ | n/a | **New to Bearoom docs** |
| 15 | [Sero01/watchparty](https://github.com/Sero01/watchparty) | 0 | 2026-09-22 | none | Sync app | self-hosted HLS watch party, WebRTC voice, mobile-first | n/a | **New**, tiny |
| — | Stale or known: [D3adlyRocket/Hindi-Nuvio](https://github.com/D3adlyRocket/Hindi-Nuvio) (2026-05-27), [mohameodo/nano](https://github.com/mohameodo/nano) (15★, 2026-09-06), [kerv/movy](https://github.com/kerv/movy) (movy.sx WebView wrapper), [mintugoud21/streamflow-stremio-nuvio](https://github.com/mintugoud21/streamflow-stremio-nuvio) | | | | | | | already in the landscape report or stale |

**Archived / DMCA (HTTP status observed in Playwright today):**
- **451 "Repository unavailable due to DMCA takedown":**
  - [consumet/consumet.ts](https://github.com/consumet/consumet.ts) and
    [consumet/api.consumet.org](https://github.com/consumet/api.consumet.org): **new**.
  - [p-stream/providers](https://github.com/p-stream/providers): known.
- **Archived:**
  - [xp-technologies-dev/p-stream](https://github.com/xp-technologies-dev/p-stream): last push 2026-08-15. FMHY still
    links it as the GitHub for Cinecat / Basement.
  - [vyla-entertainment/stream-api](https://github.com/vyla-entertainment/stream-api): last push 2026-08-04.
- **404:** `movie-web/providers` and `xp-technologies-dev/providers`.
- **Still up (200):** `cool-dev-guy/vidsrc.ts`, `walterwhite-69/*`, `DivineChile/vidsrc-scraper`,
  `sussy-code/providers` (95★, last push 2025-01-30, stale).

---

## 5. What's new vs `github-scraper-landscape-2026-10.md`

1. **Official watch-party command APIs** (VidFast, VidCore.io, VidZen, CinemaOS; partial: Vidlove `SET_TIME`). The
   landscape report covered only scraper / resolver code, and no prior doc records these APIs. This is the most
   actionable item for the party feature:
   - `providers.json` already lists vidfast.
   - Phase-6 QA F1 says the bridge currently works only on videasy.
   - Bearoom's `vidcore` entry points at vidcore.org, not at vidcore.io, which has the commands.
2. **FMHY's current view:**
   - Movy is 🌟 #1 (starred Sept 2026).
   - videasy, cineby and cineplay have been removed.
   - The API list dropped videasy, embed.su and moviesapi. Bearoom's `providers.json` still has videasy, mycineby
     and 111movies (NXDOMAIN today), and the DB seed has embed.su and moviesapi.to. All are candidates for pruning
     after a health check **(inferred)**.
3. **Hindi audio parameters on embeds** (Nxsha `lang=hi`, Cinezo `server=hindi`, Cinetaro and VidCore.org
   multi-audio). Not measured; worth adding to the Hindi-first benchmark as an embed-tier comparison.
4. **The Vega ecosystem:** an RN / Expo app with a TS provider repo, India-focused, plus a Nuvio→Vega converter. It is
   the closest stack match to Bearoom found so far, and none of the prior docs mention it.
5. **More takedowns:** Consumet (both repos 451); the xp-technologies-dev P-Stream repo and Vyla's stream-api are
   archived. The movie-web / P-Stream provider lineage has no live public source on GitHub or Codeberg today.
6. **More Nuvio provider churn.** Created after 10-01: ArabibZ (MovieBox beta, 10-06) and wGodfather/BOAT (10-03).
   Updated in the last few days: KhooLy, maliariza, eakcabag (drama), Gowaru (French, 24★), KennethJYS (Latino,
   15★), InvalidPandaa (German) and others.
   None is Hindi-specific except catalog-only `nuvio-hindi-dub`. **No new Hindi plugin repo has displaced AIO /
   Eclipsia.**
7. **VidAPI.ru serves from `vaplayer.ru`**, the same host family as playimdb / zevran. That adds a third front-end on
   the same backend (one failure domain) **(inferred)**.

## 6. Caveats

- Listing on FMHY is not a safety or legality endorsement. Almost every source here is an unlicensed aggregator; the
  legal note in `streaming-integration-research.md` applies.
- Embed docs are self-descriptions. Nothing in §3a was played or tested, and "Hindi" knobs may not work. Status
  observations come from one load on one network.
- GitHub logged-out search shows 10 results per page. Only the first page was read, plus page 2 of "nuvio providers".
  Star counts are as of today.
