# 📚 Bearoom — GitHub References & Stream Scraper Research Archive

> [!CAUTION]
> **ARCHIVED FOR RESEARCH & REFERENCE ONLY — NOT USED IN PRODUCTION**  
> Direct stream scraping was evaluated in a comprehensive POC and **REJECTED** due to Cloudflare WAF blocks, rotating token expirations, and missing catalog coverage.  
> **Production Standard:** Bearoom uses the **Injected WebView Hijack Architecture** (`components/player/HijackPlayer.tsx`).  
> 📖 Read the full analysis: [**Scraper POC Post-Mortem & ADR**](scraper-poc-postmortem.md)

---

## 🏆 Tier 1 — Directly Adaptable (TypeScript/JavaScript, Working Extractors)

### 1. `cool-dev-guy/vidsrc.ts`

- **URL:** <https://github.com/cool-dev-guy/vidsrc.ts>

- **Language:** TypeScript (Node.js + Deno)
- **What it does:** Extracts direct `.m3u8` streams from VidSrc domains (`.me`, `.net`, `.xyz`, `.in`, `.io`) using TMDB IDs.
- **API:** `tmdbScrape("TMDB_ID", "movie")` → returns `[{ name, stream: "https://playlist.m3u8" }]`
- **Deployable:** Has a Vercel branch for serverless deployment.
- **Adaptability for Bearoom:** ⭐⭐⭐⭐⭐ — TypeScript, returns direct M3U8, can be integrated as a resolver in our cascade.
- **Risk:** VidSrc domains rotate frequently; may need maintenance.

### 2. `4texas4/movie-scraper`

- **URL:** <https://github.com/4texas4/movie-scraper>
- **Language:** JavaScript/TypeScript
- **What it does:** Multi-provider movie stream scraper.
- **Adaptability for Bearoom:** ⭐⭐⭐⭐ — General purpose movie scraper, may have working provider implementations.

### 3. `smy778/EncDecEndpoints`

- **URL:** <https://github.com/smy778/EncDecEndpoints>
- **Language:** JavaScript
- **What it does:** API layer for encryption/decryption of streaming provider responses. Handles converting encrypted strings from third-party sites to structured stream data.
- **Status:** Core logic made closed-source (enc/dec methods change frequently).
- **Adaptability for Bearoom:** ⭐⭐⭐ — Useful as reference for understanding provider encryption patterns.

---

## 🥈 Tier 2 — Adaptable with Porting (Python, but Proven Working)

### 4. `walterwhite-69/Vidlink.pro-Decryptor`

- **URL:** <https://github.com/walterwhite-69/Vidlink.pro-Decryptor>
- **Language:** Python (FastAPI + PyNaCl + curl_cffi)
- **What it does:** Reverse-engineered VidLink's `XSalsa20-Poly1305` encryption. Extracts direct M3U8 streams without WASM/headless browser.
- **Key technique:** Uses `curl_cffi` to mimic Chrome 110 TLS fingerprint (bypasses Cloudflare WAF).
- **API endpoints:** `/movie/{tmdb_id}`, `/tv/{tmdb_id}/{s}/{e}`
- **Adaptability for Bearoom:** ⭐⭐⭐⭐⭐ — The crypto can be ported to JS using `tweetnacl`. The `curl_cffi` TLS fingerprinting is the key insight — our Node.js fetch lacks this. Could be run as a Python microservice or ported to a Cloudflare Worker with Web Crypto API.
- **Risk:** Encryption keys may rotate; needs monitoring.

### 5. `walterwhite-69/Proxify-Streams`

- **URL:** <https://github.com/walterwhite-69/Proxify-Streams>
- **Language:** Python (Flask)
- **What it does:** Unified stream proxy aggregator. Consolidates multiple anime/streaming providers into a single API. Handles XOR/Base64 encoding, CORS bypass, and TLS fingerprinting.
- **Adaptability for Bearoom:** ⭐⭐⭐⭐ — Architecture is exactly what we need. Flask → can be ported to Express/Hono.

### 6. `cool-dev-guy/vidsrc-api`

- **URL:** <https://github.com/cool-dev-guy/vidsrc-api>
- **Language:** Python
- **What it does:** Predecessor to `vidsrc.ts`. Python-based VidSrc API wrapper.
- **Adaptability for Bearoom:** ⭐⭐⭐ — Replaced by the TypeScript version above, but useful as reference.

### 7. `heyitswit/vidsrc-bypass`

- **URL:** <https://github.com/heyitswit/vidsrc-bypass>
- **Language:** Python
- **What it does:** Bypass tool for VidSrc protection mechanisms.
- **Adaptability for Bearoom:** ⭐⭐⭐ — Reference for understanding VidSrc's protection layers.

---

## 🥉 Tier 3 — Reference Architecture & Ecosystem

### 8. `cinepro-org/core`

- **URL:** <https://github.com/cinepro-org/core>
- **What it does:** OMSS-compliant (Open Media Streaming Standard) scraping engine. Modular provider system for aggregating video stream sources. Uses TMDB metadata.
- **Adaptability for Bearoom:** ⭐⭐⭐⭐ — Architectural reference for our provider cascade pattern.
- **Docs:** <https://docs.cinepro.cc>

### 9. `cinepro-org/backend`

- **URL:** <https://github.com/cinepro-org/backend>
- **What it does:** Backend service for CinePro — manages provider health, caching, and API gateway.
- **Adaptability for Bearoom:** ⭐⭐⭐ — Reference for provider health monitoring.

### 10. `omss-spec/omss-spec`

- **URL:** <https://github.com/omss-spec/omss-spec>
- **What it does:** Open Media Streaming Standard specification. Defines interfaces for stream resolvers, providers, and cascading.
- **Adaptability for Bearoom:** ⭐⭐⭐ — Our `IStreamResolver` interface aligns with OMSS patterns.

### 11. `majusss/purevideo`

- **URL:** <https://github.com/majusss/purevideo>
- **What it does:** Clean video streaming frontend with multi-provider support.
- **Adaptability for Bearoom:** ⭐⭐⭐ — UI/UX reference for provider switching.

### 12. `DivineChile/vidsrc-scraper`

- **URL:** <https://github.com/DivineChile/vidsrc-scraper>
- **Language:** Node.js + Playwright
- **What it does:** Uses Playwright headless browser to extract `.m3u8` streams and subtitles from VidSrc.
- **Adaptability for Bearoom:** ⭐⭐⭐⭐ — Playwright approach is the most reliable for bypassing WAF. Could run as a lightweight microservice.

### 13. `pratikkarbhal/m3u8_StreamSniper`

- **URL:** <https://github.com/pratikkarbhal/m3u8_StreamSniper>
- **What it does:** Captures M3U8 URLs from websites using Selenium.
- **Adaptability for Bearoom:** ⭐⭐ — Older approach, Selenium is heavier than Playwright.

---

## 🎌 Tier 4 — Anime (Future Scope — Post V1)

### 14. `SH0MIK/Anivault-Scraper`

- **URL:** <https://github.com/SH0MIK/Anivault-Scraper>
- **What it does:** Anime stream scraper for AniVault sources.

### 15. `consumet/api.consumet.org`

- **URL:** <https://github.com/consumet/api.consumet.org>
- **What it does:** Meta API for anime/manga/movie/book providers. Widely used aggregator.

### 16. `yur3iDev/consumet-mc`

- **URL:** <https://github.com/yur3iDev/consumet-mc>
- **What it does:** Consumet fork/wrapper.

### 17. `sleeyax/stremio-consumet-addon`

- **URL:** <https://github.com/sleeyax/stremio-consumet-addon>
- **What it does:** Stremio addon using Consumet for anime sources.

### 18. `demonkingswarn/luffy`

- **URL:** <https://github.com/demonkingswarn/luffy>
- **What it does:** Anime streaming CLI tool.

---

## 🎬 Tier 5 — Full Streaming Apps (Architecture Reference)

### 19. `iMayhem/moovie-web`

- **URL:** <https://github.com/iMayhem/moovie-web>
- **What it does:** Full movie streaming web app. Reference for UI/UX patterns.

### 20. `iMayhem/moovie-hub`

- **URL:** <https://github.com/iMayhem/moovie-hub>
- **What it does:** Movie hub aggregator — companion to moovie-web.

### 21. `codegeasse1/hikari`

- **URL:** <https://github.com/codegeasse1/hikari>
- **What it does:** Streaming app with multi-provider support.

### 22. `himanshu8443/8-Stream`

- **URL:** <https://github.com/himanshu8443/8-Stream>
- **Language:** TypeScript/Next.js
- **What it does:** Movie/series streaming app using Consumet API. **No longer maintained.**

### 23. `fragmentone/f1streamer`

- **URL:** <https://github.com/fragmentone/f1streamer>
- **Language:** JavaScript/Node.js
- **What it does:** F1 live stream bot using Puppeteer + FFmpeg. Intercepts HLS playlists via headless browser.
- **Interesting:** Uses Puppeteer to intercept network requests — same technique our web sniffer needs.

---

## 🔑 Key Takeaways for Bearoom V2 Scraping

1. **`vidsrc.ts` is the best starting point** — TypeScript, returns direct M3U8, can be added as a resolver directly in our cascade.

2. **VidLink decryption requires `XSalsa20-Poly1305`** — can be ported to JS using `tweetnacl-js` npm package. The production keys are reverse-engineered and available.

3. **TLS Fingerprinting is the #1 blocker** — Node.js `fetch()` has a non-browser TLS fingerprint. Solutions:
   - Use `curl_cffi` (Python) or `node-curl-impersonate` (Node.js) to mimic Chrome's JA3 hash
   - Run a lightweight Python microservice (FastAPI) alongside the proxy
   - Use Playwright/Puppeteer for providers that require browser sessions

4. **Provider APIs rotate frequently** — Need a health-check system (GitHub Actions cron) to detect when providers break and fall back automatically.

5. **The Playwright approach is most resilient** — `DivineChile/vidsrc-scraper` uses Playwright to load the real page, which runs the provider's own JS/WASM, bypasses all WAF, and intercepts the M3U8 from network traffic. This is what our mobile WebView sniffer does — the web equivalent needs Playwright on a server.
