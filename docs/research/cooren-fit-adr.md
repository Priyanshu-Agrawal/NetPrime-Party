# ADR — Cooren as a stream backend for Bearoom (validation spike)

**Date:** 2026-08-25 · **Status:** ⛔ **NO-GO — dropped.** Too unstable to pursue for Bearoom even in a dev environment (owner decision, 2026-08-25). Keep the WebView hijack.
**Related:** `docs/research/scraper-poc-postmortem.md` (native-resolver rejection), HANDBOOK §3.4
**Spike target:** does a self-hosted Cooren (`/Users/essence/ReactNative/CoorenLabs`) resolve real
streams that play end-to-end on a device *on a different IP than the resolver*, and at what cost?

## TL;DR
Cooren's **vidcore proxy path works** — it resolved a real title and the stream **plays end-to-end,
including remotely through a tunnel** (a real off-network client path). But it does so by **relaying
every video byte through Cooren's own server** (~23 MB/min @720p, ~46 @1080p) after a **~31 s
headful-browser resolve**, and **vidfast failed** on the one attempt. This is exactly the
bandwidth+ops model Bearoom rejected. The **GO/NO-GO hinges on one pending check** (below): is the raw
CDN IP-locked? If yes → proxy is mandatory (bandwidth cost is unavoidable). If no → the resolved URL
could be handed straight to the device (no Cooren bandwidth), and Cooren is just a cheap resolver.

## What was measured (self-hosted Cooren, cache OFF, `SHOW_PROXIED_URL=true`)
Test title: **Fight Club (TMDB 550)**, `GET /stream/vidcore/movie/550`.

| Metric | Result |
|---|---|
| Resolve success (vidcore) | ✅ HTTP 200 |
| **Resolve latency** | **31.6 s** (headful `puppeteer-real-browser` sniff; blocks first frame) |
| Sources returned | 4 × HLS, up to **4K** (3840×2160), + 1080p/720p/480p; `isEncrypted:false` |
| Return shape | `/proxy/m3u8-proxy?url=<raw CDN>&headers={"referer":"vidcore.net"}` (relative→absolute via `SERVER_ORIGIN`) |
| Raw CDN host | `moon.peakstorm.top` (master), segments on `keenanchor.top` (fMP4 `.m4s`) |
| **Proxy rewrite** | ✅ full tree master→variant→segment, **across hosts**; `Range` forwarded (seek works) |
| **Playback via proxy (local)** | ✅ ffmpeg pulled 20.1 s of 720p H.264/AAC (7.73 MB) |
| **Playback via proxy (remote, through cloudflared tunnel)** | ✅ ffmpeg pulled 10.1 s (4.0 MB) over CF→Cooren→CDN |
| **Bandwidth (through Cooren)** | **~23 MB/min @720p**, ~46 @1080p → ~3.2 GB / ~6.4 GB per full movie |
| Raw CDN from **resolver IP**, no headers | HTTP 200 (master, variant, and a 2.1 MB segment) → **not header-locked** here |
| Token | base64 `9swwL9CZrTcfTSfdZKxDaA:4U7BykW3d6PBroc9nouRxA` — opaque id:secret, **no readable IP/expiry** |
| Freshness | raw token still 200 at ~4 min (longer TTL not yet measured) |
| **vidfast (TMDB 550)** | ❌ **HTTP 000 after 28.8 s** on the one attempt — sniff/auto-clicker missed the m3u8 (flaky, non-scalable) |
| videasy (Bearoom's shipping provider) | ⛔ **not supported by Cooren at all** |

## The one pending check (needs a genuinely different IP — your phone)
Everything above was from the resolver's own IP, where the raw CDN plays freely. The cost verdict turns
entirely on **IP-lock**. With Cooren running + a cloudflared tunnel live, on a phone **with WiFi off
(cellular = different IP)**:
1. **Raw CDN direct** → open `https://moon.peakstorm.top/vd/<token>/master.m3u8` → **403 = IP-locked**
   (proxy mandatory) · **200 = not IP-locked** (raw URL could go straight to the device).
2. **Proxied via tunnel** → open the `…trycloudflare.com/proxy/m3u8-proxy?…` master in a HLS-capable
   player (iOS Safari plays HLS natively / VLC) → **should play** (bytes come from Cooren's IP).

## Decision tree
- **Raw is IP-locked (expected, matches videasy's Hindi CDN):** the only way to play is **all bytes
  through Cooren** → confirms the **~$500/mo bandwidth + headful-Chromium ops** cost Bearoom rejected.
  Cooren *works*, but reintroduces that cost **and** requires re-adding the abandoned native player
  (`expo-video`/hls.js) to consume the m3u8. → **Fast-path only if that cost is acceptable.**
- **Raw is NOT IP-locked:** hand the resolved URL straight to the device (no Cooren bandwidth); Cooren
  becomes a cheap resolver. Remaining risks: **token TTL** (re-resolve per play; don't cache — Cooren's
  default 2-day source cache must stay OFF), the **31 s resolve latency**, and **WAF at resolve time**.

## Hard limits regardless of the check
- **No videasy support** → Cooren cannot replace the WebView hijack; at most an **optional fast-path for
  *other* providers/titles** (vidcore proven; vidfast flaky), WebView stays primary/fallback.
- **31 s resolve latency** per cold play (headful browser) — unacceptable as the sole path; needs
  pre-resolve/caching, which fights token TTL.
- **vidfast unreliable** (1/1 failed here); real-browser sniff is single-instance, serialized, headful.
- **Not production-safe as-is:** `/proxy/*` is an **open proxy / SSRF** (no allow-list/auth), **no
  rate-limit**, **CORS `*`**, no request timeouts, resolved-source cache up to 2 days. All must be fixed
  before any deploy.

## Decision (2026-08-25): NO-GO — dropped
Abandoned during the spike as too unstable/unfavorable for Bearoom even in dev. Deciding factors:
- **No `videasy`** (Bearoom's only shipping provider) → cannot replace the WebView; at most an optional
  fast-path for *other* providers.
- **`vidfast` failed** (1/1: HTTP 000 @29 s) and the resolver is a **single serialized headful Chrome**
  with **~31 s** cold-resolve latency — unusable as a primary path.
- **The IP-lock check was never cleanly settleable in this environment:** a browser can't distinguish
  200 (downloads/blank) from 403 (Forbidden) on `.m3u8`/`.m4s`, and wireless-ADB puts the phone on the
  Mac's own public IP. It's also **moot** — even the best case (not IP-locked) still requires
  re-introducing the abandoned native player, per-play re-resolve (token TTL), and survives WAF only
  because Cooren ran on a **residential Mac IP** (a datacenter deploy would likely be CF-challenged).
- **Proxy path works but at rejected cost:** proven end-to-end (local + tunnel) at ~23–46 MB/min through
  Cooren = the ~$500/mo bandwidth model Bearoom already rejected for its $0 goal.
- Not production-safe as-is (open proxy/SSRF, no auth, CORS `*`, no timeouts, 2-day stale-link cache).

**Outcome:** keep the WebView hijack as the sole player. Cooren is archived as reference only (like
`scraper-poc-postmortem.md`); revisit only if a same-IP resolve+play + affordable proxy becomes viable.
What *was* validated stands as data (see the metrics table): Cooren's `/proxy` HLS relay is genuinely
functional and could serve a non-IP-locked, cost-tolerant use case — just not Bearoom's.

## Repro (spike harness — throwaway, no app changes)
```
cd /Users/essence/ReactNative/CoorenLabs
# .env already: PORT=3000, ENABLE_CACHE=false, SHOW_PROXIED_URL=true
bun run src/index.ts &                     # headful Chrome pops up on resolve
curl "http://localhost:3000/stream/vidcore/movie/550"          # ~31s, returns proxied HLS
ffmpeg -allowed_extensions ALL -i "<proxied 720p url>" -t 12 -c copy /tmp/clip.mp4   # verify playback
cloudflared tunnel --url http://localhost:3000                 # remote/different-IP test
# restart Cooren with SERVER_ORIGIN=<tunnel> so rewritten child URLs are reachable off-network
```
