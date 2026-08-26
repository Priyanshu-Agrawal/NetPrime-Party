# Bearoom — Development Tooling & MCP Stack

The agent-facing dev toolkit: which MCP servers / plugins to use, why, and how to set each up.
Every entry below was **web-verified** (search-first), not asserted from memory. Ratings are tuned to
*this* project (RN 0.79 / Expo 53 WebView-streaming + watch-party, Cloudflare Worker + Supabase backend,
**off-store** distribution via GitHub Releases + Obtainium).

**Verdict key:** `adopt-now` = wire it up · `adopt-later` = right tool, not urgent · `skip` = redundant/misfit.

---

## At a glance

| Tool | Status | Verdict | One-line fit |
|---|---|---|---|
| **Google Stitch** MCP | ✔ connected | adopt-now | Design system + screen concepts for the UI rework & party/queue UX (design source, **not** RN codegen). |
| **GitHub** MCP | ✘ failing auth | adopt-now | Cut/edit GitHub **Releases** (Obtainium channel), issues, PRs, Actions. One missing env var from working. |
| **Sentry** (SDK + MCP) | not installed | adopt-now | Fills the off-store crash-telemetry blackhole: field crashes in the hijack bridge / Realtime / custom OTA. |
| **Cloudflare** MCP (Observability + Docs) | not installed | adopt-now | Query `netprime-worker` logs/errors; accurate Wrangler answers. Free, one-command. |
| **Expo / EAS** MCP | ✔ needs auth | adopt-now* | *Scoped to EAS **Build → APK** orchestration only.* Store/OTA tools are moot here. |
| **chrome-devtools** + **playwright** MCP | ✔ connected | adopt-later | The correct instruments for the planned in-app-browser **media sniffer** (read real `.m3u8/.mp4` requests). |
| **execbro** (RN AI devtools) | ✔ connected | keep + use | On-device RN debug: screenshot/tap/inspect, Metro logs, Redux/RTK state — the core QA loop. |
| **Supabase** MCP (project-scoped) | ✔ connected | keep + use | Runs the Realtime/RLS backend: `list_tables`, `apply_migration`, `execute_sql`, `get_advisors`. |
| **context7** MCP | ✔ connected | keep + use | Live docs for react-native-webview, supabase-js, Hono/Zod, Expo SDK 53. |
| **Figma** MCP | not installed | skip | Redundant with Stitch; paid Dev seat; emits React+Tailwind web, not RN. |
| **Obsidian** MCP | not installed | skip | Redundant — the agent edits the vault markdown directly; MCP needs the GUI running + a 2nd write path. |
| **firebase** MCP | ✔ connected | **remove** | Genuine misfit — Bearoom is Supabase-only; it just bloats the tool list (~30 unused tools). |
| **postman** MCP | needs auth | optional | Worker + TMDB/KLIPY already reachable via execbro-network/curl; auth only if you want collections/mocks. |

> Also connected but irrelevant to this project: `claude.ai Indeed` (job search), `gitlab` (you use GitHub).

---

## adopt-now — setup steps

### 1. GitHub MCP — fix the broken auth (highest-leverage quick win)
**Why it's failing:** the plugin's config hardcodes `Authorization: Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
but that env var is **unset**, so the server gets a malformed header → `HTTP 400 "Authorization header is
badly formatted"`. Not OAuth, not the wrong server — the token is simply absent.

**Fix (interactive):**
1. Create a fine-grained PAT at github.com/settings/personal-access-tokens → repo access =
   `Priyanshu-Agrawal/NetPrime-Party` → permissions: **Contents R/W** (Releases live here), **Metadata R**,
   **Issues R/W**, **Pull requests R/W**, **Actions R/W**. (Classic-PAT equivalent: `repo` + `workflow`.)
2. Export it under the exact name the config reads — add to `~/.zshrc`:
   `export GITHUB_PERSONAL_ACCESS_TOKEN="github_pat_xxxxx"` → open a new terminal (or `source ~/.zshrc`).
3. Reconnect (restart Claude Code, or `/mcp` → reconnect `github`). Verify: `claude mcp list` → `github ✔`.

**Fit:** cut/edit Releases + notes + tags for the Obtainium APK channel, trigger/inspect Actions (CI/EAS),
file/triage backlog & QA issues, open/review PRs (feat/improvements → master).
**Honest caveat:** attaching the **APK binary** to a release goes through `uploads.github.com` and is *not* a
reliable MCP tool — do that from a GitHub Actions step the MCP triggers, or `gh release upload`.

### 2. Sentry — the off-store crash-telemetry gap
Off-store distribution means **no Play Console / App Store Connect crash reports**. Sentry is the standard fix.
- **SDK (native rebuild):** `npx @sentry/wizard@latest -i reactNative` (installs `@sentry/react-native`, adds
  the Metro serializer + Expo config plugin + `Sentry.init({ dsn })`), then `npx expo prebuild` + rebuild the APK.
  `sentry-expo` is deprecated — the wizard uses the merged `@sentry/react-native` (first-class on Expo SDK 53).
- **Custom-OTA sourcemaps:** you ship OTA via the Cloudflare Worker + Supabase bridge (`secure-ota`), **not** EAS
  Update — so wire `sentry-cli sourcemaps upload` into the OTA release script after each bundle, or OTA-delivered
  JS errors show up minified.
- **MCP (interactive):** `claude mcp add --transport http sentry https://mcp.sentry.dev/mcp` → `/mcp` OAuth.
- **Free tier:** Developer plan = 5k errors/mo, 1 user — fine solo. Add a `beforeSend` filter to drop noisy
  expected WebView/provider errors so a looping embed can't burn the quota. **Skip** Session Replay (mobile-masked,
  clashes with the no-blur-on-video rule) and Performance/APM — use it purely as an **error monitor**.

### 3. Cloudflare MCP — Worker observability + docs
- **Add (interactive OAuth):**
  `claude mcp add --transport http cloudflare-observability https://observability.mcp.cloudflare.com/mcp`
  `claude mcp add --transport http cloudflare-docs https://docs.mcp.cloudflare.com/mcp` → `/mcp` to OAuth.
- **Enable logs first:** add `[observability]\nenabled = true` to `worker/wrangler.toml` and redeploy, else the
  log-query tools return little (live `wrangler tail` is separate).
- **Fit:** query the `netprime-worker` invocation logs/errors (esp. the `POST /report` health telemetry and
  `/cache/purge` + config/bridge routes) and get accurate Wrangler answers. **Skip** the Builds server (deploy is
  `wrangler deploy`, no Workers Builds CI) and the Bindings server (only a ratelimit binding today — no KV/D1/R2).

### 4. Expo / EAS MCP — build orchestration only
Already registered (`plugin:expo`), just **needs auth**: interactive `/mcp` → `expo` → browser OAuth (~30s).
- **Fit (narrow):** trigger/watch **EAS Build** for the release APK and read failed-build logs from inside Claude
  Code. **Ignore** its Submit/TestFlight/store-review tools (off-store) and EAS Update tools (you use the custom
  Supabase/Worker OTA). Its docs/on-device tools duplicate context7 + execbro.

### 5. Google Stitch — already wired; use it design-system-first
Connected & working (official `stitch.googleapis.com/mcp`, API-keyed). Free (Google Labs; ~400 daily design
credits). **How to use it well:**
- `create_design_system` / `upload_design_md` to lock **one** token set (color/type/spacing/radius) that replaces
  the current off/ugly shell — tokens port cleanly to the RN theme.
- `generate_screen_from_text` for concrete concepts: the queue/collections browser, providers bottomsheet, sticky
  header, zero-provider empty-state.
- **Two hard limits:** (1) output is web (HTML/CSS/Tailwind) — treat screens as a layout **spec** to hand-port to
  RN, there is no RN export; (2) Stitch defaults to **glassmorphism/shadow/blur** — every Player/Party prompt MUST
  explicitly forbid blur/shadow/elevation or it reintroduces the proven dimezisBlurView stutter. Not for the live
  player surface.

---

## Cleanup actions (interactive — reversible)
1. **Dedupe Playwright** — registered twice (`plugin:playwright` + a standalone `playwright`, identical). Keep the
   plugin: `claude mcp remove playwright`.
2. **Dedupe Supabase** — the project `.mcp.json` HTTP endpoint is live/authed; `plugin:supabase` is an unauthed dead
   duplicate. Keep the project one; disable/remove the plugin variant.
3. **Remove firebase** — misfit (Supabase-only stack); disable the `firebase` plugin to drop ~30 unused tools.
4. **Postman** — leave unauthed (optional) unless you want collection/mock workflows for the Worker/TMDB.

---

## Skipped — and why (so we don't re-litigate)
- **Figma MCP** — only pays off if designs live in Figma; Bearoom's design source is Stitch (generative). It needs a
  paid Dev/Full seat and emits React+Tailwind **web** (manual RN translation). Revisit *only* if Figma deliberately
  becomes the source of truth for the queue program.
- **Obsidian MCP** — the agent already reads/edits the vault markdown directly with git as source of truth; the MCP
  re-exposes a subset via a REST bridge that needs the desktop app running and adds a competing write path. If
  link-safe doc refactors are ever wanted, use the free official **Obsidian CLI** (obsidian.md/cli) ad hoc via Bash
  instead of standing up a server.

---

*Verified 2026-08-26 via a search-first research pass (8 agents, sources: developers.googleblog.com/stitch,
github.com/github/github-mcp-server, mcp.sentry.dev, *.mcp.cloudflare.com, mcp.expo.dev, mcp.figma.com,
MarkusPfundstein/mcp-obsidian, and each connected server's docs). Re-verify capability/pricing claims before acting
if this note is stale.*
