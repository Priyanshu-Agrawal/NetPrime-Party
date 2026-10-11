# Phase 2C — Language Before Play (Title Page Preview) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a title page, a background preview finds which audio languages native streams exist in, so Play reads "Play in Hindi". An "Other languages" chip lists the rest. Pressing Play afterwards reuses the preview's streams.

**Architecture:** A probe-free preview (`previewTitle`) runs the plugin host and ranks candidates without touching stream hosts. Its streams land in the plugin host's 15-minute cache, and a second request for the same title joins a run already in flight, so Play never runs a plugin twice. The title page uses:
- a hook (`useLanguagePreview`) that gates the preview on flags, network, data saver and metered connections, and waits 600 ms;
- pure helpers that turn the results into the button label, a note and the other languages;
- a small component under the Play row.

**Tech Stack:** Expo SDK 57 / RN 0.86, TypeScript, jest-expo + react-test-renderer, @react-native-community/netinfo.

**Spec:** `docs/superpowers/specs/2026-10-10-playback-languages-party-design.md` §6.1 (title page — language before Play), §1.1 S1/S2/S4, §9 row 2 ("title-page ▶ Play in Hindi preview").

## Global Constraints

- Play is never blocked or delayed by the preview (§6.1).
- The preview starts after 600 ms on the title page and never on data-saver or metered connections unless the user opts in (§6.1).
- Preview results seed Play through the plugin host's 15-minute cache (§6.1).
- No probing in the preview, so no request reaches a stream host. Plugin runs only.
- Native lane gate: the `pluginHost` and `nativeLane` flags are on, `nativeFetchAvailable` holds, and the platform isn't web (same as `PlayerLaneScreen`).
- Never claim a language is missing unless native candidates answered completely (`complete`) and none had it. With no native candidates, or a partial answer, show plain Play.
- No Reanimated `entering`/`exiting`/`layout`. No new Modal (an inline chip row instead). Never touch `src/ui/BearAlert.tsx` or `.codex/`.
- No stream URLs, cookies or headers in logs or telemetry.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Leaving the title page early.** The user leaves before 600 ms or mid-preview. No preview starts, or its result is dropped, and nothing updates after unmount. Pinned in Task 4.
2. **TV season switch mid-preview.** The answer for the previous episode must not label the new one. Pinned in Task 4.
3. **Play pressed mid-preview.** Play isn't blocked, and plugins don't run twice. Pinned in Tasks 1 and 4.
4. **Unknown or absent languages.** No native candidates, unlabelled candidates, or an early (partial) answer must never say "Hindi not available". Pinned in Task 3.
5. **Gates.** Flags off, offline, data saver on, or a metered network without the opt-in means no preview runs and Play stays plain. Pinned in Task 4.

---

### Task 1: PluginHost shares a run already in flight

**Files:**
- Modify: `services/plugins/PluginHost.ts`
- Test: `services/plugins/PluginHost.test.ts`

**Interfaces:**
- Produces: `PluginHost.getStreams(req, opts)` — unchanged signature. A second call for the same title and plugin, while the first run is still going, joins it:
  - it doesn't call `deps.run` again;
  - it gets the streams through `onStreams` and its result;
  - it gets no `onSettled` for the joined run, because the first caller records health once.

- [ ] **Step 1: Write the failing test**

```ts
  it("a second call for the same title joins a plugin already running instead of running it twice", async () => {
    const { host, run, answer } = harness([plugin("a")]);
    const settledA: string[] = [];
    const settledB: string[] = [];
    const first = host.getStreams(REQ, { onSettled: (k) => settledA.push(k) });
    await jest.advanceTimersByTimeAsync(0);
    const second = host.getStreams(REQ, { onSettled: (k) => settledB.push(k) });
    await answer("a", ["u1"]);
    expect(run).toHaveBeenCalledTimes(1);
    expect((await first).streams.map((s) => s.url)).toEqual(["u1"]);
    expect((await second).streams.map((s) => s.url)).toEqual(["u1"]);
    expect(settledA).toEqual(["r/a@1"]);
    expect(settledB).toEqual([]);
  });

  it("a joined run that fails is a failure for both callers, reported once", async () => {
    const { host, run, pending } = harness([plugin("a")]);
    const settled: string[] = [];
    const first = host.getStreams(REQ, { onSettled: (k) => settled.push(k) });
    await jest.advanceTimersByTimeAsync(0);
    const second = host.getStreams(REQ, { onSettled: (k) => settled.push(k) });
    await jest.advanceTimersByTimeAsync(200);
    pending.get("r/a@1")!.reject(new Error("boom"));
    await jest.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    expect((await first).failures).toHaveLength(1);
    expect((await second).failures).toHaveLength(1);
    expect(settled).toEqual(["r/a@1"]);
  });
```

- [ ] **Step 2: Run to verify it fails** — `npx jest services/plugins/PluginHost` → FAIL (`run` called twice).

- [ ] **Step 3: Implement**

`runOne` keeps the shared outcome in `private inflight = new Map<string, Promise<PluginStream[] | PluginFailure>>()`, keyed `${title}|${p.key}`, and removes the entry when the run settles. In `getStreams`:
- a cache hit adds the cached streams, as today;
- otherwise, if `inflight` has the key, attach to the shared promise: streams go to `add`, a failure goes into this call's `failures` without `onSettled`, then `settle()`;
- otherwise queue the plugin for a fresh run.

The joined run isn't counted in `ran` and takes no parallel slot.

```ts
  private inflight = new Map<string, Promise<PluginStream[] | PluginFailure>>();
  // in getStreams' loop, after the cache check:
        const shared = this.inflight.get(`${title}|${p.key}`);
        if (shared) {
          void shared.then((out) => {
            if (Array.isArray(out)) add(p, out);
            else failures.push(out);
            settle();
          });
          continue;
        }
```

`runOne` becomes:
- start the run;
- store `run.then(list | failure)` in `inflight` before awaiting it;
- delete the entry in `finally`.

Its per-caller side effects (`add`, `fail` → `failures` + `onSettled`) are unchanged for the caller that started it.

- [ ] **Step 4: Run** — `npx jest services/plugins` → PASS (all PluginHost tests, old and new).

- [ ] **Step 5: Commit** — `git commit -m "feat(plugins): a second request for a title joins plugins already running"`

---

### Task 2: A probe-free preview resolve

**Files:**
- Modify: `services/playback/resolver.ts`, `services/playback/index.ts`
- Test: `services/playback/resolver.test.ts`

**Interfaces:**
- Consumes: `ResolveDeps` (Task 1 unchanged), `toCandidates`, `rankCandidates`.
- Produces:
  - `previewPlayback(req: TitleRequest, deps: Omit<ResolveDeps, "probe">): Promise<{ ranked: PlaybackCandidate[]; complete: boolean }>`, which never probes and records health as each plugin settles;
  - `previewTitle(req: TitleRequest, languages: string[]): Promise<{ ranked: PlaybackCandidate[]; complete: boolean }>`.

- [ ] **Step 1: Write the failing test**

```ts
  it("preview: ranks what the plugins found without probing, and records health as they settle", async () => {
    const health = { isDown: () => false, record: jest.fn() };
    const getStreams = jest.fn(async (_r, opts) => {
      opts?.onSettled?.("r/p@1");
      return { streams: [stream({ name: "Src • Hindi", url: "https://a.example.net/h.m3u8" }), stream({ name: "Src • English", url: "https://a.example.net/e.m3u8" })], failures: [], ran: ["r/p@1"], complete: true };
    });
    const out = await previewPlayback({ tmdbId: "1", type: "movie" }, { getStreams, health, platform: "android", languages: ["hi", "en"] });
    expect(out.complete).toBe(true);
    expect(out.ranked.map((c) => c.languages[0])).toEqual(["hi", "en"]);
    expect(out.ranked.every((c) => c.verdict === "unverified")).toBe(true);
    expect(health.record).toHaveBeenCalledWith("r/p", true);
  });
```

(Use the file's existing `stream()` helper; if its signature differs, adapt the call — the assertion is the contract.)

- [ ] **Step 2: Run** — `npx jest services/playback/resolver` → FAIL (`previewPlayback` not exported).

- [ ] **Step 3: Implement**

Pull the `getStreams` + `onSettled` health block out of `resolvePlayback` into a local `streamsFor(req, deps)` and use it in both.

```ts
export async function previewPlayback(req: TitleRequest, deps: Omit<ResolveDeps, "probe">): Promise<{ ranked: PlaybackCandidate[]; complete: boolean }> {
  deps.warm?.();
  const host = await streamsFor(req, deps);
  const all = toCandidates(host.streams, { originalLanguage: req.originalLanguage, titleName: req.titleName, originalTitle: req.originalTitle });
  return { ranked: rankCandidates(all, { platform: deps.platform, languages: deps.languages, isDown: (id) => deps.health.isDown(id) }), complete: host.complete };
}
```

In `index.ts`, add `previewTitle(req, languages)` wired like `resolveTitle`, without `probe`.

- [ ] **Step 4: Run** — `npx jest services/playback` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(playback): a probe-free preview resolve for the title page"`

---

### Task 3: What Play says (pure)

**Files:**
- Create: `src/features/title/languagePreview.ts`
- Test: `src/features/title/languagePreview.test.ts`

**Interfaces:**
- Consumes: `languageName(code)` from `components/player/native/languages.ts`.
- Produces:
  - `type PreviewStatus = "off" | "waiting" | "checking" | "done"`
  - `interface PreviewAnswer { langs: string[][]; complete: boolean }`: each ranked candidate's languages, best first.
  - `foundLanguages(answer): string[]`: unique primary (first) languages in rank order.
  - `playButton(status, answer | null, wanted: string[]): { label: string; note?: string; others: { code: string; label: string }[] }`

**Rules:**
- `off` or `waiting` → `{ label: "Play", others: [] }`.
- `checking` → `{ label: "Play", note: "Checking languages…", others: [] }`.
- `done`:
  - `found` = foundLanguages; `play` = the first `wanted` code in `found`.
  - `play === wanted[0]` → label `Play in <Name>`.
  - Otherwise label `Play`, plus note `<Name of wanted[0]> not available for this title`, but only when `answer.complete` and `found.length > 0`.
  - `others` = `found` minus `play`.
  - `found` empty → `{ label: "Play", others: [] }`.

- [ ] **Step 1: Write the failing tests**

```ts
import { foundLanguages, playButton } from "./languagePreview";

const done = (langs: string[][], complete = true) => ({ langs, complete });

describe("playButton", () => {
  it("says nothing before the preview starts", () => {
    expect(playButton("off", null, ["hi"])).toEqual({ label: "Play", others: [] });
    expect(playButton("waiting", null, ["hi"])).toEqual({ label: "Play", others: [] });
  });
  it("is still Play while checking", () => {
    expect(playButton("checking", null, ["hi"])).toEqual({ label: "Play", note: "Checking languages…", others: [] });
  });
  it("names the preferred language when a stream has it, and offers the others", () => {
    expect(playButton("done", done([["hi"], ["en"], ["ta", "en"]]), ["hi", "en"])).toEqual({
      label: "Play in Hindi",
      others: [{ code: "en", label: "English" }, { code: "ta", label: "Tamil" }],
    });
  });
  it("says the preferred language is missing only after a complete answer that found other languages", () => {
    expect(playButton("done", done([["en"]]), ["hi", "en"])).toEqual({ label: "Play", note: "Hindi not available for this title", others: [] });
    expect(playButton("done", done([["en"]], false), ["hi", "en"])).toEqual({ label: "Play", others: [] });
  });
  it("claims nothing when no native stream answered or none says its language", () => {
    expect(playButton("done", done([]), ["hi", "en"])).toEqual({ label: "Play", others: [] });
    expect(playButton("done", done([[], []]), ["hi", "en"])).toEqual({ label: "Play", others: [] });
  });
  it("offers languages outside the wanted list without a play language", () => {
    expect(playButton("done", done([["ja"]]), ["hi", "en"])).toEqual({ label: "Play", note: "Hindi not available for this title", others: [{ code: "ja", label: "Japanese" }] });
  });
});

describe("foundLanguages", () => {
  it("takes each stream's primary language once, best first", () => {
    expect(foundLanguages(done([["hi", "en"], ["en"], ["hi"]]))).toEqual(["hi", "en"]);
  });
});
```

- [ ] **Step 2: Run** — `npx jest src/features/title/languagePreview` → FAIL (module missing).

- [ ] **Step 3: Implement** the module per the rules above (≈40 lines).

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(title): what Play says once the languages are known"`

---

### Task 4: `useLanguagePreview` — gated, delayed, cancellable

**Files:**
- Create: `src/features/title/useLanguagePreview.ts`; add `getPreviewOnMetered` / `setPreviewOnMetered` (`pref.previewOnMetered`, default false) to `utils/prefs.ts`
- Test: `src/features/title/useLanguagePreview.test.tsx`

**Interfaces:**
- Consumes: `previewTitle` (Task 2), `playButton` / `PreviewAnswer` (Task 3), and:
  - `useFeatureFlags`, `nativeFetchAvailable`, `useConnectivity`, `useNetInfo`;
  - `getDataSaver`, `getPreviewOnMetered`;
  - `languageOrder`, `resolveOrder`, `getTitleLanguage`, `setTitleLanguage`, `titleKeyOf`.
- Produces: `PREVIEW_DELAY_MS = 600` and
  `useLanguagePreview(input: { type: "movie" | "tv"; tmdbId: string; season?: number; episode?: number; details?: { original_language?: string; title?: string; name?: string; original_title?: string; original_name?: string; runtime?: number }; enabled: boolean }): { status: PreviewStatus; button: ReturnType<typeof playButton>; choose(code: string): void }`

**Behaviour:**
- `allowed` requires all of:
  - `enabled`, `pluginHost && nativeLane`, `nativeFetchAvailable`, a platform that isn't web;
  - not offline, data saver off;
  - not metered (`netinfo.details?.isConnectionExpensive === true`), unless `getPreviewOnMetered()` is on.
- When allowed and the input key (`type:id:season:episode`) changes:
  - status `waiting`; after 600 ms, `checking`, then call `previewTitle`;
  - a sequence number drops answers for an old key or after unmount;
  - answer → `done`; error → `off`.
- `wanted` = `resolveOrder(languageOrder(), details.original_language, choice ?? getTitleLanguage(key))`.
- `choose(code)` calls `setTitleLanguage(key, code)` and sets `choice`, so the label updates without a new preview. The native player reads the same per-title language when Play starts.

- [ ] **Step 1: Write the failing tests** with a test component that renders `JSON.stringify(hook.button)` + `status`, fake timers, and mocks for every input. Cases:
  1. Nothing runs before 600 ms; it is `checking` after, then `done` with "Play in Hindi" when the mock answer has Hindi.
  2. Unmount at 300 ms → `previewTitle` never called; unmount mid-preview → no state update (no act warning) and the late answer is ignored.
  3. Changing `episode` mid-preview → the old answer is ignored and a new preview runs for the new episode.
  4. Each of: flags off, `nativeFetchAvailable` false, offline, data saver on, metered without opt-in → `previewTitle` never called and the label is "Play". Metered with opt-in → it runs.
  5. `choose("en")` → `setTitleLanguage("movie:1","en")` called and the label becomes "Play in English" without a second `previewTitle` call.
- [ ] **Step 2: Run** → FAIL (module missing).
- [ ] **Step 3: Implement** the hook per the behaviour above.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(title): the language preview — after 600 ms, never on metered data unless allowed"`

---

### Task 5: The title page shows it

**Files:**
- Create: `src/features/title/PlayLanguageRow.tsx` (+ test `PlayLanguageRow.test.tsx`)
- Modify: `src/screens/MovieDetailsScreen.tsx`, `src/screens/TvDetailsScreen.tsx`

**Interfaces:**
- Consumes: `useLanguagePreview` (Task 4), `Chip` from `src/ui`.
- Produces: `PlayLanguageRow({ button, onChoose }: { button: { note?: string; others: { code: string; label: string }[] }; onChoose(code: string): void })`. It renders:
  - the note (dim caption), if any;
  - a "Other languages" chip with `chevron-down` when `others` is non-empty. Tapping it shows the others inline as chips; picking one calls `onChoose` and folds the row.

  No Modal, no layout animation.

- [ ] **Step 1: Write the failing component test.** The note renders. The chip expands to the language chips. A pick calls `onChoose("ta")` and collapses. Nothing renders when there's no note and no others.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement the component, then wire both screens:**
  - Call the hook above the early returns, with `enabled: !!d && released`.
  - Movie: `{ type: "movie", tmdbId: id }`.
  - TV: `season` = the selected season and `episode` = `seasonData?.episodes?.[0]?.episode_number ?? 1`, so the preview matches what Play opens.
  - Use `label={button.label}` on the Play `Button`.
  - Render `<PlayLanguageRow button={button} onChoose={choose} />` inside the same `Appear index={0}`, after the actions row.
- [ ] **Step 4: Run** — `npx jest src/features/title && npx tsc --noEmit && npx eslint src/features/title src/screens/MovieDetailsScreen.tsx src/screens/TvDetailsScreen.tsx` → PASS / clean.
- [ ] **Step 5: Commit** — `git commit -m "feat(title): Play says the language it will play, with the others one tap away"`

---

### Task 6: Playback & data settings — the metered opt-in

**Files:**
- Create: `src/screens/PlaybackPrefsScreen.tsx` (+ test)
- Modify:
  - `src/navigation/types.ts` (`PlaybackPrefs: undefined`);
  - `src/navigation/RootNavigator.tsx` (register it);
  - `src/navigation/actions.ts` (`openPlaybackPrefs()`);
  - `src/features/profile/ProfileView.tsx` (the "Playback & data" row opens it instead of "coming soon").

**Interfaces:**
- Consumes: `getPreviewOnMetered` / `setPreviewOnMetered` (Task 4).
- Produces: a screen with one row. Title: "Check languages on mobile data". Caption: "Title pages look up which languages a film is in. Off saves data." The `Switch` is styled like `HomePrefsScreen`.

- [ ] **Step 1: Failing test.** The switch starts from `getPreviewOnMetered()`, and toggling it calls `setPreviewOnMetered(true)`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**, modelled on `HomePrefsScreen` (`Screen` + `LibraryScreenHeader title="Playback & data"`).
- [ ] **Step 4: Run** — the screen test, `npx tsc --noEmit`, and the full suite → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(settings): Playback & data — allow the language check on mobile data"`

---

### Task 7: Gate — phone and iOS simulator

- [ ] **Step 1: Build both** (same commands as 2B-2: release, `EXPO_PUBLIC_TEST_STREAMS=1`).
- [ ] **Step 2: Phone** (check `dumpsys power` first). Expected:
  - Big Buck Bunny's page: "Checking languages…" within ~1 s of arriving, then "Play" + "Hindi not available for this title".
  - Press Play: native first frame in ≤ 3 s (streams from the preview's cache), on the same source line as 2B-2.
  - Fight Club's page: plain "Play", no note; Play → web flow.
  - Leave a title page within half a second: no preview runs (logcat shows no sandbox mount).
- [ ] **Step 3: iOS simulator:** Big Buck Bunny's page shows the note; Play → native.
- [ ] **Step 4: Docs, memory, commit:**
  - Board section "Phase 2C — language before Play": gate table + rulings.
  - BACKLOG: anything found.
  - Memory: Phase 2 status → 2C done; next 2D.
  - `git commit -m "docs: Phase 2C gate"`
