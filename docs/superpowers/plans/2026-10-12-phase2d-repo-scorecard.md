# Phase 2D — Repo Scorecard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dev-only scorecard in the Plugin Lab that runs a pinned candidate plugin repo inside Bearoom's real sandbox, on the device, over benchmark titles. It measures what the owner needs in order to say yes or no to a repo.

**Architecture:**
- **Host.** Each candidate is installed from a pinned row into an in-memory store, never into the user's registry or `/config`. A throwaway `PluginHost` runs it through the same sandbox bridge and SSRF-guarded fetch.
- **Measurement.** A pure scorer runs titles one at a time and probes candidates with the real StreamProbe. It aggregates per title and per plugin:
  - streams;
  - streams playable on this platform;
  - playable Hindi;
  - wrong-content rejects;
  - time to the first stream;
  - which files look obfuscated.
- **Data.** A byte counter on the fetch layer reports data used, and a budget stops the run.

**Tech Stack:** Expo SDK 57 / RN 0.86, TypeScript, jest-expo.

**Spec:** `docs/superpowers/specs/2026-10-10-playback-languages-party-design.md`:
- §9 row 2: "repo scorecard (dev tool: paste a repo → sandboxed benchmark run → titles played, real-Hindi rate, wrong-content rate, iOS playability, speed, readable-vs-obfuscated, last update)";
- the repo-selection paragraph: the agent recommends, the owner's yes enables;
- §10: the benchmark.

## Global Constraints

- Nothing third-party is enabled. Candidates never enter `plugin_repos` as enabled, `/config`, or the user registry/MMKV store; they live in memory for one scorecard run.
- No scraper is written, ported or modified; candidates run byte-for-byte as pinned (sha256 checked).
- Dev-only: the scorecard UI sits in the Plugin Lab (`EXPO_PUBLIC_TEST_STREAMS=1` builds).
- No stream URLs, cookies or headers on screen or in logs: hosts only, as the Plugin Lab already does.
- **Data budget:** the network is metered (the owner's hotspot). Every run shows bytes used and stops at its budget: smoke run 60 MB, full run 400 MB.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Isolation.** A scorecard run must not touch the user registry, `/config` rows, the main plugin host's cache, or source health.
2. **Data budget.** It stops promptly at the budget (no new title starts, and the current title's probes are skipped), and the byte count includes plugin fetches, probes and downloads.
3. **Honest metrics.** "Playable" means probed `ok` for this platform, not just returned. "Hindi" means probed-ok with `hi` among its languages. Wrong content means a `duration` reject.
4. **A misbehaving repo.** A manifest that won't parse, a file whose hash doesn't match, or a plugin that throws or hangs must give a readable result, never a stuck run.
5. **Stop.** The user can stop mid-run; the screen stays usable.

---

### Task 1: The pure scorer

**Files:**
- Create: `services/plugins/scorecard.ts`
- Test: `services/plugins/scorecard.test.ts`

**Interfaces:**
- `looksObfuscated(source: string): boolean`. True when any of these holds:
  - the average line exceeds 400 characters;
  - `_0x[0-9a-f]{4,}` identifiers appear at least 20 times;
  - more than 30 % of the file is one string literal over 2 KB.
- `interface BenchTitle { tmdbId: string; type: "movie" | "tv"; season?: number; episode?: number; name: string; runtimeMin?: number; originalLanguage?: string }`
- `interface ScoreDeps`:
  - `getStreams(req): Promise<HostResult>`;
  - `probe(c, ctx): Promise<PlaybackCandidate>`;
  - `platform: "ios" | "android"`;
  - `now(): number`;
  - `bytesUsed(): number`;
  - `budgetBytes: number`;
  - `stopped(): boolean`;
  - `onProgress?(done: number, total: number)`;
  - `probeLimit: number` (default 8 per title).
- `interface PluginScore { pluginId: string; titlesWithStreams: number; streams: number; playable: number; hindiPlayable: number; wrong: number; failures: Record<string, number> }`
- `interface TitleScore { name: string; streams: number; playable: number; hindiPlayable: number; wrong: number; firstStreamMs: number | null }`
- `interface ScoreReport { titles: TitleScore[]; plugins: PluginScore[]; bytes: number; stoppedBy: "done" | "budget" | "user" }`
- `scoreRepo(titles: BenchTitle[], deps: ScoreDeps): Promise<ScoreReport>`:
  - titles run one at a time;
  - for each title: `getStreams` (time to first stream from `onStreams`), `toCandidates`, `rankCandidates`, then probe up to `probeLimit` by backend (`probeByBackend`);
  - it checks `stopped()` and the budget before each title and before probing.

- [ ] **Step 1: Write failing tests** with fakes. Cases:
  1. Two titles and two plugins: counts per title and per plugin, with "playable" requiring verdict `ok` and the platform.
  2. Hindi is counted only for probed-ok streams that list `hi`.
  3. A `duration` reject counts as wrong.
  4. The budget is reached after title 1, so title 2 never runs and `stoppedBy` is `"budget"`.
  5. `stopped()` becomes true, so `"user"`.
  6. Failures are tallied per plugin by reason.
  7. `looksObfuscated`: plain code → false; a minified one-liner of 50 KB → true; `_0x` soup → true.
- [ ] **Step 2: Run** `npx jest services/plugins/scorecard` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(plugins): a repo scorecard — what a candidate repo really plays here`

### Task 2: The dev host and the byte counter

**Files:**
- Modify: `services/plugins/index.ts` (count bytes of every fetch response body: sandbox fetches, `hostFetch`, downloads; export `bytesUsed()`)
- Create: `services/plugins/devScorecard.ts` with `scorecardHost(row: PluginRepoRow): Promise<{ host: PluginHost; plugins: LoadedPlugin[]; status: RepoStatus; obfuscated: string[] }>`. It:
  - installs into `memoryPluginStore()` with the same `download`;
  - builds a `PluginHost` with `plugins: () => loadPlugins(row, mem)`, `run` through `sandboxBridge.run`, `normalise` with a scorecard-only cookie jar per plugin, and `now: Date.now`.
- Test: `services/plugins/devScorecard.test.ts`. Mock `@/services/plugins` internals at the module boundary: fake `download` and `run`.
  - A pinned row installs in memory and nothing is written to the MMKV store.
  - A hash mismatch → `status.state === "failed"` and no plugins.
- [ ] Steps: failing test → implement → pass → commit `feat(plugins): run a candidate repo in memory through the real sandbox`.

### Task 3: Candidates and benchmark titles

**Files:**
- Create: `src/features/dev/scorecardData.ts`:
  - `CANDIDATE_REPOS: PluginRepoRow[]`, pinned with `node scripts/pin-plugin-repo.mjs` at commit-addressed URLs, `enabled: false`;
  - `BENCH_FULL: BenchTitle[]`: the spec's 12 + 8 chosen now;
  - `BENCH_SMOKE: BenchTitle[]`: Jawan, Oppenheimer, Mirzapur S1E1, Breaking Bad S1E1.
- [ ] **Step 1:** pin both candidates:
  - Eclipsia `codeberg.org/eclipsia/nuvio-plugin@4e486ed…`
  - AIO `NuvioPlugin/All-in-One-Nuvio@3f09a6f…`
  - Commit the rows: URLs and hashes only, no third-party code.
- [ ] **Step 2:** choose the extra 8 titles (spec §10) through the TMDB proxy and record the TMDB ids. Runtimes come from TMDB at run time.
- [ ] **Step 3:** a unit test that every candidate is disabled, uses commit-addressed URLs, and has every file pinned with a 64-hex sha256.
- [ ] **Step 4:** commit `chore(dev): scorecard candidates (pinned, disabled) and benchmark titles`.

### Task 4: Plugin Lab — Scorecard

**Files:**
- Create: `src/features/dev/ScorecardPanel.tsx` (+ test)
- Modify: `src/screens/PluginLabScreen.tsx` (render the panel)

**What it shows:**
- each candidate: name, commit (short) and file count;
- a **Smoke** button (4 titles, 60 MB) and a **Full** button (20 titles, 400 MB), plus **Stop**;
- progress: title n/N and MB used;
- results:
  - a summary line: titles with a playable stream, Hindi titles, wrong content, median first-stream time, MB used, how it stopped;
  - one line per plugin that returned anything, best first: hits, playable, Hindi, wrong, the top failure reason;
  - the obfuscated file count.

Hosts only, never URLs.

- [ ] Failing component test with a fake `scoreRepo`/`scorecardHost` (renders the summary and per-plugin lines, Stop sets `stopped`) → implement → pass → commit `feat(dev): Scorecard in the Plugin Lab`.

### Task 5: Run and recommend

- [ ] Build the Android release (`EXPO_PUBLIC_TEST_STREAMS=1`) and the iOS simulator app.
- [ ] Phone: Plugin Lab → Scorecard → **Smoke** for each candidate. Record the summary + plugin lines (uiautomator dump).
- [ ] iOS simulator: Smoke for each candidate (iOS playability: DASH and Origin-after-302 are filtered here).
- [ ] Full runs only if the owner says the data use is fine, or on an unmetered network. Note the estimate from the smoke runs' MB.
- [ ] Write `docs/research/repo-scorecard-2026-10-12.md`:
  - per-repo results on both platforms;
  - per-plugin highlights;
  - obfuscation;
  - last update (commit date);
  - known risks (enc-dec oracles, Set-Cookie needs, shared failure domains);
  - **a plain recommendation**: which repo or plugins to enable via `allow_plugins`, and why. The owner's yes enables them; nothing is enabled now.
- [ ] Board section "Phase 2D — repo scorecard"; memory; commit `docs: Phase 2D — repo scorecard results and recommendation`.
