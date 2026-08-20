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

## `[x]` Phase 5.5: User Preferences (Silent Memory & Matching)
**Status:** CLOSED
**Summary:** 
Implemented a perfectly silent, zero-UI preference memory system.
* **Lean Architecture:** Hooked directly into `utils/prefs.ts` (MMKV). No Redux overhead for local scalars.
* **Fuzzy Matcher:** Built `utils/trackMatch.ts` to seamlessly handle provider label variances (e.g., resolving "Fade" or "hin" to Hindi). Successfully bypassed the Levenshtein distance trap for short ISO codes.
* **Auto-Apply:** `PlayerScreen` quietly intercepts `onEvent` track loads and applies the user's saved preferences on the fly without causing re-buffers.

---

## `[ ]` Phase 6: Cloudflare-Served Injection Scripts (The Bridge)
**Status:** PENDING
**Objective:** Decouple DOM-hijack logic from the app binary for instant cat-and-mouse updates.
**Details:**
* **Shared-Core Architecture:** Structure scripts as a shared-core (video finder, event wiring) + per-provider deltas. Keep typed references in-repo.
* **Validation:** Scripts must be linted/smoke-tested before uploading to Supabase to prevent massive blast radius.
* **Execution:** App caches scripts in MMKV on boot. `HijackPlayer.tsx` loads them instantly.

---

## `[x]` Phase 7: Telemetry & Failure Memory (The Smart Net)
**Status:** CLOSED
**Summary:**
Stood up the provider-health telemetry that powers the cat-and-mouse loop and the (Phase 8) smart fallback.
* **Endpoint:** Rate-limited `POST /report` on the Worker (Hono + Zod). Derives `country` (CF geo) + a hashed client IP **server-side**; writes via the **service-role** key into an RLS-locked `provider_reports` table, so clients can never write directly (anti-poisoning). Best-effort — returns 202 even if the DB write fails, so telemetry never breaks playback.
* **A rate, not a tally:** the `provider_health` view computes a **distinct-client-weighted failure RATE** over a rolling 24h window, with `success` as the **denominator** (its omission would auto-disable the most popular provider). `not_found`/`manual_switch` are excluded from the numerator (per-title gap / weak signal). Verified live: 2 `success` + 1 `no_bind` → `0.333`.
* **Client:** RTK Query `reportOutcome` mutation + `PlayerScreen` hooks. `success` (sustained >30s playback) and `manual_switch` are wired and accurate today.
* **Deferred to Phase 8 (by design):** the failure call-sites (`no_bind`/`http_error`/`render_crash`/`playback_stall`/`captcha_block`) are one-liners waiting on their detection signals (WebView error props + the no-bind timer), and the session exclusion list lives with the fallback UI. Not fired on guesses — that would poison the health denominator.

---

## `[ ]` Phase 8: Lazy Fallback & The Safety Net
**Status:** PENDING
**Objective:** Create a resource-efficient, zero-wait fallback system if the primary provider fails.
**Details:**
* **Lazy Fetch:** `[▶ Play]` instantly mounts Priority 1. Fallback scrape triggers only if the primary fails or user taps `[⚙️ Sources]`.
* **Filtered Hard Error:** If WebView throws `onError`/`onHttpError` (strictly filtered to `isForMainFrame` to ignore ad 404s) or `onRenderProcessGone` (Android crash), instantly auto-pop the `ProviderSheet`.
* **Smart Timeouts:**
  * *10s Soft (No-Bind):* Show actionable banner ("Taking too long?").
  * *25s Hard Timeout:* Gate this on "play-intent" signals to prevent false-firing on idle ad-walls. Pause timers when app is backgrounded.
* **Wire Phase 7 failure reports:** at each detection point (`onFatalError`, the no-bind timer, the stall detector) call `report("<outcome>", …)`. Give `playback_stall` its own guard so it can fire even after a `success`.
* **Session exclusion list:** track already-failed providers so the fallback never re-offers a corpse; read `provider_health` to order the alternatives.

---

## `[ ]` Phase 9: Server-Side Scrape Caching (Supabase)
**Status:** PENDING
**Objective:** Cache lazy fallback scrapes to protect the Cloudflare Worker from rate limits.
**Details:**
* Create a `title_provider_cache` table.
* **Rule 1:** Cache *only* metadata (dubs, qualities). NEVER cache `.m3u8` URLs for IP-locked providers.
* **Rule 2:** Do not negative-cache failures for 4h (avoids poisoning a title due to a transient API hiccup).

---

## `[ ]` Phase 10: App Store Review & Web Parity
**Status:** PENDING
**Objective:** Pass Apple/Google review and ensure Web platform degradation.
**Details:**
* **Review Mode:** Wire the Supabase `enabledProviders: []` state to show a fully benign "Listing Only" UI.
* **Web Parity:** Acknowledge cross-origin iframe limits. Provide a simplified Web-only fallback story.
