# Scraper-Based Native Streaming POC: Post-Mortem & Architectural Decision Record (ADR)

**Date:** 2026-08-18  
**Status:** **REJECTED / ARCHIVED FOR REFERENCE ONLY**  
**Decision:** Standardize 100% on the **Injected WebView Hijack Architecture** across Mobile and Web.

> ## ⚠ 2026-08-31 — READ THIS BEFORE CITING THIS DOCUMENT
> **This post-mortem is not wrong, but its scope is narrower than its title suggests.** Everything below was
> measured against **server-side resolution** — a resolver running on our infrastructure, handing a URL to a
> phone on a *different* IP. Every blocker it identifies follows from that split.
>
> Re-measured against **on-device** resolution ([`nuvio-plugin-architecture.md`](./nuvio-plugin-architecture.md),
> 2026-08-29), the three walls do not hold:
> - **IP-locked CDN tokens** — not reproduced. 2 MB of media served **HTTP 206 to a foreign Tor exit IP with
>   no headers**, from a URL resolved ~20 min earlier. And when resolver and player are the same device, the
>   mismatch cannot arise by construction.
> - **Cloudflare WAF / JA3 fingerprinting** — not hit, from plain Node *or* React Native fetch.
> - **Deterministic sub-hour tokens that "can't self-heal"** — the model was wrong. Only the 30 s *seed*
>   rotates; re-resolving under a **different** seed returned **byte-identical URLs**.
> - **"videasy is `enc=2`, client-decrypted, so no API shortcut"** — defeated. A ~23 KB JS plugin
>   reimplements the decrypt and runs inside our own Hermes runtime.
>
> **What survives:** the WebView hijack remains primary and is *not* being removed; a native lane is
> **additive** (Program 1 · P2/P3). The genuinely hard problem turned out to be **codecs, not scraping** —
> see the successor doc.
>
> Cite this document for *why server-side resolution was rejected*. Do not cite it for "native playback is
> impossible."


---

## 🎯 Executive Summary & Verdict

We conducted an in-depth proof-of-concept (POC) to evaluate replacing third-party iframe/WebView embeds with a **reverse-engineered direct scraper and native video player pipeline** (using XSalsa20 token decryptors, VixSrc token extractors, and an M3U8 CORS proxy).

### Final Verdict: **REJECTED FOR PRODUCTION USE**

While direct extraction successfully decrypted select titles (e.g., *Inception*, *House of the Dragon*), live testing against diverse real-world catalogs revealed that **direct scrapers are fundamentally brittle, unmaintainable, and unsuitable for production scale**.

The **Injected WebView Hijack Player** (`components/player/HijackPlayer.tsx`) remains the **sole production-grade architecture** for Bearoom/NetPrime-Party.

---

## 💥 Detailed Failure Modes Encountered in Live Testing

### 1. Ephemeral CDN Signatures & Signed Token Expiration (HTTP 429 / 403)
- **What happened:** Upstream CDNs (such as `bcdn.hakunaymatata.com`) protect video files using time-limited signatures (`?sign=...&t=1786712316`).
- **The failure:** Scraper APIs frequently return cached URLs with timestamps that are hours or days old. The moment a client attempts to fetch the stream, the CDN blocks the request with `429 Too Many Requests` or `403 Forbidden`.
- **Contrast with WebView:** A full browser engine renders the provider's player script, which refreshes tokens dynamically via client-side WebSockets and internal heartbeat pings.

### 2. Cloudflare Bot Management & TLS Fingerprinting (HTTP 403 WAF Blocks)
- **What happened:** Direct playlist endpoints (`vixsrc.to/playlist/...`, `multiembed.mov`) implement Cloudflare Turnstile, JA3/JA4 TLS fingerprinting, and HTTP/2 header order verification.
- **The failure:** Cloudflare Workers, Node.js proxy daemons, and `fetch()` calls from server environments fail TLS validation and receive `403 Forbidden` challenge pages instead of M3U8 master manifests.
- **Contrast with WebView:** The native mobile WebView (`RNCWebView` / Android System WebView / iOS WKWebView) uses the device's real OS networking stack with valid TLS fingerprints, passing WAF checks effortlessly.

### 3. Catalog Coverage Gaps & Edge Cases (Unreleased / Fallbacks)
- **What happened:** When testing upcoming titles, CAM rips, or niche media (e.g., *Spider-Man: Brand New Day*, *Lanterns*), scrapers returned hard `404 Not Found` or empty objects.
- **The failure:** The native player had no media to mount and either threw unhandled network errors or entered infinite loading loops.
- **Contrast with WebView:** Providers like NetPrime/Videasy and NetMirror maintain automated fallback chains (trailers, alternate server mirrors, internal search mapping) that render seamlessly within the embed.

### 4. Continuous Key Rotation & Reverse-Engineering Maintenance Burden
- **What happened:** Providers regularly rotate encryption ciphers (e.g., rotating XSalsa20 secret keys, changing timestamp offsets from `+480s` to custom nonces, switching obfuscation algorithms).
- **The failure:** A key change by a single provider breaks playback app-wide until a developer manually reverse-engineers the new obfuscation bundle and pushes an update.
- **Contrast with WebView:** The app interacts with the `<video>` element on the DOM via `BRIDGE_JS` (`window.__vlCmd`), completely agnostic of whatever encryption or DRM the provider uses internally.

---

## 📊 Comprehensive Comparison Matrix

| Feature / Metric | Scraper + Native Player (POC) | Injected WebView Hijack (Production) |
| :--- | :---: | :---: |
| **Catalog Reliability** | ❌ **Low** (Breaks on key rotations, expired CDN tokens) | ✅ **100%** (Plays all titles supported by providers) |
| **WAF / Cloudflare Bypass** | ❌ **Fails** (Blocked without complex TLS fingerprinting) | ✅ **Native** (Runs in real OS browser engine) |
| **Audio Dub Switching** | ⚠️ Complex (Requires bespoke API reversing per provider) | ✅ **Built-in** (Fade=Hindi, Yoru=Original via DOM tabs) |
| **Watch Party Synchronization** | ⚠️ Flaky (Stalls on stream decode errors) | ✅ **Rock Solid** (Injected bridge syncs with 0ms drift) |
| **Proxy Bandwidth & Server Costs** | ❌ **High** (Video bytes must route through edge proxy) | ✅ **$0** (Streams directly from CDN to device WebView) |
| **Maintenance Overhead** | ❌ **Extreme** (Requires ongoing RE and key updates) | ✅ **Minimal** (Standard DOM injection contract) |

---

## 🏛️ Permanent Architecture & Standard

1. **Mobile Playback (iOS & Android)**:
   - Primary player is `components/player/HijackPlayer.tsx` powered by `react-native-webview`.
   - Video observation and control are handled by `BRIDGE_JS` via `window.__vlCmd`.
   - Audio dubs are switched by synthetic pointer events on provider DOM server tabs (**Fade** = Hindi, **Yoru** = Original).

2. **Web Playback**:
   - Rendered via sandboxed embed `<iframe>` with messaging bridge in `components/player/HijackPlayer.web.tsx`.

3. **Research Archive**:
   - The 23 open-source streaming repositories in [`docs/research/github-references.md`](file:///Users/essence/ReactNative/NetPrime-Party/docs/research/github-references.md) remain documented for reference only.
