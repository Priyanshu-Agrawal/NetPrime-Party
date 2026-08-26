# Bearoom / NetPrime — Documentation

Home of the project docs. **Open the `docs/` folder as an Obsidian vault** — this note is the map.
Everything here is version-controlled markdown (the source of truth); Obsidian is just the viewer/editor.

> **Bearoom** is a server-driven movie & synced-watch-party app on **Expo SDK 53 / React Native 0.79 /
> React 19 (New Arch, Bridgeless)**. A Cloudflare Worker + Supabase serve a dynamic provider registry and
> OTA "hijack" bridges; a `react-native-webview` mounts the provider's embed and an injected JS bridge finds
> and drives the `<video>` — powering both solo playback and synced watch-party.

---

## Start here
- **[AGENT_START_HERE](AGENT_START_HERE.md)** — fastest path in for a new agent/developer.
- **[HANDBOOK](HANDBOOK.md)** — the complete manual: architecture, every subsystem, the **decision log (#1–43)**,
  file/dir map, env/secrets/ops runbook. Read this for depth.

## Product & status (the three views — keep them distinct)
- **[project-board](project-board.md)** — **ACTIVE status.** What's in flight / just shipped. Read the tail.
- **[BACKLOG](BACKLOG.md)** — **EXHAUSTIVE scope.** Every deferred/planned item (groups A–J) + a full shipped
  record + strategic decisions. The anti-loss anchor.
- **[ROADMAP](ROADMAP.md)** — **SEQUENCING.** What ships in what order across programs and phases.

## Architecture (subsystem deep-dives) — [`architecture/`](architecture/README.md)
- [app-shell-and-data](architecture/app-shell-and-data.md) · [player-and-injection](architecture/player-and-injection.md)
  · [watch-party-sync](architecture/watch-party-sync.md) · [chat-and-reactions](architecture/chat-and-reactions.md)
- [streaming-strategy-v2](architecture/streaming-strategy-v2.md) · [native-player](architecture/native-player.md)
  · [native-streaming-master-plan](architecture/native-streaming-master-plan.md)

## Providers — [`providers/`](providers/README.md)
- [videasy](providers/videasy.md) — the primary (only currently-hijackable) provider's DOM/behavior notes.

## Plans (per-feature designs) — [`plans/`](plans/)
- **[watch-together-multi-source-queue](plans/watch-together-multi-source-queue.md)** — the big pivot: queue +
  direct-link + YouTube + in-app-browser + collections. *(Program 1.)*
- [chat-typography-and-emoji](plans/chat-typography-and-emoji.md) — chat font + cross-platform emoji. *(Program 2.)*
- [backend-hardening](plans/backend-hardening.md) — C1/H1/M1/M7/H2/H3 (**all shipped** — kept as the record).
- [webview-native-features](plans/webview-native-features.md) — PiP/AirPlay/bg-audio/lock-screen (deferred).
- [native-player-controls](plans/native-player-controls.md) · [party-background-audio](plans/party-background-audio.md).

## Development tooling
- **[tooling](tooling.md)** — the agent dev toolkit: which MCP servers/plugins to use (verified `adopt-now` /
  `skip` verdicts), setup steps, and the connected-set cleanup. Read before wiring up new tools.

## Engineering record
- **Reviews:** [2026-08-22 full-app review](reviews/2026-08-22-full-app-review.md).
- **Investigations:** [playback-stutter](investigations/playback-stutter.md) ·
  [videasy-resume-after-pause](investigations/videasy-resume-after-pause.md).
- **Research / ADRs:** [cooren-fit-adr (NO-GO)](research/cooren-fit-adr.md) ·
  [scraper-poc-postmortem](research/scraper-poc-postmortem.md) ·
  [streaming-integration-research](research/streaming-integration-research.md) ·
  [architecture-case-studies-summary](research/architecture-case-studies-summary.md) ·
  [github-references](research/github-references.md).
- **QA:** [phase6-cutover-qa](qa/phase6-cutover-qa.md) · [error-recovery-qa](qa/error-recovery-qa.md) ·
  [milestone-qa](qa/milestone-qa.md).

---

## How the docs relate
```
README.md ─ this map
  ├─ AGENT_START_HERE  → onboarding
  ├─ HANDBOOK          → the manual (architecture + decision log + runbook)
  ├─ project-board     → ACTIVE status  ─┐
  ├─ BACKLOG           → FULL scope       ├─ the three product views (distinct on purpose)
  ├─ ROADMAP           → SEQUENCING      ─┘
  ├─ architecture/     → subsystem deep-dives (the "how it works")
  ├─ providers/        → per-provider DOM/behavior
  ├─ plans/            → per-feature designs ("the what/why before building")
  └─ reviews/ investigations/ research/ qa/ → the engineering record
```

## Conventions
- **Source of truth = these markdown files** (in git). Notion/hosted copies, if any, are mirrors — never edit
  docs only in a hosted tool.
- **Distribution is off-store** (GitHub Releases + Obtainium); see BACKLOG §4 for the compliance decisions.
- **Do NOT start any OPEN backlog item until asked** (anti-loss discipline — see BACKLOG).
- Commit docs like code; keep `project-board` (active) and `BACKLOG` (scope) in sync when something ships.
