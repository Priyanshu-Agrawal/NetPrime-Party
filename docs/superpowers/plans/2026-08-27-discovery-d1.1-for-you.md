# Discovery D1.1 — "For You" blended rail + preference toggle

**Goal:** Upgrade the single-seed "Because you watched X" rail into a **blended "For You"** rail (recommendations merged from the last ~6 watched titles, de-duped, watched excluded, ranked), with a **transparent header** that names the seeds, and a **user toggle** to disable/enable it from Settings → Preferences → Home.

**Builds on:** committed D1 (`8908012`). Reworks `components/home/BecauseYouWatchedRail.tsx`; the `becauseYouWatched` section type + FeedSection wiring stay unchanged.

**Verification:** no test runner → `tsc` + `lint` + a node quick-check for the pure `blendRecs`. Device QA (long title, toggle off/on, blended results) is manual.

## Global constraints
- **Commit only on explicit "commit."** Co-Author trailer. Scoped commits.
- Keep the `becauseYouWatched` section type + `FeedSection` switch case unchanged (component-internal rework only).
- No blur/elevation regressions (discovery, safe).

---

### Task 1 — pref + pure blend
**Files:** `utils/prefs.ts` (add `personalRecs`), `utils/blendRecs.ts` (new).
- `utils/prefs.ts`: add `PrefKey.PersonalRecs = "pref.personalRecs"` + `getPersonalRecs(): boolean` (default `true`) / `setPersonalRecs(v)`. Follow the existing get/set pattern.
- `utils/blendRecs.ts`: pure `blendRecs(recLists, excludeIds, limit=20)`:
```ts
export interface RecCandidate { id: number; poster_path?: string | null; title?: string; name?: string; vote_average?: number; }
export function blendRecs(recLists: RecCandidate[][], excludeIds: Set<number>, limit = 20): RecCandidate[] {
  const byId = new Map<number, { item: RecCandidate; freq: number }>();
  for (const list of recLists) for (const r of list) {
    if (!r || !r.poster_path || excludeIds.has(r.id)) continue;
    const e = byId.get(r.id);
    if (e) e.freq += 1; else byId.set(r.id, { item: r, freq: 1 });
  }
  return [...byId.values()]
    .sort((a, b) => b.freq - a.freq || (b.item.vote_average ?? 0) - (a.item.vote_average ?? 0))
    .slice(0, limit).map((e) => e.item);
}
```
Ranks by cross-seed frequency (a title several of your watches point to = strong) then rating. Excludes already-watched + poster-less. **Node quick-check:** dedupe by id, freq ordering, exclude set, poster filter.

### Task 2 — `useForYou` + rail rework
**File:** `components/home/BecauseYouWatchedRail.tsx` (rework).
- Load recent history (focus effect) → `seeds = history.slice(0, MAX_SEEDS=6)`; also read `getPersonalRecs()` into an `enabled` state in the same focus effect (so toggling in settings + returning reflects immediately).
- Fetch recs with a **fixed count** of `useDetailsQuery` (6 calls, `skipToken` for empty slots — hooks can't loop; this stays reactive + cached). Each → `data?.recommendations?.results ?? data?.similar?.results ?? []`.
- `excludeIds = new Set(history.map(h => Number(h.id)))` (never recommend a watched title).
- `items = useMemo(() => blendRecs(recLists, excludeIds), [...])`.
- After hooks: `if (!enabled || seeds.length === 0 || items.length === 0) return null;` (self-hide).
- **Header (transparent):** eyebrow `✨ BECAUSE YOU'VE BEEN WATCHING` (honey, uppercase) + a title line naming seeds — `seedLabel(seeds)` = first 1–2 titles + " & more" when >2 — `numberOfLines={1}`. Keep the existing eyebrow styles.
- Keep the `PosterCard` FlatList (poster w342, rating, kind, openDetails). Each rec's `kind` = its own media_type when present else the seed kind.

### Task 3 — Home preferences screen + wiring
**Files:** `src/screens/HomePrefsScreen.tsx` (new), `src/navigation/types.ts` (+`HomePrefs: undefined`), `src/navigation/RootNavigator.tsx` (register), `src/navigation/actions.ts` (`openHomePrefs`), `src/features/profile/ProfileView.tsx` (add a "Home" Row in the Preferences section).
- `HomePrefsScreen`: `Screen` + `LibraryScreenHeader title="Home"`; a card with a **ToggleRow** — label "Recommended for you", subtitle "Show the 'Because you've been watching' rail on Home", RN `Switch` bound to `getPersonalRecs()`/`setPersonalRecs()` (local state, honey `trackColor` — match `components/party/RoomSettingsSheet.tsx:243`).
- `ProfileView`: add `<Row icon="sparkles-outline" label="Home" onPress={openHomePrefs} />` in the Preferences group (before "Playback & data").
- `openHomePrefs()` → `navigate("HomePrefs")`.

## Verification
`tsc` + `lint` clean; `blendRecs` node-check passes; device: rail shows blended recs with the seed-named header; toggling Home→off hides it, on shows it; a long seed title truncates.
