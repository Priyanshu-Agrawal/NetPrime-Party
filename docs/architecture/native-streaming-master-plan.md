# 🎬 Master Architecture & Implementation Plan: Zero-Cost ($0) Native Streaming & Watch Party

> **Document Status:** Complete Architecture & Modular Implementation Blueprint  
> **Target Audience:** All AI Agents & Developers. Designed to be 100% modular so any agent can pick up any phase independently without context loss.  
> **Core Objective:** Deliver 100% Native Video Playback across Mobile (iOS/Android) and Web with Hindi/Original Audio Dubs, Multi-Provider Fallbacks, and Realtime Watch Party Sync at **$0.00 Infrastructure Cost**.

---

## 📑 Table of Contents
1. [Architecture Overview & System Topology](#1-architecture-overview--system-topology)
2. [Edge Cases & Mitigation Strategies](#2-edge-cases--mitigation-strategies)
3. [The $0 Infrastructure Matrix](#3-the-0-infrastructure-matrix)
4. [Module 1: Stream Resolvers & Decryptor Engine](#4-module-1-stream-resolvers--decryptor-engine)
5. [Module 2: M3U8 CORS & Media Segment Edge Proxy](#5-module-2-m3u8-cors--media-segment-edge-proxy)
6. [Module 3: Web Native Video Player (`HlsPlayer.web.tsx`)](#6-module-3-web-native-video-player-hlsplayerwebtsx)
7. [Module 4: Mobile Native Player (`expo-video`) & Sniffer](#7-module-4-mobile-native-player-expo-video--sniffer)
8. [Module 5: Audio Dubs & Watch Party Sync](#8-module-5-audio-dubs--watch-party-sync)
9. [Step-by-Step Execution Milestones](#9-step-by-step-execution-milestones)
10. [Self-Review & Verification Checkpoints](#10-self-review--verification-checkpoints)

---

## 1. Architecture Overview & System Topology

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT REQUEST LAYER ($0)                         │
│                                                                             │
│ • User selects title (TMDB ID) + Audio Language (Hindi / Original)         │
│ • Universal MediaRef: { tmdbId: "27205", type: "movie", dub: "hindi" }      │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                 RESOLVER CASCADE & DECRYPTOR (services/streaming/)          │
│                                                                             │
│ 1. Fast Direct API Decryptor: VidLink / VixSrc (~150ms HTTP)                │
│ 2. Background Sniffer: Offscreen WebView (Mobile) / Browser context (Web)   │
│    - NetPrime / Videasy: selects server "Fade" (Hindi) or "Yoru" (Original) │
│ 3. Provider Fallback Chain: MultiEmbed -> VidSrc -> VidFast -> VidCore      │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                         Master .m3u8 Stream + Headers
                                       │
         ┌─────────────────────────────┴─────────────────────────────┐
         ▼ (Mobile: iOS / Android)                                   ▼ (Web: Desktop / Tablet)
┌──────────────────────────────────────┐            ┌──────────────────────────────────────┐
│       NATIVE HARDWARE PLAYER         │            │      CLOUDFLARE WORKER PROXY         │
│       (expo-video / VideoView)       │            │      (m3u8ProxyEngine.ts - $0)       │
│                                      │            └──────────────────┬───────────────────┘
│ • AVPlayer (iOS) / ExoPlayer (Android│                               ▼
│ • Direct CDN connection (No proxy)   │            ┌──────────────────────────────────────┐
│ • Hardware accelerated decoding      │            │          HlsPlayer.web.tsx           │
│ • Background audio & Native PiP      │            │          (HTML5 Video + hls.js)      │
│ • Bearoom Amber UI overlay controls  │            │                                      │
│ • Dub Hot-Swap without rebinding     │            │ • 100% Native HTML5 Video            │
└──────────────────┬───────────────────┘            │ • Zero iframes & Zero popup ads      │
                   │                                │ • Bearoom Amber UI overlay controls  │
                   │                                └──────────────────┬───────────────────┘
                   │                                                   │
                   └─────────────────────────┬─────────────────────────┘
                                             ▼
                             ┌───────────────────────────────┐
                             │    SUPABASE REALTIME SYNC     │
                             │  (Watch Party Room Authority) │
                             └───────────────────────────────┘
```

---

## 2. Edge Cases & Mitigation Strategies

| Edge Case / Problem | Root Cause | Robust Mitigation in this Plan |
| :--- | :--- | :--- |
| **Short-Lived & Ephemeral Tokens** | Streaming CDNs expire stream tokens after 2–4 hours. | **Auto Re-Resolve on Error**: If `hls.js` or `expo-video` encounters a fatal network/403 error during playback, the player automatically triggers a background 1-second re-resolve and resumes at the current timestamp (`player.currentTime`). |
| **WAF / Cloudflare Anti-Bot Challenges** | Server-side scrapers get blocked by Cloudflare Turnstile when querying from datacenter IPs. | **On-Device Sniffing (Mobile)**: Scrapes using the user's real residential device IP inside a hidden 1×1 WebView. Immune to datacenter IP bans. |
| **Provider Encryption Changes ("Rot")** | Embed providers change obfuscation and WASM hashing algorithms frequently. | **DOM Sniffer Execution**: Because the provider's *own* official JavaScript runs in the background sniffer and does the decryption, our hook captures the `.m3u8` regardless of future algorithm changes. |
| **CORS & `X-Frame-Options` on Web** | Web browsers block external iframes and cross-origin HLS fetches. | **M3U8 & Segment Edge Proxy**: Cloudflare Worker / local proxy rewrites all playlist lines and injects `Access-Control-Allow-Origin: *` and `Range` headers. |
| **Multi-Language Audio Separation** | Dubs are separate CDN servers (e.g. Fade for Hindi), not multi-track audio inside one manifest. | **Server Dub Selector + Stream Swap**: Audio picker maps to server names (`Fade` = Hindi, `Yoru` = Original) and performs an in-memory stream swap (`replaceAsync` / `loadSource`) preserving timeline position. |
| **Watch Party Time Drift across Platforms** | Web and Mobile clients decode frames at slightly varying clock speeds. | **Supabase Lease Authority**: Host broadcasts periodic anchor timestamps. Guests apply rate modulation (`playbackRate = 1.05` or `0.95`) for small drifts (<2s) and hard seek for large drifts (>3s). |

---

## 3. The $0 Infrastructure Matrix

1. **Client-Side Compute ($0.00)**:
   - iOS / Android devices run the background resolver and native hardware decoders. Zero server costs.
2. **Cloudflare Workers ($0.00)**:
   - Free tier includes **100,000 requests/day**. Used solely for the Web M3U8 & segment proxy.
   - Video chunks are streamed directly via `TransformStream` without buffering in memory, consuming negligible CPU.
3. **Supabase Free Tier ($0.00)**:
   - Handles room presence, chat, and host authority sync (up to 200 concurrent connections per project).
4. **GitHub Actions ($0.00)**:
   - 2,000 free minutes/month for scheduled provider health checks.

---

## 4. Module 1: Stream Resolvers & Decryptor Engine

### Target Directory: `services/streaming/`

### 4.1 Interface Contract (`services/streaming/types.ts`)
```ts
export interface MediaRef {
  tmdbId: string;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
}

export interface DubServer {
  id: string;        // e.g. "fade", "yoru", "omen", "killjoy"
  language: string;  // e.g. "Hindi", "Original", "Spanish", "German"
  streamUrl: string;
  headers?: Record<string, string>;
}

export interface ResolvedStream {
  streamUrl: string;
  providerId: string;
  dubServers: DubServer[];
  activeDub: string;
  headers?: Record<string, string>;
}

export interface IStreamResolver {
  id: string;
  name: string;
  resolve(media: MediaRef, dubPreference?: string): Promise<ResolvedStream>;
}
```

### 4.2 Resolvers Included:
1. **`vidLinkResolver.ts`**: Fast direct API decryptor using client-side hashing (~150ms).
2. **`vixSrcResolver.ts`**: Fast direct API query (`/api/movie/${id}`).
3. **`videasySniffer.ts`**: On-device / browser background sniffer for NetPrime/Videasy with synthetic pointer event dub selector (**Fade for Hindi**, **Yoru for Original**).
4. **`multiEmbedResolver.ts`**: Fast fallback resolver.
5. **`streamResolverCascade.ts`**: Orchestrates the fallback waterfall:
   - Tries primary with requested dub -> fast API fallback -> secondary scraper fallback.
   - Stores failure memory in MMKV/UniversalStorage to prevent repeating failed attempts.

---

## 5. Module 2: M3U8 CORS & Media Segment Edge Proxy

### Target Directory: `services/proxy/` & `workers/`

### 5.1 Proxy Engine (`services/proxy/m3u8ProxyEngine.ts`)
- Zero-dependency parser that recursively intercepts and rewrites:
  - `#EXT-X-STREAM-INF` (Variant resolution streams)
  - `#EXT-X-MEDIA` (Audio / Subtitle tracks)
  - `#EXT-X-KEY` (AES-128 encryption keys)
  - `#EXT-X-MAP` (fMP4 initialization chunks)
  - Transport stream chunks (`.ts` / `.m4s` / `.mp4`)
- Preserves base64-encoded upstream headers (`Referer`, `User-Agent`, `Origin`).

### 5.2 Cloudflare Worker (`workers/streamProxyWorker.js`)
- Deployable to Cloudflare Workers for $0.
- Handles `GET /proxy/m3u8` and `GET /proxy/segment`.
- Passes through HTTP `Range: bytes=...` headers for instant seeking (`206 Partial Content`) and sets `Access-Control-Allow-Origin: *`.

---

## 6. Module 3: Web Native Video Player (`HlsPlayer.web.tsx`)

### Target File: `components/player/HlsPlayer.web.tsx`

### 6.1 Capabilities
- Powered by `hls.js` (Chrome, Firefox, Edge) and native HLS (Safari).
- Implements `PlayerHandle` (`play`, `pause`, `seek`, `setRate`, `fullscreen`, `setQuality`, `setAudio`).
- Emits all Bearoom `PlayerEvent`s (`ready`, `play`, `pause`, `seeking`, `seeked`, `tick`, `quality`, `audio`).
- **Dub Hot-Swap**: Calling `setAudio("Hindi")` loads the new proxied M3U8 and restores playback position seamlessly without remounting the video player.

---

## 7. Module 4: Mobile Native Player (`expo-video`) & Sniffer

### Target Files:
- `components/player/NativeVideoPlayer.tsx`
- `components/player/StreamResolverWebView.tsx`
- `components/player/NativePlayerControls.tsx`

### 7.1 Capabilities
- **`expo-video` (`VideoView` + `useVideoPlayer`)**:
  - Full hardware acceleration via `AVPlayer` (iOS) and `ExoPlayer` (Android).
  - Background audio playback & Picture-in-Picture (PiP) enabled via `plugins/bearoom-playback`.
  - True lock screen media metadata and playback controls.
- **Offscreen `StreamResolverWebView`**:
  - 1×1 hidden WebView with `mediaPlaybackRequiresUserAction={false}` and ad-redirect blocking.
  - Injected script executes synthetic pointer clicks to activate the target audio server (**Fade** for Hindi, **Yoru** for English).
  - Intercepts `fetch`/`XHR` to extract the direct master `.m3u8` and passes it directly to `expo-video`.

---

## 8. Module 5: Audio Dubs & Watch Party Sync

### Target Files:
- `contexts/watchParty/watchPartySyncEngine.ts`
- `components/player/PlayerSettingsSheet.tsx`

### 8.1 Watch Party Sync Contract
- **Host Authority**: Host transmits playback status and timestamp ticks (~1/sec).
- **Client-Side Audio Freedom**:
  - Each guest can listen to **Fade (Hindi)** or **Yoru (Original English)** independently.
  - The sync engine synchronizes the universal timeline (`currentTime`), allowing different audio streams to stay in exact frame sync across all members.
- **Graceful Fallback**: If native resolution fails after 8 seconds, the UI automatically offers a seamless fallback to `HijackPlayer` WebView.

---

## 9. Step-by-Step Execution Milestones

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  MILESTONE 1 │ ──► │  MILESTONE 2 │ ──► │  MILESTONE 3 │ ──► │  MILESTONE 4 │ ──► │  MILESTONE 5 │
│ Fast Scraper │     │ Proxy Worker │     │  Web Player  │     │ Mobile Player│     │  Party Sync  │
│  & Resolvers │     │ & Cloudflare │     │  Integration │     │ & Sniffer WV │     │ & Dub Sheet  │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

- **Milestone 1**: Build unified streaming resolvers in `services/streaming/` (VidLink Decryptor, VixSrc, Videasy Sniffer, Fallback Cascade).
- **Milestone 2**: Finalize `m3u8ProxyEngine.ts` and export the Cloudflare Worker script for $0 Web hosting.
- **Milestone 3**: Wire `HlsPlayer.web.tsx` into `PlayerScreen.tsx` and `PartyScreen.tsx` for Web with Bearoom custom controls.
- **Milestone 4**: Implement `NativeVideoPlayer.tsx` and `StreamResolverWebView.tsx` for iOS & Android native hardware decoding.
- **Milestone 5**: Integrate Audio Dub switcher (**Fade = Hindi**, **Yoru = Original**) and verify synchronized multi-dub Watch Parties.

---

## 10. Self-Review & Verification Checkpoints

Any agent or developer working on this project must verify the following checkpoints before marking a milestone complete:

1. **TypeScript Build Check**: `npx tsc --noEmit` must pass with **0 errors**.
2. **Web Bundle Export**: `npx expo export --platform web` must bundle cleanly.
3. **M3U8 Parser Assertions**: `npx tsx scripts/testProxyEngine.mjs` must pass all URI rewriting tests.
4. **Live Stream Validation**: `curl -s -I http://localhost:3001/proxy/segment?...` must return `HTTP 200/206` with `Access-Control-Allow-Origin: *`.
5. **No Native Mobile Regressions**: Native iOS/Android builds (`plugins/bearoom-playback`) must remain completely intact.

---

## 11. Future Product Scope: Dedicated Anime Segment (Post-V1 Future Release)

> **Release Scope:** Strictly deferred to a future major release cycle.  
> **Current Release Priority:** Core Movie/TV playback stability, zero-cost streaming proxy edge deployment, and watch party synchronization.  
> **Reference Projects (For Future Pick-up):** [SH0MIK/Anivault-Scraper](https://github.com/SH0MIK/Anivault-Scraper), [cinepro-org/core (OMSS)](https://github.com/cinepro-org/core), [majusss/purevideo](https://github.com/majusss/purevideo).

### 11.1 Future Anime Architecture Overview
When prioritized in a subsequent release cycle, Bearoom will introduce a dedicated **Anime Segment**:
- **Cross-Platform Metadata**: AniList / MAL / TMDB cross-referencing.
- **Dedicated Scrapers**: Senshi, AnimeHeaven, Miruro, and Anikoto stream extraction.
- **Dual Sub/Dub Switcher**: Synchronized Japanese audio with soft `.vtt` subtitles or English/Hindi dubs.
- **Anime Watch Parties**: Frame-synchronized rooms with intro/outro (OP/ED) skip triggers.

---

## 12. Production Deployment & Zero-Cost ($0) Infrastructure Guide

This section outlines the step-by-step procedure to deploy Bearoom across Web, Cloudflare Serverless Edge, and Mobile.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PRODUCTION DEPLOYMENT MATRIX                      │
│                                                                             │
│ 1. Edge Proxy: Cloudflare Workers (100,000 req/day Free Tier)               │
│ 2. Web App: Cloudflare Pages / Vercel / Netlify / GitHub Pages ($0)         │
│ 3. Database & Sync: Supabase Free Tier (500MB DB, 50k monthly active users) │
│ 4. Mobile: Expo / Android APK & AAB release build                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.1 Deploying the Cloudflare Worker Streaming Proxy (`workers/streamProxyWorker.js`)

The stream proxy enables CORS-free playback of raw M3U8 streams and media segments on Web.

#### Option A: Deploy via Cloudflare Dashboard (GUI — 2 Minutes)
1. Log in to your [Cloudflare Dashboard](https://dash.cloudflare.com/) (Free account).
2. Navigate to **Workers & Pages** -> **Create Application** -> **Create Worker**.
3. Name the Worker `bearoom-stream-proxy` and click **Deploy**.
4. Click **Edit Code**, paste the entire contents of [`workers/streamProxyWorker.js`](file:///Users/essence/ReactNative/NetPrime-Party/workers/streamProxyWorker.js), and click **Save and Deploy**.
5. Copy your Worker URL: `https://bearoom-stream-proxy.<your-subdomain>.workers.dev`.

#### Option B: Deploy via Wrangler CLI
```bash
# 1. Install wrangler if not already present
npx wrangler login

# 2. Deploy the worker script
npx wrangler deploy workers/streamProxyWorker.js --name bearoom-stream-proxy --compatibility-date 2024-01-01
```

#### Option C: Link Worker URL in Codebase
Update your `.env.local` or production environment variables:
```ini
EXPO_PUBLIC_STREAM_PROXY_URL=https://bearoom-stream-proxy.<your-subdomain>.workers.dev/proxy
```

---

### 12.2 Deploying the Web Client

The web client is built into a standalone static single-page application (`dist/`).

```bash
# 1. Export production web bundle
npx expo export --platform web

# 2. Output directory: dist/
# Deploy dist/ to any zero-cost static hosting:
# - Cloudflare Pages: npx wrangler pages deploy dist
# - Vercel: npx vercel dist --prod
# - Netlify: npx netlify deploy --dir=dist --prod
```

---

### 12.3 Building the Android Release APK

For Android devices, build the standalone release binary:

```bash
# Option 1: Local Gradle Build (Tracked android/ project)
cd android
./gradlew assembleRelease
# Output APK: android/app/build/outputs/apk/release/app-release.apk

# Option 2: EAS Build (Cloud)
npx eas build --platform android --profile preview
```


