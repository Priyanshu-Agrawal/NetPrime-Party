# NetPrime Master Implementation Plan

This document serves as the persistent, living checklist and documentation for the entire NetPrime project. It lives directly in the repository so it scales with the codebase and remains accessible to all developers and agents. 

As tasks are completed, they will be summarized and closed out step-by-step.

## Task Status Legend
- `[ ]` Pending
- `[/]` **ACTIVE**
- `[x]` Closed & Summarized

---

## `[x]` Phase 1: Architecture & Deep Research
**Status:** CLOSED
**Summary:** 
Conducted deep case studies on piracy architectures (iMayhem, CinePro, StreamGrabber). Rejected the $500/mo reverse-proxy approach. Locked in the **Two-Tier Hybrid OMSS Architecture**. 
* **Tier 1:** Serverless Edge API (Fast Path).
* **Tier 2:** React Native `SnifferWebView` (Heavy Tank). 
* Documented the "4 Hidden Walls of WebView Sniffing" that defeat standard scrapers.

## `[x]` Phase 2: Database Strategy & Seeding
**Status:** CLOSED
**Summary:**
Transitioned from hardcoded JSON to a dynamic Supabase Postgres backend. 
* Scraped the `LyeDevGit` repository and filtered out 15+ hostile/dead providers.
* Seeded the **Top 10 Providers** into the `providers` table.
* **Strategic Pivot:** Forced `videasy` (NetPrime) to Priority 1 to guarantee multi-dub (Hindi) support for the target Indian demographic, with fast English endpoints (VidSrc) serving as indestructible fallbacks.

## `[x]` Phase 3: Tier-1 Edge Server (Cloudflare Worker)
**Status:** CLOSED
**Summary:**
Built and deployed the Cloudflare Worker to `netprime-worker.spiderfan-no1.workers.dev`.
* Completely overhauled with **Hono** and **Zod**.
* Features self-documenting Swagger UI (`/docs`).
* Automatically fetches provider config from Supabase, caches it for 60s at the Edge, and aggregates scrape results across all enabled providers.

---

## `[/]` Phase 4: React Native App Bootstrapping
**Status:** **ACTIVE**
**Objective:** Connect the React Native app to the live Cloudflare Worker.
**Details to Implement:**
1. Setup a global state store (e.g., Zustand or React Context) to hold the app configuration.
2. On app launch (Splash Screen), fetch `GET /config` from the live Worker URL.
3. Save the `providers` list globally so the app knows which providers are enabled, unstable, or require the client sniff.

---

## `[ ]` Phase 5: The Pre-Play UI (Metadata Aggregation)
**Status:** PENDING
**Objective:** Build the UI that fetches `/scrape` when a user clicks a movie.
**Details:**
* Call the Worker with the TMDB ID.
* Parse the `requires_client_for_stream` and `success` statuses.
* Render the available Audio Dubs (Hindi, English) and Qualities to the user *before* mounting the WebView.

---

## `[ ]` Phase 6: The `SnifferWebView` Component (Tier 2)
**Status:** PENDING
**Objective:** Build the engine that bypasses Cloudflare and AES keys.
**Details:**
* Implement the invisible `<WebView>`.
* Defeat Wall 1: `injectedJavaScriptForMainFrameOnly={false}`.
* Defeat Wall 2 (iOS): Inject `MutationObserver` for `<video>` tags.
* Defeat Wall 3 & 4: Monkey-patch `window.fetch`, `XMLHttpRequest`, and unregister Service Workers.
* Emit the standard OMSS object back to React Native.

---

## `[ ]` Phase 7: The Native Video Player 
**Status:** PENDING
**Objective:** Play the snatched stream and ensure Watch Party sync.
**Details:**
* Catch the OMSS payload from the WebView.
* Mount `expo-video` with the `.m3u8` URL.
* Connect playback state (Play, Pause, Seek) to the Watch Party socket.
