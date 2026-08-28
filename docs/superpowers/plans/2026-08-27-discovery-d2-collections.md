# D2 — Collections (implementation plan)

Spec: `docs/superpowers/specs/2026-08-27-discovery-ux-overhaul-design.md` §7.
Goal: surface TMDB **collections** (franchises) across discovery — a rail on Home,
a "Part of *X*" chip on movie details, a Collection screen, and collections in search.

**Global constraints:** no test runner → verify `tsc --noEmit` + `expo lint` + node-check pure
fns + execbro device. Never touch `src/ui/BearAlert.tsx` or `.codex/`. No blur/elevation on
video screens. Reuse `PosterCard` / the `TrendingShowsView` grid / `wrapQuery`. Commit only on
explicit "commit".

## Tasks

**T1 — tmdbApi endpoints** (`src/store/services/tmdbApi.ts`)
- `collection(id)` → `collection/{id}` — full `{ id, name, overview, poster_path, backdrop_path, parts[] }` (for the Collection screen). `wrapQuery`, `keepUnusedDataFor: 600`.
- `collections(ids: number[])` → `Promise.all` of `collection/{id}`, mapped to `{ id, name, poster_path, backdrop_path }[]` (lighter, for the Franchises rail). Drops failed/poster-less.
- `searchCollection({ query, page })` → `search/collection` (lazy, `keepUnusedDataFor: 120`).
- Export `useCollectionQuery`, `useCollectionsQuery`, `useLazySearchCollectionQuery`.

**T2 — Navigation** (`types.ts`, `PlayerNavigator.tsx`, `actions.ts`)
- `PlayerStackParamList.Collection: { id: string | number }`.
- Register `Collection` screen in `PlayerNavigator` (slide_from_right, like the other detail screens).
- `openCollection(id)` in `actions.ts` → `navigate("PlayerStack", { screen: "Collection", params: { id } })`.

**T3 — CollectionScreen** (`src/screens/CollectionScreen.tsx`)
- `useCollectionQuery(id)`; backdrop header (name + overview) then the parts as a `PosterCard` grid (COLS=3, reuse the `TrendingShowsView` layout), **sorted by `release_date` asc**.
- Loading → skeleton grid; error/offline → reuse `OfflineState` (`!!error` gate). Each card → `openDetails(part, part.media_type ?? "movie")`.
- "Add all to queue" — omitted (P1 queue not shipped).

**T4 — "Part of *X*" chip** (`src/screens/MovieDetailsScreen.tsx`)
- Read `d.belongs_to_collection` (already in the details payload — no new append). If present, render a chip ("Part of *The X Collection*") in the meta/quick area → `openCollection(d.belongs_to_collection.id)`.

**T5 — FranchisesRail + wire FeedSection** (`components/home/FranchisesRail.tsx`, `src/features/home/FeedSection.tsx`)
- `FranchisesRail({ ids, title })` → `useCollectionsQuery(ids)` → horizontal rail of collection cards (poster + name) → `openCollection`. Self-hides on empty. Use `RAIL_LIST_PROPS`.
- `FeedSection`: `case "franchises": return <FranchisesRail ids={section.collectionIds} title={section.title} />`.

**T6 — Curated fallback franchises** (`data/homeFeedFallback.ts`)
- Add a `{ type: "franchises", ... }` section with real TMDB collection ids (MCU 86311, Harry Potter 1241, Star Wars 10, LOTR 119, Fast & Furious 9485, John Wick 404609, Mission: Impossible 87359, Jurassic 328). Server-editable per §7.

**T7 — Collections in search** — **DEFERRED to D4.** The `searchCollection` endpoint (T1) is shipped and ready, but surfacing collections in search touches `useSearchData`, which D4 (search rework, spec §9/§12) reworks wholesale — doing it now = touching that hook twice. D4 wires `searchCollection` into the new search + adds the `Collections` results section/chip.

## Status — T1–T6 DONE & device-verified (2026-08-27), uncommitted
- ✅ **T1** endpoints (`collection`, `collections`, `searchCollection`) + `CollectionCard` type.
- ✅ **T2** `Collection {id}` route + `openCollection`.
- ✅ **T3** `CollectionScreen` — backdrop + overview + parts grid, chronological. Verified: Avengers collection renders 6 parts in release order.
- ✅ **T4** "Part of X" chip on MovieDetails from `d.belongs_to_collection`. Verified on The Avengers → chip → Collection.
- ✅ **T5** `FranchisesRail` + `FeedSection` `franchises` case. Verified: "Iconic Franchises" rail on Home (Avengers/HP/Star Wars/LOTR…).
- ✅ **T6** curated fallback franchises (8 collection ids). Also promoted `FranchisesSection` (collectionIds) into `types/feed.ts` + normalizer validation.
- ⏳ **T7** deferred → D4.

**Worker follow-up (separate deploy):** mirror `FranchisesSection` in `worker/src/schemas.ts` `AppConfigSchema.homeFeed` Zod so a server-sent `franchises` section validates. Not blocking (worker ships `homeFeed` omitted → app uses the fallback).

## Verification (done)
`tsc --noEmit` 0 + lint clean. Device: Home Franchises rail → Collection screen → part → "Part of X" chip → Collection. All work.
