# Discovery UX Overhaul — Design Spec

**Status:** IN PROGRESS. **D1** (feed foundation) + **D1.1** (For-You rail) **shipped & committed**; perf/resilience + connectivity/offline UX shipped. **D2 (Collections) shipped & committed** (`c34d1ed` + worker `/franchises` `8309d28`): endpoints, `Collection` screen, "Part of X" chip, Franchises rail, curated fallback; collections-in-search deferred to D4. Plan: `docs/superpowers/plans/2026-08-27-discovery-d2-collections.md`. **D3 (Genre browse) + Home rework shipped & device-verified 2026-08-28, UNCOMMITTED**: `genreList(kind)` endpoint; `GenreChipsRow` = ONE row with an **animated Movie/TV toggle** (shared `components/home/KindToggle.tsx`); discover-by-genre grid **reusing `RailSeeAll`** (no separate `GenreBrowse` screen — see §8); `BrowseHeader` moods → real genre IDs. **Home arrangement reworked** so discovery sits high, and a **new "Popular in {country}" rail** added at feed **position 3** (`regionPopular` — mixed local movie+TV via CF-detected region, with a Movies/Series toggle; §8.5). Worker Zod `FeedSection` completed for `genreRow`/`franchises`/`regionPopular`; `/config` now returns CF `region` (`AppConfig.region`, worker change local/undeployed; client `useRegion()` defaults `IN`). **D4 (search rework)** next (absorbs collections-in-search + genre filters). **Owner gate:** per-phase `writing-plans` → implement.

## 1. Context & goal

Bearoom's discovery today is a **flat wall of hardcoded rails**: `HomeView` renders 8 literal `<MediaRail>` JSX elements (each self-fetching a TMDB `path`), a hero, a watch-party CTA, and continue-watching. There are **no collections, no genre browse, no personalized rails**, and search is a single merged FlashList grid with type chips. `belongs_to_collection` is returned by TMDB but never read.

This overhaul turns discovery into a **server-driven, lolomo-style feed** plus **collections**, **genre browse**, and a **reworked search** — a *complete UX change* (approved), using the existing visual tokens (`theme/bearoom.ts`); a full visual re-skin remains a later, separate effort ("B").

**Design principles (ranked, per owner):**
1. **Maintainable / human-dev-friendly** — one shared type, one section switch, a readable manifest, a self-documenting fallback.
2. **Highly customizable** — reshape Home from the server (worker `/feed/home`) with no app release; every section richly + optionally configurable.
3. **Migratable** — versioned manifest + a client normalizer that never crashes on drift; forward/backward compatible for slow-updating (Obtainium) clients.
4. Reuse, don't rebuild — `MediaRail` (self-fetch), `PosterCard`, the `TrendingShowsView` grid, `workerApi` (RTK Query), the provider-registry/`/config` pattern, `theme/bearoom.ts`, `actions.ts` nav.
5. YAGNI — no full component-tree SDUI; no per-user targeting yet (leave room).

## 2. Architecture — lolomo, not full SDUI

Research (Netflix "list-of-lists-of-movies"; Reddit's SliceKit; Airbnb/Lyft SDUI; Rise Tools) shows a spectrum. **We deliberately pick the lolomo/config-driven end:** the server sends an **ordered manifest of typed sections**; the **client owns the components**. We do NOT build a component-tree renderer + registry (Reddit/Rise style) — that's a framework to maintain, and our `MediaRail` already self-fetches from a `path`, so the server only needs to decide *which rows, in what order, with what data source*.

```
worker /feed/home  ──(RTK Query, cached, Zod-validated)──►  FeedManifest
                                                              │
HomeView ── map(sections) ──►  <FeedSection section={s} />  ──┘  (switch on s.type)
                                   │  unknown type → renders null (forward-compat)
                                   └► Hero | ContinueWatching | BecauseYouWatched
                                      | GenreRow | Franchises | MediaRail{path} | …
```

**Two lessons baked in from the research:**
- **Ignore-unknown (Reddit):** a client must render nothing for a `type`/prop it doesn't recognize, so a new server section never breaks an old Obtainium build.
- **Same-shape fallback:** the baked-in default manifest is byte-shape-identical to the served one, so "local → server-driven" is a no-op swap and the default is the living documentation of the feed.

## 3. The feed manifest (the contract)

**Shared type** (one file, imported by app; mirrored by worker Zod schema):

```ts
// types/feed.ts  (shared shape; worker re-declares as Zod)
export type FeedSectionType =
  | "hero" | "continueWatching" | "becauseYouWatched"
  | "genreRow" | "franchises" | "tmdbRail" | "editorialRow"; // editorialRow = P5, reserved

export interface FeedSectionBase {
  id: string;              // stable key (dedupe, analytics, React key)
  type: FeedSectionType;
  title?: string;          // section heading (optional; some types self-title)
  enabled?: boolean;       // default true; false = server-side hide without removal
  minAppVersion?: string;  // RESERVED semver, e.g. "2.2.0" — gate DEFERRED (§11); the app only
                           // exposes semver via expo-constants (no build number), so no-op for now
}
export interface TmdbRailSection extends FeedSectionBase {
  type: "tmdbRail";
  path: string;            // e.g. "movie/popular" — fed straight to MediaRail/useListQuery
  kind: "movie" | "tv";
  icon?: string;           // Ionicons glyph
  seeAll?: boolean;        // show a See-all → paginated grid
  limit?: number;          // cap items (default all)
}
export interface FranchisesSection extends FeedSectionBase {
  type: "franchises";
  collectionIds: number[]; // curated TMDB collection ids — EDITABLE SERVER-SIDE
}
export interface GenreRowSection extends FeedSectionBase { type: "genreRow"; kind?: "movie" | "tv"; }
export interface SimpleSection extends FeedSectionBase {
  type: "hero" | "continueWatching" | "becauseYouWatched" | "editorialRow";
}
export type FeedSection =
  | TmdbRailSection | FranchisesSection | GenreRowSection | SimpleSection;

export interface FeedManifest {
  version: number;         // SCHEMA version (bump only on breaking shape change)
  sections: FeedSection[];
}
```

**Design notes that serve the three principles:**
- **Maintainable:** the union is exhaustive and small; each section is *declarative data*, never behavior. A dev adds a section type in exactly three edits (§5 recipe). Worker Zod schema = the same shape, so validation errors are self-explanatory.
- **Customizable:** order = array order; hide via `enabled:false`; retitle via `title`; the franchise set is just `collectionIds` — all server-editable. (`minAppVersion` is reserved for later safe-rollout gating; not implemented in D1 — see §11.)
- **Migratable:** `version` is the schema generation; the client **normalizer** (§4) upgrades/《coerces》 any manifest to the current shape. Unknown `type` and unknown props are dropped, not fatal.

## 4. Client rendering + normalizer

**`<FeedSection>`** — one switch, the single place sections map to components:

```tsx
// src/features/home/FeedSection.tsx
export function FeedSection({ section }: { section: FeedSection }) {
  switch (section.type) {
    case "hero":              return <HeroCarousel />;
    case "continueWatching":  return <ContinueWatching />;
    case "becauseYouWatched": return <BecauseYouWatchedRail />;
    case "genreRow":          return <GenreChipsRow kind={section.kind} />;
    case "franchises":        return <FranchisesRail ids={section.collectionIds} title={section.title} />;
    case "tmdbRail":          return <MediaRail title={section.title!} path={section.path}
                                        kind={section.kind} icon={section.icon}
                                        onSeeAll={section.seeAll ? () => openSeeAll(section) : undefined} />;
    default:                  return null; // forward-compat: unknown type renders nothing
  }
}
```

**`normalizeManifest(raw): FeedManifest`** — the migration/robustness layer (never throws):
- Coerces a missing/garbage manifest → the baked-in fallback.
- Drops sections with an unknown `type`, missing required props (e.g. `tmdbRail` without `path`), or `enabled:false`. (`minAppVersion` semver-gating is reserved/no-op for now — §11.)
- Fills defaults (`enabled:true`), assigns an `id` if absent.
- Version handling: a small `migrations[]` chain upgrades `raw.version < CURRENT` (additive; today just passthrough).

**`HomeView`** — replaces the hardcoded JSX with: `const { data } = useGetConfigQuery()` → `normalizeManifest(data?.homeFeed)` → `sections.map(s => <FeedSection key={s.id} section={s} />)` inside the existing `Animated.ScrollView` (sticky `AppHeader` + the `useCollapsingHeader` scroll handler preserved). `normalizeManifest(undefined)` returns the baked-in fallback, so loading / offline / first-run all render a valid Home instantly (no flash, no spinner wall).

## 5. Adding a section type (the maintainability recipe)

1. Add the variant to `FeedSection` union in `types/feed.ts` (+ worker Zod).
2. Add one `case` to the `<FeedSection>` switch → your component.
3. (If server-served) add it to the `AppConfigSchema.homeFeed` default in `worker/src/schemas.ts` (additive — no version bump).

No renderer changes, no navigation rewiring, no manifest-format migration for additive types.

## 6. Where the manifest lives — extend `/config`, not a new endpoint

**[QA-revised]** The worker is `@hono/zod-openapi` (`createRoute` + `app.openapi`, auto-documented at `/docs`), and `AppConfig` (`{ appVersion, maintenanceMode, providers[] }`) is already fetched once at startup by `ConfigBootstrap` and cached (60s edge / 5min client). So the feed rides that, rather than a second endpoint + second fetch + second cache:

- **Worker:** add `homeFeed: FeedManifest` to `AppConfigSchema` (Zod, in `worker/src/schemas.ts`) and populate it in the existing `/config` handler (`worker/src/index.ts`). The Zod schema auto-documents at `/docs` (maintainability win). Franchise `collectionIds` + section order live here → editable without an app release.
- **App:** extend the `AppConfig` type (`src/types/worker.types.ts`) with `homeFeed?: FeedManifest`; consume via the **existing** `useGetConfigQuery()` — no new RTK endpoint.
- **Fallback is a NEW pattern, not a mirror.** `getConfig` today has **no** fallback (it fails to empty — the worker even comments "the no-fallback"). RTK Query has no built-in error-fallback, so resilience lives in the client: `normalizeManifest(data?.homeFeed)` returns the baked-in `HOME_FEED_FALLBACK` whenever `homeFeed` is absent/loading/garbage. The fallback and served manifest are the same `FeedManifest` shape.

## 7. Collections (D2)

- **Endpoints** (`tmdbApi.ts`, `wrapQuery` pattern): `collection(id)` → `collection/{id}` (`{ parts[], name, overview, poster_path, backdrop_path }`); `searchCollection({query,page})` → `search/collection` (separate from `search/multi`).
- **"Part of *The X Collection*"** — read `d.belongs_to_collection` (already in the movie details payload; no new append) → a chip on `MovieDetailsScreen` → `openCollection(id)`.
- **`Collection` screen** (new PlayerStack route `{ id }`) — reuse the `TrendingShowsView` grid (FlatList COLS=3 + `PosterCard` + `LibraryScreenHeader`); parts sorted by `release_date`; backdrop header. **"Add all to queue" is stubbed/hidden until the P1 queue ships.**
- **Franchises rail** (the `franchises` section) — render `collectionIds` as collection cards (poster from `collection/{id}` or first part) → `Collection` screen.
- **Collections in search** — run `searchCollection` in parallel in `useSearchData`; surface via a `Collections` filter chip / section; cards → `Collection` screen.

## 8. Genre browse (D3)

- **Endpoint:** `genreList(kind)` → `genre/{movie|tv}/list`; browse via existing `listPage`/`discover` with `with_genres`.
- **`GenreChipsRow`** (the `genreRow` section) → taps open **`GenreBrowse`** screen (new route `{ id, name, kind }`) = the `TrendingShowsView` grid fed by `discover/{kind}?with_genres={id}&sort_by=popularity.desc`.
- Replaces the fake "mood" *text* queries in `BrowseHeader` with real genre IDs.

**SHIPPED 2026-08-28 (device-verified, uncommitted):** `genreList(kind)` (`genre/{movie|tv}/list`) + `useGenreListQuery`; `GenreChipsRow` renders the `genreRow` section as **ONE row with an animated Movie/TV toggle** — the shared `components/home/KindToggle.tsx` (a Reanimated sliding-thumb segmented control, `withTiming` + selection haptic; NOT a layout animation) — switching which TMDB genre set the chips show. `openGenre(id,name,kind)` builds `discover/{kind}?with_genres={id}&sort_by=popularity.desc` and routes to the **existing `RailSeeAll` grid** — a **deliberate deviation** from the "new `GenreBrowse` screen" above (reuse/YAGNI; a dedicated screen stays trivial to split out later). `BrowseHeader` mood tiles now open genre browse (Action 28 / Comedy 35 / Sci-Fi 878) instead of literal text search. `GenreRowSection { kind? }` promoted in `types/feed.ts` (D1 had stubbed genreRow into `SimpleSection`, which has no `kind`). NOTE: the earlier "movie + TV genreRow rows" were collapsed into the single toggle row during the Home-arrangement rework.

## 8.5 Popular in your region (local content) — SHIPPED 2026-08-28 (uncommitted)

A **"Popular in {country}"** rail of locally-produced content at feed **position 3** (right after the personalized rails, above the content tail). TMDB has NO region-ranked popularity (verified), so it approximates via `discover/{movie|tv}?with_origin_country={CC}&vote_count.gte=50&sort_by=popularity.desc` — the `vote_count` floor drops the long-tail (0-vote daily serials), and a **per-region flagship language** biases to hits (`IN → &with_original_language=hi`, Bollywood-forward; unmapped regions use origin-country only). A new `regionPopular` feed section → `RegionPopularRail` fetches BOTH kinds, and a **Movies/Series toggle** (the same shared `KindToggle`) filters which shows — films and serials browsed SEPARATELY, not mixed. Region = Cloudflare `request.cf.country` returned in `/config` (`AppConfig.region`; worker change **local/undeployed**) with a **client `useRegion()` default of `IN`**, so the rail runs on-device without a deploy. Global "Popular Movies/Series" rails stay untouched (purely additive). New surfaces: `tmdbApi.regionPopular`, `components/home/RegionPopularRail.tsx`, `components/home/KindToggle.tsx`, `providersSlice.region` + `useRegion()`, worker Zod `regionPopular` + `AppConfig.region`.

## 9. Search rework (D4)

- Add **catalog filters** (genre / year / `sort_by`) to `useSearchData` (drive `discover` in browse, keep `search/*` for text) + the `Collections` results section from D2.
- Keep the FlashList grid + `PosterCard`; extend the chip row (`All·Movies·TV·People·Collections`).
- This absorbs D2 (collections-in-search) + D3 (genre filters); ships last.

## 10. Data model & new surfaces (summary)

- **Shared:** `types/feed.ts` (`FeedManifest`, `FeedSection`) + `data/homeFeedFallback.ts` (canonical default) + `utils/normalizeManifest.ts`.
- **New `tmdbApi` endpoints:** `collection`, `searchCollection`, `genreList` (+ reuse `listPage`, `discover*`).
- **Config (no new endpoint):** extend `AppConfig` (`src/types/worker.types.ts`) + `AppConfigSchema` (`worker/src/schemas.ts`) with `homeFeed`; consume via existing `useGetConfigQuery`.
- **New routes:** `Collection { id }`, `GenreBrowse { id, name, kind }`, and a generic `RailSeeAll { title, path, kind }` (for `tmdbRail.seeAll`) — PlayerStack; register in `PlayerNavigator.tsx`, add to `types.ts`, add `openCollection`/`openGenre`/`openSeeAll` in `actions.ts`.
- **New components:** `FeedSection`, `BecauseYouWatchedRail`, `GenreChipsRow`, `FranchisesRail`, `CollectionScreen`, `GenreBrowseScreen`, `RailSeeAllScreen`, a "Part of X" chip. (`RailSeeAll`/`Collection`/`GenreBrowse` all reuse the `TrendingShowsView` grid.)

## 11. Migration & versioning strategy (the "migratable" guarantee)

- **Schema `version`** on the manifest; a client `migrations` chain (additive; passthrough today) upgrades older manifests before use.
- **Forward-compat:** unknown `type`/props dropped by the normalizer → new server sections never crash old clients.
- **Backward-compat:** the worker keeps `homeFeed` renderable by the oldest supported client (additive changes only). `minAppVersion` is **reserved** for gating a future section type to capable builds — deferred until first needed, because the app exposes only a semver string (`Constants.expoConfig?.version` = "2.1.0" via `expo-constants`; no `versionCode`/`buildNumber`, no `expo-application`), so implementing the gate means a tiny semver-compare, not a numeric compare. No D1 section needs it.
- **Local↔server parity:** the fallback and `AppConfig.homeFeed` share the exact `FeedManifest` shape, so enabling/disabling server-driving is a config swap, and the fallback is always a valid, shippable Home.
- **No hard cutover:** D1 ships with the worker omitting `homeFeed` → the client renders the baked-in fallback (identical to today's Home). Flip to server-driven simply by populating `homeFeed` in `/config` — no client release, no feature flag.

## 12. Phasing (each shippable + verifiable)

- **D1 — Server-driven feed foundation:** `types/feed.ts`, `data/homeFeedFallback.ts`, `utils/normalizeManifest.ts`, `<FeedSection>`, `HomeView` rewrite, extend `AppConfig` + `AppConfigSchema` with `homeFeed` (in the existing `/config`), a generic `RailSeeAll` screen (for `tmdbRail.seeAll`), `BecauseYouWatchedRail`, `GenreChipsRow` (chips inert until D3). *Ships: today's Home, now fallback-rendered + server-drivable, + 2 new rails.*
- **D2 — Collections:** endpoints, "Part of X" chip, `Collection` screen, `Franchises` rail, collections-in-search.
- **D3 — Genre browse + Home rework:** ✅ SHIPPED 2026-08-28 (device-verified, uncommitted). genre endpoint; `GenreChipsRow` = animated Movie/TV toggle (shared `KindToggle`); reused `RailSeeAll` (no `GenreBrowse` screen); retire mood-text queries. **+ Home arrangement rework + new "Popular in {region}" rail — `regionPopular`, Movies/Series toggle (§8.5).**
- **D4 — Search rework:** catalog filters + collections section. NEXT.

## 13. Verification

No test runner exists → gate = `npx tsc --noEmit` + `npm run lint` + **worker check** (curl `/config`, confirm `homeFeed` validates against the Zod schema) + **execbro** device screenshots (feed renders from `AppConfig.homeFeed`; reorder a section server-side → Home reorders with no rebuild; `homeFeed` omitted → baked-in fallback renders; unknown-type section → silently skipped; Collection/Genre screens navigate). Manifest normalizer gets a documented node quick-check (pure function).

## 14. Risks & open questions

- **`AppConfig.homeFeed` shape drift vs app type** — mitigated by the shared `FeedManifest` shape + worker Zod + client normalizer; change `worker.types.ts` and `schemas.ts` together.
- **`becauseYouWatched` source** — seeds off local MMKV history (`utils/history.ts`, has `id`+`type`, no genres) → fetch that title's `recommendations`. Empty history → section self-hides.
- **Franchise poster** — `collection/{id}` has poster/backdrop; if sparse, fall back to first part's poster.
- **Open:** `homeFeed` stays anonymous/static for now (per-user targeting deferred). Does the franchise starter list live in worker code or a worker-read config store? (Recommend a worker-code constant for D2, promote to a store later.)

## 15. References

- Reddit SDUI (feeds, SliceKit, ignore-unknown): https://www.infoq.com/news/2023/09/reddit-feed-server-driven-ui
- Netflix SDUI / lolomo: https://www.infoq.com/news/2024/07/netflix-server-driven-ui/
- Airbnb/Netflix/Lyft SDUI lessons: https://medium.com/@aubreyhaskett/server-driven-ui-what-airbnb-netflix-and-lyft-learned-building-dynamic-mobile-experiences-20e346265305
- Rise Tools (RN full-SDUI, the heavier end we intentionally avoid): https://dev.to/fasthedeveloper/server-defined-rendering-for-react-native-using-rise-4mgc · https://github.com/FastheDeveloper/react-native-rise-sdui-server
- TMDB RN reference apps (none implement collections/SDUI — confirms this is greenfield): https://github.com/adrianhajdin/react-native-movie-app · https://github.com/Shreyas-29/cineo

## 16. Audit revisions (2026-08-27 QA)

Verified the spec against the real codebase (worker + `workerApi` + `app.json`). Findings applied above:

| # | Sev | Finding | Fix |
|---|-----|---------|-----|
| F1 | High (correctness) | "Fallback mirrors the provider-registry resilience" was **false** — `getConfig` has no fallback (fails to empty; worker comments "the no-fallback"), and RTK Query has no built-in error-fallback. | §6/§11 rewritten: fallback is a **new** client-side pattern via `normalizeManifest(data?.homeFeed) → HOME_FEED_FALLBACK`. |
| F2 | High (correctness) | `minAppVersion: number` assumed a build number the app doesn't expose — no `versionCode`/`buildNumber` in `app.json`, no `expo-application`/`expo-updates`; only semver `"2.1.0"` via `expo-constants`. | Changed to `minAppVersion?: string` (semver), **reserved + gate deferred** (no D1 section needs it). |
| F3 | Med (maintainability, owner's #1) | A separate `GET /feed/home` = a 2nd endpoint/fetch/cache/schema. `ConfigBootstrap` already fetches `/config` (`AppConfig`) at startup, cached 60s/5min. | Embed as **`AppConfig.homeFeed`** (extend `AppConfigSchema` Zod + `worker.types.ts`); consume via existing `useGetConfigQuery`. One source, auto-documented at `/docs`. |
| F4 | Med (gap) | `tmdbRail.seeAll` referenced `openSeeAll()` but no generic path-driven See-all screen exists (only "Trending Shows"). | Added a generic **`RailSeeAll { title, path, kind }`** screen (reuses `TrendingShowsView`) to D1 + §10. |
| F5 | Low (grounding) | Worker route pattern unverified. | Confirmed `@hono/zod-openapi` (`createRoute` + `app.openapi`); the plan follows it, gaining auto-docs. |

**Still-open assumptions to confirm cheaply during implementation (not blockers):**
- TMDB endpoints `collection/{id}`, `search/collection`, `genre/{movie|tv}/list`, `discover?with_genres=` behave as designed (verified in the prior TMDB research; re-confirm with a curl in D2/D3).
- Franchises rail = N × `collection/{id}` fetches (RTK-cached; batch via the worker later if it's a perf issue).
- `becauseYouWatched` seeds off `utils/history.ts` (has `id`+`type`, no genres) → fetch that title's `recommendations`; self-hides on empty history.
