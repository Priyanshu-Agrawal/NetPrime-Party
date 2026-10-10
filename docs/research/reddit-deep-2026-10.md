# Reddit deep-dive for Bearoom — 2026-10-10

**Scope.** Hindi-dub streaming, competitor apps, watch parties, provider churn and embed APIs, from Reddit posts and
comments, mostly from the last 6 months. About 170 threads were read in full or close to it.

**Method.** I read logged out, through the Playwright browser, using `www.reddit.com/*.json` from inside the page.

- `old.reddit.com` now sends logged-out visitors to `/login/?reason=lor2`.
- Plain `curl` gets a 403.
- r/FREEMEDIAHECKYEAH is *restricted*: only pinned posts are visible and in-sub search returns nothing. I used its
  public wiki changelog (`/r/FREEMEDIAHECKYEAH/wiki/updates`) instead.
- r/VegaApp is restricted.
- These returned nothing for the year: r/SynclerApp, r/teleparty, r/StreamWatchParty, and in-sub search on
  r/Cloudstream3. Search inside some subs is unreliable.

**Subs covered:** Piracy, PiratingWebsites, PiracyBackup, PiracyArchive, InternetPiracy, StremioAddons, Stremio, Nuvio,
nuvioaddons, NuvioForks, Cloudstream_Help, animeapp, animeindian, AskIndia, IndiaTech, indiasocial, bollywood,
TeenIndia, IndianTeenagers, sideloaded, Cineby, PlayTorrio, LongDistance, StreamingAnime, animepiracy, AndroidTVApps,
Cinema_HD, Malware, jellyfin, JellyfinCommunity, BangaloreSocial, DiscordAlternatives and WebApps.

**How to read this.**
- Comment links have the form `reddit.com/r/<sub>/comments/<post>/comment/<id>/`.
- Dates are the dates the comments were made.
- **(low signal)** marks a claim that rests on one comment, or on a post with no replies.
- Nothing here was verified by visiting the streaming sites.
- The two docs read beforehand (`fmhy-github-index` §1/§5 and `github-scraper-landscape` §1/§4) are not repeated.
  Reddit evidence is cross-referenced to them where it agrees or disagrees.

---

## 1. Hindi / Indian-language dubbed streaming

### 1.1 What users recommend (most-mentioned first)

| Source | Kind | What users say (snippet, date, link) |
|---|---|---|
| **CloudStream + Indian extension repos** (megarepo, phisher, **CNC / "cncv" / CNCVerse**, AnimeWorld, AnimeDekho, Animesalt, Bollyflix, HDHub4u, MoviesMod, Vegamovies, Kartoons, an "MX Player" extension) | Android app with HTTP scrapers | <ul><li>"For indian content i prefer Cloudstream. Also its easier to setup" (2026-04-20, [oh9vowd](https://reddit.com/r/Piracy/comments/1sqf8p9/comment/oh9vowd/))</li><li>"it's just the multi language options, stremio works better for English language content" (2026-04-20, [oh7ql8i](https://reddit.com/r/Piracy/comments/1sqf8p9/comment/oh7ql8i/))</li><li>"Cloudstream has a lot of Extensions with different Languages supported like Hindi 100%" (2026-09-17, [pag3hd6](https://reddit.com/r/StremioAddons/comments/1wiq9ir/comment/pag3hd6/))</li><li>"type megarepo … m player for all movies/series on mx player then animeworldindia … extensions that have ur countries flag" (2026-07-12, [ox1jzg3](https://reddit.com/r/InternetPiracy/comments/1utdqga/comment/ox1jzg3/))</li><li>"Use playtorrio, or cloudstream with CNC verse extension" for Hindi serials (2026-09-22, [pbc7u3z](https://reddit.com/r/PiracyBackup/comments/1t4o3m6/comment/pbc7u3z/))</li><li>"when I can just play the show on cloudstream from those site then why bother" (2026-02-17, [o5u7yb1](https://reddit.com/r/StremioAddons/comments/1r714r4/comment/o5u7yb1/))</li></ul> |
| **HDHub4u / 4KHDHub** (Stremio addon "hdhub", Nuvio plugin, CloudStream extension) | DDL site scraped into apps | <ul><li>"i love hdhub its the best atleast for me" (2026-09-18, [panw5kv](https://reddit.com/r/StremioAddons/comments/1wjr5ta/comment/panw5kv/))</li><li>"Install HDhub addon for Indian stuff" (2026-06-25, [oto257z](https://reddit.com/r/AskIndia/comments/1uefxfi/comment/oto257z/))</li><li>An Indian user's working list: "VidFast HDHub TorrentsDB PenguPlay" (2026-08-07, [post](https://reddit.com/r/Nuvio/comments/1vhqonn/))</li></ul>**Complaints:**<ul><li>"Many hindi file i don't f[ind] there" (2026-09-18, [pal5545](https://reddit.com/r/StremioAddons/comments/1wjr5ta/comment/pal5545/))</li><li>Junk "10Gbps download only" entries in results (2026-10-05, [pe2pxis](https://reddit.com/r/nuvioaddons/comments/1wxincd/comment/pe2pxis/))</li></ul> |
| **NetMirror** (Netflix / Prime / Hotstar "mirror" app and site, Hindi dubs) | APK + website | Very popular with Indian teens: "netmirror best" (2026-09-30, [pd0muwf](https://reddit.com/r/TeenIndia/comments/1wu78pn/comment/pd0muwf/)).<br>**Problems:**<ul><li>"after I have watched 2 hrs or 3 hrs it just keeps buffering" (2026-08-12, [p36a5jr](https://reddit.com/r/PiratingWebsites/comments/1vlc11g/comment/p36a5jr/))</li><li>"keeps changing domain … website has small library compared to app" (2026-08-12, [p38xiab](https://reddit.com/r/PiratingWebsites/comments/1vlc11g/comment/p38xiab/))</li><li>Malware write-up (see §4)</li></ul> |
| **MovieBox** (moviebox.ph / .id; preinstalled Palm Store on Transsion phones) | APK / site | <ul><li>"moviebox.ph aur Netmirror pr sabhi movies mily gy lekin quality mostly 720p" (2026-06-14, [ork39r3](https://reddit.com/r/Piracy/comments/1u3qlkd/comment/ork39r3/))</li><li>Went paid in August (see §4)</li></ul> |
| **PenguPlay** (pengu.uk, free HTTP addon) | Stremio / Nuvio addon | <ul><li>"Thanks penguplay worked" for Hindi audio on K-dramas (2026-09-09, [p8rnicr](https://reddit.com/r/nuvioaddons/comments/1wbmpqz/comment/p8rnicr/))</li><li>vs "penguplay is so bad in asia I don't even know why people preach about it" (2026-09-18, [pan2gnc](https://reddit.com/r/StremioAddons/comments/1wjr5ta/comment/pan2gnc/))</li><li>Buffering since late September (§4)</li></ul> |
| **multimovies.casa** | Hindi-dub site (Filemoon / StreamHG / EarnVids hosts) | <ul><li>Top answer, 7 points, to "Best Hindi Dubbed … 1080p To 4K" (2026-09-21, [pb4iiqk](https://reddit.com/r/PiratingWebsites/comments/1wm6apq/comment/pb4iiqk/))</li><li>Has Pokémon Hindi episodes that AIOStreams lacks (2026-09-25, [post](https://reddit.com/r/nuvioaddons/comments/1wpz5s1/))</li></ul> |
| **Nuvio plugin repos with Indian scrapers** | Nuvio JS plugins | <ul><li>CB Providers "Chole Bhature", 31 scrapers including HDHub4u, VegaMovies, MoviesDrive, DesiFlix, Einthusan, Castle, NetMirror and AnimeWorld multi-audio (2026-10-08, [post](https://reddit.com/r/nuvioaddons/comments/1x0wrz2/))</li><li>Eclipsia and All-in-One-Nuvio (2026-08-20, [p4rnun5](https://reddit.com/r/Nuvio/comments/1vt8n2g/comment/p4rnun5/))</li><li>But "Deadly rocket will not receive maintenance anymore. The devs confirmed" (2026-10-08, [peqaq0w](https://reddit.com/r/nuvioaddons/comments/1x0wrz2/comment/peqaq0w/))</li></ul> |
| **Embed sites with "Hindi servers"** | Multi-server sites | <ul><li>7reels.cc "Just need to try different servers for Hindi" (2026-08-19, [p4ozqso](https://reddit.com/r/PiratingWebsites/comments/1vsl1cv/comment/p4ozqso/)) → "the vidbolt server has hindi🔥" (2026-09-10, [p908e9y](https://reddit.com/r/PiratingWebsites/comments/1vsl1cv/comment/p908e9y/))</li><li>youflex.top "2 servers zyra and Bolly for Hindi" (2026-08-19, [p4p1s4f](https://reddit.com/r/PiratingWebsites/comments/1vsl1cv/comment/p4p1s4f/)) **(low signal)**</li><li>cinehd.vc for an MCU film in Hindi (2026-08-19, [p4p88wx](https://reddit.com/r/PiratingWebsites/comments/1vsl1cv/comment/p4p88wx/)) **(low signal)**</li></ul> |
| **Nova Streams** | Free HTTP Stremio addon advertising Hindi, Tamil, Telugu … | Popular post (91 points), but flaky (§4) (2026-08-23, [post](https://reddit.com/r/StremioAddons/comments/1vw259y/)). |
| **Telegram channels** | Last resort | <ul><li>"I see people watching hindi dub all the time from telegram" (2026-08-03, [post](https://reddit.com/r/animeindian/comments/1vegk06/))</li><li>"your last hope is telegram" (2026-09-18, [paif2cj](https://reddit.com/r/nuvioaddons/comments/1wjapn7/comment/paif2cj/))</li><li>Pain: "they force us to join many channels" (2025-10-25, [nl9ny9q](https://reddit.com/r/animeapp/comments/1ofhppe/comment/nl9ny9q/))</li></ul> |
| **Bollywood originals** | Sites / addons | <ul><li>"For Bollywood I use einthusan.tv and desicinemas" (2026-06-12, [or769jl](https://reddit.com/r/Piracy/comments/1u3qlkd/comment/or769jl/))</li><li>"Bharat Binge addon for regional catalogue with Mediafusion and Torrentio" (2026-07-12, [ox484rj](https://reddit.com/r/Nuvio/comments/1uulap7/comment/ox484rj/))</li></ul> |
| **Legal / ad-supported** | YouTube, MX Player, JioHotstar | <ul><li>Muse India, Ani-One India and "Muse Hindi Dub" on YouTube for anime (2026-09-14, [p9rd3ty](https://reddit.com/r/animeindian/comments/1wfywh8/comment/p9rd3ty/))</li><li>"MX player has some but comes with ads" (2026-09-12, [p9dm3dn](https://reddit.com/r/PiratingWebsites/comments/1we9e34/comment/p9dm3dn/))</li></ul> |

For debrid users, Hindi dubs are a weak spot:

- "most hindi dubbed stuff just doesn't get torrented as much so you're kinda stuck with the streaming sites" (2026-02-17,
  [o5u4vl4](https://reddit.com/r/StremioAddons/comments/1r714r4/comment/o5u4vl4/)).
- "You would hardly find any daily soaps on debrid" (2026-10-06,
  [pe61fxx](https://reddit.com/r/nuvioaddons/comments/1wyqmpf/comment/pe61fxx/)).

### 1.2 Reported dead or broken, Hindi-relevant (dates in §4)

- **MovieBox** went paid with a forced update (late August).
- **NetMirror** was down from Sept 22 to Sept 29, and again in early October.
- **7reels.cc** returned 502 / was down (July 31; Sept 21).
- **fluxtv.qzz.io** ("has hindi dub and hindi app language") later showed "It's not available" (2026-07-18,
  [oybj7ks](https://reddit.com/r/PiratingWebsites/comments/1tlfylh/comment/oybj7ks/)).
- **Bingebang** was taken down (2026-09-30, [post](https://reddit.com/r/TeenIndia/comments/1wu78pn/)) **(low signal)**.
- **The Deadly Rocket / AIO Nuvio plugin** is unmaintained.
- **Einthusan addon**: "not working for anyone else?" (2026-09-16, title only,
  [post](https://reddit.com/r/StremioAddons/comments/1whnnpl/)) **(low signal)**.

### 1.3 Common complaints

1. **Hindi simply missing, or only on some episodes.**
   - "I have visited so many sites, but none of them have Hindi servers, even if a site has one, it is not working"
     (2026-08-19, [p4p1fur](https://reddit.com/r/PiratingWebsites/comments/1vsl1cv/comment/p4p1fur/)).
   - Pokémon Hindi was found for S01E01 but not S01E25 (2026-09-25,
     [post](https://reddit.com/r/nuvioaddons/comments/1wpz5s1/)).
   - "I wanted all season … in Hindi", but only seasons 1–2 exist (2026-09-14,
     [p9rte0l](https://reddit.com/r/animeindian/comments/1wfywh8/comment/p9rte0l/)).
   - "people rarely upload Hindi dubbed Hollywood films" (2026-06-12,
     [or8ipuj](https://reddit.com/r/Piracy/comments/1u3qlkd/comment/or8ipuj/)).
2. **Hindi tops out at 720p.**
   - "available in amazon in hindi but i find hard to get it. Or even i get it the quality is just 720p" (2026-09-09,
     [post](https://reddit.com/r/nuvioaddons/comments/1wbmpqz/)).
   - Also [ork39r3](https://reddit.com/r/Piracy/comments/1u3qlkd/comment/ork39r3/).
3. **Wrong default audio track; language preferences ignored.** This is the inverse problem, and it bites Hindi-first
   apps too.
   - Nuvio on Tizen: "Every movies play in Hindi or another language sound track but not the original" (2026-09-01,
     [post](https://reddit.com/r/Nuvio/comments/1w41jn5/); bug NuvioTVSmart#959,
     [paq6r05](https://reddit.com/r/Nuvio/comments/1w41jn5/comment/paq6r05/)).
   - "Always. I typically get Russian" (2026-09-12, [p9fzsq5](https://reddit.com/r/Nuvio/comments/1weqv38/comment/p9fzsq5/)).
   - Nova Streams: "even though you don't select any Indian language they show up" (2026-08-23,
     [p5dn2ho](https://reddit.com/r/StremioAddons/comments/1vw259y/comment/p5dn2ho/)).
   - FrameXTV, from a non-Hindi viewer: "the movie … was in hindi so honestly was kind of useless. being able to choose
     the language would make this the nicest site" (2026-10-06,
     [pe5yr91](https://reddit.com/r/PiracyArchive/comments/1w7yh36/comment/pe5yr91/)).
   - AIOStreams with "hindi in required languages … very few 1-2 max … torrentio standalone shows plenty" (2026-09-19,
     [papv3h4](https://reddit.com/r/StremioAddons/comments/1wjr5ta/comment/papv3h4/)).
4. **Wrong title plays, or labels lie.**
   - "wrong movies open with most providers with older content" (2026-10-08,
     [peomj2p](https://reddit.com/r/nuvioaddons/comments/1x0wrz2/comment/peomj2p/)).
   - "when i click on link there was different anime playing" (2026-09-06,
     [p86o9ua](https://reddit.com/r/nuvioaddons/comments/1w8ndpx/comment/p86o9ua/)).
   - "showing the incorrect media on clicking totally another title" (2026-08-27,
     [p69tm3g](https://reddit.com/r/Piracy/comments/1vzjm40/comment/p69tm3g/)).
   - A feature request for descriptive source names (title, resolution, audio, size, provider) because "many providers
     often return incorrec[t]" matches (2026-06-07, [post](https://reddit.com/r/nuvioaddons/comments/1tzl0n7/)).
   - Missing Hindi streams were fixed by switching metadata from AIOMetadata to TMDB (an ID-mapping bug) (2026-06-10,
     [post](https://reddit.com/r/StremioAddons/comments/1u1qm31/)).
5. **Few working links; buffering.**
   - "Even pengu just offers a few which end up not playing" (2026-09-18,
     [post](https://reddit.com/r/nuvioaddons/comments/1wjapn7/)).
   - "I tried 10+ links … the only one that works was a poor quality 480p" (2026-10-08,
     [pepirrv](https://reddit.com/r/nuvioaddons/comments/1x0wrz2/comment/pepirrv/)).
   - "these http addons are hit or miss truly" (21 points, 2026-08-08,
     [p2dvsbw](https://reddit.com/r/nuvioaddons/comments/1viijsm/comment/p2dvsbw/)).
   - "content loading takes around 15-30seconds" (2026-08-07,
     [p27cf8y](https://reddit.com/r/Nuvio/comments/1vhqonn/comment/p27cf8y/)).
   - "could never get captions in sync with audio, loading takes 1 minute … switched to other sites on fmhy" (2026-08-07,
     [p27zj8m](https://reddit.com/r/Nuvio/comments/1vhqonn/comment/p27zj8m/)).
6. **Indian ISPs block streams; Cloudflare DNS is the folk fix.**
   - "Changing it is a must to play streams in India" (2026-09-19,
     [pav4vo1](https://reddit.com/r/nuvioaddons/comments/1wjapn7/comment/pav4vo1/)).
   - DNS-over-HTTPS with Cloudflare fixed CloudStream buffering (2025-10-25,
     [nlajaav](https://reddit.com/r/animeapp/comments/1ofhppe/comment/nlajaav/)).
7. **The catalogue is weak for Indian content.**
   - "since it use tmdb which is severely lacking in Indian content" (2026-09-06,
     [post](https://reddit.com/r/nuvioaddons/comments/1w8ndpx/)).
   - TMDB "More like this" is poor for Hindi (2026-09-17, title only,
     [post](https://reddit.com/r/Nuvio/comments/1wja0oc/)).
8. **Ads and malware.**
   - vidsrc and vidnet embeds have "incredibly aggressive pop-under ads and redirects that bypass standard ad-blockers"
     (2026-07-15, [oxme29g](https://reddit.com/r/InternetPiracy/comments/1uwuzj0/comment/oxme29g/)).
   - NetMirror is "full of Malware" (2026-09-26,
     [pc7bme5](https://reddit.com/r/AskIndia/comments/1wqnxel/comment/pc7bme5/)).
   - MovieBox asks for "50+ app permissions" (2026-09-12,
     [p9g5wyp](https://reddit.com/r/Piracy/comments/1w2ilgw/comment/p9g5wyp/)).
9. **Dub familiarity matters.** "if we had watched a show … with particular dubbed audio … it's just annoying to watch
   … with different dub audio", i.e. childhood Hindi dubs of Doraemon, Shinchan and Pokémon (2026-09-25,
   [post](https://reddit.com/r/StremioAddons/comments/1wptfof/)).

---

## 2. Competitor apps

### Nuvio (the reference competitor)

**Users love:**
- **UI.** "Nuvio's UI is leagues ahead of Stremio … collections … look like a proper streaming service. Stremio is just
  a list of catalogs" (2026-09-10, [p8yhq0u](https://reddit.com/r/Piracy/comments/1wckbmr/comment/p8yhq0u/)).
- **Skip intro.** (2026-09-11, [p939ps4](https://reddit.com/r/Piracy/comments/1wckbmr/comment/p939ps4/))
- **Downloads.** "The download section alone is worth it" (2026-09-21,
  [pb7gxej](https://reddit.com/r/sideloaded/comments/1wmhzl2/comment/pb7gxej/)).
- **Mobile build.** It is "one of the most stable ones. and very smooth" (2026-09-21,
  [pb72pvd](https://reddit.com/r/sideloaded/comments/1wmhzl2/comment/pb72pvd/)).
- **The new player.** It looks "kinda like apple tv or prime video" (2026-10-10,
  [pf1079a](https://reddit.com/r/Nuvio/comments/1x2covn/comment/pf1079a/)).
- **FMHY stars.** Starred in iOS Streaming (Jan 2026) and Android Streaming (April 2026), per the FMHY wiki changelog.

**Users hate:**
- **iOS.**
  - Pulled from the App Store: "took down nuvio for no reason and won't let the Devs appeal" (2026-08-21,
    [p51hfl2](https://reddit.com/r/sideloaded/comments/1vuexp7/comment/p51hfl2/)).
  - The TestFlight build expires Oct 12 (2026-10-03, [post](https://reddit.com/r/Nuvio/comments/1wwvd7e/)).
  - SideStore free developer teams are getting soft-banned with error `0xe8008024` (2026-10-07,
    [pee9ei0](https://reddit.com/r/Nuvio/comments/1wwvd7e/comment/pee9ei0/)).
  - "i don't want to sideload i don't trust putting my appleid out there", so users ask for a web build (2026-10-07,
    [post](https://reddit.com/r/Nuvio/comments/1x04wda/)).
  - The community web port is "crashing way too many times" (2026-10-07,
    [pei2lqj](https://reddit.com/r/Nuvio/comments/1x04wda/comment/pei2lqj/)).
  - "No airplay to stream to tv" (2026-10-04, [pdq5uax](https://reddit.com/r/Nuvio/comments/1wwvd7e/comment/pdq5uax/)).
- **Audio-language rules are unreliable.** See §1.3 #3. Also: "so my partner can use it as simply as Netflix: click an
  episode, autoplay the first stream, and always use the original audio" — that preference is broken (2026-09-10,
  [post](https://reddit.com/r/Nuvio/comments/1wcf70k/)).
- **Crashes and slow TVs.**
  - "the app just disappears" (2026-07-05, [ovrgxuc](https://reddit.com/r/Piracy/comments/1uoafh6/comment/ovrgxuc/)).
  - "works flawlessly [on phone] … takes endless in TV" on an Android 9 Sony with about 2 GB RAM (2026-08-08,
    [post](https://reddit.com/r/Nuvio/comments/1vipbod/)).
- **Governance.**
  - Forks were banned from r/Nuvio on 09-27 (426 points, [post](https://reddit.com/r/Nuvio/comments/1wrsdct/)).
  - "nuvio does not accept new feature contributions" (2026-09-28,
    [pchckra](https://reddit.com/r/Nuvio/comments/1wrsdct/comment/pchckra/)).
  - Forks are where auto subtitle sync and auto stream selection live (2026-09-29,
    [pcpxwtt](https://reddit.com/r/Nuvio/comments/1wrsdct/comment/pcpxwtt/)).
- **Play Store.** Back on 2026-10-02 as beta 0.8 ([post](https://reddit.com/r/Nuvio/comments/1wvxty2/)). The Play
  version "doesn't do automatic trailers" ([pecbqh9](https://reddit.com/r/Nuvio/comments/1wvxty2/comment/pecbqh9/)).

### Stremio

- **The June paywall backlash** was the biggest competitor event of the year.
  - "You can't call it a donation if you're locking features behind a paywall" (1,497 points, 2026-06-09,
    [oqpfv1n](https://reddit.com/r/Piracy/comments/1u1fk9z/comment/oqpfv1n/)).
  - "lets make child safety a paid feature" (515 points,
    [oqphpp1](https://reddit.com/r/Piracy/comments/1u1fk9z/comment/oqphpp1/)).
  - A 2,241-point "uninstalled stremio" thread (2026-06-10, [post](https://reddit.com/r/Piracy/comments/1u2ifz1/)).
- **Player bugs.**
  - "most stuff has no sound … same stuff under same torrentio has sound on Nuvio" (2026-06-11,
    [oqzzze8](https://reddit.com/r/Piracy/comments/1u2ifz1/comment/oqzzze8/)).
  - "heaven forbid you dare to time skip … [sound is] gone now and only a hard restart will get it back" (2026-06-11,
    [or3gwby](https://reddit.com/r/Piracy/comments/1u2ifz1/comment/or3gwby/)).
- **India onboarding.**
  - "not available in playstore for Indian users" (2026-06-24,
    [otjnap4](https://reddit.com/r/AskIndia/comments/1uefxfi/comment/otjnap4/)).
  - Out of the box it "redirects me to the amazon or Netflix where it asks me for subscription" (2026-06-25,
    [otoxodw](https://reddit.com/r/AskIndia/comments/1uefxfi/comment/otoxodw/)).
  - "I can't change the quality while watching something" (2026-06-25,
    [otpbxt3](https://reddit.com/r/AskIndia/comments/1uefxfi/comment/otpbxt3/)).
  - "I need an app for some free movies, i don't understand addons" (2026-09-10,
    [p90z7bv](https://reddit.com/r/AskIndia/comments/1uefxfi/comment/p90z7bv/)).
- **Simplicity and web.**
  - "Wife likes stremio cause it's simpler" (2026-09-10,
    [p8yogif](https://reddit.com/r/Piracy/comments/1wckbmr/comment/p8yogif/)).
  - The web app works on iOS (2026-10-07, [ped2x04](https://reddit.com/r/Piracy/comments/1wzjqnq/comment/ped2x04/)).

### CloudStream

- **Users love:**
  - It is the best for Indian and multi-language content (§1.1).
  - "I have yet to see any streaming app that is better than Cloudstream in http streaming … 4k or in HDR … without any
    glitch" (2026-08-08, [p2e5vpq](https://reddit.com/r/nuvioaddons/comments/1viijsm/comment/p2e5vpq/)).
- **Users hate:**
  - Android only; no Tizen (2026-04-20,
    [ohdp9j7](https://reddit.com/r/Piracy/comments/1sqf8p9/comment/ohdp9j7/)).
  - "takes a significant amount of time to load videos and constantly buffers", vs AniStation (2026-09-25,
    [post](https://reddit.com/r/animeapp/comments/1wpl7pe/)).
  - "often doesn't load the sites" (2026-04-28,
    [oiqtleb](https://reddit.com/r/Piracy/comments/1sqf8p9/comment/oiqtleb/)).
- **Bridging is a trend.**
  - CNC Bridge runs CloudStream extensions as a Nuvio HTTPS addon (136 points, 2026-09-28,
    [post](https://reddit.com/r/nuvioaddons/comments/1wsaok4/)).
  - Its catch: "links may take 30sec to load" ([pcqyjh1](https://reddit.com/r/nuvioaddons/comments/1wsaok4/comment/pcqyjh1/)).
  - PlayTorrio added CloudStream extension support on mobile and desktop (2026-09-18,
    [post](https://reddit.com/r/PlayTorrio/comments/1wjq0nl/)).

### Vega (the closest stack peer)

Barely discussed on Reddit; the sub is restricted.

- "Unlike cloudstream, nuvio, stremio. Vega doesn't have much providers. And it's not well known either. But its working
  just fine" (2026-09-23, [pc8jo3e](https://reddit.com/r/Cinema_HD/comments/1wokn3p/comment/pc8jo3e/)).
- In the same thread: zenda-cross providers added but "the video doesn't play"
  ([pbtaqv7](https://reddit.com/r/Cinema_HD/comments/1wokn3p/comment/pbtaqv7/)).
- "using vega for months and i want to change it up … another app that has great ui" (2026-04-08,
  [post](https://reddit.com/r/Piracy/comments/1sg0fsp/)) **(low signal)**.
- Search noise: Amazon's "Vega OS" Fire Sticks pollute "vega app" results.

### PlayTorrio

- **What it is.** Flutter, an mpv-based player, Stremio addons and a "111477" HTTP engine (2026-03-31,
  [post](https://reddit.com/r/Piracy/comments/1s8md1y/)). It is used in India as the MovieBox replacement
  ([p9cohdw](https://reddit.com/r/PiracyBackup/comments/1t4o3m6/comment/p9cohdw/)).
- **Users hate:**
  - "PlayTorrio only have the info of this show and not the episodes" (2026-09-22,
    [pbcckkd](https://reddit.com/r/PiracyBackup/comments/1t4o3m6/comment/pbcckkd/)).
  - Antivirus flags it as a trojan (2026-05-21, [post](https://reddit.com/r/Piracy/comments/1tjppvr/)).
  - "no option to set a default audio and subtitle language? … the very first feature I'd implement" (2026-05-19,
    [ommzinf](https://reddit.com/r/Piracy/comments/1s8md1y/comment/ommzinf/)).
  - Subtitle settings revert on Android TV ([ojgnzj9](https://reddit.com/r/Piracy/comments/1s8md1y/comment/ojgnzj9/)).
  - On Android TV it "constantly crashes … continue watching doesn't work" (2026-09-21,
    [pb5z1fn](https://reddit.com/r/PlayTorrio/comments/1wjq0nl/comment/pb5z1fn/)).

### Others

- **Flixclusive.** Effectively dead: "UI looked great … but it just shows errors and retrys" (2025-11-25,
  [nqpxvoe](https://reddit.com/r/PiracyBackup/comments/1p658br/comment/nqpxvoe/)).
- **Syncler.** Only appears in lists ([ovqs3gm](https://reddit.com/r/Piracy/comments/1uoafh6/comment/ovqs3gm/)); no
  2026 posts found **(low signal)**.
- **Zangetsu** (anime). Active, v2.2 on 09-21 ([post](https://reddit.com/r/animeapp/comments/1wmc2r7/)).
  - "in-built player causing lag" ([pb9arbj](https://reddit.com/r/animeapp/comments/1wmc2r7/comment/pb9arbj/)).
  - "audio isnt working on the reanime extension" ([pb79lcq](https://reddit.com/r/animeapp/comments/1wmc2r7/comment/pb79lcq/)).
  - A Cloudflare issue on iOS ([pb645ni](https://reddit.com/r/animeapp/comments/1wmc2r7/comment/pb645ni/)).
- **SceneBox** (iOS IPA).
  - Forced sign-up was criticised, and a guest mode was added (2026-08-22,
    [p586kd3](https://reddit.com/r/sideloaded/comments/1vuexp7/comment/p586kd3/)).
  - "only request would be … chromecast or airplay" ([p5fytst](https://reddit.com/r/sideloaded/comments/1vuexp7/comment/p5fytst/)).
- **Harbor** (Stremio front-end with Watch Together).
  - Its site is "vibe coded" and burns 70–80% CPU (2026-07-27,
    [p03si9a](https://reddit.com/r/Piracy/comments/1v79x9g/comment/p03si9a/)).
  - Watch Together "keeps disconnecting every few minutes" (2026-07-23,
    [post](https://reddit.com/r/StremioAddons/comments/1v3ydwa/)) **(low signal)**.
- **Strand** (iOS App Store). Recommended as a Nuvio replacement but "too much" money (2026-10-04,
  [pdqg13t](https://reddit.com/r/Nuvio/comments/1wwvd7e/comment/pdqg13t/)).
- **MX Player / JioHotstar.**
  - These are the legal fallbacks: "Try YouTube or MX Player for free/ad-supported" (2026-09-26,
    [pc5i7ht](https://reddit.com/r/AskIndia/comments/1wqnxel/comment/pc5i7ht/)).
  - Indians use Teleparty with Netflix and Prime (2026-09-18, [post](https://reddit.com/r/BangaloreSocial/comments/1wjvhl4/)).
- **Website-first users.** "Most websites … fine on a computer but super jank on a phone" (2026-10-06,
  [post](https://reddit.com/r/Piracy/comments/1wzao8v/)).
- **iOS web players.** They "open in the native iOS player. And that player won't show subtitles unless they're already
  embedded" (2026-09-22, [post](https://reddit.com/r/PiratingWebsites/comments/1wnlgdn/)).

---

## 3. Watch party

### 3.1 What people use

**Discord screen share** is the default.
- "You can stream your screen on discord … Works on pretty much any pirate site" (2026-06-24,
  [otifoh9](https://reddit.com/r/PiratingWebsites/comments/1ue9x9i/comment/otifoh9/)).

**Countdown sync**, i.e. "you send her a link and she presses start at the same time" (2026-05-08,
[okq3uoj](https://reddit.com/r/Piracy/comments/1t7ln13/comment/okq3uoj/)).

**Syncplay** (with VLC/mpv; works across Stremio and Nuvio).
- "you don't need to use the same app, he can still use stremio and you can still use nuvio" (2026-07-06,
  [ovuqb40](https://reddit.com/r/Nuvio/comments/1unxmpk/comment/ovuqb40/)).
- An automation-script guide (2026-07-06, [post](https://reddit.com/r/Nuvio/comments/1uoqt9w/)).
- Each viewer must paste their own link "to avoid using the same RealDebrid api token" (2025-12-18,
  [nunixhp](https://reddit.com/r/StremioAddons/comments/1pom831/comment/nunixhp/)).

**Plezy "Watch Together"** (Plex client).
- "uses a relay … you create a room and share a code, then the host selects a movie" (2026-09-23,
  [pbn4myj](https://reddit.com/r/jellyfin/comments/1wjzti0/comment/pbn4myj/)).
- It worked where Jellyfin SyncPlay "never worked reliably"
  ([pbk15cg](https://reddit.com/r/jellyfin/comments/1wjzti0/comment/pbk15cg/)).

**Jellyfin SyncPlay.**
- Recommended for self-hosters ([palyph7](https://reddit.com/r/Piracy/comments/1wjwabh/comment/palyph7/)).
- Broken after the v12 rewrite (2026-09-18, [post](https://reddit.com/r/jellyfin/comments/1wjzti0/)).
- Not available on Android TV (2026-09-09, [post](https://reddit.com/r/JellyfinCommunity/comments/1wbxvs9/)).

**Teleparty, Rave, Kosmi, Hyperbeam, Watch2Gether, Metastream, Google Meet.**
- "Google meet works with all streaming services" (2026-07-28,
  [p0cqu26](https://reddit.com/r/LongDistance/comments/1v9c6h9/comment/p0cqu26/)).
- Rave: "infelizmente ele não existe mais no iPhone" (2026-08-16,
  [p40qgdx](https://reddit.com/r/Nuvio/comments/1vmvqcx/comment/p40qgdx/)) **(low signal)**.

**Built-in site parties.**
- Cineby had one before its rebrand: "Cineby had that feature but since they are branding the new website does not have
  it" (2026-10-01, [post](https://reddit.com/r/Piracy/comments/1wurpwq/)).
- AnimeKai's room link: "If either person paused, resumed, or skipped … it updated for both of us" (2026-06-27,
  [post](https://reddit.com/r/PiratingWebsites/comments/1uh7uz8/)).
- HiAnime's w2g is "officially down since a few months" (2026-09-03,
  [post](https://reddit.com/r/animepiracy/comments/1w69yoa/)).
- popcornmovies.ac "start share party" with chat (2026-09-06,
  [p85y7ig](https://reddit.com/r/LongDistance/comments/1w8vic1/comment/p85y7ig/)).
- A couple used cinemaos.live together (2026-09-27, [post](https://reddit.com/r/BestOfFreeStreaming/comments/1wruj6s/))
  **(low signal)**.
- FMHY added a **"Stream Lounges"** section in October 2026: "sites that stream … random movies or shows, and generally
  include chatrooms" (FMHY wiki changelog).

**App-level options.**
- The ysosrs NuvioTV fork "has it" (2026-10-04,
  [pdv1nnm](https://reddit.com/r/Nuvio/comments/1wxn6qv/comment/pdv1nnm/)).
- "There's an extension available on cloudstream, but I couldn't find any for Nuvio" (2026-09-05,
  [p7wsopm](https://reddit.com/r/Nuvio/comments/1w6rfky/comment/p7wsopm/)).
- Peario (Stremio): "Peario não funciona há anos" (2026-08-16,
  [p3ygtrc](https://reddit.com/r/Nuvio/comments/1vmvqcx/comment/p3ygtrc/)).

### 3.2 What breaks

- **Screen-share audio and quality.**
  - "the piracy platforms had no audio shared through the screen share" (2026-05-08,
    [post](https://reddit.com/r/Piracy/comments/1t7ln13/)).
  - No internal audio when sharing from Android 10 (2026-02-07,
    [o41py39](https://reddit.com/r/Piracy/comments/1qy5ahw/comment/o41py39/)).
  - "Discord streams look like shit with gigabit upload and nitro" (2026-01-08,
    [nybirgd](https://reddit.com/r/StremioAddons/comments/1pom831/comment/nybirgd/)).
  - "discord stream audio is *horrid*" (2026-07-28,
    [p0d4yvc](https://reddit.com/r/LongDistance/comments/1v9c6h9/comment/p0d4yvc/)).
- **DRM / black screen.**
  - "discord won't show the shared screen if it's a movie"; the fix was turning off hardware acceleration (2026-07-28,
    [post](https://reddit.com/r/LongDistance/comments/1v9c6h9/)).
  - Hyperbeam "plays audio and subtitles but not actually the video" (2025-12-17,
    [nugp8q7](https://reddit.com/r/StremioAddons/comments/1pom831/comment/nugp8q7/)).
  - Pirate sites inside party tools: "tried … (watch party, kosmi, hyperbeam) but i can't get shit to work" (2026-06-23,
    [post](https://reddit.com/r/Piracy/comments/1udu36f/)) **(low signal)**.
- **Desync, one person buffering, different cuts.**
  - "the sync part can be a pain if one person's connection buffers even a little … off by a few seconds half the time …
    a slightly different cut or framerate" (2026-07-28,
    [p0cm94j](https://reddit.com/r/LongDistance/comments/1v9c6h9/comment/p0cm94j/)).
  - Countdown "works until someone needs to pause" (2026-05-08,
    [okqbsdd](https://reddit.com/r/Piracy/comments/1t7ln13/comment/okqbsdd/)).
- **Region locks.**
  - Teleparty fails "due to different country licenses" (2026-07-28,
    [post](https://reddit.com/r/LongDistance/comments/1v9c6h9/)).
  - Disney+ Malaysia ↔ US lands on the home page (2026-08-19, [post](https://reddit.com/r/LongDistance/comments/1vsdhqa/)).
  - popcornmovies "doesn't work without a VPN" from Iran (2026-09-08,
    [p8inu14](https://reddit.com/r/LongDistance/comments/1w8vic1/comment/p8inu14/)).
- **Dead or janky party sites.**
  - "most of them are pretty janky when it comes to watch parties" (2026-08-20,
    [post](https://reddit.com/r/PiratingWebsites/comments/1vtclmj/)).
  - "i miss when rabbit just worked" (2026-06-24,
    [otisyr2](https://reddit.com/r/PiratingWebsites/comments/1ue9x9i/comment/otisyr2/)).
  - An invite-only party site "doesn't work" (2026-09-13,
    [p9lkwmp](https://reddit.com/r/PiratingWebsites/comments/1weah02/comment/p9lkwmp/)).
  - "Nebula Sports" has a watch-party button, but "3200 views and no one knows" how to join (2026-09-01,
    [p79i51o](https://reddit.com/r/nuvioaddons/comments/1vudkx9/comment/p79i51o/)) **(low signal)**.
- **TV and mobile.**
  - "The goal is to watch on TV together in full quality full experience" (2026-08-13,
    [p3fc7xq](https://reddit.com/r/Nuvio/comments/1vmvqcx/comment/p3fc7xq/)).
  - Peario "seems to be for the browser, that wouldn't work … on TV" (2026-08-13,
    [p3fc27p](https://reddit.com/r/Nuvio/comments/1vmvqcx/comment/p3fc27p/)).
  - A request for a fork on Windows/Mac (2026-10-10, [post](https://reddit.com/r/NuvioForks/comments/1x2bx91/))
    **(low signal)**.
- **Platform blocks.** "Discord had its video streams blocked in our country" (Brazil, 2026-10-09,
  [pev9ipk](https://reddit.com/r/DiscordAlternatives/comments/1x19y8k/comment/pev9ipk/)) **(low signal, regional)**.

### 3.3 What people ask for

- **A native watch party in the app they already use.** This is one of the most-requested Nuvio features.
  - "+1 for watch party!", 44 points (2026-08-20, [post](https://reddit.com/r/Nuvio/comments/1vte98z/)).
  - "I could get so many friends on this app for watch parties. It would be my most used feature" (2026-08-20,
    [p4vqm7l](https://reddit.com/r/Nuvio/comments/1vte98z/comment/p4vqm7l/)).
  - "Would pay for this if it's part of support tier" (2026-08-21,
    [p4yxvvg](https://reddit.com/r/Nuvio/comments/1vte98z/comment/p4yxvvg/)).
  - **India-specific willingness to pay:** "Agr to watch party agya bdhiya se to im ready to contribute smthn bawa via upi"
    (2026-09-03, [p7m5c2o](https://reddit.com/r/TeenIndia/comments/1w6ch6q/comment/p7m5c2o/)).
- **Pause propagates to everyone, but with control.**
  - "If she pauses on her end does it pause my nuvio stream as well?" → "That's how Amazon's watch together works"
    (2026-08-13, [p3d47ks](https://reddit.com/r/Nuvio/comments/1vmvqcx/comment/p3d47ks/)).
  - In Rave, a guest's pause becomes a request to the room owner (2026-08-16,
    [p3ygomi](https://reddit.com/r/Nuvio/comments/1vmvqcx/comment/p3ygomi/)).
- **Each viewer plays their own copy (no restreaming), at full quality, on a TV.** See p3fc7xq above.
  - "Both of you can just create stremio accounts and stream the movies separately" (2026-02-07,
    [o4446qe](https://reddit.com/r/Piracy/comments/1qy5ahw/comment/o4446qe/)).
- **Room plus link or code, no sign-up.**
  - The AnimeKai description above.
  - Plezy room codes (pbn4myj).
  - WatchAlong (a vendor post) lists the competitors' failures as "Limited platform support / Separate apps for
    communication / Complicated setup / Mandatory sign-ups" (2026-07-25,
    [post](https://reddit.com/r/WebApps/comments/1v62n77/)) **(vendor self-promo)**.
- **Chat and voice in the same place** ("Trying to avoid discord", p3fc7xq). WatchAlong pitches built-in video chat,
  sticker reactions and drawing on the frame **(vendor)**.
- **Intro skip and episode alignment.** "We're watching anime and have to manually skip through the intro and then give
  our times. Then count down" (2025-12-17, [post](https://reddit.com/r/StremioAddons/comments/1pom831/)).
- **Deep-link "start at t".** An embed-API user asks: "does it has start at url parameter for watchparty things?"
  (2026-08-18, [p4hd0nl](https://reddit.com/r/StreamingAnime/comments/1v1vwyy/comment/p4hd0nl/)) **(low signal)**.

---

## 4. Provider churn and shutdown news (focus on August–October 2026)

| Date (comment date) | Provider | What Reddit reports | Source |
|---|---|---|---|
| 2026-06-06 | Cineby / Bitcine / Fmovies | New domains after the registrar (njalla) acted; Kakao blamed | [post, 1,007 pts](https://reddit.com/r/Piracy/comments/1tyas39/), [oq2qmve](https://reddit.com/r/Piracy/comments/1tyas39/comment/oq2qmve/) |
| June 2026 | AnimeKai + yflix | Removed from FMHY: "datacenter caught fire" | FMHY wiki changelog |
| 2026-07-05 | videasy | "Authenticating your browser before continuing" during certain hours (DDoS-Guard) | [post](https://reddit.com/r/Piracy/comments/1untu78/), [ovnfkq4](https://reddit.com/r/Piracy/comments/1untu78/comment/ovnfkq4/) |
| 2026-07-11 | MovieBox | Points system removed, price "too high", ads | [post](https://reddit.com/r/InternetPiracy/comments/1utdqga/) |
| 2026-07-31 / 09-21 | 7reels.cc | 502, then down | [post](https://reddit.com/r/PiratingWebsites/comments/1vbdy6d/), [post](https://reddit.com/r/PiracyBackup/comments/1wm55fw/) |
| 2026-08-11 | vidfast / videasy / mapple | One user: "404 movie not found" on every device for a month **(low signal)** | [post](https://reddit.com/r/PiratingWebsites/comments/1vlk114/) |
| 2026-08-18 | Cineby | "shutting down on 26 Aug" | [p4dmq9m](https://reddit.com/r/Cineby/comments/1vqzq5l/comment/p4dmq9m/) |
| 2026-08-21 | Nuvio (iOS) | Removed from the App Store, cited as part of "Apple's recent takedowns of multiple apps" | [p511kui](https://reddit.com/r/sideloaded/comments/1vuexp7/comment/p511kui/), [p51hfl2](https://reddit.com/r/sideloaded/comments/1vuexp7/comment/p51hfl2/) |
| 2026-08-22 | vidlink | "struggling in the past month, but right now its back on track" **(low signal)** | [post](https://reddit.com/r/PiratingWebsites/comments/1vvfn26/) |
| 2026-08-23 → 08-29 | Nova Streams addon | Moved to a free Render server, then many "not working anymore"; dev: "Reinstall pls" | [post](https://reddit.com/r/StremioAddons/comments/1vw259y/), [p5sa7pr](https://reddit.com/r/StremioAddons/comments/1vw259y/comment/p5sa7pr/) |
| **2026-08-25 / 08-27** | **videasy** | "Videasy is getting shut down" (148 pts). Shutdown date "15th of September". "this one provides the api that many sites use". "Cineby runs videasy/vidking" | [post](https://reddit.com/r/Piracy/comments/1vzjm40/), [p5rw2v0](https://reddit.com/r/Piracy/comments/1untu78/comment/p5rw2v0/), [p661enn](https://reddit.com/r/Piracy/comments/1vzjm40/comment/p661enn/), [p6k6lzt](https://reddit.com/r/Piracy/comments/1vzjm40/comment/p6k6lzt/) |
| 2026-08-30 | MovieBox | Forced update → "now everything is paid"; old APK refuses to stream | [post](https://reddit.com/r/Piracy/comments/1w2ilgw/), [p75r3y7](https://reddit.com/r/Piracy/comments/1w2ilgw/comment/p75r3y7/) |
| 2026-09-03 | HiAnime | "officially down since a few months" (rumours of arrests are unverified: [pbwja9f](https://reddit.com/r/StreamingAnime/comments/1wnz5ii/comment/pbwja9f/)) | [post](https://reddit.com/r/animepiracy/comments/1w69yoa/) |
| 2026-09-10 | Real-Debrid | "RD had a purge recently which was bigger than the one 2–3 years back"; users move to TorBox | [p8yhh6r](https://reddit.com/r/Piracy/comments/1wckbmr/comment/p8yhh6r/) |
| 2026-09-18 | Cineby | "it's been a month" of "rip cineby" posts | [post](https://reddit.com/r/Cineby/comments/1wjws8a/) |
| 2026-09-20 | videasy | "With Videasy no longer around" → FrameXTV pitched as a replacement embed | [post](https://reddit.com/r/PiracyArchive/comments/1wlvvp3/) |
| 2026-09-22 → 09-29 | NetMirror | "Network Error / Main Page Loading Fail" on app and web for days; fake domains circulate; working again 09-29 | [post, 116 cmts](https://reddit.com/r/AndroidTVApps/comments/1woebsv/), [pbtlj93](https://reddit.com/r/PiratingWebsites/comments/1wp8klg/comment/pbtlj93/), [pcrj3ct](https://reddit.com/r/PiratingWebsites/comments/1wp8klg/comment/pcrj3ct/) |
| 2026-09-23 | AnimeKai | "animekai is back … tho all the data has been lost" → gone again by 10-08 | [pbkpf9p](https://reddit.com/r/StreamingAnime/comments/1wnz5ii/comment/pbkpf9p/), [post](https://reddit.com/r/PiratingWebsites/comments/1x0t37t/) |
| 2026-09-27 | cinemaos.live | Not loading for a CA/US couple **(low signal)** | [post](https://reddit.com/r/BestOfFreeStreaming/comments/1wruj6s/) |
| 2026-09-27 | Nuvio sub | Forks banned → r/NuvioForks | [post](https://reddit.com/r/Nuvio/comments/1wrsdct/) |
| 2026-09-29 | Cineby → cineby.rocks | New domain works on phone but not on TV; old cineby.at used to | [pcu3wz8](https://reddit.com/r/Cineby/comments/1wtgz8x/comment/pcu3wz8/), [pcu452z](https://reddit.com/r/Cineby/comments/1wtgz8x/comment/pcu452z/) |
| 2026-09-29 | FrameXTV | "no popups … but it js doesnt work" **(low signal)** | [post](https://reddit.com/r/PiratingWebsites/comments/1wtph6d/) |
| 2026-09-30 | Bingebang | "taken down" **(low signal)** | [post](https://reddit.com/r/TeenIndia/comments/1wu78pn/) |
| 2026-10-01 | PenguPlay | "was working really well previously but now is buffering" (154 pts); "Pengu has no control over the source" | [post](https://reddit.com/r/nuvioaddons/comments/1wuwx0c/), [pddz4s2](https://reddit.com/r/nuvioaddons/comments/1wuwx0c/comment/pddz4s2/) |
| 2026-10-02 | Nuvio (Android) | Back on the Play Store (beta 0.8) | [post](https://reddit.com/r/Nuvio/comments/1wvxty2/) |
| 2026-10-03 | vidsrc / vidlink | Dev: "VidSrc has too many ads/popups, and VidLink often gets stuck loading" | [post](https://reddit.com/r/PiracyBackup/comments/1wwpfkt/) |
| 2026-10-03 | Nuvio (iOS) | TestFlight build expires on the 12th | [post](https://reddit.com/r/Nuvio/comments/1wwvd7e/) |
| 2026-10-04 → 10-10 | cineby.rocks + cinejoy | Plays nothing; "Now that cineby and cinejoy are down" | [peahr6q](https://reddit.com/r/Cineby/comments/1wxamk1/comment/peahr6q/), [post](https://reddit.com/r/PiratingWebsites/comments/1x25gf0/) |
| 2026-10-05 / 10-06 | 1Shows | Domain moved, accounts lost, back on .org; then banned in Australia (1,238 pts) | [pe0mt24](https://reddit.com/r/Piracy/comments/1wy95ls/comment/pe0mt24/), [post](https://reddit.com/r/Piracy/comments/1wz3q0p/) |
| 2026-10-04 / 10-06 | NetMirror | "down again?" (titles only) **(low signal)** | [post](https://reddit.com/r/TeenIndia/comments/1wxl15w/), [post](https://reddit.com/r/IndianTeenagers/comments/1wz0zy3/) |
| 2026-10-07 | Movy | "can't log in … everything just restarts" **(low signal)** | [post](https://reddit.com/r/PiratingWebsites/comments/1wzpkwm/) |
| 2026-10-07 | MovieBox | TorrentFreak: 300M downloads via Palm Store; Canal+ alerts the EU | [post](https://reddit.com/r/Piracy/comments/1wzvdjl/) |
| 2026-10-08 / 10-09 | Nuvio plugin repos | Deadly Rocket abandoned; CB Providers "dahmermovies … under maintenance" | [peqaq0w](https://reddit.com/r/nuvioaddons/comments/1x0wrz2/comment/peqaq0w/), [petoetw](https://reddit.com/r/nuvioaddons/comments/1x0wrz2/comment/petoetw/) |

**Background**

- **NetMirror malware analysis** (2026-05-18, 147 points, [post](https://reddit.com/r/Malware/comments/1tgfosb/)):
  "clean UI, React Native based … emulator/sandbox detection … Base64-encoded infrastructure domains".
- **P-Stream** was removed from FMHY in April 2026 because its owners "decided to step back" (FMHY wiki).
- **Not discussed on Reddit at all** in the window: Consumet / P-Stream DMCA, castle, vidrock (other than one January
  NetMirror "VidRock server" mention), VidKing, Nxsha and Cinezo.
- **How users explain the churn:**
  - "every site i've seen discontinue service has said it's due to funding, not external pressure" (2026-08-28,
    [p6h6ymj](https://reddit.com/r/Piracy/comments/1vzjm40/comment/p6h6ymj/)).
  - "this happens like every other month … a new site that is almost identical will take its place" (2026-10-05,
    [pe0l3l2](https://reddit.com/r/Piracy/comments/1wy95ls/comment/pe0l3l2/)).

**Reddit agrees with the GitHub doc.** It confirms the videasy → Cineby/Cineplay coupling (one failure domain) and the
mid-September shutdown. It adds the user-facing date "until the 15th [of Sept]" and the Cineby "26 Aug" shutdown.

---

## 5. Embed providers with player or watch-party APIs (developer-facing)

Reddit has **almost no first-hand discussion** of the VidFast / VidCore / VidZen / CinemaOS postMessage watch-party APIs.
It also has none of Nxsha `lang=` or Cinezo `server=hindi`. Those doc claims remain **unvalidated by users**.

**What developers report:**
- **vidsrc / vidnet / vidlink.**
  - Ads that "bypass standard ad-blockers"
    ([oxme29g](https://reddit.com/r/InternetPiracy/comments/1uwuzj0/comment/oxme29g/), 2026-07-15).
  - VidLink "often gets stuck loading" (2026-10-03, [post](https://reddit.com/r/PiracyBackup/comments/1wwpfkt/)).
  - VidLink has a "customizable player … ads arent very excessive" (2026-08-22,
    [post](https://reddit.com/r/PiratingWebsites/comments/1vvfn26/)) **(low signal)**.
  - Advice: "go find the api and use the original m3u8 and mp4 files"
    ([oxn0bu2](https://reddit.com/r/InternetPiracy/comments/1uwuzj0/comment/oxn0bu2/)).
- **CinePro Core.** "some HLS sources fail with `fragParsingError`" (2026-10-03,
  [post](https://reddit.com/r/PiracyBackup/comments/1wwpfkt/)) **(low signal)**.
- **VidFast.** Indian Nuvio users list it among the sources that work (2026-08-07,
  [post](https://reddit.com/r/Nuvio/comments/1vhqonn/)). But to "Do vidfast provide hindi dubbed …?" the answer was
  "Always got original audio" ([p27cef5](https://reddit.com/r/Nuvio/comments/1vhqonn/comment/p27cef5/)).
  So **for Hindi, VidFast looks like an original-audio-only source** **(low signal, one reply)**. That matters if
  Bearoom adopts VidFast's watch-party API: the party would need a separate Hindi path.
- **FrameXTV** (framextv.tech/api).
  - An Indian solo dev's ad-free site and embed with its own player and a published API. 552 points / 264 comments
    (2026-09-05, [post](https://reddit.com/r/PiracyArchive/comments/1w7yh36/)).
  - Multi-audio by server: "Bowler has multi audios"
    ([pe7rn8y](https://reddit.com/r/PiracyArchive/comments/1w7yh36/comment/pe7rn8y/)).
  - The dev promised a watch party ([p7mjiou](https://reddit.com/r/TeenIndia/comments/1w6ch6q/comment/p7mjiou/)).
  - Users praised fast seeking: "when i click the timeline … in other sites it takes time to load, but in this one it
    loaded pretty quick" ([p7t5vkk](https://reddit.com/r/TeenIndia/comments/1w6ch6q/comment/p7t5vkk/)).
  - Requests: "Multi audio support is what I'm looking for", 25 points
    ([p7ywh2y](https://reddit.com/r/PiracyArchive/comments/1w7yh36/comment/p7ywh2y/)); AirPlay
    ([p7z4mkf](https://reddit.com/r/PiracyArchive/comments/1w7yh36/comment/p7z4mkf/)); 3XL subtitles
    ([p7yuhn8](https://reddit.com/r/PiracyArchive/comments/1w7yh36/comment/p7yuhn8/)).
  - Reported not working on 09-29 **(low signal)**.
  - This is a young, single-operator dependency.
- **Anime-Nexus** (anime embed API). A user asks for a "start at" URL parameter "for watchparty things"
  ([p4hd0nl](https://reddit.com/r/StreamingAnime/comments/1v1vwyy/comment/p4hd0nl/)) **(low signal)**.
- **Cinezo.** Praised generically as "the super smooth streaming experiences website" (2026-02-23,
  [post](https://reddit.com/r/ixtream/comments/1rchdgk/)) **(low signal; no Hindi mention)**.

---

## Signals for Bearoom

### Features users want (ranked by how often and how strongly)

1. **Real audio-track switching in the player**, with Hindi pinned and the choice persisted.
   - "A lot of sites either have only one language or force you to use a separate version instead of letting you switch
     audio on the player" (2026-06-28, [post](https://reddit.com/r/PiratingWebsites/comments/1uhr54k/)).
   - The repeated "multi audio" asks on FrameXTV.
2. **A native watch party.** It is the #1 open request on r/Nuvio across Jul–Oct, and Indian users offer to pay via UPI.
   - **Each member plays their own stream.** No screen-share, so there are no DRM black screens and no audio loss.
   - **TV-first.**
   - **Room link or code, no sign-up.**
   - **Host-controlled pause/seek**, optionally with guest pause *requests* (the Rave model).
   - **Chat or voice in-app.**
3. **Netflix-like simplicity:** click → autoplay the best stream → correct audio.
   - "click an episode, autoplay the first stream, and always use the original audio"
     ([post](https://reddit.com/r/Nuvio/comments/1wcf70k/)).
   - "8 out of 10 times I still open Netflix … one-touch play, no hassle" (2026-10-09,
     [pewhbmn](https://reddit.com/r/sideloaded/comments/1x1s4js/comment/pewhbmn/)).
   - Indian newcomers say "i don't understand addons".
4. **Honest stream labels** (title/year, resolution, **audio languages**, size, host) and filtering out junk such as
   "10Gbps download only" entries.
5. **Quality switching during playback** ([otpbxt3](https://reddit.com/r/AskIndia/comments/1uefxfi/comment/otpbxt3/)),
   plus a 1080p default. Users turn 4K off because "the streams lagged like crazy" (2026-10-01,
   [pd6z4qv](https://reddit.com/r/nuvioaddons/comments/1wuwx0c/comment/pd6z4qv/)).
6. **Fast seek** (the FrameXTV praise), **skip intro**, and **downloads**, including a whole season
   ([pbbilax](https://reddit.com/r/sideloaded/comments/1wmhzl2/comment/pbbilax/)).
7. **Subtitle sync and size; AirPlay / Chromecast** (SceneBox, FrameXTV, Nuvio iOS).
8. **An Indian-aware catalogue.** Region rails plus global trending, because TMDB is weak for Indian titles and soaps.
   Hindi dubs of childhood cartoons and anime (Doraemon, Shinchan, Pokémon, Naruto) are a real niche.

### Failure modes to design against

- **The default-audio lottery.** Hindi-first users get English or Russian, and English-first users get Hindi. Bearoom
  should:
  - pick the track by language tag, then verify it;
  - remember the user's choice per title or series;
  - show the current track clearly.
- **Wrong title or episode** from scrapers, especially older or obscure titles. Validate by year, runtime or episode
  before playing, and let the user report a mismatch in one tap.
- **Partial Hindi coverage within a series** (episode 1 yes, episode 25 no). In a party, the room needs a fallback rule
  for that.
- **Source death every few weeks.** In this window alone: videasy, Cineby (twice), MovieBox paywall, NetMirror outages,
  AnimeKai and 7reels. Plan for:
  - multi-provider failover;
  - health telemetry;
  - no user-visible dependency on one brand.
- **Clone and fake domains** after outages (NetMirror). Never let users type provider domains.
- **India network quirks.** ISP blocks fixed by Cloudflare DNS or DoH suggest **app-level DoH** is worth having. Also
  expect slow, low-RAM Android 9 TVs (2 GB) and 15–60 s source lookups that users abandon.
- **Watch-party breakers:**
  - one member buffering;
  - different cuts or frame rates across sources, so the room must pin one stream;
  - region-specific availability;
  - screen-share audio and DRM issues (avoid by design);
  - disconnects every few minutes (Harbor).
- **Trust and safety.** A React Native piracy APK (NetMirror) was publicly dissected for malware. MovieBox's 50+
  permissions and PlayTorrio's antivirus flags drive users away. Keep permissions minimal; open-source or reproducible
  builds help.
- **iOS distribution.** Nuvio was pulled from the App Store, its TestFlight expires, and free SideStore teams are
  soft-banned. If Bearoom targets iOS, expect sideload-only distribution and users who refuse to sideload.

### Sources most-mentioned for Hindi on Reddit (Jun–Oct 2026)

1. CloudStream Indian repos: megarepo, phisher, CNC / CNCVerse, AnimeWorld, Animesalt, AnimeDekho and Kartoons.
2. HDHub4u / 4KHDHub (also inside PenguPlay and CB Providers).
3. NetMirror (OTT mirrors; huge with teens; unstable; malware concerns).
4. MovieBox (Hindi breadth; now paid; 720p complaints).
5. PenguPlay (mixed in Asia).
6. multimovies.casa (Hindi dub incl. cartoons and anime).
7. Vegamovies / MoviesMod / MoviesDrive via scrapers.
8. Telegram channels.
9. Einthusan / desicinemas (Bollywood originals).
10. Muse India / Ani-One India YouTube (legal anime Hindi).

Embed sites with "Hindi servers" (7reels' vidbolt, youflex Bolly/zyra, FrameXTV's multi-audio server) were each
mentioned once or twice and churn fast. VidFast appears in Indian setups but reportedly carries original audio only.

---

### Caveats

- Logged-out JSON search returns at most 25–100 results per query, and in-sub search is unreliable on some subs. Signal
  is skewed toward English-speaking, Android/debrid power users on r/Nuvio and r/nuvioaddons. Indian casual users show up
  mainly in r/TeenIndia, r/AskIndia and r/PiratingWebsites.
- Many PiratingWebsites answers were auto-removed for containing links, so site names there are under-counted.
- Vendor and self-promo posts (CB Providers, Nova Streams, FrameXTV, WatchAlong, SceneBox) are marked as such. Their
  comment sections are the useful part.
- Raw extracts for audit: `scratchpad/reddit/rd-*.txt`; condensed notes: `scratchpad/reddit/notes.md`.
