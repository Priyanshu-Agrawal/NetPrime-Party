# Competitor teardown for Bearoom (2026-10-10)

Scope: product and UX, not plumbing. Architecture, sync maths, plugin hosts and embed APIs are already covered in
`docs/research/similar-apps-architecture-2026-10.md` (§0, §1.7–1.11, §3.4, §3.7) and
`docs/research/fmhy-github-index-2026-10.md` (§3a–3d). They are not repeated here.

Method: WebSearch / WebFetch, `curl` of Google Play pages (`gl=IN`, 2026-10-10), the iTunes lookup API, GitHub release
download counts (`api.github.com`), and a shallow read of the source of `vega-org/vega-app` and the
`movy.sx` build manifest and i18n strings. No browser automation was used.

Labels: **(inf.)** = my inference. **(vendor)** = the vendor's own or a competitor's marketing claim. **(SEO)** = from APK
mirror or listicle sites, low trust. Play numbers are the India listing as of 2026-10-10.

---

## 1. Headlines

1. **Nobody ships a mobile-native, cross-platform (iOS and Android) watch party for Indian or dubbed content in 2026.**
   - The big services withdrew theirs: Disney+ GroupWatch (removed 2023-09-18), Prime Video Watch Party (launched in
     India Dec 2020, removed 2024-04-02), Plex Watch Together (dropped from the new mobile and TV apps, Feb 2025;
     web only now), Twitch Prime Watch Party (April 2024, "low usage").
   - JioHotstar, ZEE5 and SonyLIV have **no native group watch**. The only routes are desktop browser extensions:
     Teleparty (paid, for ZEE5), Flickcall, WatchSync and LofiCouch.
   - **Rave**, the biggest mobile party app (50M+ Play installs), was **removed from the iOS App Store on
     2025-08-06**, and the iTunes lookup still returns 0 results today. Teleparty's iOS app is premium-only and rated
     2.8★. Scener has no Android app. SharePlay is Apple-only.
2. **The free-streaming apps Indian users actually use have no watch party at all.** That covers Vega, Nuvio,
   CloudStream, PlayTorrio, Flixclusive, MX Player, MovieBox, Castle and NetMirror.
   - The one exception is **Movy** (web only, FMHY's #1 aggregator). It has full rooms: a public list, password
     rooms, owner-only control, kick and transfer ownership.
   - Stremio parties exist only as community browser extensions for Stremio Web.
3. **Dub choice is everywhere a mid-playback "Audio" menu over in-stream tracks.**
   - Vega and Nuvio both remember a language. Vega keeps one global last language; Nuvio keeps a primary and a
     secondary preference.
   - Nuvio's preference is visibly unreliable: issue #1771, "Preferred audio language is ignored", was closed by the
     stale bot.
   - **No app tells the user before pressing play whether a Hindi dub exists.** None treats "Hindi" as a
     first-class, title-level fact.
4. **Store removal is the norm for grey apps:**
   - Nuvio: removed from Play 2026-09-05, after an MPA DMCA.
   - Stremio: removed from Play in January 2026, and its iOS Lite app was pulled the same month. Its Play listing is
     live again today (updated 2026-10-07).
   - Kast: removed from Play 2025-01-10.
   - CloudStream: GitHub DMCA takedowns in 2022 (Sky UK) and 2023 (MPA).
   - Rave: removed from iOS over moderation and "fraud" allegations.

   Distribution and update channels must survive a store takedown.
5. **The India demand signal** (EY–IAMAI "Rob Report", Oct 2024, 2023 data):
   - 51% of Indian media consumers access pirated content.
   - Sources: streaming sites 63%, apps 16%, social media and torrents 21%.
   - 76% of them are aged 19–34.
   - 64% would switch to an authorised channel if it were free with ads; 70% don't want to buy any OTT subscription.

---

## 2. Feature matrix A: watch-together products

Columns follow the brief: platforms and install, user base, playback feel, language and quality, subtitles, the
party itself (join, size, control, buffering, social, queue, cross-platform, cost), what users say, and fate.

| Product | Platforms / install | User-base signal | Playback feel | Lang / quality / subs | Party: join · size · control · buffering | Social · queue · x-plat · cost | Praise / complaints | Fate / lesson |
|---|---|---|---|---|---|---|---|---|
| **Teleparty** | Chrome / Edge / Opera extension (v5.7.3; 9 services free, 23 more with Premium); Android app; iOS app (Premium needed to host) | Android 5M+, 4.1★ (13.1K reviews), updated 2026-09-30; iOS 2.8★ (817 ratings); "10 million people" (vendor) | Overlays each member's own Netflix / Hotstar / ZEE5 player; mobile plays inside the app | The service's own UI; no Teleparty-level language control | Party link from the "TP" button; changing the title means a **new link**; "Only I have control" toggle; host can disable reactions; no documented buffering wait | Chat, custom reactions (Premium), video chat (Premium); $6.59/mo or $49.99/yr on iOS; each member needs the subscription | Mobile playback broken for Disney+ (Oct 2025); can't leave a party without force-quitting; billing after cancel; PiP requested; tiers differ between in-app and web purchase | Alive, but mobile is the weak spot. Lesson: **one stable room link across titles**, and an obvious Leave |
| **Rave** (Rave Inc., package `com.wemesh.android`) | Android, Windows, Android TV; **iOS and Mac gone since 2025-08** | Android **50M+**, 4.3★ (949K reviews), updated 2026-10-02 | Signs into your Netflix etc. inside Rave; YouTube free; "millisecond-precise" sync (vendor) | — | Room auto-created when you start a video; link / SMS / in-app invite; visibility public / nearby / friends / invite-only (reported default: public); only the starter controls, and the host sets who can use voice; "no limit" on size (vendor) | Text and voice chat, images, karaoke; Premium removes ads | India reviews: Netflix stuck loading, "left the channel" ghosts, long sessions lag, Netflix login loop | **Apple removed it** (fraud and moderation; Reddit reports of unmoderated public rooms, CSAM, scams; AV vendors flagged it). Rave is suing (US, Canada, Brazil, Netherlands, Russia). Lesson: **public rooms without moderation are an existential risk** |
| **Scener** | Chrome extension (required to host on desktop); iOS app (iOS 15+); no Android | Raised $2.1M in 2020; "pre-revenue" | Overlays the service's own player | — | 16-character room code or invite link; **reusable rooms**; Room = up to 10 on video; Theater = unlimited text-only guests plus 10 co-hosts; **"remote" you pass to another user**; mobile video limited to 4 | Video and voice need Premium (3-day trial); out of sync → "Re-Launch Show"; mobile has a SYNC button | — | Alive. Lesson: the **"pass the remote"** metaphor, and a one-tap resync |
| **Hyperbeam Watch Party** | Web (watch.hyperbeam.com); a cloud virtual browser; mobile = browser only | Trustpilot 3.2 from 136 reviews | Everyone watches one cloud browser stream (works with any site) | Whatever the site offers | Link; control of the browser passes between people | Voice and video built in; saved playlists; **free: 3 h sessions, 10-minute cooldown**; Premium $5/mo | "laggier" lately | Alive. Session caps are resented |
| **Kast** (Evasyst → Live Current → licensed to Amaze) | Was Windows / Android / iOS | — | Screen-share style: 20 sharers, 100 watchers | — | — | Screen share moved to paid | — | **Removed from Play 2025-01-10**; kast.gg now shows "Joining Amaze". Lesson: party-only apps rarely survive alone |
| **Watch2Gether** | Web, responsive for mobile; extension (W2gSync) for Netflix and others | Long-running | YouTube, Vimeo and similar embedded players | — | Room link; **private by default**; creator is moderator and can delegate; about 1,000 users per room; temporary rooms deleted after 24 h, permanent rooms need an account | Chat; webcam / audio for up to 10 (disabled above 50 users); playlist of up to 1,000 items; PLUS $2.90/mo | — | Alive |
| **Kosmi**, **SyncUp**, **OpenTogetherTube** | Web (SyncUp also has native iOS and Android apps) | — | Embedded YouTube etc. | — | SyncUp: host / moderator / viewer roles; OTT: room permissions and voting | Kosmi: "free, no download, no signup" | — | Alive; these are the "Kast alternative" crowd |
| **Plex Watch Together** | Web app only since the 2025 rewrite | — | Plex's own player, on your own media or Plex's free catalogue | Plex's own | Invite friends, or non-users by link; **lobby shows each person as Invited → Buffering… → Ready, then auto-starts when all are ready** (or start anyway); anyone can play, pause or seek; no new joiners after start | No chat | Forum: infinite buffering spinner; no pause when the host disconnects; the host can't rejoin | **Dropped from the mobile and TV apps (2025-02-25)** to speed up the rewrite. Lesson: party code that isn't core gets cut in rewrites |
| **Prime Video Watch Party** | Desktop browser only (the app redirected to the web); US, then India (Dec 2020) | — | Prime's player | Prime's own | Link; up to **100**; **host-only** play / pause / skip | Text chat and stickers; every member needs Prime; no rentals | — | **Removed 2024-04-02, quietly.** Lesson: desktop-only social features die on mobile-first markets |
| **Disney+ GroupWatch** | Phones, web, TVs (TVs could only join) | — | Disney+'s player | — | Link from the detail page; up to **7 people**; **anyone** could pause or seek | **Six fixed emoji reactions only** (like, funny, sad, angry, scared, surprised); no chat | — | **Removed 2023-09-18** (inf.: cost or usage, and ad-tier friction) |
| **Apple SharePlay** | iOS, iPadOS, macOS, tvOS, inside FaceTime | — | Each app's native player | Each app's own | FaceTime call → "Join SharePlay"; group FaceTime up to 32 (inf. from the FaceTime cap); **everyone has controls, and a notification names who paused or seeked**; per-app setting: Automatically / Ask Next Time | Voice and video via FaceTime; each member needs the subscription; region limits apply | — | Alive, but **Apple-only**; Rave alleges Apple used it to justify the Rave removal |
| **Discord Watch Together** | Discord desktop and mobile (YouTube only) | — | Embedded YouTube | — | Inside a voice channel; **Host mode** vs **Sharing mode** (everyone controls); anyone can add to the playlist; when a host hits the time cap, hosting passes to someone else | Voice / video are Discord's own; reported 180-minute group cap; the session pauses after 30 min with no interaction | Users hate the 180-minute cap | Alive |
| **Google Meet live sharing** | Android only; starting needs YouTube Premium | — | YouTube | — | Inside a Meet call | Guests don't need Premium | — | Alive (Android-only mirror of SharePlay) |
| **India: JioTV / JioCinema / JioHotstar, ZEE5, SonyLIV** | — | JioHotstar: 500M+ users, 100M+ paid (early 2026, secondary source); Amazon MX Player: 78M MAU | Native players | Per-title audio menu mid-playback (JioHotstar's "Audio & Subtitles") | **None native.** JioTV once had a cricket-only Watch Party (≈2021–22). JioCinema's IPL 2023 "watch parties" came via Glance | Third-party desktop extensions only: Teleparty (ZEE5, paid host), Flickcall (adds video calls; added JioHotstar in v11.1.0), WatchSync, LofiCouch (4 people), SyncCouch ("coming soon") | Extension listings show very low usage (one ZEE5 extension: 95 downloads a month) | **The gap Bearoom fills** |
| **Syncplay / Synkplay** (mobile) | Desktop (mpv, VLC, MPC). Synkplay: Play, App Store, AltStore, IzzyOnDroid | Syncplay 2.7K★; Synkplay 379★ | Your local file in mpv / ExoPlayer / VLCKit | **Preferred audio and subtitle languages**; OpenSubtitles search; subtitle offset | Server + room name + password, or a share link; **"I'm ready to watch"** (pausing sets you not ready); **"Play when all ready"** 3 s after a minimum number of users are ready; **managed rooms** where only operators control; warns on duration mismatch; per-user **offset** | Chat (Synkplay adds emoji and GIFs); shared playlists with undo; iOS and Android in one room | — | Alive. **The best-designed readiness model**, but every member needs the same file |
| **Movy** (movy.sx, web) | Web; QR login for TVs | FMHY 🌟 #1 aggregator | Its own web player | "Finding the best server for you…" → server list; one **"Audio & Subtitles"** sheet; quality picker; OpenSubtitles search | `/watchparty`: **public room list** + "Join by Room ID"; private = password; **"Only the room owner can control playback"**; Kick user; Transfer ownership; "X is the new room owner"; join / leave / kick system messages; limit on rooms per host | Chat; Participants list; profiles with a 4-digit PIN; downloads capped at 5 per 24 h | — | Alive. **Closest product to Bearoom**, but web-only and with public rooms |
| **CinemaOS / Cinezo** | Web | FMHY tags them "Watch Parties" | Embed players | Cinezo documents `server=hindi` | **Unverified:** cinemaos.live was unreachable from here; cinezo.live is now an API / docs site with no party UI | — | — | — |
| **2025–26 newcomers** | Turtle (Android, 10K+, 2026-10-06); PartySync (Android in-app browser, 500+); WEVER (iOS and Android; only the host pays); Watchly (vendor claims); KINO Social (extension); CineCoop (4 people); Movies Anywhere Watch Together (9 people, PG-13+ profiles) | Small | Mostly embedded browsers or service overlays | — | Link join; Turtle: shared play / pause / seek; **KINO Social gates chat by watch progress (spoiler-safe)** | — | Turtle: "host pause but the member still playing", sign-in loops; "Love from India" | — |

---

## 3. Feature matrix B: free-streaming apps Bearoom users would otherwise use

| Product | Platforms / install | User-base signal | Playback feel | Language / dub UX | Quality UX | Subtitles | Watch party | Praise / complaints | Fate |
|---|---|---|---|---|---|---|---|---|---|
| **Vega** (vega-org; **React Native / Expo**) | Android and Android TV; APK from GitHub and vega.8man.in; Play (`vega.app`, "local or network media" framing); Vega-Desktop | GitHub **≈706K release downloads** (85 releases, v5.0.3 on 2026-10-10); Play 10K+, 4.4★ (65 reviews) | `react-native-video`; bottom bar = **Audio · Subtitle · Speed · Sleep timer · PIP · Server & Quality · Resize**; Cast with a remuxer that keeps audio and subtitle tracks switchable; external player; downloads | Audio button **labelled with the current language** ("hin" / "auto"); sheet lists in-stream tracks with type · title detail; "Loading audio tracks…"; **audio delay** ("Sound plays later / earlier"); **one global `lastAudioTrack`** (kept even when clearing the cache) | One split sheet: servers on the left, the selected server's quality variants on the right; button shows the current quality | Track picker; subtitle search with Hindi; last subtitle track remembered | No | Play reviews: "no ads, no premium… every movie" | Alive. Catalogue = whichever provider is chosen in a drawer (58 providers: VegaMovies, MoviesMod, HDHub4u, **NetMirror family, MovieBox Web, Castle, MX Player**, Torrentio…) |
| **Nuvio** (KMP rewrite) | Android, iOS (libmpv), Android TV, desktop, Linux | GitHub **≈1.32M release downloads**; 380K Play installs before removal | ExoPlayer on Android, MPV on iOS; Auto picks MPV for anime; gestures, hold-to-speed | **Preferred + Secondary Audio Language**; Reuse Last Link (1 h–7 d); Prefer Binge Group | Auto Stream Selection = first source / manual / **regex**; Stream Selection Timeout (Instant → Unlimited); no resolution preference (regex only) | Preferred + secondary language; Use Forced Subtitles; Show Only Preferred; startup modes (Fast / Preferred only / All); size, offset, colour, outline; libass | No | Play: "better than Stremio… like Apple TV+"; freezing after updates; **#1771: preferred audio ignored, closed by the stale bot**; desktop: preference lost on the next episode | **Removed from Play 2026-09-05** (MPA DMCA citing 6 titles; possibly over artwork) |
| **Stremio** (+ addons) | Android (Play live again, 10M+, 4.4★, 79.5K reviews, updated 2026-10-07); desktop; web; **iOS: Lite pulled Jan 2026; full IPA sideload since 2026-02-03**; Fire TV via Amazon | 10M+ | Native player (external player optional) | "Default audio track" setting; addons decide what exists. **AIOStreams: language as a sort key plus required / excluded rules and "Preferred Lists"**; MediaFusion: Hindi / Tamil / Malayalam / Kannada and "dubbed" catalogues | Addon-sorted stream list (resolution, size, seeders) | Addon subtitles | **Only community extensions for Stremio Web:** Stremio Party (Firefox: voice, public rooms, drift correction), WatchParty for Stremio (Chrome v2.0.1, May 2026: chat, reactions, host controls) | "just works" once set up, but debrid setup means "dodgy-looking websites"; bug where double-tap seek resets progress | Play removal (Jan 2026), then back; iOS sideload only |
| **CloudStream** | Android and TV; pre-release APK; not on Play | 10.9K★; ≈6.7M downloads on the current release assets | Media3; Chromecast; no ads or tracking | Depends on the source; India repos (CSX: Bollyflix / VegaMovies; CNCVerse: Netflix / Hotstar mirrors) per SEO sites | Per source | External subtitles, styling (SEO) | No | "starts empty", manual repo setup, no auto-update (SEO) | GitHub DMCA: Sky UK 2022, MPA 2023 |
| **PlayTorrio** (Flutter) | Windows, macOS, Linux, Android, **unsigned iOS IPA** | ≈170K release downloads (repo created Aug 2026) | fvp (FFmpeg) player; **scraper results stream in as they arrive** | Not documented | Not documented | Subdl auto-fetch, timing and size adjustment | No | Fast-growing | Alive |
| **Flixclusive** | Android (Media3); plugins via Discord | 538★ | Media3 | — | — | — | No | — | Alive |
| **MX Player** (Amazon MX Player) | Android (Play), and Prime Video on other surfaces | **1B+ installs**, 4.3★, 14.3M reviews; **78M MAU (Apr 2026) vs a 250M peak** | Best-known local player: gestures (volume, brightness, zoom, **subtitle-based seeking**, subtitle move and resize), floating window, PiP | **Legal Hindi / Tamil / Telugu dubs** (18 CJ ENM K-dramas, free from Sept 2025; Turkish, Mandarin, anime); in-player audio menu (inf.) | Auto (inf.) | Very wide format support | No | **Ad load is the #1 complaint** ("7 ad breaks in a 40-minute episode, about 3 min each"); login problems | **Being merged into Prime Video** (reported 2026-05-07) |
| **MovieBox / Castle / NetMirror / PikaShow** (grey, sideloaded) | Android APKs from swarms of SEO clone sites | MovieBox Play listing 10M+ (old snapshot); otherwise unknown | App-native | Marketing claims Hindi / Tamil / Telugu dub tracks with in-player switching (SEO, unverified). Bearoom measured Castle = 5 AAC tracks muxed in TS (similar-apps doc §0) | — | — | No | Clone and malware warnings everywhere | Constant domain churn |
| **Movy** | see matrix A | | | | | | **Yes** | | |

---

## 4. Best-in-class patterns Bearoom should copy (concrete UX)

Bearoom already has host and guest roles, `RoomAccess` (`open / locked / private / password`), `guestControlDefault`
("Guests can control playback"), `approveGuests`, room codes, text and GIF chat, polls and a queue
(`services/party/protocol.ts`, `components/party/RoomSettingsSheet.tsx`). The list below is what is still missing or
worth refining.

### Joining
1. **Short code, deep link and QR together.**
   - Scener uses a 16-character reusable code plus a "Copy Invite Link". Movy uses a Room ID plus a password.
     Synkplay accepts either a share link or server and room fields.
   - For India, make the **WhatsApp share sheet** the primary action. Put a 6-character code inside the message so it
     can be read out on a call, and give the link a web fallback that says "Get Bearoom to join" (inf.).
2. **One stable room link across titles.** Teleparty's #1 mobile complaint is that changing the video needs a new link.
   - Bearoom's queue already allows this. Never rotate the link when the title changes.
   - Add **persistent "rooms" for a friend group**: Scener's reusable rooms, and Watch2Gether's permanent rooms
     versus its 24-hour temporary ones.
3. **An obvious Leave** (Movy: "Leave Room" with a confirmation step). Teleparty users have to force-quit to leave.

### Starting and buffering
4. **A readiness lobby** (Plex's Invited → Buffering… → Ready, then auto-start; Syncplay's "Play when all ready", 3 s
   after the minimum number of users are ready).
   - Show a per-member chip: *Finding stream → Buffering → Ready*.
   - The host gets "Start anyway". Syncplay's rule also applies: a member who pauses becomes "not ready".
5. **Attributed pauses** (SharePlay notifies who paused or seeked).
   - Example toasts: "Riya paused", "Waiting for Aman (buffering)…".
   - After N seconds, the host sees "Continue without Aman". This is the user-facing side of the group-wait barrier
     in the similar-apps doc §0.
6. **One-tap Resync for guests.** Scener has an out-of-sync "Re-Launch Show" and a mobile SYNC button. Turtle's
   reviews show what happens without one.

### Control
7. **Pass the remote** (Scener), **Transfer ownership** and **Kick** with system messages (Movy), and **co-hosts**
   (Scener theaters, Syncplay operators).
   - Bearoom's per-guest `canControlPlayback` is the right base. Expose it as a 🎮 "remote" icon on the member row.
8. **Two named control modes** instead of a bare toggle: Discord's *Host mode* vs *Sharing mode*, and Teleparty's
   "Only I have control".
   - Default to host-only for groups of four or more, and to sharing for two people (Discord recommends the same) (inf.).

### Social
9. **A fixed, small reaction set floating over the video.** Disney+ used six emoji with no chat at all.
   - The host can turn reactions off (Teleparty v5.0.1).
   - Keep the reactions cheap to render (the project rule says no blur or glow on video screens).
10. **Spoiler-safe chat for late joiners** (KINO Social gates chat by watch progress). This is cheap to add with the
    existing queue and position data.
11. **Voice: don't build it first.** Voice and video sit behind paywalls in Teleparty and Scener, and Rave's voice is
    tied to its moderation problems. Make sure playback ducks gracefully during a WhatsApp call that runs alongside
    (inf.).

### Language, quality and subtitles
12. **Dub status on the detail page, before Play.** This is new; no competitor does it.
    - Show language chips such as *Hindi ✓ · Tamil · English (original)* and a primary button reading **"Play in
      Hindi"**.
    - Fall back the way Nuvio does: per-title remembered choice → ordered list (primary, then secondary) → stream
      default.
    - When Hindi is missing, **say so** ("No Hindi dub found — English with Hindi subtitles?"). Silently playing
      track 1 is exactly Nuvio's #1771 complaint.
13. **Label the player buttons with their current state** (Vega's Audio button shows `hin`; Server & Quality shows
    `1080p`). Use a split sheet for source and quality. Add **audio delay** (Vega, Nuvio) and a **sleep timer** (Vega).
14. **"Finding the best server for you…"** (Movy) followed by an auto-pick, with the full list one tap away. Add
    **Reuse Last Link** and binge-group stickiness for the next episode (Nuvio).
15. **Subtitles:** in-player OpenSubtitles search (Movy, Synkplay), preferred and secondary languages, forced subtitles,
    and size and vertical offset (Nuvio). Add a **sync offset**, which Nuvio lacks and Synkplay and PlayTorrio have.
16. **Store the language preference per profile** (Netflix keeps audio and subtitle preferences per profile). A
    guest's language in a party stays theirs whenever the room stream has in-stream tracks (similar-apps doc §3.7).

---

## 5. Gaps nobody fills well (Bearoom's opportunity)

1. **A Hindi-dub-first catalogue.**
   - Today the legal apps hide dub availability behind the player menu. The grey apps bury it in file names such as
     "Dual Audio [Hindi-English] 1080p".
   - Nobody turns "Hindi available?" into a browseable, title-level fact: a filter, a rail ("Hollywood in Hindi") or
     a badge.
2. **A cross-platform mobile party.** iOS and Android in one room, native app, no browser extension. Rave lost iOS,
   SharePlay is Apple-only, Scener is iOS-only, Plex dropped mobile, and Teleparty's iOS app is premium-only at 2.8★.
3. **A party for Indian content at all.** No native group watch exists on JioHotstar, ZEE5, SonyLIV or Amazon MX
   Player, and the extensions are desktop-only with tiny usage.
4. **No subscription per member.** Every legal tool requires each member to hold the subscription, and every grey app
   has no party. Bearoom's "one room stream" is the differentiator, and it is also the legal-risk surface (§6).
5. **Per-member dub inside one room.** Example: Mom hears Hindi, a cousin hears English, same timeline.
   - Nobody does this. It works when the room stream carries in-stream tracks.
   - Syncplay only *warns* on a duration mismatch, and nobody handles different dub cuts. Bearoom's ±2.5 s rule plus
     an offset mode (similar-apps doc §3.7) would be a first.
6. **A readiness lobby on mobile.** Plex had the best one and removed it from its mobile apps.
7. **Data-aware party playback.** Let each member keep their own quality and a data-saver setting while staying in
   sync. Nobody advertises this, and Indian mobile data makes it valuable (inf.).
8. **Published startup and sync numbers.** Competitors claim "millisecond precision" (Rave, PartySync) but publish no
   time-to-first-frame or drift figures. Bearoom can measure and show "Ready in 3 s" honestly (inf.).

---

## 6. Pitfalls (with the precedent for each)

1. **Store takedowns.**
   - Precedents: Nuvio (Play, MPA DMCA, Sep 2026), Stremio (Play and iOS Lite, Jan 2026), Kast (Play, Jan 2025),
     Rave (iOS, Aug 2025), CloudStream (GitHub DMCA 2022 and 2023), Consumet (HTTP 451).
   - Lessons:
     - Keep providers server-configured, as Bearoom's worker already does.
     - Keep an OTA and APK update channel that doesn't depend on a store.
     - Keep pirated-title artwork out of store listings; Nuvio suspects the DMCA concerned artwork.
     - Publish **one canonical download page**. Fake "Nuvio" apps sit on Play, and every grey app has a swarm of
       malware-prone clone sites.
2. **Public rooms without moderation.** Rave's removal cites moderation, and the Reddit reports describe CSAM and
   scams. Movy and Rave both list public rooms.
   - **Keep rooms private by default** (Watch2Gether does).
   - Defer public discovery, or gate it behind reporting, kicking and age gating.
3. **Group watch gets cut when it costs money or usage is low.** Precedents: Disney 2023, Prime 2024, Twitch 2024
   ("low usage"), Plex 2025 (during a rewrite).
   - Solo playback must stand on its own; the party is the retention layer.
   - Keep the party backend cheap and always on. Bearoom's own memory notes that a Supabase free-tier pause made the
     app look dead.
4. **Mobile-party failure modes users actually report.**
   - The joiner can't play video (Teleparty).
   - The host pauses and the member keeps playing (Turtle).
   - "Left the channel" ghosts (Rave).
   - No pause when the host disconnects; the host can't rejoin (Plex).
   - Sign-in loops (Turtle, Rave).

   Each of these needs a test case.
5. **Preference that silently fails.** Nuvio's preferred-audio bug was closed by the stale bot and is still
   resurfacing on desktop. Test default-language selection per player engine, and on the next episode.
6. **Session caps and paywalls on core party features** (Discord 180 min, Hyperbeam 3 h free, Teleparty and Scener
   video behind Premium). These generate the angriest reviews.
7. **Ads that break the room.** MX Player's ad load is its top complaint. If Bearoom ever monetises, ad breaks must be
   room-synced or kept outside playback (inf.).
8. **Subscription and billing trust.** Teleparty is charged after cancellation, and its tiers differ between in-app
   and web purchase.

---

## 7. Sources

**Watch-together**
- Teleparty:
  - [App Store](https://apps.apple.com/us/app/teleparty-watch-party/id1620026075)
  - [Play](https://play.google.com/store/apps/details?id=com.teleparty.android&hl=en_IN) (curl 2026-10-10)
  - [Chrome Web Store](https://chromewebstore.google.com/detail/netflix-party-is-now-tele/oocalimimngaihdkbihfgmpkcpnmlaoa?hl=en)
  - [ZEE5 page](https://www.teleparty.com/zee5)
  - ["Only I have control" (Android Central)](https://www.androidcentral.com/how-use-netflix-party-stream-friends-amidst-social-distancing)
- Rave:
  - [rave.io/faq](https://rave.io/faq)
  - [Play](https://play.google.com/store/apps/details?id=com.wemesh.android&hl=en) (curl)
  - [MacRumors, 2026-05-07](https://www.macrumors.com/2026/05/07/apple-rave-app-store-lawsuit/)
  - [AppleInsider](https://appleinsider.com/articles/26/05/07/shareplay-is-not-why-co-streaming-app-rave-was-kicked-off-the-app-store)
  - [MakeUseOf](https://www.makeuseof.com/how-to-use-rave-to-stream-in-sync/)
  - [Common Sense Media](https://www.commonsensemedia.org/app-reviews/rave-watch-together)
- Scener: [FAQ](https://www.scener.com/faq), [Variety 2020](https://variety.com/2020/digital/news/scener-watch-party-disney-plus-hbo-max-netflix-1234787891/)
- Hyperbeam: [hyperbeam.com](https://hyperbeam.com/), [Trustpilot](https://ca.trustpilot.com/review/hyperbeam.com)
- Comparison: [SyncUp 2026 comparison](https://syncup.tv/blog/best-watch-party-apps-2026)
- Kast:
  - [AppBrain](https://www.appbrain.com/app/kast-watch-together/com.evasyst.Kast)
  - [Live Current merger](https://www.accessnewswire.com/newsroom/en/publishing-and-media/live-current-completes-merger-with-video-streaming-platform-kast-698847)
  - [Amaze partnership](https://www.tipranks.com/news/the-fly/amaze-enters-partnership-with-live-current-media)
- Watch2Gether: [limits FAQ](https://community.w2g.tv/t/faq-what-are-the-limitations-of-watch2gether/148839), [room size](https://community.w2g.tv/t/is-there-a-limit-on-the-number-of-people-in-a-room/347)
- Plex:
  - [PCWorld, 2025-02](https://www.pcworld.com/article/2619590/plex-is-dropping-a-popular-feature-from-its-new-streaming-apps.html)
  - [Stark Insider (lobby states)](https://www.starkinsider.com/2020/05/new-plex-feature-watch-together-makes-it-easy-to-host-virtual-movie-nights-watch-in-sync.html)
  - [forum issues](https://forums.plex.tv/t/expand-watch-together-features/792851)
- Prime Video Watch Party:
  - [TVBEurope (100 viewers)](https://tvbeurope.com/media-delivery/new-amazon-watch-party-feature-lets-100-viewers-stream-together)
  - [India launch](https://www.thenewsminute.com/atom/amazon-prime-video-launches-social-viewing-feature-watch-party-india-139204)
  - [removal (iTechGuides)](https://www.itechguides.com/amazon-prime-video-watch-party-why-it-ended-and-how-to-watch-with-friends-now/)
  - [Android Authority](https://www.androidauthority.com/amazon-prime-viewing-party-axed-3458167/)
- Disney+ GroupWatch: [How-To Geek](https://www.howtogeek.com/693081/how-to-watch-disney-remotely-with-friends-using-groupwatch/), [TechRadar removal](https://www.techradar.com/streaming/disney-plus-just-removed-one-of-its-best-friends-and-family-focused-features)
- SharePlay: [Apple Support](https://support.apple.com/en-euro/guide/tv/atvb65186d08/15.0), [AOL (33 people)](https://www.aol.com/finance/apple-shareplay-watch-movies-tv-210045443.html)
- Discord: [Watch Together support](https://support-apps.discord.com/hc/en-us/articles/26502500234519-Watch-Together), [180-min cap thread](https://support.discord.com/hc/it/community/posts/18744592937751-Do-something-to-Watch-Together-so-it-doesn-t-need-the-180-minute-cap)
- Google Meet: [live sharing help](https://support.google.com/meet/answer/12429722)
- Twitch: [Watch Party shutdown](https://sportskeeda.com/esports/news-twitch-shut-watch-party-feature-prime-subscribers-starting-april-2024-citing-low-usage)
- Syncplay / Synkplay: [Syncplay client guide](https://syncplay.pl/guide/client/), [Synkplay](https://github.com/yuroyami/syncplay-mobile)
- Movy: [movy.sx](https://www.movy.sx/), with its `_buildManifest.js` routes `/watchparty` and `/watchparty/[roomId]` and the i18n strings, curled 2026-10-10
- India party tools:
  - [Onsitego (JioTV Watch Party)](https://onsitego.com/blog/jio-watch-party-streaming-cricket-matches/)
  - [Glance × JioCinema](https://www.exchange4media.com/ipl-news/glance-and-jiocinema-partner-for-ipl-2023-126386.html)
  - [Flickcall](https://www.flickcall.com/)
  - [WatchSync](https://chromewebstore.google.com/detail/watchsync-%E2%80%94-for-jiohotsta/jhgalfpjpfamoolbjimfojgkmnbedknk)
  - [LofiCouch](https://loficouch.com/watch-party)
  - [SyncCouch](https://synccouch.com/jiohotstar-watch-party)
  - [ZEE5 extension](https://chrome-stats.com/d/dahegllklicpkipnbdpddkjfkaimoedo)
- Newcomers:
  - [Turtle](https://play.google.com/store/apps/details?id=com.turtle.turtletv&hl=en_IN)
  - [PartySync](https://play.google.com/store/apps/details?id=com.partysync.app&hl=en_US)
  - [WEVER](https://apps.apple.com/us/app/watch-party-together-wever/id1559522498)
  - [Movies Anywhere (via Slashfilm)](https://slashfilm.com/movies-anywhere-watch-together-feature)
  - [KINO Social / CineCoop](https://chromeboard.com/extension/kino-social-iaedcegbflejhokgobbichidoehelhaf)

**Streaming apps**
- Vega: [vega-org/vega-app](https://github.com/vega-org/vega-app) (source read: `src/screens/home/Player.tsx`, `src/lib/hooks/useStream.ts`), [vega-providers manifest](https://github.com/Zenda-Cross/vega-providers), [Play `vega.app`](https://play.google.com/store/apps/details?id=vega.app)
- Nuvio:
  - [player settings](https://nuvio.wiki/settings/player)
  - [issue #1771](https://github.com/NuvioMedia/NuvioMobile/issues/1771)
  - [desktop #822](https://github.com/NuvioMedia/NuvioDesktop/issues/822)
  - [TROYPOINT on the Play removal](https://troypoint.com/nuvio-removed-from-google-play/)
  - [AppBrain](https://www.appbrain.com/app/nuvio/com.nuvio.app)
- Stremio:
  - [Wikipedia](https://en.wikipedia.org/wiki/Stremio)
  - [AlternativeTo IPA news](https://alternativeto.net/news/2026/2/stremio-releases-full-featured-sideloadable-ipa-app-for-ios-ipados-and-apple-tv)
  - [Play](https://play.google.com/store/apps/details?id=com.stremio.one) (curl)
  - [Stremio Party](https://addons.mozilla.org/en-US/firefox/addon/stremio-party/)
  - [WatchParty for Stremio](https://chromewebstore.google.com/detail/watchparty-for-stremio/kfkdlmmjcnndgjkbbckhcafglbmndobk)
  - [AIOStreams](https://hub.docker.com/r/viren070/aiostreams)
  - [MediaFusion](https://hub.docker.com/r/mhdzumair/mediafusion)
- CloudStream: [repo](https://github.com/recloudstream/cloudstream), [TorrentFreak 2022](https://torrentfreak.com/cloudstream-3-piracy-app-taken-down-by-sky-uk-dmca-notice-220804/), [TorrentFreak 2023](https://torrentfreak.com/github-takes-down-cloudstream-apk-code-repo-following-mpa-complaint-230616/), [India repos (SEO)](https://cloudstream.pk/cloudstream-repositories-extensions/)
- PlayTorrio: [repo](https://github.com/ayman708-UX/PlayTorrioV3)
- Flixclusive: [repo](https://github.com/flixclusiveorg/Flixclusive)
- MX Player:
  - [Play](https://play.google.com/store/apps/details?id=com.mxtech.videoplayer.ad) (curl)
  - [merger into Prime Video and MAU](https://www.siliconreport.com/amazon-to-merge-mx-player-into-prime-video-in-india-consolidating-paid-and-ad-supported-ti-57daabe0)
  - [CJ ENM Hindi dubs](https://www.cjenm.com/en/news/cj-enm-expands-global-reach-with-amazon-mx-player-deal-in-india/)
- Grey Indian apps (SEO only): [Castle](https://www.castleapp.co.in/), [NetMirror](https://www.sahu4you.com/netflix-mirror-apps), [MovieBox Play](https://play.google.com/store/apps/details?id=com.enjoy.moviebox&hl=en_IN)
- Netflix: [per-profile audio](https://help.netflix.com/en/node/372?rel=rec)
- India piracy demand: [EY–IAMAI Rob Report (Oct 2024)](https://www.ey.com/en_in/newsroom/2024/10/inr-224-billion-lost-annually-to-piracy-majority-call-for-stricter-enforcement-ey-iamai-report), [OTTVerse summary](https://ottverse.com/51-of-indian-consumers-access-pirated-content-despite-industry-efforts/)

## 8. Caveats
- Several claims come from vendors or competitors: Watchly on Rave, Kosmi on Kast, and Rave's "no limit". They are
  labelled where used.
- Rave's control model comes from guides, not official docs. Third-party walkthroughs conflict: the MakeUseOf guide
  says only the starter controls, while a lower-quality one says everyone does.
- CinemaOS and Cinezo party features are **unverified**: the site was unreachable from here, and Cinezo is now
  docs-only.
- Hindi-dub claims for MovieBox, Castle and NetMirror come only from SEO sites. Bearoom's own measurements are the
  better evidence (similar-apps doc §0 and §3.7).
- Stremio's Play status conflicts: Wikipedia reports a January 2026 removal, but the listing is live today.
