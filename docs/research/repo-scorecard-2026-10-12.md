# Plugin repo scorecard — 2026-10-12 (smoke runs)

**For:** the owner, to decide which third-party plugins Bearoom may run. Nothing below is enabled. Your "yes" does that,
by listing the repo in `plugin_repos` with an `allow_plugins` list.

## Bottom line

- **Enable first: Eclipsia, readable plugins only.** It plays all 4 test titles on both phones, its code can be read
  before pinning, and it was updated yesterday.
  - Allow-list: `karnis, zevran, mavonyx, rynara, soryn, evyrith`.
  - Optional small extras: `wrenok, vitrix, quinox, sylphera`.
- **Add for Hindi on Android: All-in-One `moviebox`.**
  - It is readable and the best Hindi source measured: 6 playable Hindi streams across the 4 titles.
  - Its streams are DASH, so they play on Android only. The app already keeps them off iPhones.
- **Your call — strong but unreadable: AIO `playimdb, castle, vidrock`, and Eclipsia `waelum`.**
  - These are among the most reliable plugins measured, and playimdb carries Hindi.
  - Their code is obfuscated, so neither of us can review it before it runs. It would run inside Bearoom's sandbox, which
    has no direct network and no device access, so the realistic risk is bad or ad-laden streams rather than data theft.
  - I'd hold them back until the readable set proves short.
- **Leave out:**
  - `brellor`: it returned the wrong film or cut 2–3 times out of 9.
  - `haylox` / `nyxora`: they depend on a closed remote decryption service.
  - Every plugin that only failed or found nothing (lists below).

## How this was measured

- **Where:** Bearoom's own sandbox and player-side probe, on your Nothing Phone 1 (release build) and the iOS 27
  simulator.
- **What was run:** each candidate was pinned by commit and file hash and run in memory only (Plugin Lab → Scorecard).
- **"Playable" (ok):** the stream's playlist or file was fetched and checked for this platform.
  - **"Unverified":** reachable, but the 6 s check couldn't confirm it. The app would still try these.
  - **"Hindi":** labelled Hindi. Unlabelled original-audio streams of Hindi films aren't counted, so Hindi is undercounted.
  - **"Wrong":** the length didn't match the film (a different film or cut).
- **Smoke set:** Jawan, Oppenheimer, Breaking Bad S1E1, Mirzapur S1E1. Every plugin was run for every title (no early
  stop). Up to 16 streams per title were probed, shared round-robin so each plugin got checked.
- **Data used:** ≈ 110 MB in total on your hotspot (≈ 15–30 MB per run). A full 20-title run would be ≈ 5× that per
  repo per device, so it waits for your OK or an unmetered network.

## Results per repo

| Repo (pinned) | Last update | Platform | Titles playable | Labelled Hindi on | Wrong streams | First stream p50 | Data (+install) | Obfuscated files |
|---|---|---|---|---|---|---|---|---|
| Eclipsia `4e486ed` (codeberg) | 2026-10-11 | Android | 4/4 | 3 | 5 | 1.0 s | 29.9 MB (+0.5) | 10/43 |
| | | iOS | 4/4 | 3 | 6 | 0.6 s | 23.0 MB (+0.5) | |
| All-in-One `3f09a6f` (github) | 2026-10-02 | Android | 4/4 | 4 | 2 | 2.0 s | 14.9 MB (+3.3) | 53/66 |
| | | iOS | 4/4 | 3 | 2 | 1.3 s | 15.7 MB (+3.3) | |

Neither repo states a licence.

## Plugins that carried the results

| Plugin (repo) | Readable | Titles with streams | Probed → ok (Android / iOS) | Hindi (Android / iOS) | Wrong | Notes |
|---|---|---|---|---|---|---|
| karnis (Eclipsia) | yes | 4/4 | 5→5 / 5→5 | 1 / 1 | 0 | Castle backend, same as AIO `castle` |
| zevran (Eclipsia) | yes | 4/4 | 6→5 / 6→5 | 0 / 0 | 0 | shares hosts with `playimdb` |
| mavonyx (Eclipsia) | yes | 4/4 | 6→4 / 6→4 | 4 / 2 | 1 | MovieBox mirror; DASH Hindi is Android-only |
| rynara (Eclipsia) | yes | 3/4 | 4→4 / 4→4 | 0 | 0 | |
| soryn (Eclipsia) | yes | 3/4 | 4→4 / 4→4 | 0 | 0 | |
| evyrith (Eclipsia) | yes | 3/4 | 3→1 (+2 unverified) / 4→1 (+3) | 0 | 0 | Vidrock backend, same as AIO `vidrock` |
| waelum (Eclipsia) | **no** | 4/4 | 6→5 / 8→8 | 0 / 1 | 0 | highest volume (23 streams) |
| moviebox (AIO) | yes | 4/4 | 8→7 / 3→0 (+3 unverified) | **6 / 0** | 0 | DASH: Android only |
| playimdb (AIO) | **no** | 4/4 | 10→9 / 10→9 | **4 / 4** | 0 | most reliable measured |
| castle (AIO) | **no** | 4/4 | 6→6 / 6→6 | 1 / 1 | 0 | multi-audio Mirzapur (5 Indian languages in one stream, per the Aug measurement) |
| vidrock (AIO) | **no** | 4/4 | 6→3 (+3) / 6→3 (+3) | 2 / 2 | 0 | |
| brellor (Eclipsia) | yes | 2/4 | 3→1 / 4→1 | 0 | **2 / 3** | wrong content → leave out |

## Found nothing or only failed (4 titles)

- **Eclipsia: answered with nothing.** fendrix, gravix, jhaeros, jyniq, kethrax, lyrin, nyxora, onyxia, praxiel, qorva,
  vyranel, zyrvael, and xandril (iOS run).
- **Eclipsia: only failed.** durnel (timeouts), fjoral, hexion, lenyr, pynvix, solunix, svartok, tyvrel, vornix (errors
  on every title).
- **AIO: answered with nothing (48 plugins).** These include its videasy, vidfast, vidlink, vidsrc, vixsrc, netmirror,
  hdhub4u, vegamovies, uhdmovies and torrentio wrappers.
- **AIO: only failed.** ctgmovies (timeouts), fibwatch (errors), gramcinema and showbox (empty within 100 ms).
- **AIO: streams, but nothing playable here.** 4khdhub, desiflix, dahmermovies(-tv), einthusan and reanime return files
  (MKV, or unreachable hosts). movieblast's streams were all unverified.

## Risks to know before saying yes

- **Shared backends.** Enabling both members of a pair adds routes, not independence:
  - karnis + castle (Castle);
  - evyrith + vidrock (Vidrock);
  - zevran + playimdb (shared hosts).
- **Obfuscation.** 53 of AIO's 66 files and 10 of Eclipsia's 43 can't be reviewed. Pinning by hash means a file never
  changes underneath us, but we can't read what it does.
- **No licences stated.** Both are community repos that can disappear. Pinned copies keep working until their sites
  change, and the app falls back to today's web player for any title with no native stream.
- **Small sample.** These are 4 titles. The full 20-title benchmark (spec §10) runs once you OK the data use (≈ 250 MB per
  device), or on unmetered Wi-Fi.

## What "yes" looks like

Run as the operator in Supabase:

```sql
update public.plugin_repos set enabled = true, allow_plugins = '{karnis,zevran,mavonyx,rynara,soryn,evyrith}' where id = 'eclipsia';
```

The repo is first inserted disabled with `node scripts/pin-plugin-repo.mjs <manifest URL at 4e486ed…> --id eclipsia`.

For AIO `moviebox`: the same, with id `aio` and `allow_plugins = '{moviebox}'`.

Raw per-plugin lines for every run sit next to this file in `repo-scorecard-2026-10-12/`.
