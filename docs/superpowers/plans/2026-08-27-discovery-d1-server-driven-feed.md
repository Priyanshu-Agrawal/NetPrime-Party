# Discovery D1 — Server-Driven Feed Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Home's hardcoded rail JSX with a **server-driven, lolomo-style feed** — a typed `FeedManifest` (served inside `AppConfig.homeFeed`, with a baked-in fallback) rendered by a `<FeedSection>` switch — and add the "Because you watched X" rail + a generic See-all grid.

**Architecture:** The manifest is an ordered array of typed sections; the client owns the components. `HomeView` keeps Hero + the party CTA as fixed chrome, then maps the normalized manifest to `<FeedSection>`. The feed rides the existing `/config` fetch (`useGetConfigQuery`); a client normalizer guarantees a valid Home even when `homeFeed` is absent/garbage. No new endpoint, no component-tree SDUI.

**Tech Stack:** Expo SDK 53 / RN 0.79 / React 19 · Redux Toolkit + RTK Query · `@hono/zod-openapi` worker · Reanimated 3 · TMDB via `tmdbApi` (fakeBaseQuery).

**Spec:** [docs/superpowers/specs/2026-08-27-discovery-ux-overhaul-design.md](../specs/2026-08-27-discovery-ux-overhaul-design.md) — §2–6, §11 (incl. the §16 QA revisions: embed in `/config`, semver-reserved `minAppVersion`, generic `RailSeeAll`).

## Global Constraints

- **Commit ONLY on explicit "commit."** Messages end `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Scope with `git commit -- <paths>`.
- **No test runner** (no jest, zero tests). Gate = `npx tsc --noEmit` + `npm run lint` + a **node quick-check** for pure functions (`normalizeManifest`) + **execbro** device screenshots. UI parity check: Home must look identical to today when `homeFeed` is absent (fallback = current rails + the new Because-you-watched rail).
- **Server-driven, lolomo — client owns components.** No component-tree renderer.
- **Forward-compat:** `<FeedSection>` returns `null` for any unknown `type`; `normalizeManifest` drops invalid sections. A new server section type must never crash an older Obtainium build.
- **Same-shape fallback:** `data/homeFeedFallback.ts` is a valid `FeedManifest` identical in shape to what the worker serves; it *is* today's Home + the new rail.
- **No blur/elevation regressions.** Discovery is video-free; existing `Frost` header + `GlassCard blur={false}` CTA stay as-is.
- **`AppConfig.homeFeed` is OPTIONAL.** D1 ships with the worker able to omit it (client renders fallback); server-driving is proven by populating it, not required for the app to work.

---

## File structure

- **Create:** `types/feed.ts` (shared manifest types) · `data/homeFeedFallback.ts` (canonical default) · `utils/normalizeManifest.ts` (robust coercion) · `src/features/home/FeedSection.tsx` (the switch) · `components/home/BecauseYouWatchedRail.tsx` · `src/features/discovery/RailSeeAllScreen.tsx` (generic grid).
- **Modify:** `src/features/home/HomeView.tsx` (rail JSX → feed loop) · `src/types/worker.types.ts` (`AppConfig.homeFeed?`) · `worker/src/schemas.ts` (+`FeedManifestSchema`, `AppConfigSchema.homeFeed`) · `worker/src/index.ts` (`/config` handler returns `homeFeed`) · `src/navigation/types.ts` + `PlayerNavigator.tsx` + `src/navigation/actions.ts` (`RailSeeAll` route + `openSeeAll`).

---

### Task 1: Feed manifest types + fallback

**Files:**
- Create: `types/feed.ts`, `data/homeFeedFallback.ts`
- Reference: current rails `src/features/home/HomeView.tsx:76-89`

**Interfaces:**
- Produces: `FeedManifest`, `FeedSection` (union), `FeedSectionType`; `HOME_FEED_FALLBACK: FeedManifest`.

- [ ] **Step 1: Write `types/feed.ts`**

```ts
// types/feed.ts — shared shape for the server-driven Home feed (mirrored by worker Zod).
export type FeedSectionType =
  | "continueWatching" | "becauseYouWatched"
  | "tmdbRail" | "genreRow" | "franchises" | "editorialRow"; // last 3 reserved (D2/D3/P5)

export interface FeedSectionBase {
  id: string;
  type: FeedSectionType;
  title?: string;
  enabled?: boolean;       // default true
  minAppVersion?: string;  // RESERVED (semver) — gate deferred, no-op in D1
}
export interface TmdbRailSection extends FeedSectionBase {
  type: "tmdbRail";
  path: string;            // TMDB list path, e.g. "movie/popular"
  kind: "movie" | "tv";
  icon?: string;           // Ionicons glyph
  seeAll?: boolean;
  limit?: number;
}
export interface SimpleSection extends FeedSectionBase {
  type: "continueWatching" | "becauseYouWatched" | "genreRow" | "franchises" | "editorialRow";
}
export type FeedSection = TmdbRailSection | SimpleSection;

export interface FeedManifest {
  version: number;         // schema version; bump only on a breaking shape change
  sections: FeedSection[];
}
export const FEED_SCHEMA_VERSION = 1;
```

- [ ] **Step 2: Write `data/homeFeedFallback.ts`** (today's Home, data-driven, + the new rail)

```ts
import type { FeedManifest } from "@/types/feed";
import { FEED_SCHEMA_VERSION } from "@/types/feed";

// The canonical default feed = current Home rails + "Because you watched".
// Hero + the party CTA remain fixed chrome in HomeView (not sections).
export const HOME_FEED_FALLBACK: FeedManifest = {
  version: FEED_SCHEMA_VERSION,
  sections: [
    { id: "continue",   type: "continueWatching" },
    { id: "because",    type: "becauseYouWatched" },
    { id: "trend-tv",   type: "tmdbRail", title: "Trending Shows",  path: "trending/tv/week", kind: "tv", icon: "flame", seeAll: true },
    { id: "now-playing",type: "tmdbRail", title: "Now Playing",     path: "movie/now_playing", kind: "movie", seeAll: true },
    { id: "pop-movie",  type: "tmdbRail", title: "Popular Movies",  path: "movie/popular", kind: "movie", seeAll: true },
    { id: "top-movie",  type: "tmdbRail", title: "Top Rated Movies",path: "movie/top_rated", kind: "movie", icon: "star", seeAll: true },
    { id: "upcoming",   type: "tmdbRail", title: "Upcoming",        path: "movie/upcoming", kind: "movie", seeAll: true },
    { id: "pop-tv",     type: "tmdbRail", title: "Popular Series",  path: "tv/popular", kind: "tv", seeAll: true },
    { id: "top-tv",     type: "tmdbRail", title: "Top Rated Series",path: "tv/top_rated", kind: "tv", icon: "star", seeAll: true },
    { id: "airing",     type: "tmdbRail", title: "Airing Today",    path: "tv/airing_today", kind: "tv", seeAll: true },
  ],
};
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean.
- [ ] **Step 4: Commit** (on "commit") — `types/feed.ts`, `data/homeFeedFallback.ts`.

---

### Task 2: `normalizeManifest` (pure, node-checked)

**Files:**
- Create: `utils/normalizeManifest.ts`

**Interfaces:**
- Consumes: `HOME_FEED_FALLBACK`, `FeedManifest`, `FeedSection`.
- Produces: `normalizeManifest(raw: unknown): FeedManifest` — always returns a valid manifest, never throws.

- [ ] **Step 1: Write `utils/normalizeManifest.ts`**

```ts
import type { FeedManifest, FeedSection, FeedSectionType } from "@/types/feed";
import { FEED_SCHEMA_VERSION } from "@/types/feed";
import { HOME_FEED_FALLBACK } from "@/data/homeFeedFallback";

const KNOWN: FeedSectionType[] = [
  "continueWatching", "becauseYouWatched", "tmdbRail", "genreRow", "franchises", "editorialRow",
];

function normalizeSection(raw: any, i: number): FeedSection | null {
  if (!raw || typeof raw !== "object") return null;
  const type = raw.type as FeedSectionType;
  if (!KNOWN.includes(type)) return null;                 // forward-compat: unknown → drop
  if (raw.enabled === false) return null;
  if (type === "tmdbRail") {
    if (typeof raw.path !== "string" || !raw.path) return null;  // missing required prop → drop
    if (raw.kind !== "movie" && raw.kind !== "tv") return null;
  }
  return {
    ...raw,
    id: typeof raw.id === "string" && raw.id ? raw.id : `s${i}`,
    enabled: true,
  } as FeedSection;
}

/** Coerce ANY input into a valid FeedManifest. Undefined/garbage → the baked-in fallback. */
export function normalizeManifest(raw: unknown): FeedManifest {
  const m = raw as any;
  if (!m || typeof m !== "object" || !Array.isArray(m.sections)) return HOME_FEED_FALLBACK;
  const sections = m.sections
    .map((s: any, i: number) => normalizeSection(s, i))
    .filter(Boolean) as FeedSection[];
  if (sections.length === 0) return HOME_FEED_FALLBACK;   // empty after filtering → fallback
  return { version: typeof m.version === "number" ? m.version : FEED_SCHEMA_VERSION, sections };
}
```

- [ ] **Step 2: Node quick-check** (throwaway; no test runner). Write `scratch: node -e` covering:

```bash
npx tsx -e '
import { normalizeManifest } from "./utils/normalizeManifest";
import { HOME_FEED_FALLBACK } from "./data/homeFeedFallback";
const eq = (a,b,msg)=>{ if(JSON.stringify(a)!==JSON.stringify(b)) throw new Error("FAIL: "+msg); console.log("ok:",msg); };
eq(normalizeManifest(undefined), HOME_FEED_FALLBACK, "undefined -> fallback");
eq(normalizeManifest({sections:[]}), HOME_FEED_FALLBACK, "empty -> fallback");
const r = normalizeManifest({version:1,sections:[
  {type:"tmdbRail",path:"movie/popular",kind:"movie"},   // ok, gets id
  {type:"tmdbRail",kind:"movie"},                          // no path -> dropped
  {type:"bogus"},                                          // unknown -> dropped
  {type:"continueWatching",enabled:false},                // disabled -> dropped
  {type:"becauseYouWatched",id:"b"},                       // ok
]});
if (r.sections.length !== 2) throw new Error("FAIL count "+r.sections.length);
if (!r.sections[0].id) throw new Error("FAIL id assign");
console.log("all good", JSON.stringify(r.sections.map(s=>s.type)));
'
```
Expected: all `ok:` lines + `all good ["tmdbRail","becauseYouWatched"]`. Delete the scratch after.

- [ ] **Step 3: Commit** (on "commit") — `utils/normalizeManifest.ts`.

---

### Task 3: `BecauseYouWatchedRail`

**Files:**
- Create: `components/home/BecauseYouWatchedRail.tsx`
- Reference: `components/home/ContinueWatching.tsx` (history load pattern), `components/home/MediaRail.tsx` (rail layout), `MovieDetailsScreen.tsx:103` (recs derivation), `src/ui/PosterCard.tsx`, `src/ui/SectionHeader.tsx`.

**Interfaces:**
- Consumes: `getWatchHistory()` (`utils/history.ts`), `useDetailsQuery` (`tmdbApi`), `img` (`utils/tmdbDetails`), `openDetails` (`actions.ts`).
- Produces: `<BecauseYouWatchedRail />` (self-contained; renders `null` when there is no history or no recommendations).

- [ ] **Step 1: Write the component**

```tsx
import { openDetails } from "@/src/navigation/actions";
import { SectionHeader, PosterCard } from "@/src/ui";
import { useDetailsQuery } from "@/src/store/services/tmdbApi";
import { img } from "@/utils/tmdbDetails";
import { getWatchHistory, type HistoryItem } from "@/utils/history";
import { spacing, ms } from "@/theme/bearoom";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { FlatList, View } from "react-native";

const POSTER_W = ms(112);

export function BecauseYouWatchedRail() {
  const [recent, setRecent] = useState<HistoryItem | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    getWatchHistory()
      .then((list: HistoryItem[]) => {
        if (!active) return;
        const sorted = [...list].filter((i) => i.id).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
        setRecent(sorted[0] ?? null);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []));

  const { data: details } = useDetailsQuery(
    recent ? { type: recent.type, id: recent.id } : (undefined as any),
    { skip: !recent },
  );

  const recs = ((details?.recommendations?.results ?? details?.similar?.results ?? []) as any[])
    .filter((m) => m.poster_path).slice(0, 20);

  if (!recent || recs.length === 0) return null; // self-hide

  return (
    <View style={{ marginTop: spacing.lg }}>
      <SectionHeader title={`Because you watched ${recent.title}`} icon="sparkles" />
      <FlatList
        data={recs}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}
        renderItem={({ item }) => (
          <PosterCard
            width={POSTER_W}
            poster={img(item.poster_path, "w342") ?? undefined}
            title={item.title || item.name}
            rating={item.vote_average ?? undefined}
            kind={recent.type}
            onPress={() => openDetails({ id: item.id, media_type: recent.type }, recent.type)}
          />
        )}
      />
    </View>
  );
}
```
> Confirm `SectionHeader` is exported from `@/src/ui` (it lives at `src/ui/SectionHeader.tsx`) and its prop names (`title`, `icon`) — adjust the import path if it is not re-exported through the `@/src/ui` barrel. Confirm `HistoryItem` is exported from `utils/history.ts`.

- [ ] **Step 2: Verify** — `npx tsc --noEmit` + `lint`. Temporarily mount `<BecauseYouWatchedRail/>` in HomeView (or wait for Task 5) and screenshot on a device that has watch history → rail shows recs; on a fresh install → renders nothing (no empty header).
- [ ] **Step 3: Commit** (on "commit") — `components/home/BecauseYouWatchedRail.tsx`.

---

### Task 4: `FeedSection` renderer

**Files:**
- Create: `src/features/home/FeedSection.tsx`
- Reference: `components/home/{MediaRail,ContinueWatching}.tsx`, Task 3, `openSeeAll` (Task 6).

**Interfaces:**
- Consumes: `FeedSection`, `MediaRail`, `ContinueWatching`, `BecauseYouWatchedRail`, `openSeeAll`.
- Produces: `<FeedSection section={FeedSection} />`.

- [ ] **Step 1: Write the switch**

```tsx
import type { FeedSection as Section } from "@/types/feed";
import { MediaRail } from "@/components/home/MediaRail";
import { ContinueWatching } from "@/components/home/ContinueWatching";
import { BecauseYouWatchedRail } from "@/components/home/BecauseYouWatchedRail";
import { openSeeAll } from "@/src/navigation/actions";
import React from "react";

export function FeedSection({ section }: { section: Section }) {
  switch (section.type) {
    case "continueWatching":  return <ContinueWatching />;
    case "becauseYouWatched": return <BecauseYouWatchedRail />;
    case "tmdbRail":
      return (
        <MediaRail
          title={section.title ?? ""}
          path={section.path}
          kind={section.kind}
          icon={section.icon as any}
          onSeeAll={section.seeAll ? () => openSeeAll(section.title ?? "", section.path, section.kind) : undefined}
        />
      );
    // genreRow (D3), franchises (D2), editorialRow (P5): not yet rendered.
    default: return null; // forward-compat
  }
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` (will flag the missing `openSeeAll` until Task 6; do Task 6 first if executing strictly TDD-serial, or stub `openSeeAll` then).
- [ ] **Step 3: Commit** (on "commit") — `src/features/home/FeedSection.tsx`.

---

### Task 5: `HomeView` rewrite

**Files:**
- Modify: `src/features/home/HomeView.tsx` (replace the rail block `:76-89`; keep Hero `:40` + CTA `:42-72` fixed)

**Interfaces:**
- Consumes: `useGetConfigQuery` (`workerApi`), `normalizeManifest`, `<FeedSection>`.

- [ ] **Step 1: Replace the hardcoded rails with the feed loop.** Keep everything else (StatusBar, Hero, CTA, header overlay, styles) unchanged. Add imports and swap `:74-89`:

```tsx
// imports
import { useGetConfigQuery } from "@/src/store/services/workerApi";
import { normalizeManifest } from "@/utils/normalizeManifest";
import { FeedSection } from "@/src/features/home/FeedSection";
```
```tsx
// inside the component, before return:
const { data: config } = useGetConfigQuery();
const feed = normalizeManifest(config?.homeFeed);
```
```tsx
// replace <ContinueWatching /> + the eight <MediaRail/> lines (:74-89) with:
{feed.sections.map((s) => (
  <FeedSection key={s.id} section={s} />
))}
```
(`ContinueWatching` is now a section, so drop its direct import/usage; Hero + CTA stay above the loop.)

- [ ] **Step 2: Verify (execbro, parity)** — With the worker NOT serving `homeFeed`, Home must render **identically to before** plus the new "Because you watched" rail after Continue Watching. `tsc` + `lint` clean. Screenshot Home; compare rail order/titles to the previous build.
- [ ] **Step 3: Commit** (on "commit") — `src/features/home/HomeView.tsx`.

---

### Task 6: Generic `RailSeeAll` screen + route + action

**Files:**
- Create: `src/features/discovery/RailSeeAllScreen.tsx` (generalize `TrendingShowsView`)
- Modify: `src/navigation/types.ts` (add `RailSeeAll: { title: string; path: string; kind: "movie" | "tv" }` to the PlayerStack list), `src/navigation/PlayerNavigator.tsx` (register the screen), `src/navigation/actions.ts` (add `openSeeAll`)
- Reference: `src/features/profile/TrendingShowsView.tsx` (copy structure; swap the 3 hardcoded consts `:17-19` for route params), `src/navigation/actions.ts` (`openDetails`/`openLibrary` pattern)

**Interfaces:**
- Produces: route `RailSeeAll`; `openSeeAll(title: string, path: string, kind: "movie"|"tv"): void`.

- [ ] **Step 1: Create `RailSeeAllScreen`** by copying `TrendingShowsView.tsx` and replacing the three module constants with `useRoute` params:

```tsx
// swap: const LIST_PATH = "trending/tv/week";  →  read from route
const { title, path, kind } = useRoute<RouteProp<PlayerStackParamList, "RailSeeAll">>().params;
// use `path` in fetchPage({ path, page }), `kind` on PosterCard + the media_type stamp, `title` in <LibraryScreenHeader/>.
```
Keep the lazy `useLazyListPageQuery` + ref-pagination + skeleton + retry logic verbatim.

- [ ] **Step 2: Register route + params + action.**
```ts
// types.ts (PlayerStack param list)
RailSeeAll: { title: string; path: string; kind: "movie" | "tv" };
```
```ts
// actions.ts
export function openSeeAll(title: string, path: string, kind: "movie" | "tv") {
  navigate("PlayerStack", { screen: "RailSeeAll", params: { title, path, kind } });
}
```
Register `<Stack.Screen name="RailSeeAll" component={RailSeeAllScreen} />` in `PlayerNavigator.tsx`.

- [ ] **Step 3: Verify** — `tsc` + `lint`. On device: tap a rail's "See all" → paginated grid for that path; scroll paginates; back returns to Home.
- [ ] **Step 4: Commit** (on "commit") — the four files.

---

### Task 7: Worker — `homeFeed` in `AppConfig` (optional) + prove server-driving

**Files:**
- Modify: `worker/src/schemas.ts` (add `FeedSectionSchema`/`FeedManifestSchema`; add `homeFeed` to `AppConfigSchema` `:78-84`), `worker/src/index.ts` (`/config` handler `:118+` returns `homeFeed`), `src/types/worker.types.ts` (add `homeFeed?: FeedManifest` to `AppConfig` `:29-33`)

**Interfaces:**
- Produces: `AppConfig.homeFeed?: FeedManifest` end-to-end.

- [ ] **Step 1: Worker Zod schema** — add to `schemas.ts`, mirroring `types/feed.ts`:

```ts
const FeedSectionSchema = z.object({
  id: z.string(),
  type: z.enum(["continueWatching","becauseYouWatched","tmdbRail","genreRow","franchises","editorialRow"]),
  title: z.string().optional(),
  enabled: z.boolean().optional(),
  minAppVersion: z.string().optional(),
  path: z.string().optional(),
  kind: z.enum(["movie","tv"]).optional(),
  icon: z.string().optional(),
  seeAll: z.boolean().optional(),
  limit: z.number().int().optional(),
}).openapi("FeedSection");
export const FeedManifestSchema = z.object({
  version: z.number().int(),
  sections: z.array(FeedSectionSchema),
}).openapi("FeedManifest");
```
Then in `AppConfigSchema`: `homeFeed: FeedManifestSchema.optional(),`.

- [ ] **Step 2: App type** — add `homeFeed?: FeedManifest;` to `AppConfig` in `src/types/worker.types.ts` (import `FeedManifest` from `@/types/feed`).
- [ ] **Step 3: `/config` handler** — leave `homeFeed` **omitted** in the shipped response for now (client renders the fallback — no-hard-cutover). `tsc` on the worker (`cd worker && npx tsc --noEmit` or the worker's typecheck).
- [ ] **Step 4: Prove server-driving (verification, not shipped)** — temporarily return a `homeFeed` from `/config` with a **reordered** subset (e.g. `pop-movie` before `trend-tv`, and one bogus `{type:"xyz"}` section). `curl <worker>/config | jq .homeFeed`. On device: Home reflects the new order **without a rebuild**, and the bogus section is silently skipped. Then revert to omitting `homeFeed`.
- [ ] **Step 5: Commit** (on "commit") — `worker/src/schemas.ts`, `worker/src/index.ts`, `src/types/worker.types.ts`.

**D1 done when:** Home is fully data-driven from `normalizeManifest(config?.homeFeed)` with the baked-in fallback identical to today's Home + a "Because you watched" rail; every rail has a working generic See-all; a worker-served `homeFeed` reorders Home with no rebuild and drops unknown sections. `tsc` + `lint` clean, device-verified.

---

## Verification (whole phase)

1. `npx tsc --noEmit` (app + `cd worker`) and `npm run lint` clean.
2. `normalizeManifest` node quick-check passes (Task 2).
3. **Parity:** worker omits `homeFeed` → Home == today's rails + Because-you-watched (execbro screenshot).
4. **Server-driving:** worker returns a reordered `homeFeed` → Home reorders, no rebuild; unknown-type section skipped (Task 7 Step 4).
5. **See-all:** each rail's See-all opens the generic paginated grid for its path.
6. **Resilience:** airplane-mode first launch → fallback Home renders (no blank, no crash).

## Notes / deferred from spec (intentional)

- **`hero` + party CTA stay fixed chrome** (not sections) in D1 — lower risk, and they're always-present. A server-driven hero can be added later as a section type.
- **`genreRow` deferred to D3** (shipping inert genre chips is a UX defect) — it lands with the Genre browse screen. `franchises` → D2, `editorialRow` → P5. All three already parse (dropped/`null`) so no crash if present.
- **`minAppVersion` gate** is reserved/no-op (semver only; see spec §16 F2).
