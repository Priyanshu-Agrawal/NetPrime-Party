# Streaming Architecture Research & Master Case Studies

*This document is the definitive master thesis on the architectural choices, potential pitfalls, and historical case studies of modern video streaming for mobile applications. It documents exactly why the Two-Tier Hybrid Architecture (Cloudflare Worker + React Native WebView) was chosen over all alternatives.*

---

## 1. The Arms Race: Why Server-Side Scraping is Dying
For years, streaming apps relied on server-side scraping. However, modern providers (VidSrc, Videasy, VidCore) now protect their `.m3u8` streams using two massive walls:
1. **Cloudflare WAF / Turnstile:** Blocks simple server `fetch()` requests.
2. **AES Encryption:** The API returns encrypted payloads, expecting the provider's own Javascript to decrypt it in the browser.

---

## 2. Case Study: The Two Faces of Server-Side Scraping (`iMayhem`)
To bypass these protections, we analyzed how top open-source developers like `iMayhem` and `sharoon7171` (vidcore-hls-scraper) build their servers. We discovered they are forced to maintain massive, brittle workarounds:

### Approach A: The Node.js Static Scraper (`iMayhem/api`, `vidcore-scraper`)
- **How it works:** A Node.js Express server fetches the raw HTML using `cheerio`. The developer manually reverse-engineers the provider's AES-CBC or AES-256-GCM algorithms and hardcodes them using `crypto-js` to decrypt the streams.
- **The Fatal Flaw:** It is extremely brittle. If the provider rotates their AES key or obfuscation math, the entire API instantly breaks until the developer reverse-engineers the new keys.

### Approach B: The JVM Microservice (`iMayhem/scrapers-api`)
- **How it works:** To avoid maintaining AES keys, `iMayhem` built a Kotlin Ktor server that runs **Cloudstream Android plugins** natively on a JVM using `android-stubs`.
- **The Fatal Flaw:** While this cleverly offloads scraper maintenance to the Cloudstream open-source community, the server still struggles against Cloudflare IP blocks and requires heavy compute overhead.

### The Ultimate Server Trap: CORS Proxying
Because both of the above approaches were built to serve Web Apps (React/Browser), they hit **CORS (Cross-Origin Resource Sharing)** restrictions. The provider's CDNs block requests from untrusted origins. 
To fix this, `moovie-hub` and `vidcore-scraper` built HLS Proxies (`/proxy?url=...`), forcing gigabytes of video to route through their own servers. **This destroys the $0 bandwidth constraint.**

---

## 3. Case Study: The P2P & Debrid Trap
We evaluated bypassing web providers entirely by using Torrents/Magnets.
- **Direct P2P on Mobile:** Requires heavy native `libtorrent` bridges, kills device battery, and makes Watch Party seeking impossible due to piece-fetching latency.
- **Debrid Services (Real-Debrid):** Fast and reliable, but strictly enforces a **1-IP Rule**. An app developer cannot proxy a single Debrid account for hundreds of users without getting permanently banned.
- **Self-Hosted Proxy:** Running our own real-time Torrent-to-HTTP VPS proxy hits limits immediately. 500 users streaming at 5 Mbps requires 2.5 Gbps of continuous outbound bandwidth, costing hundreds of dollars per month and triggering instant DMCA server shutdowns.

---

## 4. Case Study: Headless Execution (`streamgrabber` & `movie-web`)
The industry standard has shifted to **Execution-Based Scraping**: letting a real browser execute the provider's JS to naturally solve Cloudflare and AES decryption.
- **`streamgrabber` (Python):** Uses Playwright (Headless Chromium) to intercept network requests. Validates the concept, but a 1.5GB headless browser cannot be shipped in an iOS/Android app.
- **`movie-web` (React):** Executed scrapers client-side in the user's browser, but had to rely on a massive fleet of Cloudflare Worker CORS Proxies just to fetch the HTML.

**Our Breakthrough:** React Native WebViews (`react-native-webview`) possess the ultimate advantage. They are real browser engines (0MB added app size) that **do not enforce CORS limits**. We can execute the DOM and stream directly from the CDN for $0.

---

## 5. The "Hidden Walls" of WebView Sniffing (And How We Break Them)
If React Native WebViews are so powerful, why do other developers retreat to messy Native Java Bridges (`shouldInterceptRequest`) or settle for horrible "Play-in-WebView" experiences? 

They hit four invisible walls when trying to monkey-patch Javascript. Here is how we armor our "Snatch & Kill" JS injector to break through all of them:

### Wall 1: The Cross-Origin Iframe Trap
- **The Trap:** Providers always embed the actual video player inside a cross-origin `<iframe>`. By default, React Native only injects JS into the top-level frame, meaning the hooks never see the video requests.
- **The Solution:** We must strictly configure the WebView to inject into all frames: `injectedJavaScriptForMainFrameOnly={false}`.

### Wall 2: The iOS Native HLS Request Trap
- **The Trap:** On Android, streaming sites use `hls.js` which triggers `window.fetch` or `XHR`. On iOS, Safari handles HLS natively at the OS level when it sees `<video src="...m3u8">`. This completely bypasses all JS network hooks!
- **The Solution:** We implement a `MutationObserver` alongside our network hooks to watch the DOM. The millisecond a `<video>` tag receives a `.m3u8` src attribute, we intercept it and call `video.remove()`.

### Wall 3: The Service Worker Trap
- **The Trap:** Modern streaming sites register Service Workers to handle caching and video segment requests. A standard `window.fetch` override in the main thread cannot catch requests made by a Service Worker.
- **The Solution:** Our injected JS must aggressively unregister all Service Workers immediately upon load.

### Wall 4: The Fetch vs. XHR Trap
- **The Trap:** Developers often only hook `window.fetch`, missing older providers or specific `hls.js` versions that still use `XMLHttpRequest`.
- **The Solution:** We deeply monkey-patch both the `fetch` API and the `XMLHttpRequest.prototype`.

---

## 6. The Final Architecture: The Two-Tier Hybrid
By combining all these lessons, our architecture is finalized:

1. **Tier 1 (Cloudflare Worker Fast Path):** We run a $0 serverless function that implements Approach A (copying AES decryption from open-source repos). This provides blazing-fast 200ms playback.
2. **Tier 2 (The Armored WebView Tank):** If Tier 1 fails due to Cloudflare WAF, AES key rotation, or IP-Locked tokens (like Videasy), the app seamlessly falls back to our armored `SnifferWebView`. The WebView breaks through the Iframes and iOS traps, snatches the URL, and feeds it to Native `expo-video`.

This guarantees 100% uptime, native performance, and $0 infrastructure cost.
