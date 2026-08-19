# Native Streaming Architecture v2: The "Two-Tier Hybrid" Model

**Status:** Approved & Ready for Implementation
**Goal:** Achieve 100% native video playback (ExoPlayer/AVPlayer) with zero server bandwidth costs, combining the lightning speed of Edge APIs with the bulletproof resilience of Client-Side WebViews.

---

## The Core Philosophy
Static server-side scraping is fast but brittle (breaks on AES key rotations and Cloudflare WAFs). Client-side WebView scraping is slow but indestructible (the provider's own JS decrypts everything). 

We use **Both**. We attempt a blazing-fast serverless API call first. If it fails, we seamlessly fallback to a hidden WebView. The user never sees an error.

---

## Tier 1: The Fast Path (Cloudflare Worker)
We deploy a $0 Cloudflare Worker (100k free requests/day) to act as our primary scraping API.

1. **The Request:** App requests `GET https://our-worker.workers.dev/scrape?tmdbId=123&provider=vidsrc`.
2. **Static Scraping:** The Worker fetches the provider's HTML using spoofed browser headers.
3. **Decryption:** Using ported open-source logic (via `crypto-js`), the Worker manually decrypts the provider's AES payload to extract the `.m3u8` link.
4. **The Result:** Returns standard OMSS JSON in ~200ms. If successful, playback is virtually instantaneous.

## Tier 2: The Fallback Tank (Hidden WebView)
If the streaming site rotates their AES keys, implements a Turnstile CAPTCHA, or the Worker returns a 500/403 error, the app instantly activates Tier 2.

1. **Background Mount:** React Native mounts the `SnifferWebView` (1x1 pixel, offscreen).
2. **Execution-Based Scraping:** The WebView loads the provider's page. As a real browser, it automatically bypasses Cloudflare JS challenges and executes the new AES decryption logic natively.
3. **OMSS Formatting:** The injected JS reads the DOM, formats available dubs/qualities into OMSS JSON, and posts it to the UI.

---

## Playback Execution & The "Snatch and Kill"
Regardless of whether the `.m3u8` came from Tier 1 or Tier 2, playback follows this flow:

1. **Snatch & Kill (WebView only):** If using Tier 2, when the user hits "Play", injected JS intercepts `window.fetch` to snatch the `master.m3u8`, and immediately executes `video.remove()` to prevent the hidden web player from double-downloading video segments.
2. **Native Playback:** The URL is passed directly to `expo-video` (ExoPlayer/AVPlayer), unlocking hardware decoding, PiP, and Chromecast.
3. **Quality Switching:** `expo-video` natively reads the `master.m3u8` and handles adaptive bitrate (1080p -> 720p) instantly with zero reloading.

---

## Handling Edge Cases

### 1. IP-Locked Tokens (The Worker Trap)
Providers like *Videasy* lock their CDN tokens to the IP address that requested the page. 
* **The Problem:** If the Cloudflare Worker requests Videasy, the token is locked to the Worker's Datacenter IP. When the phone tries to play the video, it gets a `403 Forbidden`.
* **The Solution:** For IP-locked providers, the Worker returns a flag: `{ "requiresClientSniff": true }`. The app skips Tier 1 entirely and forces the WebView (Tier 2) to generate a valid token for the user's IP.

### 2. External Subtitle Injection
Provider-embedded subtitles are often unreliable or hardcoded.
* **The Solution:** The app completely bypasses the provider for subtitles. It makes a parallel API call to OpenSubtitles/TMDB to fetch clean `.srt`/`.vtt` files and injects them directly into the native `expo-video` tracks.

### 3. The Re-Sniff Loop (Self-Healing)
If a token expires during a long Watch Party, or the user switches Audio Dubs (which often requires a different CDN):
* `expo-video` throws an HTTP 403 error.
* The app catches it, saves `currentTime`, and remounts the `SnifferWebView` to snatch a fresh token.
* The app feeds the new URL to the player and calls `seek(currentTime)`.

---

## Architectural Comparisons

| Approach | Architecture | Pros | Cons |
| :--- | :--- | :--- | :--- |
| **Our Two-Tier Hybrid** | Cloudflare Worker + React Native WebView | API speed + 100% WAF resilience, $0 cost | Requires maintaining two execution paths |
| **Pure Server Scraper (CinePro)** | Node.js `fetch()` -> Decrypt AES -> API | Fast, low client CPU | Brittle. Breaks weekly on AES key updates |
| **Proxy Hub (iMayhem)** | Server API + Video Proxying to bypass CORS | Solves web CORS limits | Massive bandwidth costs ($$$) to proxy video |
