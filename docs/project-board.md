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

## `[x]` Phase 4: React Native App Bootstrapping
**Status:** CLOSED
**Summary:**
Implemented modern Redux Toolkit (RTK) global state architecture.
* Defined strict type interfaces for Player, Watch Party, and Providers.
* Created modular feature slices using `extraReducers` to intercept API responses.
* Built the `workerApi` using RTK Query with Edge-Caching synchronization, and instantiated a headless `ConfigBootstrap` component inside `App.tsx` to automatically pull and hydrate `providersSlice` on launch.

---

## `[x]` Phase 5: The Pre-Play UI (Zero-Wait UX)
**Status:** CLOSED
**Summary:**
Locked in the UX for title details to maximize speed and remove redundancy.
* **Zero-Wait Direct Load:** The `[▶ Play]` button instantly mounts the `SnifferWebView` for Priority 1 (NetPrime) without wasting a network trip on `/scrape`.
* **Mechanical Domain Sync:** Established a `supabase db dump --data-only` routine to keep local seed domains perfectly synced with production, avoiding domain rot.
* **UI Split:** Moved the manual `[⚙️ Sources]` selection into the Player screen (or as a secondary override), relying on auto-routing for the primary flow.

---

## `[/]` Phase 5.5: User Preferences (Silent Memory & Matching)
**Status:** **ACTIVE**
**Objective:** Persist user choices for Language and Quality without intrusive onboarding.
**Details:**
* **Lean Architecture:** Use the existing `utils/prefs.ts` synchronous MMKV store. Do not overengineer with Redux slices for local scalars.
* **Fuzzy Matcher:** The real feature is cross-provider matching. Build `matchAudio(pref, available)` and `matchQuality(pref, available)` to gracefully handle varying provider labels (e.g., falling back if Hindi isn't available).
* **Data Saver Reconciliation:** Merge the `preferredQuality` concept with the existing `dataSaver` toggle. If `dataSaver` is ON, cap quality $\le$ 480p, while still honoring manual explicit picks.

---

## `[x]` Phase 6: The `SnifferWebView` (Native Sniffing)
**Status:** **REJECTED / DEPRECATED**
**Summary:** 
*Architectural Pivot:* We explicitly rejected extracting `.m3u8` URLs for native playback (`expo-video`). Deterministic WAF/AES token expiration (HTTP 403s mid-stream) made the "snatch and kill" native player impossible to keep stable.
*The Final Standard:* The **`HijackPlayer`** (driving the provider's native web player invisibly via JS bridge) is the sole production standard.

---

## `[x]` Phase 7: The Native Video Player (`expo-video`)
**Status:** **REJECTED / DEPRECATED**
**Summary:** Abandoned for the reasons listed in Phase 6. All Watch Party sync and playback control is routed through the `HijackPlayer` DOM bridge.

---

## `[ ]` Phase 8: Scrape Results Caching (Supabase)
**Status:** PENDING
**Objective:** Dramatically reduce Edge Worker execution time by caching metadata.
**Details:**
* Create a `title_provider_cache` table in Supabase.
* Cloudflare Worker checks this table before scraping (valid for a few hours).
* Cache *only* the metadata (dubs, qualities, statuses).
