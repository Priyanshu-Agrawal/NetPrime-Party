# Phase 2A — Plugin Host Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run operator-listed, hash-pinned Nuvio-style plugin repos inside a sandboxed hidden WebView on the phone. All plugin network goes through a native fetch that only reaches public addresses. Prove it end to end with Bearoom's own "Open Movies" repo and an on-device self-test.

**Architecture:**
- **Registry.** The worker adds `/config.pluginRepos` from a new operator-only Supabase table (`plugin_repos`). The app downloads each enabled repo's files once per content hash, checks every file's sha256 natively, and keeps the last good version.
- **Sandbox.** Each plugin call runs in a fresh Web Worker inside one hidden WebView. The WebView's CSP forbids all direct network.
- **Network.** A plugin's `fetch` crosses to the app, which walks redirects hop by hop through a new `BearoomFetch` Expo module (OkHttp / URLSession). Every hop is checked for public addresses only, and each plugin has its own cookie jar.
- **Fan-out.** `PluginHost` runs the plugins with Cove's budgets and returns normalised streams.
- **Out of scope here.** Ranking, probing and playback are Plan 2B.

**Tech Stack:** Expo SDK 57 local modules (Kotlin + Swift), OkHttp 4.9.2 (React Native's own copy), URLSession, react-native-webview 13.16.1, react-native-mmkv 4, esbuild 0.28 (build step only), cheerio 1.2 (`cheerio/slim`) + crypto-js 4.2 (bundled into the sandbox page), Cloudflare Worker (Hono + zod-openapi, vitest), Supabase (Postgres), jest-expo.

**Spec:** `docs/superpowers/specs/2026-10-10-playback-languages-party-design.md` — §5.4 (PluginHost), §7 F2/F3/F9/F10, §8 (Security), §9 row 2. Research it argues from: `docs/research/vega-cloudstream-teardown-2026-10.md` §1.3 + §3(a), `docs/research/nuvio-plugin-architecture.md` §1.2–1.3 + §7.1d, `docs/research/plugin-catalog-measurement-2026-10.md` §9.

## Phase 2 map (this plan is 2A)

| Plan | Scope | Gate on the phone |
|---|---|---|
| **2A — plugin host core (this plan)** | `BearoomFetch` module; sandbox page + bridge; registry (`plugin_repos`, `/config.pluginRepos`, sha256 pinning, last-known-good); `PluginHost` budgets; Open Movies repo; dev Plugin Lab with a self-test | Self-test all green; Open Movies installs from `/config` and returns streams for Big Buck Bunny / Tears of Steel / Sintel, nothing for Fight Club; a bad hash keeps the last good version |
| **2B — candidates → native player** | Candidate model (languages, container, key), StreamProbe, `rankCandidates`, resolver, Play routes to the native player when a candidate exists (otherwise today's flow), language prefs + per-title memory, Audio row backed by sibling candidates, Source sheet listing candidates, F4–F6 failover, telemetry `sourceId`, local source health | Open Movies films play natively from their real title pages; Jawan still opens today's flow; F4/F5/F6 tested |
| **2C — title page language preview** | "▶ Play in Hindi" / "Other languages ▾" after a 600 ms dwell; results seed Play; data-saver respected | Screenshots of all three Play-button states |
| **2D — benchmark + repo scorecard** | Dev benchmark runner (20 titles × 20 s) and repo scorecard; the agent's recommendation to the owner | Owner's yes/no; then S1/S2/S3/S4/S8 on the benchmark |

## Global Constraints

- **No scrapers.** Never write, port or vendor scrapers or work around any site's anti-bot protection: Bearoom ships a **generic** host (spec §2). The only plugin code in this repo is:
  - Bearoom's own **Open Movies** fixture: a fixed list of CC-licensed Blender films on publisher test streams;
  - the dev self-test fixtures.
- **No challenge-solving helpers.** The host API has no WAF / challenge-solving tools: no `openWebView`, no `cf_clearance` flows.
- **Stream URLs and cookies stay private.** They are never logged, never sent to `/report` and never written to Postgres. Dev-only console forwarding redacts URLs.
- **Pinned inputs.** A plugin file runs only if its sha256 is listed for its repo in `/config`. Nothing is fetched from a moving branch at run time.
- **Budgets (spec §5.4):**
  - ≤ 12 plugins in parallel; 15 s per plugin; 20 s overall.
  - Return early once there are ≥ 3 streams and 1.2 s pass with nothing new.
  - 15-minute per-title cache. Failures are never cached.
  - An empty result in < 100 ms counts as a failure.
- **NativeFetch (spec §5.4):**
  - ≤ 5 redirect hops, with public addresses only on **every** hop.
  - Credentials are stripped on cross-host redirects.
  - 8 s per request; 20 MiB per body.
  - A cookie jar per plugin.
- **Sandbox (spec §5.4):**
  - CSP `default-src 'none'` with `connect-src 'none'`.
  - A fresh Worker per call, with network globals removed.
  - `domStorageEnabled={false}`.
  - Reload when the renderer dies.
- **Versions:** Expo SDK 57 · RN 0.86 · react-native-webview 13.16.1 · OkHttp 4.9.2 (from RN, compile-only) · iOS pods target 16.4.
- **Off limits:** never touch `src/ui/BearAlert.tsx` or `.codex/`. No Reanimated `entering`/`exiting`/`layout`. No new Android permissions.
- **Devices:** the physical Nothing Phone only (`adb -s P2228K000422`). No emulator or simulator without asking the owner. iOS is a compile check only (`xcodebuild` on the pod target).
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Secrets:** never print `PURGE_TOKEN`, Supabase keys or Cloudflare tokens. Deploy with `env -u CLOUDFLARE_API_TOKEN`.

## Review Focus

1. **Hostile plugin output.** Non-array results, getters that throw, circular objects, 10 000 streams, megabyte strings, `javascript:` / `file:` / magnet URLs, header values carrying CR/LF. All are dropped or refused, and the host never crashes. Task 4 pins the worker's JSON round trip (`serialiseResult`); Task 6 pins the normaliser.
2. **Redirect edge cases.** Chains that end on a private address or run past 5 hops; a relative `Location`; 303 after POST; a cross-host hop carrying `Authorization` / `Cookie`. Task 3 pins all of these.
3. **Sandbox lifecycle.** The renderer is killed mid-call; calls are queued before `ready`; the sandbox never becomes ready; plugin code changes between versions; 3 runaway plugins in a row. Task 5 pins these.
4. **Registry.** A hash mismatch on update keeps the previous version running. A repo removed from `/config` stops running. `down:true` unloads a repo but keeps its files. A manifest listing a file the operator didn't pin never runs. Task 6 pins these.
5. **Offline launch.** The repo list comes from the device's cached `/config`, and no download happens until online. Task 8 pins this.

---

### Task 1: Operator plugin-repo table and `/config.pluginRepos`

**Files:**
- Create: `supabase/migrations/<applied-version>_plugin_repos.sql`
- Create: `worker/src/pluginRepos.ts`, `worker/src/pluginRepos.test.ts`
- Modify: `worker/src/schemas.ts` (add `PluginRepoSchema`; `AppConfigSchema.pluginRepos`)
- Modify: `worker/src/index.ts` (`/config` handler)
- Modify: `worker/src/routes.test.ts` (Supabase stub + 3 tests)

**Interfaces:**
- Consumes: `parseLkg`, `writeLkgIfChanged` (`worker/src/configResolve.ts`); `Bindings` (`worker/src/supabase.ts`).
- Produces: `GET /config` gains `pluginRepos: PluginRepo[]`, where
  `PluginRepo = { id: string; manifestUrl: string; version: number; files: { path: string; sha256: string }[]; enabled: boolean; down: boolean; allowPlugins: string[] | null }`.
  Only enabled rows are sent. `path` is relative to the manifest's folder. `sha256` is lower-case hex.

- [ ] **Step 1: Write the failing unit test** — `worker/src/pluginRepos.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { toPluginRepo } from "./pluginRepos";

const SHA = "a".repeat(64);
const good = {
  id: "open-movies",
  manifest_url: "https://raw.githubusercontent.com/o/r/abc/plugin-repos/open-movies/manifest.json",
  version: 1,
  files: [
    { path: "manifest.json", sha256: SHA },
    { path: "providers/open-movies.js", sha256: SHA },
  ],
  enabled: true,
  down: false,
  allow_plugins: null,
};

describe("toPluginRepo", () => {
  it("maps a well-formed row to the wire shape", () => {
    expect(toPluginRepo(good)).toEqual({
      id: "open-movies",
      manifestUrl: good.manifest_url,
      version: 1,
      files: good.files,
      enabled: true,
      down: false,
      allowPlugins: null,
    });
  });

  it("keeps the allow-list when present", () => {
    expect(toPluginRepo({ ...good, allow_plugins: ["a", "b"] })?.allowPlugins).toEqual(["a", "b"]);
  });

  it.each([
    ["an http manifest", { manifest_url: "http://x/manifest.json" }],
    ["version 0", { version: 0 }],
    ["files that are not a list", { files: {} }],
    ["a path that escapes the repo", { files: [{ path: "../x.js", sha256: SHA }] }],
    ["an absolute path", { files: [{ path: "/x.js", sha256: SHA }] }],
    ["a short hash", { files: [{ path: "x.js", sha256: "abc" }] }],
    ["an upper-case hash", { files: [{ path: "x.js", sha256: "A".repeat(64) }] }],
  ])("drops a row with %s", (_, patch) => {
    expect(toPluginRepo({ ...good, ...patch } as never)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd worker && npx vitest run src/pluginRepos.test.ts`
Expected: FAIL — `Failed to resolve import "./pluginRepos"`.

- [ ] **Step 3: Implement** — `worker/src/pluginRepos.ts`

```ts
/**
 * @file pluginRepos.ts
 * Operator-listed plugin repos for /config (spec §5.4). The table is operator-only (RLS on, no policies), so it is
 * read with the service-role key, never the anon key. A malformed row is dropped whole, never half-served.
 */
import { parseLkg, writeLkgIfChanged } from "./configResolve";
import type { PluginRepo } from "./schemas";
import type { Bindings } from "./supabase";

export interface PluginRepoRow {
  id: string;
  manifest_url: string;
  version: number;
  files: unknown;
  enabled: boolean;
  down: boolean;
  allow_plugins: string[] | null;
}

const SHA256 = /^[0-9a-f]{64}$/;
// Relative to the manifest's folder: no leading slash, no "..", plain path characters.
const SAFE_PATH = /^(?!\/)(?!.*\.\.)[A-Za-z0-9._/-]{1,200}$/;

export function toPluginRepo(row: PluginRepoRow): PluginRepo | null {
  if (!row || typeof row.id !== "string" || !row.id) return null;
  if (typeof row.manifest_url !== "string" || !row.manifest_url.startsWith("https://")) return null;
  if (!Number.isInteger(row.version) || row.version < 1) return null;
  if (!Array.isArray(row.files)) return null;
  const files: PluginRepo["files"] = [];
  for (const f of row.files as { path?: unknown; sha256?: unknown }[]) {
    if (typeof f?.path !== "string" || !SAFE_PATH.test(f.path)) return null;
    if (typeof f.sha256 !== "string" || !SHA256.test(f.sha256)) return null;
    files.push({ path: f.path, sha256: f.sha256 });
  }
  return {
    id: row.id,
    manifestUrl: row.manifest_url,
    version: row.version,
    files,
    enabled: row.enabled === true,
    down: row.down === true,
    allowPlugins: Array.isArray(row.allow_plugins)
      ? row.allow_plugins.filter((s): s is string => typeof s === "string")
      : null,
  };
}

export const PLUGIN_REPOS_LKG_KEY = "pluginRepos:lkg:v1";
const CACHE_KEY = new Request("https://internal.cache/plugin-repos");

type Waitable = { waitUntil(promise: Promise<unknown>): void };

/** Enabled rows, or null when Supabase didn't answer (an outage is not an empty list). */
async function fetchLive(env: Bindings): Promise<PluginRepo[] | null> {
  const url = env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const cols = "id,manifest_url,version,files,enabled,down,allow_plugins";
  try {
    const res = await fetch(`${url}/rest/v1/plugin_repos?select=${cols}&enabled=eq.true&order=id.asc`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const raw = (await res.json()) as unknown;
    if (!Array.isArray(raw)) return null;
    return raw.map((r) => toPluginRepo(r as PluginRepoRow)).filter((r): r is PluginRepo => r !== null);
  } catch {
    return null;
  }
}

/** Live (edge-cached 60 s, mirrored to KV) → last-known-good → none. Never throws. */
export async function getPluginRepos(env: Bindings, ctx: Waitable): Promise<PluginRepo[]> {
  const cache = caches.default;
  const hit = await cache.match(CACHE_KEY);
  if (hit) return (await hit.json()) as PluginRepo[];
  const live = await fetchLive(env);
  if (live) {
    const response = new Response(JSON.stringify(live), {
      headers: { "Content-Type": "application/json", "Cache-Control": "s-maxage=60" },
    });
    ctx.waitUntil(cache.put(CACHE_KEY, response));
    if (env.CONFIG_LKG) {
      ctx.waitUntil(
        writeLkgIfChanged(env.CONFIG_LKG, live, new Date(), PLUGIN_REPOS_LKG_KEY).catch((e) =>
          console.error("Plugin repos LKG write failed:", e),
        ),
      );
    }
    return live;
  }
  try {
    const stored = env.CONFIG_LKG ? await env.CONFIG_LKG.get(PLUGIN_REPOS_LKG_KEY) : null;
    return parseLkg<PluginRepo>(stored)?.items ?? [];
  } catch {
    return [];
  }
}
```

In `worker/src/schemas.ts`, directly above `export const AppConfigSchema`:

```ts
export const PluginRepoSchema = z
  .object({
    id: z.string(),
    manifestUrl: z.string(),
    version: z.number().int(),
    files: z.array(z.object({ path: z.string(), sha256: z.string() })),
    enabled: z.boolean(),
    down: z.boolean(),
    allowPlugins: z.array(z.string()).nullable(),
  })
  .openapi("PluginRepo");

export type PluginRepo = z.infer<typeof PluginRepoSchema>;
```

and inside `AppConfigSchema`'s object, after `flags`:

```ts
    /** Operator-listed plugin repos (enabled rows only), each file pinned by sha256 (spec §5.4). */
    pluginRepos: z.array(PluginRepoSchema).optional(),
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd worker && npx vitest run src/pluginRepos.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Write the failing route tests** — `worker/src/routes.test.ts`

In `SupaMode`, add `pluginRepos?: Row[]`. In `stubSupabase`, right after the `not-array` branch, add:

```ts
    if (url.includes("plugin_repos")) return new Response(JSON.stringify(mode.pluginRepos ?? []), { status: 200 });
```

At the end of `describe("GET /config", …)`, add:

```ts
  const repoRow = {
    id: "open-movies",
    manifest_url: "https://h.test/x/manifest.json",
    version: 2,
    files: [{ path: "manifest.json", sha256: "b".repeat(64) }],
    enabled: true,
    down: false,
    allow_plugins: null,
  };

  it("lists enabled plugin repos, read with the service-role key, and mirrors them to KV", async () => {
    const calls = stubSupabase({ providers: "ok", pluginRepos: [repoRow, { ...repoRow, id: "bad", version: 0 }] });
    const kv = fakeKv();
    const { body } = await call("/config", { ...baseEnv, SUPABASE_SERVICE_ROLE_KEY: "svc", CONFIG_LKG: kv });
    expect(body.pluginRepos).toEqual([
      { id: "open-movies", manifestUrl: "https://h.test/x/manifest.json", version: 2, files: repoRow.files, enabled: true, down: false, allowPlugins: null },
    ]);
    expect(calls.some((u) => u.includes("plugin_repos") && u.includes("enabled=eq.true"))).toBe(true);
    expect(JSON.parse(kv.store["pluginRepos:lkg:v1"]).items).toHaveLength(1);
  });

  it("during an outage serves the stored plugin repos", async () => {
    stubSupabase({ providers: "503" });
    const stored = [{ id: "open-movies", manifestUrl: "https://h.test/x/manifest.json", version: 1, files: [], enabled: true, down: false, allowPlugins: null }];
    const kv = fakeKv({ "pluginRepos:lkg:v1": JSON.stringify({ items: stored, savedAt: "x" }) });
    const { body } = await call("/config", { ...baseEnv, SUPABASE_SERVICE_ROLE_KEY: "svc", CONFIG_LKG: kv });
    expect(body.pluginRepos).toEqual(stored);
  });

  it("never reads plugin repos with the anon key", async () => {
    const calls = stubSupabase({ providers: "ok", pluginRepos: [repoRow] });
    const { body } = await call("/config", { ...baseEnv, CONFIG_LKG: fakeKv() });
    expect(body.pluginRepos).toEqual([]);
    expect(calls.some((u) => u.includes("plugin_repos"))).toBe(false);
  });
```

- [ ] **Step 6: Run them to verify they fail**

Run: `cd worker && npx vitest run src/routes.test.ts`
Expected: FAIL — `body.pluginRepos` is `undefined` (3 failures).

- [ ] **Step 7: Wire `/config`** — `worker/src/index.ts`

Import `getPluginRepos` from `./pluginRepos`. In the `/config` handler, replace the first line with:

```ts
  const [{ providers, stale, killswitch }, pluginRepos] = await Promise.all([
    getProvidersResult(c.env, c.executionCtx),
    getPluginRepos(c.env, c.executionCtx),
  ]);
```

and add `pluginRepos,` to the returned object after `killswitch,`.

- [ ] **Step 8: Run the worker suite + typecheck**

Run: `cd worker && npx vitest run && npx tsc --noEmit`
Expected: all tests PASS; tsc prints nothing.

- [ ] **Step 9: Apply the migration**

Apply with the Supabase MCP `apply_migration` (name `plugin_repos`):

```sql
-- Operator-controlled plugin repos (spec §5.4). Read only by the worker with the service-role key:
-- RLS on and no policies, so anon/authenticated clients can neither read nor write it.
create table if not exists public.plugin_repos (
  id            text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  manifest_url  text not null check (manifest_url like 'https://%'),
  version       integer not null check (version >= 1),
  files         jsonb not null default '[]'::jsonb check (jsonb_typeof(files) = 'array'),
  enabled       boolean not null default false,
  down          boolean not null default false,
  allow_plugins text[],
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.plugin_repos enable row level security;
revoke all on public.plugin_repos from anon, authenticated;

comment on table public.plugin_repos is
  'Plugin repos the operator enabled. files = [{path, sha256}] relative to the manifest folder; the app runs only pinned files. down=true unloads remotely.';
```

Then run `list_migrations`. Save the same SQL as `supabase/migrations/<version>_plugin_repos.sql`, using the version the list reports. Check RLS with `execute_sql`:
`begin; set local role anon; select count(*) from public.plugin_repos; rollback;`
Expected: `permission denied for table plugin_repos`.

- [ ] **Step 10: Deploy and check**

Run: `cd worker && env -u CLOUDFLARE_API_TOKEN npx wrangler deploy`, then `curl -s "$EXPO_PUBLIC_WORKER_URL/config" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s).pluginRepos)))'` (worker URL from `.env`).
Expected: `[]` (no rows yet).

- [ ] **Step 11: Commit**

```bash
git add worker/src/pluginRepos.ts worker/src/pluginRepos.test.ts worker/src/schemas.ts worker/src/index.ts worker/src/routes.test.ts supabase/migrations/*_plugin_repos.sql
git commit -m "feat(worker): operator plugin-repo table served as /config.pluginRepos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `BearoomFetch` native module

**Files:**
- Create: `modules/bearoom-fetch/expo-module.config.json`, `modules/bearoom-fetch/index.ts`, `modules/bearoom-fetch/index.test.ts`
- Create: `modules/bearoom-fetch/android/build.gradle`
- Create: `modules/bearoom-fetch/android/src/main/java/expo/modules/bearoomfetch/BearoomFetchModule.kt`
- Create: `modules/bearoom-fetch/android/src/main/java/expo/modules/bearoomfetch/PublicAddress.kt`
- Create: `modules/bearoom-fetch/ios/BearoomFetch.podspec`, `modules/bearoom-fetch/ios/BearoomFetchModule.swift`, `modules/bearoom-fetch/ios/PublicAddress.swift`
- Modify: `ios/Podfile.lock` (via `pod install`)

**Interfaces:**
- Produces (TypeScript, `@/modules/bearoom-fetch`):

```ts
export interface NativeRequest { url: string; method: string; headers: Record<string, string>; body?: string; timeoutMs: number; maxBytes: number; responseType: "text" | "base64" }
export interface NativeCookie { name: string; value: string; domain: string; path: string; hostOnly: boolean; secure: boolean; expiresAt: number /* epoch ms, 0 = session */ }
export interface NativeResponse { status: number; url: string; headers: Record<string, string>; cookies: NativeCookie[]; body: string; encoding: "text" | "base64"; truncated: boolean; sha256: string }
export type NativeFetchErrorCode = "ERR_BLOCKED_ADDRESS" | "ERR_TIMEOUT" | "ERR_NETWORK" | "ERR_BAD_REQUEST";
export class NativeFetchError extends Error { code: NativeFetchErrorCode }
export const nativeFetchAvailable: boolean;
export function fetchOnce(req: NativeRequest): Promise<NativeResponse>;
```

  Semantics:
  - **One exchange.** No redirect is followed. The answer carries a 3xx status and a `location` header.
  - **No cookie store.**
  - **Response headers.** Names are lower-cased; a repeated header is joined with `", "`. `set-cookie` is left out of `headers` and arrives parsed in `cookies`.
  - **Truncation.** The body is cut at `maxBytes` (`truncated: true`).
  - **Hash.** `sha256` is the hex hash of the bytes read.

- [ ] **Step 1: Write the failing test** — `modules/bearoom-fetch/index.test.ts`

```ts
// One mock whose native module each test sets; the rest of expo-modules-core stays real (jest-expo's runtime reads it).
let mockNative: { fetchOnce: jest.Mock } | null = null;
jest.mock("expo-modules-core", () => ({
  ...jest.requireActual("expo-modules-core"),
  requireOptionalNativeModule: () => mockNative,
}));

function load() {
  let mod!: typeof import("./index");
  jest.isolateModules(() => {
    mod = jest.requireActual("./index");
  });
  return mod;
}

const REQ = {
  url: "https://example.com/",
  method: "GET",
  headers: {},
  timeoutMs: 8000,
  maxBytes: 1024,
  responseType: "text" as const,
};

describe("fetchOnce", () => {
  it("hands the request to the native module and returns its answer", async () => {
    const answer = { status: 200, url: REQ.url, headers: {}, cookies: [], body: "ok", encoding: "text", truncated: false, sha256: "x" };
    mockNative = { fetchOnce: jest.fn().mockResolvedValue(answer) };
    const { fetchOnce, nativeFetchAvailable } = load();
    expect(nativeFetchAvailable).toBe(true);
    await expect(fetchOnce(REQ)).resolves.toEqual(answer);
    expect(mockNative.fetchOnce).toHaveBeenCalledWith(REQ);
  });

  it.each(["ERR_BLOCKED_ADDRESS", "ERR_TIMEOUT", "ERR_BAD_REQUEST"])("keeps the native error code %s", async (code) => {
    mockNative = { fetchOnce: jest.fn().mockRejectedValue(Object.assign(new Error("boom"), { code })) };
    const { fetchOnce } = load();
    await expect(fetchOnce(REQ)).rejects.toMatchObject({ name: "NativeFetchError", code });
  });

  it("reports any other failure as a network error", async () => {
    mockNative = { fetchOnce: jest.fn().mockRejectedValue(new Error("weird")) };
    const { fetchOnce } = load();
    await expect(fetchOnce(REQ)).rejects.toMatchObject({ code: "ERR_NETWORK" });
  });

  it("fails cleanly where the module is missing (web, old binary)", async () => {
    mockNative = null;
    const { fetchOnce, nativeFetchAvailable } = load();
    expect(nativeFetchAvailable).toBe(false);
    await expect(fetchOnce(REQ)).rejects.toMatchObject({ code: "ERR_NETWORK" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest modules/bearoom-fetch`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Implement the TypeScript wrapper** — `modules/bearoom-fetch/index.ts`

```ts
import { requireOptionalNativeModule } from "expo-modules-core";

/**
 * One HTTP exchange for the plugin host (spec §5.4): no redirect followed (the JS layer walks them hop by hop and
 * re-checks each), no shared cookie store, public addresses only — the native side checks every resolved address.
 */
export interface NativeRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  maxBytes: number;
  responseType: "text" | "base64";
}

export interface NativeCookie {
  name: string;
  value: string;
  /** Lower-case, no leading dot. */
  domain: string;
  path: string;
  hostOnly: boolean;
  secure: boolean;
  /** Epoch ms; 0 = session cookie. */
  expiresAt: number;
}

export interface NativeResponse {
  status: number;
  url: string;
  /** Lower-cased names; repeated headers joined with ", ". Set-Cookie arrives parsed in `cookies`. */
  headers: Record<string, string>;
  cookies: NativeCookie[];
  body: string;
  encoding: "text" | "base64";
  truncated: boolean;
  /** Hex SHA-256 of the body bytes read. */
  sha256: string;
}

export type NativeFetchErrorCode = "ERR_BLOCKED_ADDRESS" | "ERR_TIMEOUT" | "ERR_NETWORK" | "ERR_BAD_REQUEST";

const CODES: readonly NativeFetchErrorCode[] = ["ERR_BLOCKED_ADDRESS", "ERR_TIMEOUT", "ERR_NETWORK", "ERR_BAD_REQUEST"];

export class NativeFetchError extends Error {
  code: NativeFetchErrorCode;
  constructor(code: NativeFetchErrorCode, message: string) {
    super(message);
    this.name = "NativeFetchError";
    this.code = code;
  }
}

interface NativeBearoomFetch {
  fetchOnce(req: NativeRequest): Promise<NativeResponse>;
}

const native = requireOptionalNativeModule<NativeBearoomFetch>("BearoomFetch");

/** True when this binary carries the module (the plugin host runs only then). */
export const nativeFetchAvailable = !!native;

export async function fetchOnce(req: NativeRequest): Promise<NativeResponse> {
  if (!native) throw new NativeFetchError("ERR_NETWORK", "BearoomFetch is not in this build");
  try {
    return await native.fetchOnce(req);
  } catch (e) {
    const code = (e as { code?: unknown }).code;
    const known = CODES.find((c) => c === code);
    throw new NativeFetchError(known ?? "ERR_NETWORK", (e as Error)?.message ?? "fetch failed");
  }
}
```

`modules/bearoom-fetch/expo-module.config.json`:

```json
{
  "platforms": ["apple", "android"],
  "apple": {
    "modules": ["BearoomFetchModule"]
  },
  "android": {
    "modules": ["expo.modules.bearoomfetch.BearoomFetchModule"]
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx jest modules/bearoom-fetch`
Expected: PASS (6 tests).

- [ ] **Step 5: Android** — `modules/bearoom-fetch/android/build.gradle`

```gradle
plugins {
  id 'com.android.library'
  id 'expo-module-gradle-plugin'
}

group = 'expo.modules.bearoomfetch'
version = '1.0.0'

android {
  namespace "expo.modules.bearoomfetch"
  defaultConfig {
    versionCode 1
    versionName "1.0.0"
  }
}

dependencies {
  // React Native ships OkHttp in every app; compile against the version it declares
  // (node_modules/react-native/gradle/libs.versions.toml — bump with RN).
  compileOnly "com.squareup.okhttp3:okhttp:4.9.2"
}
```

`.../bearoomfetch/PublicAddress.kt`:

```kotlin
package expo.modules.bearoomfetch

import java.io.IOException
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress
import okhttp3.Dns

/** Only globally routable unicast addresses: no loopback, private, link-local, CGNAT, multicast or reserved ranges. */
internal fun isPublicAddress(addr: InetAddress): Boolean {
  if (addr.isAnyLocalAddress || addr.isLoopbackAddress || addr.isLinkLocalAddress ||
    addr.isSiteLocalAddress || addr.isMulticastAddress
  ) return false
  val b = addr.address.map { it.toInt() and 0xff }
  return when (addr) {
    is Inet4Address -> isPublicV4(b)
    is Inet6Address -> isPublicV6(b)
    else -> false
  }
}

private fun isPublicV4(b: List<Int>): Boolean {
  val a = b[0]
  val c = b[1]
  return when {
    a == 0 || a == 10 || a == 127 -> false
    a == 100 && c in 64..127 -> false // CGNAT
    a == 169 && c == 254 -> false
    a == 172 && c in 16..31 -> false
    a == 192 && c == 168 -> false
    a == 192 && c == 0 && (b[2] == 0 || b[2] == 2) -> false
    a == 198 && (c == 18 || c == 19) -> false
    a == 198 && c == 51 && b[2] == 100 -> false
    a == 203 && c == 0 && b[2] == 113 -> false
    a >= 224 -> false // multicast, reserved, broadcast
    else -> true
  }
}

private fun isPublicV6(b: List<Int>): Boolean {
  // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::a.b.c.d — what IPv6-only carriers synthesise) carry a v4 address.
  if (b.subList(0, 10).all { it == 0 } && b[10] == 0xff && b[11] == 0xff) return isPublicV4(b.subList(12, 16))
  if (b[0] == 0x00 && b[1] == 0x64 && b[2] == 0xff && b[3] == 0x9b) return isPublicV4(b.subList(12, 16))
  return when {
    b[0] == 0x00 -> false // ::/8 (::, ::1, v4-compatible)
    (b[0] and 0xfe) == 0xfc -> false // fc00::/7 unique local
    b[0] == 0xfe && (b[1] and 0xc0) == 0x80 -> false // fe80::/10
    b[0] == 0xff -> false // multicast
    b[0] == 0x20 && b[1] == 0x01 && b[2] == 0x0d && b[3] == 0xb8 -> false // documentation
    else -> true
  }
}

internal class BlockedAddressException(host: String) : IOException("Blocked non-public address for $host")

/** OkHttp resolves through this on every connection — so on every redirect hop the JS layer walks. */
internal object PublicOnlyDns : Dns {
  override fun lookup(hostname: String): List<InetAddress> {
    val ok = Dns.SYSTEM.lookup(hostname).filter(::isPublicAddress)
    if (ok.isEmpty()) throw BlockedAddressException(hostname)
    return ok
  }
}
```

`.../bearoomfetch/BearoomFetchModule.kt`:

```kotlin
package expo.modules.bearoomfetch

import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InterruptedIOException
import java.net.InetAddress
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Cookie
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

class FetchRequest : Record {
  @Field val url: String = ""
  @Field val method: String = "GET"
  @Field val headers: Map<String, String> = emptyMap()
  @Field val body: String? = null
  @Field val timeoutMs: Int = 8000
  @Field val maxBytes: Int = 20 * 1024 * 1024
  @Field val responseType: String = "text"
}

/**
 * One HTTP exchange for the plugin host (spec §5.4). No redirects followed (JS walks them hop by hop), no cookie
 * store (each plugin has its own jar in JS), public addresses only: the resolver filters every connection, and
 * IP-literal hosts — which skip DNS — are checked here.
 */
class BearoomFetchModule : Module() {
  private val client: OkHttpClient by lazy {
    OkHttpClient.Builder()
      .followRedirects(false)
      .followSslRedirects(false)
      .dns(PublicOnlyDns)
      .retryOnConnectionFailure(false)
      .build()
  }

  override fun definition() = ModuleDefinition {
    Name("BearoomFetch")

    AsyncFunction("fetchOnce") Coroutine { req: FetchRequest ->
      withContext(Dispatchers.IO) { perform(req) }
    }
  }

  private fun perform(req: FetchRequest): Map<String, Any?> {
    val url = req.url.toHttpUrlOrNull()
      ?: throw CodedException("ERR_BAD_REQUEST", "Not an http(s) URL", null)
    if (isIpLiteral(url.host) && !isPublicAddress(InetAddress.getByName(url.host))) {
      throw CodedException("ERR_BLOCKED_ADDRESS", "Blocked non-public address", null)
    }
    val method = req.method.uppercase()
    val contentType = req.headers.entries.firstOrNull { it.key.equals("content-type", ignoreCase = true) }?.value
    val body = if (method == "GET" || method == "HEAD") null else (req.body ?: "").toRequestBody(contentType?.toMediaTypeOrNull())
    val builder = try {
      Request.Builder().url(url).method(method, body)
    } catch (e: IllegalArgumentException) {
      throw CodedException("ERR_BAD_REQUEST", e.message ?: "Bad request", e)
    }
    for ((name, value) in req.headers) {
      try {
        builder.header(name, value)
      } catch (e: IllegalArgumentException) {
        throw CodedException("ERR_BAD_REQUEST", "Bad header $name", e)
      }
    }
    val call = client.newBuilder()
      .callTimeout(req.timeoutMs.toLong(), TimeUnit.MILLISECONDS)
      .build()
      .newCall(builder.build())
    try {
      call.execute().use { res ->
        val digest = MessageDigest.getInstance("SHA-256")
        val out = ByteArrayOutputStream()
        var truncated = false
        res.body?.byteStream()?.use { stream ->
          val buf = ByteArray(16 * 1024)
          while (true) {
            val n = stream.read(buf)
            if (n < 0) break
            val room = req.maxBytes - out.size()
            if (n > room) {
              out.write(buf, 0, room)
              digest.update(buf, 0, room)
              truncated = true
              break
            }
            out.write(buf, 0, n)
            digest.update(buf, 0, n)
          }
        }
        val bytes = out.toByteArray()
        val headers = linkedMapOf<String, String>()
        for (name in res.headers.names()) {
          val lower = name.lowercase()
          if (lower != "set-cookie") headers[lower] = res.headers(name).joinToString(", ")
        }
        val cookies = Cookie.parseAll(url, res.headers).map { c ->
          mapOf(
            "name" to c.name,
            "value" to c.value,
            "domain" to c.domain,
            "path" to c.path,
            "hostOnly" to c.hostOnly,
            "secure" to c.secure,
            "expiresAt" to if (c.persistent) c.expiresAt.toDouble() else 0.0,
          )
        }
        val base64 = req.responseType == "base64"
        val charset = res.body?.contentType()?.charset(Charsets.UTF_8) ?: Charsets.UTF_8
        return mapOf(
          "status" to res.code,
          "url" to res.request.url.toString(),
          "headers" to headers,
          "cookies" to cookies,
          "body" to if (base64) Base64.encodeToString(bytes, Base64.NO_WRAP) else String(bytes, charset),
          "encoding" to if (base64) "base64" else "text",
          "truncated" to truncated,
          "sha256" to digest.digest().joinToString("") { "%02x".format(it) },
        )
      }
    } catch (e: IOException) {
      if (generateSequence<Throwable>(e) { it.cause }.any { it is BlockedAddressException }) {
        throw CodedException("ERR_BLOCKED_ADDRESS", "Blocked non-public address", e)
      }
      if (e is InterruptedIOException) throw CodedException("ERR_TIMEOUT", "Timed out", e)
      throw CodedException("ERR_NETWORK", e.message ?: "Network error", e)
    }
  }

  private fun isIpLiteral(host: String) = host.contains(':') || IPV4.matches(host)

  private companion object {
    val IPV4 = Regex("^\\d{1,3}(\\.\\d{1,3}){3}$")
  }
}
```

- [ ] **Step 6: Compile Android**

Run: `cd android && JAVA_TOOL_OPTIONS=-Djava.net.preferIPv4Stack=true ./gradlew :bearoom-fetch:compileReleaseKotlin`
Expected: `BUILD SUCCESSFUL`. If the project name differs, list it with `./gradlew projects | grep bearoom`.

- [ ] **Step 7: iOS** — `modules/bearoom-fetch/ios/BearoomFetch.podspec`

```ruby
Pod::Spec.new do |s|
  s.name           = 'BearoomFetch'
  s.version        = '1.0.0'
  s.summary        = 'Bearoom plugin-host fetch (manual redirects, public addresses only)'
  s.description    = 'One HTTP exchange per call for the plugin host, with no shared cookies and no private addresses.'
  s.license        = 'MIT'
  s.author         = 'Bearoom'
  s.homepage       = 'https://github.com/'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end
```

`modules/bearoom-fetch/ios/PublicAddress.swift`:

```swift
import Darwin
import Foundation

/// Every address a host resolves to must be public (spec §8 SSRF guard). URLSession resolves again when it connects,
/// so a DNS answer that changes in between is not caught here — Android checks at connect time instead.
enum PublicAddress {
  enum Failure: Error { case blocked, unresolved }

  static func check(host: String) throws {
    var hints = addrinfo(
      ai_flags: AI_ADDRCONFIG, ai_family: AF_UNSPEC, ai_socktype: SOCK_STREAM, ai_protocol: 0,
      ai_addrlen: 0, ai_canonname: nil, ai_addr: nil, ai_next: nil)
    var result: UnsafeMutablePointer<addrinfo>?
    guard getaddrinfo(host, nil, &hints, &result) == 0, let first = result else { throw Failure.unresolved }
    defer { freeaddrinfo(result) }
    var node: UnsafeMutablePointer<addrinfo>? = first
    while let ai = node {
      if ai.pointee.ai_family == AF_INET, let sa = ai.pointee.ai_addr {
        let sin = sa.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { $0.pointee }
        let bytes = withUnsafeBytes(of: sin.sin_addr) { Array($0) }
        if !isPublic(v4: bytes) { throw Failure.blocked }
      } else if ai.pointee.ai_family == AF_INET6, let sa = ai.pointee.ai_addr {
        let sin6 = sa.withMemoryRebound(to: sockaddr_in6.self, capacity: 1) { $0.pointee }
        let bytes = withUnsafeBytes(of: sin6.sin6_addr) { Array($0) }
        if !isPublic(v6: bytes) { throw Failure.blocked }
      }
      node = ai.pointee.ai_next
    }
  }

  static func isPublic(v4 b: [UInt8]) -> Bool {
    let a = b[0], c = b[1]
    if a == 0 || a == 10 || a == 127 { return false }
    if a == 100 && (64...127).contains(c) { return false }
    if a == 169 && c == 254 { return false }
    if a == 172 && (16...31).contains(c) { return false }
    if a == 192 && c == 168 { return false }
    if a == 192 && c == 0 && (b[2] == 0 || b[2] == 2) { return false }
    if a == 198 && (c == 18 || c == 19) { return false }
    if a == 198 && c == 51 && b[2] == 100 { return false }
    if a == 203 && c == 0 && b[2] == 113 { return false }
    if a >= 224 { return false }
    return true
  }

  static func isPublic(v6 b: [UInt8]) -> Bool {
    if b[0..<10].allSatisfy({ $0 == 0 }) && b[10] == 0xff && b[11] == 0xff { return isPublic(v4: Array(b[12..<16])) }
    if b[0] == 0x00 && b[1] == 0x64 && b[2] == 0xff && b[3] == 0x9b { return isPublic(v4: Array(b[12..<16])) }
    if b[0] == 0x00 { return false }
    if (b[0] & 0xfe) == 0xfc { return false }
    if b[0] == 0xfe && (b[1] & 0xc0) == 0x80 { return false }
    if b[0] == 0xff { return false }
    if b[0] == 0x20 && b[1] == 0x01 && b[2] == 0x0d && b[3] == 0xb8 { return false }
    return true
  }
}
```

`modules/bearoom-fetch/ios/BearoomFetchModule.swift`:

```swift
import CryptoKit
import ExpoModulesCore
import Foundation

struct FetchRequest: Record {
  @Field var url: String = ""
  @Field var method: String = "GET"
  @Field var headers: [String: String] = [:]
  @Field var body: String? = nil
  @Field var timeoutMs: Int = 8000
  @Field var maxBytes: Int = 20 * 1024 * 1024
  @Field var responseType: String = "text"
}

private final class NoRedirects: NSObject, URLSessionTaskDelegate {
  func urlSession(
    _ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void
  ) {
    completionHandler(nil)
  }
}

/// One HTTP exchange for the plugin host (spec §5.4): no redirects followed, no cookie store, public addresses only.
public class BearoomFetchModule: Module {
  private lazy var session: URLSession = {
    let cfg = URLSessionConfiguration.ephemeral
    cfg.httpCookieStorage = nil
    cfg.httpShouldSetCookies = false
    cfg.httpCookieAcceptPolicy = .never
    cfg.urlCache = nil
    cfg.requestCachePolicy = .reloadIgnoringLocalCacheData
    return URLSession(configuration: cfg, delegate: NoRedirects(), delegateQueue: nil)
  }()

  public func definition() -> ModuleDefinition {
    Name("BearoomFetch")

    AsyncFunction("fetchOnce") { (req: FetchRequest) async throws -> [String: Any] in
      try await self.perform(req)
    }
  }

  private func fail(_ code: String, _ detail: String) -> Exception {
    Exception(name: "BearoomFetchError", description: detail, code: code)
  }

  private func perform(_ req: FetchRequest) async throws -> [String: Any] {
    guard let url = URL(string: req.url), let scheme = url.scheme?.lowercased(),
      scheme == "http" || scheme == "https", let host = url.host, !host.isEmpty
    else { throw fail("ERR_BAD_REQUEST", "Not an http(s) URL") }
    do {
      try PublicAddress.check(host: host)
    } catch PublicAddress.Failure.blocked {
      throw fail("ERR_BLOCKED_ADDRESS", "Blocked non-public address")
    } catch {
      throw fail("ERR_NETWORK", "Could not resolve \(host)")
    }

    var request = URLRequest(url: url, timeoutInterval: Double(req.timeoutMs) / 1000)
    request.httpMethod = req.method.uppercased()
    request.httpShouldHandleCookies = false
    for (name, value) in req.headers { request.setValue(value, forHTTPHeaderField: name) }
    if let body = req.body, request.httpMethod != "GET", request.httpMethod != "HEAD" {
      request.httpBody = body.data(using: .utf8)
    }

    let started = Date()
    let bytes: URLSession.AsyncBytes
    let response: URLResponse
    do {
      (bytes, response) = try await session.bytes(for: request)
    } catch let e as URLError {
      throw fail(e.code == .timedOut ? "ERR_TIMEOUT" : "ERR_NETWORK", e.localizedDescription)
    }
    guard let http = response as? HTTPURLResponse else { throw fail("ERR_NETWORK", "Not an HTTP response") }

    var data = Data()
    var truncated = false
    do {
      for try await byte in bytes {
        if data.count >= req.maxBytes { truncated = true; break }
        data.append(byte)
        if data.count % 65536 == 0, Date().timeIntervalSince(started) * 1000 > Double(req.timeoutMs) {
          bytes.task.cancel()
          throw fail("ERR_TIMEOUT", "Timed out")
        }
      }
    } catch let e as URLError {
      throw fail(e.code == .timedOut ? "ERR_TIMEOUT" : "ERR_NETWORK", e.localizedDescription)
    }
    if truncated { bytes.task.cancel() }

    var headers: [String: String] = [:]
    var fields: [String: String] = [:]
    for (k, v) in http.allHeaderFields {
      guard let name = k as? String, let value = v as? String else { continue }
      fields[name] = value
      let lower = name.lowercased()
      if lower != "set-cookie" { headers[lower] = value }
    }
    let cookies: [[String: Any]] = HTTPCookie.cookies(withResponseHeaderFields: fields, for: url).map { c in
      let dotted = c.domain.hasPrefix(".")
      return [
        "name": c.name,
        "value": c.value,
        "domain": (dotted ? String(c.domain.dropFirst()) : c.domain).lowercased(),
        "path": c.path,
        "hostOnly": !dotted,
        "secure": c.isSecure,
        "expiresAt": (c.expiresDate?.timeIntervalSince1970 ?? 0) * 1000,
      ]
    }
    let base64 = req.responseType == "base64"
    let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    return [
      "status": http.statusCode,
      "url": http.url?.absoluteString ?? req.url,
      "headers": headers,
      "cookies": cookies,
      "body": base64 ? data.base64EncodedString() : String(decoding: data, as: UTF8.self),
      "encoding": base64 ? "base64" : "text",
      "truncated": truncated,
      "sha256": digest,
    ]
  }
}
```

- [ ] **Step 8: Compile iOS (no simulator)**

Run: `cd ios && pod install`, then `xcodebuild -project ios/Pods/Pods.xcodeproj -target BearoomFetch -sdk iphonesimulator -configuration Debug ONLY_ACTIVE_ARCH=YES ARCHS=arm64 SYMROOT=$SP/ios-build OBJROOT=$SP/ios-build/obj build > $SP/ios-fetch-build.log 2>&1; tail -3 $SP/ios-fetch-build.log` (`$SP` = scratchpad).
Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 9: Commit**

```bash
git add modules/bearoom-fetch ios/Podfile.lock
git commit -m "feat(fetch): BearoomFetch module — one exchange, manual redirects, public addresses only

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: Plugin fetch layer — URL guard, cookie jar, limiter, redirect walker

**Files:**
- Create: `services/plugins/urlGuard.ts`, `services/plugins/urlGuard.test.ts`
- Create: `services/plugins/cookieJar.ts`, `services/plugins/cookieJar.test.ts`
- Create: `services/plugins/limiter.ts`, `services/plugins/limiter.test.ts`
- Create: `services/plugins/pluginFetch.ts`, `services/plugins/pluginFetch.test.ts`

**Interfaces:**
- Consumes: `fetchOnce`, `NativeFetchError`, `NativeRequest`, `NativeResponse`, `NativeCookie` (Task 2).
- Produces:
  - `checkUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: "scheme" | "credentials" | "host" }`
  - `cleanHeaders(h: unknown): Record<string, string>`, `hasHeader(h, name): boolean`, `withoutHeader(h, name): Record<string, string>`
  - `class CookieJar { constructor(now?: () => number); store(list: NativeCookie[]): void; header(url: string): string | undefined; size(): number }`
  - `class Limiter { constructor(perKey: number, overall: number); run<T>(key: string, task: () => Promise<T>): Promise<T> }`, `registrableDomain(host: string): string`
  - `interface PluginFetchRequest { url: string; method?: string; headers?: Record<string, string>; body?: string; redirect?: "follow" | "manual" | "error"; responseType?: "text" | "base64" }`
  - `interface PluginFetchResponse { status: number; url: string; redirected: boolean; headers: Record<string, string>; body: string; encoding: "text" | "base64"; sha256: string }`
  - `class PluginFetchError extends Error { code: "blocked" | "timeout" | "network" | "too-large" | "redirects" | "bad-request" }`
  - `interface PluginFetchDeps { fetchOnce: (req: NativeRequest) => Promise<NativeResponse>; limiter: Limiter; tmdbProxyBase: string }`
  - `pluginFetch(jar: CookieJar, req: PluginFetchRequest, deps: PluginFetchDeps): Promise<PluginFetchResponse>`
  - `toPluginFetchRequest(v: unknown): PluginFetchRequest` (validates what a worker sends)
  - `rewriteTmdb(url: URL, proxyBase: string): URL`
  - constants `MAX_HOPS = 5`, `REQUEST_TIMEOUT_MS = 8000`, `MAX_BODY_BYTES = 20 * 1024 * 1024`

- [ ] **Step 1: Write the failing tests**

`services/plugins/urlGuard.test.ts`:

```ts
import { checkUrl, cleanHeaders, withoutHeader } from "./urlGuard";

describe("checkUrl", () => {
  it.each(["https://example.com/a?b=1", "http://cdn.example.co.uk:8443/x", "https://8.8.8.8/", "https://[2606:4700::1111]/"])(
    "allows %s",
    (u) => expect(checkUrl(u).ok).toBe(true),
  );

  it.each([
    ["file:///etc/hosts", "scheme"],
    ["javascript:alert(1)", "scheme"],
    ["ftp://x.com/", "scheme"],
    ["not a url", "scheme"],
    ["https://user:pw@example.com/", "credentials"],
    ["http://localhost:8081/", "host"],
    ["http://127.0.0.1/", "host"],
    ["http://2130706433/", "host"],
    ["http://10.1.2.3/", "host"],
    ["http://192.168.1.1/", "host"],
    ["http://172.20.0.1/", "host"],
    ["http://169.254.169.254/latest/meta-data", "host"],
    ["http://100.64.0.1/", "host"],
    ["http://0.0.0.0/", "host"],
    ["http://[::1]/", "host"],
    ["http://[fd00::1]/", "host"],
    ["http://[::ffff:127.0.0.1]/", "host"],
    ["http://printer.local/", "host"],
    ["http://router/", "host"],
    ["http://metadata.google.internal/", "host"],
  ])("refuses %s (%s)", (u, reason) => expect(checkUrl(u)).toEqual({ ok: false, reason }));
});

describe("cleanHeaders", () => {
  it("keeps ordinary headers and drops the ones the HTTP client owns", () => {
    expect(
      cleanHeaders({ Referer: "https://a.test/", "User-Agent": "UA", Host: "evil", "Accept-Encoding": "br", "Content-Length": "9", Connection: "close" }),
    ).toEqual({ Referer: "https://a.test/", "User-Agent": "UA" });
  });

  it("drops header-injection attempts and names that are not tokens", () => {
    expect(cleanHeaders({ "X-A": "1\r\nX-B: 2", "Bad Name": "x", "X-C": "ok", "X-N": 5 })).toEqual({ "X-C": "ok", "X-N": "5" });
  });

  it("tolerates junk", () => {
    expect(cleanHeaders(null)).toEqual({});
    expect(cleanHeaders("x")).toEqual({});
  });

  it("withoutHeader ignores case", () => {
    expect(withoutHeader({ Cookie: "a", "X-Y": "b" }, "cookie")).toEqual({ "X-Y": "b" });
  });
});
```

`services/plugins/cookieJar.test.ts`:

```ts
import type { NativeCookie } from "@/modules/bearoom-fetch";
import { CookieJar } from "./cookieJar";

const c = (over: Partial<NativeCookie>): NativeCookie => ({
  name: "a",
  value: "1",
  domain: "example.com",
  path: "/",
  hostOnly: false,
  secure: false,
  expiresAt: 0,
  ...over,
});

describe("CookieJar", () => {
  it("sends domain cookies to subdomains and host-only cookies to their host alone", () => {
    const jar = new CookieJar(() => 1000);
    jar.store([c({ name: "d" }), c({ name: "h", domain: "www.example.com", hostOnly: true })]);
    expect(jar.header("https://cdn.example.com/x")).toBe("d=1");
    expect(jar.header("https://www.example.com/x")).toBe("d=1; h=1");
    expect(jar.header("https://notexample.com/")).toBeUndefined();
  });

  it("matches paths on segment boundaries, longest first", () => {
    const jar = new CookieJar(() => 1000);
    jar.store([c({ name: "root", path: "/" }), c({ name: "deep", path: "/api" })]);
    expect(jar.header("https://example.com/api/x")).toBe("deep=1; root=1");
    expect(jar.header("https://example.com/apix")).toBe("root=1");
  });

  it("keeps secure cookies off plain http", () => {
    const jar = new CookieJar(() => 1000);
    jar.store([c({ name: "s", secure: true })]);
    expect(jar.header("http://example.com/")).toBeUndefined();
    expect(jar.header("https://example.com/")).toBe("s=1");
  });

  it("forgets expired cookies, and a server can delete one by expiring it", () => {
    const t = { now: 1000 };
    const jar = new CookieJar(() => t.now);
    jar.store([c({ name: "x", expiresAt: 2000 }), c({ name: "y" })]);
    expect(jar.header("https://example.com/")).toBe("x=1; y=1");
    t.now = 3000;
    expect(jar.header("https://example.com/")).toBe("y=1");
    jar.store([c({ name: "y", value: "gone", expiresAt: 500 })]);
    expect(jar.header("https://example.com/")).toBeUndefined();
  });

  it("replaces a cookie with the same name, domain and path", () => {
    const jar = new CookieJar(() => 1000);
    jar.store([c({ value: "old" })]);
    jar.store([c({ value: "new" })]);
    expect(jar.header("https://example.com/")).toBe("a=new");
  });

  it("caps how many cookies one plugin can hold", () => {
    const jar = new CookieJar(() => 1000);
    jar.store(Array.from({ length: 400 }, (_, i) => c({ name: `n${i}` })));
    expect(jar.size()).toBe(300);
  });
});
```

`services/plugins/limiter.test.ts`:

```ts
import { Limiter, registrableDomain } from "./limiter";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("registrableDomain", () => {
  it.each([
    ["a.b.example.com", "example.com"],
    ["example.com", "example.com"],
    ["x.example.co.uk", "example.co.uk"],
    ["cdn.example.co.in", "example.co.in"],
    ["8.8.8.8", "8.8.8.8"],
    ["localhost", "localhost"],
  ])("%s → %s", (h, d) => expect(registrableDomain(h)).toBe(d));
});

describe("Limiter", () => {
  it("runs at most perKey tasks per key and overall in total", async () => {
    const lim = new Limiter(2, 3);
    const open: Record<string, () => void> = {};
    const task = (key: string, id: string) => lim.run(key, () => new Promise<void>((res) => (open[id] = res)));
    const all = [task("a", "a1"), task("a", "a2"), task("a", "a3"), task("b", "b1"), task("c", "c1")];
    await flush();
    expect(Object.keys(open).sort()).toEqual(["a1", "a2", "b1"]); // a3 waits for its key, c1 for the total
    open.a1();
    await flush();
    expect(Object.keys(open).sort()).toEqual(["a1", "a2", "a3", "b1"]);
    open.b1();
    await flush();
    expect(Object.keys(open)).toContain("c1");
    open.a2();
    open.a3();
    open.c1();
    await Promise.all(all);
  });

  it("passes results and failures through and frees the slot", async () => {
    const lim = new Limiter(1, 1);
    await expect(lim.run("k", async () => 7)).resolves.toBe(7);
    await expect(lim.run("k", async () => Promise.reject(new Error("x")))).rejects.toThrow("x");
    await expect(lim.run("k", async () => 8)).resolves.toBe(8);
  });
});
```

`services/plugins/pluginFetch.test.ts`:

```ts
import { NativeFetchError, type NativeRequest, type NativeResponse } from "@/modules/bearoom-fetch";
import { CookieJar } from "./cookieJar";
import { Limiter } from "./limiter";
import { MAX_HOPS, pluginFetch, rewriteTmdb, toPluginFetchRequest } from "./pluginFetch";

const res = (over: Partial<NativeResponse> = {}): NativeResponse => ({
  status: 200,
  url: "",
  headers: {},
  cookies: [],
  body: "ok",
  encoding: "text",
  truncated: false,
  sha256: "h",
  ...over,
});

function setup(answers: Record<string, NativeResponse | Error>) {
  const seen: NativeRequest[] = [];
  const fetchOnce = jest.fn(async (req: NativeRequest) => {
    seen.push(req);
    const a = answers[req.url];
    if (!a) throw new Error(`unexpected ${req.url}`);
    if (a instanceof Error) throw a;
    return a;
  });
  return { seen, jar: new CookieJar(() => 0), deps: { fetchOnce, limiter: new Limiter(2, 24), tmdbProxyBase: "https://tmdb.proxy.test/" } };
}

describe("pluginFetch", () => {
  it("returns a plain answer with the native limits", async () => {
    const { seen, jar, deps } = setup({ "https://a.test/x": res({ body: "hi", headers: { "content-type": "text/plain" } }) });
    const out = await pluginFetch(jar, { url: "https://a.test/x" }, deps);
    expect(out).toMatchObject({ status: 200, url: "https://a.test/x", redirected: false, body: "hi", headers: { "content-type": "text/plain" } });
    expect(seen[0]).toMatchObject({ method: "GET", timeoutMs: 8000, maxBytes: 20 * 1024 * 1024, responseType: "text" });
  });

  it("follows a relative redirect and reports where it landed", async () => {
    const { jar, deps } = setup({
      "https://a.test/x": res({ status: 302, headers: { location: "/y" } }),
      "https://a.test/y": res({ body: "landed" }),
    });
    await expect(pluginFetch(jar, { url: "https://a.test/x" }, deps)).resolves.toMatchObject({ status: 200, url: "https://a.test/y", redirected: true, body: "landed" });
  });

  it("redirect: manual hands the 3xx back to the plugin", async () => {
    const { jar, deps } = setup({ "https://a.test/x": res({ status: 302, headers: { location: "https://b.test/" } }) });
    await expect(pluginFetch(jar, { url: "https://a.test/x", redirect: "manual" }, deps)).resolves.toMatchObject({ status: 302, headers: { location: "https://b.test/" } });
  });

  it("redirect: error refuses a redirect", async () => {
    const { jar, deps } = setup({ "https://a.test/x": res({ status: 301, headers: { location: "/y" } }) });
    await expect(pluginFetch(jar, { url: "https://a.test/x", redirect: "error" }, deps)).rejects.toMatchObject({ code: "redirects" });
  });

  it(`stops after ${MAX_HOPS} hops`, async () => {
    const answers: Record<string, NativeResponse> = {};
    for (let i = 0; i <= MAX_HOPS + 1; i++) answers[`https://a.test/${i}`] = res({ status: 302, headers: { location: `/${i + 1}` } });
    const { seen, jar, deps } = setup(answers);
    await expect(pluginFetch(jar, { url: "https://a.test/0" }, deps)).rejects.toMatchObject({ code: "redirects" });
    expect(seen).toHaveLength(MAX_HOPS + 1);
  });

  it("refuses a redirect to a private address before asking the network", async () => {
    const { seen, jar, deps } = setup({ "https://a.test/x": res({ status: 302, headers: { location: "http://192.168.1.1/admin" } }) });
    await expect(pluginFetch(jar, { url: "https://a.test/x" }, deps)).rejects.toMatchObject({ code: "blocked" });
    expect(seen).toHaveLength(1);
  });

  it("maps native failures to plugin-facing codes", async () => {
    const { jar, deps } = setup({
      "https://blocked.test/": new NativeFetchError("ERR_BLOCKED_ADDRESS", "no"),
      "https://slow.test/": new NativeFetchError("ERR_TIMEOUT", "slow"),
    });
    await expect(pluginFetch(jar, { url: "https://blocked.test/" }, deps)).rejects.toMatchObject({ name: "PluginFetchError", code: "blocked" });
    await expect(pluginFetch(jar, { url: "https://slow.test/" }, deps)).rejects.toMatchObject({ code: "timeout" });
  });

  it("303 after POST continues as GET without the body", async () => {
    const { seen, jar, deps } = setup({
      "https://a.test/form": res({ status: 303, headers: { location: "/done" } }),
      "https://a.test/done": res(),
    });
    await pluginFetch(jar, { url: "https://a.test/form", method: "POST", body: "a=1", headers: { "Content-Type": "application/x-www-form-urlencoded" } }, deps);
    expect(seen[1]).toMatchObject({ method: "GET", body: undefined });
    expect(seen[1].headers).not.toHaveProperty("Content-Type");
  });

  it("307 keeps the method and the body", async () => {
    const { seen, jar, deps } = setup({
      "https://a.test/api": res({ status: 307, headers: { location: "/api2" } }),
      "https://a.test/api2": res(),
    });
    await pluginFetch(jar, { url: "https://a.test/api", method: "POST", body: "{}" }, deps);
    expect(seen[1]).toMatchObject({ method: "POST", body: "{}" });
  });

  it("never carries credentials across hosts", async () => {
    const { seen, jar, deps } = setup({
      "https://a.test/x": res({ status: 302, headers: { location: "https://b.test/y" } }),
      "https://b.test/y": res(),
    });
    await pluginFetch(jar, { url: "https://a.test/x", headers: { Authorization: "Bearer t", Cookie: "s=1", Referer: "https://a.test/" } }, deps);
    expect(seen[0].headers).toMatchObject({ Authorization: "Bearer t", Cookie: "s=1" });
    expect(seen[1].headers).toEqual({ Referer: "https://a.test/" });
  });

  it("stores response cookies and sends them back to that site; a plugin's own Cookie wins", async () => {
    const { seen, jar, deps } = setup({
      "https://a.test/login": res({ cookies: [{ name: "sid", value: "42", domain: "a.test", path: "/", hostOnly: true, secure: true, expiresAt: 0 }] }),
      "https://a.test/api": res(),
    });
    await pluginFetch(jar, { url: "https://a.test/login" }, deps);
    await pluginFetch(jar, { url: "https://a.test/api" }, deps);
    expect(seen[1].headers).toEqual({ Cookie: "sid=42" });
    await pluginFetch(jar, { url: "https://a.test/api", headers: { cookie: "mine=1" } }, deps);
    expect(seen[2].headers).toEqual({ cookie: "mine=1" });
  });

  it("sends direct TMDB calls through the app's proxy without api_key", async () => {
    const { seen, jar, deps } = setup({ "https://tmdb.proxy.test/movie/550?language=en": res({ body: "{}" }) });
    const out = await pluginFetch(jar, { url: "https://api.themoviedb.org/3/movie/550?api_key=k&language=en" }, deps);
    expect(seen[0].url).toBe("https://tmdb.proxy.test/movie/550?language=en");
    expect(out.url).toBe("https://api.themoviedb.org/3/movie/550?api_key=k&language=en");
  });

  it("refuses bodies over 20 MiB", async () => {
    const { jar, deps } = setup({ "https://a.test/big": res({ truncated: true }) });
    await expect(pluginFetch(jar, { url: "https://a.test/big" }, deps)).rejects.toMatchObject({ code: "too-large" });
  });
});

describe("rewriteTmdb", () => {
  it("leaves other hosts alone", () => {
    const u = new URL("https://example.com/3/movie/1");
    expect(rewriteTmdb(u, "https://p.test/")).toBe(u);
  });
});

describe("toPluginFetchRequest", () => {
  it("fills defaults and keeps only string headers", () => {
    expect(toPluginFetchRequest({ url: "https://a.test/", headers: { A: "1", B: 2 } })).toEqual({
      url: "https://a.test/",
      method: "GET",
      headers: { A: "1" },
      body: undefined,
      redirect: "follow",
      responseType: "text",
    });
  });

  it.each([[{}], [{ url: 5 }], [{ url: "https://a.test/", method: "CONNECT" }], [null]])("refuses %j", (v) => {
    expect(() => toPluginFetchRequest(v)).toThrow(expect.objectContaining({ code: "bad-request" }));
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest services/plugins/urlGuard services/plugins/cookieJar services/plugins/limiter services/plugins/pluginFetch`
Expected: FAIL — 4 suites, `Cannot find module`.

- [ ] **Step 3: Implement**

`services/plugins/urlGuard.ts`:

```ts
/**
 * The JS half of the plugin host's SSRF guard (spec §8). It refuses obvious local targets before anything leaves the
 * app; the BearoomFetch module re-checks the addresses each hostname actually resolves to, on every hop.
 */
export type UrlVerdict = { ok: true; url: URL } | { ok: false; reason: "scheme" | "credentials" | "host" };

const LOCAL_SUFFIXES = [".local", ".localhost", ".internal", ".lan", ".home", ".corp", ".intranet", ".invalid", ".test", ".example", ".onion", ".arpa"];
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export function checkUrl(raw: string): UrlVerdict {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "scheme" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, reason: "scheme" };
  if (url.username || url.password) return { ok: false, reason: "credentials" };
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || LOCAL_SUFFIXES.some((s) => host.endsWith(s))) return { ok: false, reason: "host" };
  if (host.startsWith("[")) return isPublicV6Literal(host.slice(1, -1)) ? { ok: true, url } : { ok: false, reason: "host" };
  if (IPV4.test(host)) return isPublicV4Literal(host) ? { ok: true, url } : { ok: false, reason: "host" };
  if (!host.includes(".")) return { ok: false, reason: "host" }; // single-label names are intranet hosts
  return { ok: true, url };
}

function isPublicV4Literal(host: string): boolean {
  const [a, b, c] = host.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  return true;
}

/** Only global unicast (2000::/3) literals, minus the documentation block; everything else is local or special. */
function isPublicV6Literal(host: string): boolean {
  return /^[23][0-9a-f]{0,3}:/.test(host) && !host.startsWith("2001:db8:");
}

// Headers the HTTP client owns (framing, compression, routing); a plugin setting them breaks the exchange.
const CLIENT_OWNED = new Set([
  "host", "content-length", "connection", "transfer-encoding", "accept-encoding", "keep-alive",
  "upgrade", "proxy-connection", "proxy-authorization", "te", "trailer", "expect",
]);
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/** Plugin-supplied headers minus client-owned ones; non-token names and values with CR/LF/NUL are dropped. */
export function cleanHeaders(h: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h || typeof h !== "object") return out;
  for (const [k, v] of Object.entries(h as Record<string, unknown>)) {
    if (typeof v !== "string" && typeof v !== "number") continue;
    const value = String(v);
    if (!TOKEN.test(k) || CLIENT_OWNED.has(k.toLowerCase()) || /[\r\n\0]/.test(value) || value.length > 8192) continue;
    out[k] = value;
  }
  return out;
}

export function hasHeader(h: Record<string, string>, name: string): boolean {
  const n = name.toLowerCase();
  return Object.keys(h).some((k) => k.toLowerCase() === n);
}

export function withoutHeader(h: Record<string, string>, name: string): Record<string, string> {
  const n = name.toLowerCase();
  return Object.fromEntries(Object.entries(h).filter(([k]) => k.toLowerCase() !== n));
}
```

`services/plugins/cookieJar.ts`:

```ts
import type { NativeCookie } from "@/modules/bearoom-fetch";

const MAX_COOKIES = 300;

/**
 * One plugin's cookies (spec §5.4): plugins never share cookies with each other, with the app or with the system
 * store. In memory only — they matter for one resolve and the stream it yields.
 */
export class CookieJar {
  private cookies: NativeCookie[] = [];

  constructor(private readonly now: () => number = Date.now) {}

  store(list: NativeCookie[]): void {
    for (const raw of list) {
      const c = { ...raw, domain: raw.domain.toLowerCase().replace(/^\./, "") };
      this.cookies = this.cookies.filter((o) => !(o.name === c.name && o.domain === c.domain && o.path === c.path));
      if (c.expiresAt !== 0 && c.expiresAt <= this.now()) continue; // an expired Set-Cookie deletes
      this.cookies.push(c);
    }
    if (this.cookies.length > MAX_COOKIES) this.cookies = this.cookies.slice(-MAX_COOKIES);
  }

  /** The Cookie header for a request to `url`, or undefined. */
  header(url: string): string | undefined {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return undefined;
    }
    const host = u.hostname.toLowerCase();
    const path = u.pathname || "/";
    const now = this.now();
    const hits = this.cookies.filter(
      (c) =>
        (c.expiresAt === 0 || c.expiresAt > now) &&
        (c.hostOnly ? host === c.domain : host === c.domain || host.endsWith(`.${c.domain}`)) &&
        pathMatches(path, c.path) &&
        (!c.secure || u.protocol === "https:"),
    );
    hits.sort((a, b) => b.path.length - a.path.length); // RFC 6265 §5.4: longer paths first
    return hits.length ? hits.map((c) => `${c.name}=${c.value}`).join("; ") : undefined;
  }

  size(): number {
    return this.cookies.length;
  }
}

function pathMatches(reqPath: string, cookiePath: string): boolean {
  if (reqPath === cookiePath) return true;
  if (!reqPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith("/") || reqPath[cookiePath.length] === "/";
}
```

`services/plugins/limiter.ts`:

```ts
/**
 * Caps requests in flight per backend and overall (spec §5.4: playimdb/zevran's hostnames share one backend that
 * 429s under parallel load). A backend is approximated by its registrable domain.
 */
export class Limiter {
  private active = new Map<string, number>();
  private total = 0;
  private queue: { key: string; start: () => void }[] = [];

  constructor(private readonly perKey: number, private readonly overall: number) {}

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        this.total++;
        this.active.set(key, (this.active.get(key) ?? 0) + 1);
        task()
          .then(resolve, reject)
          .finally(() => {
            this.total--;
            this.active.set(key, (this.active.get(key) ?? 1) - 1);
            this.pump();
          });
      };
      this.queue.push({ key, start });
      this.pump();
    });
  }

  private pump(): void {
    for (let i = 0; i < this.queue.length && this.total < this.overall; ) {
      const next = this.queue[i];
      if ((this.active.get(next.key) ?? 0) < this.perKey) {
        this.queue.splice(i, 1);
        next.start();
      } else i++;
    }
  }
}

const TWO_LEVEL = new Set(["co", "com", "net", "org", "gov", "ac", "edu"]);

/** "a.b.example.co.uk" → "example.co.uk". No suffix list: good enough to group one backend's hostnames. */
export function registrableDomain(host: string): string {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (/^\d+(\.\d+){3}$/.test(h) || h.includes(":")) return h;
  const parts = h.split(".");
  if (parts.length <= 2) return h;
  const twoLevel = parts[parts.length - 1].length === 2 && TWO_LEVEL.has(parts[parts.length - 2]);
  return parts.slice(twoLevel ? -3 : -2).join(".");
}
```

`services/plugins/pluginFetch.ts`:

```ts
import { NativeFetchError, type NativeRequest, type NativeResponse } from "@/modules/bearoom-fetch";
import type { CookieJar } from "./cookieJar";
import { registrableDomain, type Limiter } from "./limiter";
import { checkUrl, cleanHeaders, hasHeader, withoutHeader } from "./urlGuard";

/**
 * A plugin's fetch (spec §5.4): walks redirects itself so every hop is re-checked (public addresses only), keeps the
 * plugin's own cookie jar, never carries credentials to another host, and routes direct TMDB calls through the app's
 * proxy (TMDB is blocked on Indian networks).
 */
export interface PluginFetchRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  redirect?: "follow" | "manual" | "error";
  responseType?: "text" | "base64";
}

export interface PluginFetchResponse {
  status: number;
  url: string;
  redirected: boolean;
  headers: Record<string, string>;
  body: string;
  encoding: "text" | "base64";
  sha256: string;
}

export type PluginFetchErrorCode = "blocked" | "timeout" | "network" | "too-large" | "redirects" | "bad-request";

export class PluginFetchError extends Error {
  code: PluginFetchErrorCode;
  constructor(code: PluginFetchErrorCode, message: string) {
    super(message);
    this.name = "PluginFetchError";
    this.code = code;
  }
}

export interface PluginFetchDeps {
  fetchOnce: (req: NativeRequest) => Promise<NativeResponse>;
  limiter: Limiter;
  /** The app's TMDB proxy, e.g. "https://tmdb.example.workers.dev/". */
  tmdbProxyBase: string;
}

export const MAX_HOPS = 5;
export const REQUEST_TIMEOUT_MS = 8000;
export const MAX_BODY_BYTES = 20 * 1024 * 1024;
const TMDB_API_HOST = "api.themoviedb.org";
const METHODS = new Set(["GET", "POST", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"]);

const NATIVE_TO_PLUGIN: Record<NativeFetchError["code"], PluginFetchErrorCode> = {
  ERR_BLOCKED_ADDRESS: "blocked",
  ERR_TIMEOUT: "timeout",
  ERR_BAD_REQUEST: "bad-request",
  ERR_NETWORK: "network",
};

/** A direct TMDB API call goes to the proxy instead; the proxy holds the token, so `api_key` is dropped. */
export function rewriteTmdb(url: URL, proxyBase: string): URL {
  if (url.hostname !== TMDB_API_HOST) return url;
  const out = new URL(proxyBase.replace(/\/$/, "") + url.pathname.replace(/^\/3(?=\/|$)/, ""));
  url.searchParams.forEach((v, k) => {
    if (k !== "api_key") out.searchParams.append(k, v);
  });
  return out;
}

export async function pluginFetch(jar: CookieJar, req: PluginFetchRequest, deps: PluginFetchDeps): Promise<PluginFetchResponse> {
  let method = (req.method ?? "GET").toUpperCase();
  let body = req.body;
  let headers = cleanHeaders(req.headers ?? {});
  let current = req.url;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const verdict = checkUrl(current);
    if (!verdict.ok) throw new PluginFetchError("blocked", `Blocked URL (${verdict.reason})`);
    const target = rewriteTmdb(verdict.url, deps.tmdbProxyBase).toString();
    const send = { ...headers };
    if (!hasHeader(send, "cookie")) {
      const fromJar = jar.header(target);
      if (fromJar) send.Cookie = fromJar;
    }
    let res: NativeResponse;
    try {
      res = await deps.limiter.run(registrableDomain(new URL(target).hostname), () =>
        deps.fetchOnce({
          url: target,
          method,
          headers: send,
          body,
          timeoutMs: REQUEST_TIMEOUT_MS,
          maxBytes: MAX_BODY_BYTES,
          responseType: req.responseType ?? "text",
        }),
      );
    } catch (e) {
      if (e instanceof NativeFetchError) throw new PluginFetchError(NATIVE_TO_PLUGIN[e.code], e.message);
      throw new PluginFetchError("network", (e as Error)?.message ?? "fetch failed");
    }
    if (res.truncated) throw new PluginFetchError("too-large", "Response over 20 MiB");
    jar.store(res.cookies);
    const location = res.headers.location;
    const isRedirect = res.status >= 300 && res.status < 400 && res.status !== 304 && !!location;
    if (!isRedirect || req.redirect === "manual") {
      return { status: res.status, url: current, redirected: hop > 0, headers: res.headers, body: res.body, encoding: res.encoding, sha256: res.sha256 };
    }
    if (req.redirect === "error") throw new PluginFetchError("redirects", "Redirect not allowed");
    const next = new URL(location, current).toString();
    // 303 → GET; 301/302 after POST → GET (what browsers do); 307/308 keep the method and body.
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) {
      method = "GET";
      body = undefined;
      headers = withoutHeader(headers, "content-type");
    }
    if (new URL(next).hostname !== new URL(current).hostname) {
      headers = withoutHeader(withoutHeader(headers, "authorization"), "cookie");
    }
    current = next;
  }
  throw new PluginFetchError("redirects", "Too many redirects");
}

/** What a sandbox worker sent, checked field by field (it is untrusted). */
export function toPluginFetchRequest(v: unknown): PluginFetchRequest {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  if (typeof o.url !== "string" || o.url.length > 8192) throw new PluginFetchError("bad-request", "Bad URL");
  const method = typeof o.method === "string" ? o.method.toUpperCase() : "GET";
  if (!METHODS.has(method)) throw new PluginFetchError("bad-request", `Method ${method} not allowed`);
  const headers: Record<string, string> = {};
  if (o.headers && typeof o.headers === "object") {
    for (const [k, val] of Object.entries(o.headers as Record<string, unknown>)) if (typeof val === "string") headers[k] = val;
  }
  return {
    url: o.url,
    method,
    headers,
    body: typeof o.body === "string" ? o.body : undefined,
    redirect: o.redirect === "manual" || o.redirect === "error" ? o.redirect : "follow",
    responseType: o.responseType === "base64" ? "base64" : "text",
  };
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx jest services/plugins/urlGuard services/plugins/cookieJar services/plugins/limiter services/plugins/pluginFetch`
Expected: PASS (4 suites).

- [ ] **Step 5: Commit**

```bash
git add services/plugins/urlGuard.ts services/plugins/urlGuard.test.ts services/plugins/cookieJar.ts services/plugins/cookieJar.test.ts services/plugins/limiter.ts services/plugins/limiter.test.ts services/plugins/pluginFetch.ts services/plugins/pluginFetch.test.ts
git commit -m "feat(plugins): plugin fetch — per-hop URL guard, cookie jars, backend limiter, TMDB via proxy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Sandbox page — worker runtime, document runtime, build step

**Files:**
- Create: `services/plugins/sandbox/protocol.ts`
- Create: `services/plugins/sandbox/workerCore.ts`, `services/plugins/sandbox/workerCore.test.ts`
- Create: `services/plugins/sandbox/workerEntry.ts`, `services/plugins/sandbox/documentEntry.ts`
- Create: `scripts/sandbox-inputs.js`, `scripts/build-sandbox.mjs`
- Create (generated): `services/plugins/sandbox/runtime.generated.ts`
- Create: `services/plugins/sandbox/runtime.test.ts`
- Modify: `package.json` (devDependencies `esbuild@0.28.2`, `cheerio@1.2.0`, `crypto-js@4.2.0`; script `build:sandbox`)

**Interfaces:**
- Produces (`services/plugins/sandbox/protocol.ts`):

```ts
export const SANDBOX_PROTOCOL = 1;
export const MAX_RESULT_CHARS = 4 * 1024 * 1024;
export interface RunEnv { tmdbApiKey: string; settings: Record<string, unknown>; debug: boolean }
export interface FetchResultPayload { status: number; url: string; redirected: boolean; headers: Record<string, string>; body: string; encoding: "text" | "base64" }
export type HostFrame =
  | { t: "load"; key: string; source: string }
  | { t: "run"; id: string; key: string; args: unknown[]; env: RunEnv }
  | { t: "fetchResult"; id: string; reqId: number; ok: true; res: FetchResultPayload }
  | { t: "fetchResult"; id: string; reqId: number; ok: false; error: string; code: string }
  | { t: "kill"; id: string };
export type DocFrame =
  | { t: "ready"; protocol: number; csp: boolean }
  | { t: "fetch"; id: string; reqId: number; req: unknown }
  | { t: "done"; id: string; ok: true; result: unknown; ms: number }
  | { t: "done"; id: string; ok: false; error: string; ms: number }
  | { t: "log"; id: string; level: "log" | "warn" | "error"; msg: string };
```

- Produces (`services/plugins/sandbox/runtime.generated.ts`): `SANDBOX_HTML: string`, `SANDBOX_INPUT_HASH: string`.
- Produces (`workerCore.ts`, used by the Open Movies test in Task 9):
  `runPlugin(source: string, args: unknown[], env: RunEnv, io: WorkerIo, libs: Libs, scope?: Record<string, unknown>): Promise<unknown>`,
  with `WorkerIo = { fetch(req: ShimRequest): Promise<FetchResultPayload>; log(level, msg): void }` and
  `ShimRequest = { url; method; headers: Record<string, string>; body?: string; redirect: "follow" | "manual" | "error"; responseType: "text" }`.

- [ ] **Step 1: Add the build-only dependencies**

Run: `npm i -D esbuild@0.28.2 cheerio@1.2.0 crypto-js@4.2.0` and add `"build:sandbox": "node scripts/build-sandbox.mjs"` to `scripts` in `package.json`.
Expected: install succeeds; `node -p "require('esbuild/package.json').version"` prints `0.28.2`.

- [ ] **Step 2: Write the failing worker-core test** — `services/plugins/sandbox/workerCore.test.ts`

```ts
import { makeResponse, runPlugin, serialiseResult, ShimHeaders, type WorkerIo } from "./workerCore";

const ENV = { tmdbApiKey: "bearoom-proxy", settings: { a: 1 }, debug: false };
const LIBS = { cheerio: { load: () => "cheerio" }, CryptoJS: { MD5: () => "md5" } };

function io(over: Partial<WorkerIo> = {}) {
  const logs: string[] = [];
  const base: WorkerIo = {
    fetch: jest.fn(async () => ({
      status: 200,
      url: "https://x.test/",
      redirected: false,
      headers: { "content-type": "application/json" },
      body: '{"a":1}',
      encoding: "text" as const,
    })),
    log: (level, msg) => logs.push(`${level}:${msg}`),
  };
  return Object.assign(base, over, { logs });
}

const run = (source: string, args: unknown[] = ["550", "movie", null, null], i = io(), env = ENV, scope: Record<string, unknown> = {}) =>
  runPlugin(source, args, env, i, LIBS, scope);

describe("runPlugin", () => {
  it("calls module.exports.getStreams with the Nuvio arguments", async () => {
    await expect(run("module.exports = { getStreams: async (id, type, s, e) => [id, type, s, e] };", ["1396", "tv", 1, 2])).resolves.toEqual(["1396", "tv", 1, 2]);
  });

  it("accepts exports.getStreams and a bare top-level function", async () => {
    await expect(run("exports.getStreams = () => 'a';")).resolves.toBe("a");
    await expect(run("async function getStreams() { return 'b'; }")).resolves.toBe("b");
  });

  it("gives plugins the globals Nuvio plugins read bare, and puts them on the worker scope", async () => {
    const scope: Record<string, unknown> = {};
    await expect(
      run("module.exports.getStreams = () => [TMDB_API_KEY, SCRAPER_SETTINGS.a, CryptoJS.MD5(), cheerio.load()];", undefined, io(), ENV, scope),
    ).resolves.toEqual(["bearoom-proxy", 1, "md5", "cheerio"]);
    expect(scope.TMDB_API_KEY).toBe("bearoom-proxy");
    expect(typeof scope.fetch).toBe("function");
  });

  it("resolves cheerio (and its RN aliases) and crypto-js, and nothing else", async () => {
    await expect(
      run(
        "const a = require('cheerio'), b = require('react-native-cheerio'), c = require('cheerio-without-node-native'), k = require('crypto-js');" +
          "module.exports.getStreams = () => [a.load(), b.load(), c.load(), k.MD5()];",
      ),
    ).resolves.toEqual(["cheerio", "cheerio", "cheerio", "md5"]);
    await expect(run("require('fs'); module.exports.getStreams = () => 1;")).rejects.toThrow("Cannot find module 'fs'");
  });

  it("fails when the plugin has no getStreams", async () => {
    await expect(run("module.exports = {};")).rejects.toThrow("no getStreams");
  });

  it("keeps console silent unless debugging, then forwards", async () => {
    const quiet = io();
    await run("module.exports.getStreams = () => { console.log('hi', { a: 1 }); return 1; };", undefined, quiet);
    expect(quiet.logs).toEqual([]);
    const loud = io();
    await run("module.exports.getStreams = () => { console.warn('hi', { a: 1 }); return 1; };", undefined, loud, { ...ENV, debug: true });
    expect(loud.logs).toEqual(['warn:hi {"a":1}']);
  });
});

describe("the fetch shim", () => {
  it("sends method, headers and body, and answers like a Response", async () => {
    const i = io();
    const out = await run(
      `module.exports.getStreams = async () => {
         const r = await fetch("https://api.test/x", { method: "post", headers: { "X-A": "1" }, body: "q=1" });
         return [r.ok, r.status, r.headers.get("Content-Type"), await r.json()];
       };`,
      undefined,
      i,
    );
    expect(out).toEqual([true, 200, "application/json", { a: 1 }]);
    expect(i.fetch).toHaveBeenCalledWith({ url: "https://api.test/x", method: "POST", headers: { "X-A": "1" }, body: "q=1", redirect: "follow", responseType: "text" });
  });

  it("takes headers as pairs or a Headers-like object, and URLSearchParams bodies", async () => {
    const i = io();
    await run(
      `module.exports.getStreams = async () => {
         await fetch("https://a.test/", { headers: [["A", "1"]] });
         await fetch("https://a.test/", { method: "POST", headers: { forEach(cb) { cb("2", "B"); } }, body: new URLSearchParams({ q: "x" }) });
         await fetch("https://a.test/", { redirect: "manual" });
         return 1;
       };`,
      undefined,
      i,
    );
    const calls = (i.fetch as jest.Mock).mock.calls.map((c) => c[0]);
    expect(calls[0].headers).toEqual({ A: "1" });
    expect(calls[1]).toMatchObject({ body: "q=x", headers: { B: "2", "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" } });
    expect(calls[2].redirect).toBe("manual");
  });

  it("rejects with a TypeError when the host refuses, like a real fetch", async () => {
    const i = io({ fetch: jest.fn(async () => Promise.reject(Object.assign(new Error("Blocked URL (host)"), { code: "blocked" }))) });
    await expect(
      run(`module.exports.getStreams = () => fetch("http://10.0.0.1/").then(() => "reached", (e) => (e instanceof TypeError ? "TypeError:" + e.message : "other"));`, undefined, i),
    ).resolves.toBe("TypeError:Blocked URL (host)");
  });

  it("an aborted signal rejects with AbortError", async () => {
    await expect(
      run(`module.exports.getStreams = () => { const c = new AbortController(); c.abort(); return fetch("https://a.test/", { signal: c.signal }).catch((e) => e.name); };`),
    ).resolves.toBe("AbortError");
  });
});

describe("serialiseResult", () => {
  it("passes plain data, and fails cycles and throwing getters inside the plugin's own call", () => {
    expect(serialiseResult([{ a: 1, f: () => 1 }])).toEqual([{ a: 1 }]);
    expect(serialiseResult(undefined)).toBeNull();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => serialiseResult(cyclic)).toThrow();
    expect(() =>
      serialiseResult({
        get boom() {
          throw new Error("getter");
        },
      }),
    ).toThrow("getter");
  });
});

describe("makeResponse and ShimHeaders", () => {
  it("decodes base64 bodies for arrayBuffer", async () => {
    const r = makeResponse({ status: 206, url: "u", redirected: false, headers: {}, body: "AAEC", encoding: "base64" });
    expect(Array.from(new Uint8Array(await r.arrayBuffer()))).toEqual([0, 1, 2]);
    expect(r.ok).toBe(true);
  });

  it("ShimHeaders is case-insensitive and iterable", () => {
    const h = new ShimHeaders({ "Content-Type": "a" });
    h.append("x-y", "1");
    h.append("X-Y", "2");
    expect(h.get("content-type")).toBe("a");
    expect(h.get("x-y")).toBe("1, 2");
    expect([...h]).toEqual([["content-type", "a"], ["x-y", "1, 2"]]);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx jest services/plugins/sandbox/workerCore`
Expected: FAIL — `Cannot find module './workerCore'`.

- [ ] **Step 4: Implement the protocol and worker core**

`services/plugins/sandbox/protocol.ts` — exactly the **Interfaces** block above, with this file comment on top:

```ts
/** Frames between the app (host), the sandbox page (document) and its per-call workers. JSON only. */
```

`services/plugins/sandbox/workerCore.ts`:

```ts
/**
 * Runs inside a fresh Web Worker per plugin call (spec §5.4). It touches nothing but what it is given, so jest can run
 * it with fakes; the worker entry wires `io` to postMessage and passes the worker global as `scope`.
 */
import type { FetchResultPayload, RunEnv } from "./protocol";

export interface ShimRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  redirect: "follow" | "manual" | "error";
  responseType: "text";
}

export interface WorkerIo {
  fetch(req: ShimRequest): Promise<FetchResultPayload>;
  log(level: "log" | "warn" | "error", msg: string): void;
}

export interface Libs {
  cheerio: unknown;
  CryptoJS: unknown;
}

export class ShimHeaders {
  private map = new Map<string, string>();

  constructor(init?: Record<string, string>) {
    if (init) for (const [k, v] of Object.entries(init)) this.map.set(k.toLowerCase(), String(v));
  }
  get(name: string): string | null {
    return this.map.get(String(name).toLowerCase()) ?? null;
  }
  has(name: string): boolean {
    return this.map.has(String(name).toLowerCase());
  }
  set(name: string, value: string): void {
    this.map.set(String(name).toLowerCase(), String(value));
  }
  append(name: string, value: string): void {
    const k = String(name).toLowerCase();
    const prev = this.map.get(k);
    this.map.set(k, prev != null ? `${prev}, ${value}` : String(value));
  }
  delete(name: string): void {
    this.map.delete(String(name).toLowerCase());
  }
  forEach(cb: (value: string, key: string) => void): void {
    this.map.forEach((v, k) => cb(v, k));
  }
  entries() {
    return this.map.entries();
  }
  keys() {
    return this.map.keys();
  }
  values() {
    return this.map.values();
  }
  [Symbol.iterator]() {
    return this.map.entries();
  }
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buf = 0;
  let bits = 0;
  let j = 0;
  for (const ch of clean) {
    buf = (buf << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (buf >> bits) & 0xff;
    }
  }
  return out.subarray(0, j);
}

function utf8Bytes(s: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s);
  return Uint8Array.from(unescape(encodeURIComponent(s)), (c) => c.charCodeAt(0));
}

function utf8Text(b: Uint8Array): string {
  if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(b);
  return decodeURIComponent(escape(String.fromCharCode(...b)));
}

export function makeResponse(p: FetchResultPayload) {
  const bytes = () => (p.encoding === "base64" ? base64ToBytes(p.body) : utf8Bytes(p.body));
  const text = () => (p.encoding === "base64" ? utf8Text(base64ToBytes(p.body)) : p.body);
  return {
    ok: p.status >= 200 && p.status < 300,
    status: p.status,
    statusText: "",
    url: p.url,
    redirected: p.redirected,
    type: "basic" as const,
    bodyUsed: false,
    headers: new ShimHeaders(p.headers),
    text: async () => text(),
    json: async () => JSON.parse(text()) as unknown,
    arrayBuffer: async () => {
      const b = bytes();
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    },
    clone: () => makeResponse(p),
  };
}

function headerRecord(init: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!init) return out;
  if (Array.isArray(init)) {
    for (const pair of init) if (Array.isArray(pair) && pair.length >= 2) out[String(pair[0])] = String(pair[1]);
    return out;
  }
  if (typeof (init as { forEach?: unknown }).forEach === "function") {
    (init as { forEach(cb: (v: unknown, k: string) => void): void }).forEach((v, k) => {
      out[k] = String(v);
    });
    return out;
  }
  if (typeof init === "object") {
    for (const [k, v] of Object.entries(init as Record<string, unknown>)) if (v != null) out[k] = String(v);
  }
  return out;
}

const abortError = () => Object.assign(new Error("The operation was aborted."), { name: "AbortError" });

export function makeFetch(io: WorkerIo) {
  return function fetch(input: unknown, init: Record<string, unknown> = {}): Promise<ReturnType<typeof makeResponse>> {
    const asRequest = input as { url?: unknown; headers?: unknown };
    const url = typeof input === "string" ? input : typeof asRequest?.url === "string" ? asRequest.url : String(input);
    const headers = headerRecord(init.headers ?? asRequest?.headers);
    let body: string | undefined;
    if (init.body != null) {
      if (typeof init.body === "string") body = init.body;
      else if (typeof URLSearchParams !== "undefined" && init.body instanceof URLSearchParams) {
        body = init.body.toString();
        if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) {
          headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
        }
      } else return Promise.reject(new TypeError("Unsupported request body"));
    }
    const req: ShimRequest = {
      url,
      method: String(init.method ?? "GET").toUpperCase(),
      headers,
      body,
      redirect: init.redirect === "manual" || init.redirect === "error" ? init.redirect : "follow",
      responseType: "text",
    };
    const signal = init.signal as { aborted?: boolean; addEventListener?: (t: string, cb: () => void) => void } | undefined;
    if (signal?.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      signal?.addEventListener?.("abort", () => reject(abortError()));
      io.fetch(req).then(
        (p) => resolve(makeResponse(p)),
        (e: unknown) => reject(e instanceof TypeError ? e : new TypeError((e as Error)?.message ?? "fetch failed")),
      );
    });
  };
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

function makeConsole(io: WorkerIo, debug: boolean) {
  const send =
    (level: "log" | "warn" | "error") =>
    (...args: unknown[]) => {
      if (debug) io.log(level, args.map((a) => (typeof a === "string" ? a : safeJson(a))).join(" ").slice(0, 2000));
    };
  return { log: send("log"), info: send("log"), debug: send("log"), warn: send("warn"), error: send("error") };
}

/** A plugin's answer as plain JSON data; cycles, throwing getters and the like fail here, inside its own call. */
export function serialiseResult(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value ?? null)) as unknown;
}

const CHEERIO_NAMES = new Set(["cheerio", "cheerio/slim", "cheerio-without-node-native", "react-native-cheerio"]);

export async function runPlugin(
  source: string,
  args: unknown[],
  env: RunEnv,
  io: WorkerIo,
  libs: Libs,
  scope: Record<string, unknown> = {},
): Promise<unknown> {
  const fetch = makeFetch(io);
  const console = makeConsole(io, env.debug);
  const globals: Record<string, unknown> = {
    fetch,
    console,
    TMDB_API_KEY: env.tmdbApiKey,
    SCRAPER_SETTINGS: env.settings,
    CryptoJS: libs.CryptoJS,
    cheerio: libs.cheerio,
  };
  for (const [k, v] of Object.entries(globals)) {
    try {
      Object.defineProperty(scope, k, { value: v, configurable: true, writable: true });
    } catch {
      /* a frozen scope only loses the globalThis.X spelling; the bare names below still work */
    }
  }
  const require = (name: string) => {
    if (CHEERIO_NAMES.has(name)) return libs.cheerio;
    if (name === "crypto-js") return libs.CryptoJS;
    throw new Error(`Cannot find module '${name}'`);
  };
  const module = { exports: {} as Record<string, unknown> };
  const names = ["module", "exports", "require", ...Object.keys(globals)];
  const factory = new Function(...names, `${source}\n;return typeof getStreams === "function" ? getStreams : undefined;`);
  const loose: unknown = factory(module, module.exports, require, ...Object.values(globals));
  const exported = module.exports as { getStreams?: unknown; default?: { getStreams?: unknown } };
  const fn =
    typeof exported.getStreams === "function"
      ? exported.getStreams
      : typeof exported.default?.getStreams === "function"
        ? exported.default.getStreams
        : loose;
  if (typeof fn !== "function") throw new Error("Plugin has no getStreams");
  return await (fn as (...a: unknown[]) => unknown)(...args);
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx jest services/plugins/sandbox/workerCore`
Expected: PASS (13 tests).

- [ ] **Step 6: Write the worker and document entries**

`services/plugins/sandbox/workerEntry.ts`:

```ts
/**
 * The body of every per-call Worker (bundled by scripts/build-sandbox.mjs). Ambient network and storage are removed
 * before plugin code exists; the only way out is the captured `post`, which the document attributes to this call.
 */
import type { FetchResultPayload, RunEnv } from "./protocol";
import { runPlugin, serialiseResult, type ShimRequest, type WorkerIo } from "./workerCore";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const cheerio: unknown = require("cheerio/slim");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CryptoJS: unknown = require("crypto-js");

interface WorkerScope {
  postMessage(m: unknown): void;
  addEventListener(type: "message", cb: (e: { data: unknown }) => void): void;
}
const scope = globalThis as unknown as WorkerScope & Record<string, unknown>;

const post = scope.postMessage.bind(scope);
const pending = new Map<number, { resolve(p: FetchResultPayload): void; reject(e: Error): void }>();
let nextReq = 1;

const io: WorkerIo = {
  fetch: (req: ShimRequest) =>
    new Promise((resolve, reject) => {
      const reqId = nextReq++;
      pending.set(reqId, { resolve, reject });
      post({ t: "fetch", reqId, req });
    }),
  log: (level, msg) => post({ t: "log", level, msg }),
};

type Inbound =
  | { t: "fetchResult"; reqId: number; ok: true; res: FetchResultPayload }
  | { t: "fetchResult"; reqId: number; ok: false; error: string; code: string }
  | { t: "run"; source: string; args: unknown[]; env: RunEnv };

scope.addEventListener("message", (e) => {
  const m = e.data as Inbound;
  if (m?.t === "fetchResult") {
    const p = pending.get(m.reqId);
    if (!p) return;
    pending.delete(m.reqId);
    if (m.ok) p.resolve(m.res);
    else p.reject(Object.assign(new TypeError(m.error || "fetch failed"), { code: m.code }));
  } else if (m?.t === "run") {
    void execute(m.source, m.args, m.env);
  }
});

const BLOCKED = [
  "fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "Worker", "SharedWorker",
  "BroadcastChannel", "indexedDB", "caches", "WebTransport", "RTCPeerConnection", "postMessage", "close",
];
for (const name of BLOCKED) {
  try {
    Object.defineProperty(scope, name, { value: undefined, configurable: true, writable: true });
  } catch {
    /* absent in this engine */
  }
}

async function execute(source: string, args: unknown[], env: RunEnv): Promise<void> {
  const started = Date.now();
  let frame: unknown;
  try {
    const result = await runPlugin(source, args, env, io, { cheerio, CryptoJS }, scope);
    frame = { t: "done", ok: true, result: serialiseResult(result), ms: Date.now() - started };
  } catch (err) {
    frame = { t: "done", ok: false, error: String((err as Error)?.message ?? err).slice(0, 500), ms: Date.now() - started };
  }
  post(frame);
}
```

`services/plugins/sandbox/documentEntry.ts`:

```ts
/**
 * The sandbox page's only script (bundled by scripts/build-sandbox.mjs). It spawns one Worker per plugin call and
 * relays frames. A frame from a worker is attributed by which worker sent it, never by what the frame claims.
 */
import { MAX_RESULT_CHARS, SANDBOX_PROTOCOL, type HostFrame } from "./protocol";

declare const __WORKER_SOURCE__: string;

interface Page {
  ReactNativeWebView?: { postMessage(s: string): void };
  __bearoom?: (raw: string) => void;
}
const page = window as unknown as Page;

const bridge = page.ReactNativeWebView!;
const send = (m: unknown) => bridge.postMessage(JSON.stringify(m));
try {
  delete page.ReactNativeWebView; // defence in depth: plugin code runs in workers, which never see the page anyway
} catch {
  /* host object on some engines */
}

const workerUrl = URL.createObjectURL(new Blob([__WORKER_SOURCE__], { type: "text/javascript" }));
const sources = new Map<string, string>();
const workers = new Map<string, Worker>();

function finish(id: string): void {
  const w = workers.get(id);
  if (w) {
    w.terminate();
    workers.delete(id);
  }
}

function start(id: string, key: string, args: unknown[], env: unknown): void {
  const source = sources.get(key);
  if (source == null) return send({ t: "done", id, ok: false, error: "not-loaded", ms: 0 });
  let w: Worker;
  try {
    w = new Worker(workerUrl);
  } catch {
    return send({ t: "done", id, ok: false, error: "worker-failed", ms: 0 });
  }
  workers.set(id, w);
  w.onmessage = (e: MessageEvent) => {
    const f = e.data as { t?: string; reqId?: number; req?: unknown; level?: string; msg?: unknown; ok?: boolean; result?: unknown; error?: unknown; ms?: number };
    if (!f || typeof f !== "object" || !workers.has(id)) return;
    if (f.t === "fetch") send({ t: "fetch", id, reqId: f.reqId, req: f.req });
    else if (f.t === "log") send({ t: "log", id, level: f.level, msg: String(f.msg).slice(0, 2000) });
    else if (f.t === "done") {
      finish(id);
      let out = JSON.stringify(
        f.ok ? { t: "done", id, ok: true, result: f.result, ms: f.ms } : { t: "done", id, ok: false, error: String(f.error).slice(0, 500), ms: f.ms },
      );
      if (out.length > MAX_RESULT_CHARS) out = JSON.stringify({ t: "done", id, ok: false, error: "result-too-large", ms: f.ms });
      bridge.postMessage(out);
    }
  };
  w.onerror = (e: ErrorEvent) => {
    e.preventDefault();
    if (!workers.has(id)) return;
    finish(id);
    send({ t: "done", id, ok: false, error: `worker-error: ${String(e.message ?? "")}`.slice(0, 500), ms: 0 });
  };
  w.postMessage({ t: "run", source, args, env });
}

page.__bearoom = (raw: string) => {
  let m: HostFrame;
  try {
    m = JSON.parse(raw) as HostFrame;
  } catch {
    return;
  }
  if (m.t === "load") sources.set(m.key, m.source);
  else if (m.t === "kill") finish(m.id);
  else if (m.t === "fetchResult") workers.get(m.id)?.postMessage(m);
  else if (m.t === "run") start(m.id, m.key, m.args, m.env);
};

/** CSP self-check: a worker's real fetch of a data: URL must be refused. If it isn't, the host refuses to run plugins. */
function cspEnforced(): Promise<boolean> {
  return new Promise((resolve) => {
    const src =
      "try{fetch('data:text/plain,x').then(function(){postMessage('open')},function(){postMessage('blocked')})}catch(e){postMessage('blocked')}";
    let w: Worker;
    try {
      w = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
    } catch {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => {
      w.terminate();
      resolve(false);
    }, 5000);
    w.onmessage = (e: MessageEvent) => {
      clearTimeout(timer);
      w.terminate();
      resolve(e.data === "blocked");
    };
  });
}

void cspEnforced().then((csp) => send({ t: "ready", protocol: SANDBOX_PROTOCOL, csp }));
```

- [ ] **Step 7: Write the build step**

`scripts/sandbox-inputs.js`:

```js
/** What the sandbox page is built from — shared by scripts/build-sandbox.mjs and the freshness test. */
const { createHash } = require("crypto");
const { readFileSync } = require("fs");
const { join } = require("path");

const ROOT = join(__dirname, "..");
const SANDBOX_DIR = join(ROOT, "services/plugins/sandbox");
const INPUTS = ["protocol.ts", "workerCore.ts", "workerEntry.ts", "documentEntry.ts"];
const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' blob:",
  "worker-src blob:",
  "child-src blob:",
  "connect-src 'none'",
  "img-src 'none'",
  "style-src 'none'",
  "font-src 'none'",
  "media-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function inputHash() {
  const h = createHash("sha256");
  for (const f of INPUTS) h.update(f).update("\0").update(readFileSync(join(SANDBOX_DIR, f))).update("\0");
  for (const p of ["cheerio", "crypto-js", "esbuild"]) {
    h.update(`${p}@${require(join(ROOT, "node_modules", p, "package.json")).version}\0`);
  }
  h.update(CSP).update("\0").update(readFileSync(join(ROOT, "scripts/build-sandbox.mjs")));
  return h.digest("hex");
}

module.exports = { ROOT, SANDBOX_DIR, INPUTS, CSP, inputHash };
```

`scripts/build-sandbox.mjs`:

```js
// Builds the plugin sandbox page (spec §5.4) into services/plugins/sandbox/runtime.generated.ts.
// Re-run after changing anything under services/plugins/sandbox/ — a jest test fails while the output is stale.
import { build } from "esbuild";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { SANDBOX_DIR, CSP, inputHash } = require("./sandbox-inputs.js");

const common = { bundle: true, format: "iife", target: "es2019", minify: true, write: false, legalComments: "none", logLevel: "warning" };
const worker = (await build({ ...common, entryPoints: [join(SANDBOX_DIR, "workerEntry.ts")] })).outputFiles[0].text;
let doc = (await build({ ...common, entryPoints: [join(SANDBOX_DIR, "documentEntry.ts")], define: { __WORKER_SOURCE__: JSON.stringify(worker) } }))
  .outputFiles[0].text;
// The worker source sits inside a string literal, where "<\/script" means the same as "</script".
doc = doc.replace(/<\/script/gi, "<\\/script");
const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"></head><body><script>${doc}</script></body></html>`;
const out =
  "// GENERATED by scripts/build-sandbox.mjs from services/plugins/sandbox/*.ts — do not edit; re-run `npm run build:sandbox`.\n" +
  "/* eslint-disable */\n" +
  `export const SANDBOX_HTML = ${JSON.stringify(html)};\n` +
  `export const SANDBOX_INPUT_HASH = "${inputHash()}";\n`;
writeFileSync(join(SANDBOX_DIR, "runtime.generated.ts"), out);
console.log(`sandbox page: ${(html.length / 1024).toFixed(0)} KB`);
```

- [ ] **Step 8: Write the failing freshness test** — `services/plugins/sandbox/runtime.test.ts`

```ts
import { SANDBOX_HTML, SANDBOX_INPUT_HASH } from "./runtime.generated";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CSP, inputHash } = require("../../../scripts/sandbox-inputs.js") as { CSP: string; inputHash(): string };

describe("sandbox page", () => {
  it("is built from the current sources (run: npm run build:sandbox)", () => {
    expect(SANDBOX_INPUT_HASH).toBe(inputHash());
  });

  it("forbids all direct network and carries the bundled libraries", () => {
    expect(CSP).toContain("connect-src 'none'");
    expect(CSP).toContain("default-src 'none'");
    expect(SANDBOX_HTML).toContain(`content="${CSP}"`);
    expect(SANDBOX_HTML.length).toBeGreaterThan(100_000); // cheerio + crypto-js are inside
    expect(SANDBOX_HTML.length).toBeLessThan(1_000_000);
  });
});
```

Run: `npx jest services/plugins/sandbox/runtime`
Expected: FAIL — `Cannot find module './runtime.generated'`.

- [ ] **Step 9: Build and verify**

Run: `npm run build:sandbox && npx jest services/plugins/sandbox && npx tsc --noEmit`
Expected: `sandbox page: ~280 KB`; both sandbox suites PASS; tsc prints nothing.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json scripts/sandbox-inputs.js scripts/build-sandbox.mjs services/plugins/sandbox
git commit -m "feat(plugins): sandbox page — per-call workers, no ambient network, CSP self-check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Sandbox bridge (host side) and the hidden `PluginSandbox` WebView

**Files:**
- Create: `services/plugins/sandboxBridge.ts`, `services/plugins/sandboxBridge.test.ts`
- Create: `components/plugins/PluginSandbox.tsx`, `components/plugins/PluginSandbox.test.tsx`

**Interfaces:**
- Consumes: `HostFrame`, `DocFrame`, `RunEnv`, `FetchResultPayload`, `SANDBOX_PROTOCOL` (Task 4); `SANDBOX_HTML` (Task 4).
- Produces:
  - `class SandboxError extends Error { code: "timeout" | "not-ready" | "crashed" | "plugin" | "unsafe" }`
  - `interface SandboxPlugin { key: string; source: string }`, `interface SandboxState { attached: boolean; ready: boolean; csp: boolean; generation: number; running: number }`
  - `class SandboxBridge`:
    - `constructor(deps: { onFetch(pluginKey: string, req: unknown): Promise<FetchResultPayload>; onLog?(pluginKey: string, level: string, msg: string): void })`
    - lifecycle: `attach(inject: (js: string) => void): void`, `detach(): void`, `crashed(): void`, `setRestartHandler(fn: () => void): void`
    - traffic: `onMessage(raw: string): void`, `run(plugin: SandboxPlugin, args: unknown[], env: RunEnv, timeoutMs: number): Promise<unknown>`
    - state: `subscribe(fn): () => void`, `getState(): SandboxState`
  - `frameScript(frame: HostFrame): string`; constants `READY_TIMEOUT_MS = 15_000`, `RESTART_AFTER_TIMEOUTS = 3`
  - `PluginSandbox({ bridge })` (default export), `SANDBOX_ORIGIN = "https://plugin-sandbox.invalid/"`

- [ ] **Step 1: Write the failing bridge test** — `services/plugins/sandboxBridge.test.ts`

```ts
import type { HostFrame } from "./sandbox/protocol";
import { frameScript, READY_TIMEOUT_MS, RESTART_AFTER_TIMEOUTS, SandboxBridge } from "./sandboxBridge";

const ENV = { tmdbApiKey: "k", settings: {}, debug: false };
const PLUGIN = { key: "r/p@abc", source: "module.exports = { getStreams: () => [] };" };

/** What the bridge injected, decoded back into frames. */
function framesOf(inject: jest.Mock): HostFrame[] {
  return inject.mock.calls.map(([js]: [string]) => {
    const m = /^window\.__bearoom&&window\.__bearoom\(([\s\S]*)\);true;$/.exec(js);
    if (!m) throw new Error(`unexpected script ${js}`);
    return JSON.parse(JSON.parse(m[1])) as HostFrame;
  });
}
const runIds = (inject: jest.Mock) => framesOf(inject).flatMap((f) => (f.t === "run" ? [f.id] : []));

function setup(onFetch: jest.Mock = jest.fn()) {
  const bridge = new SandboxBridge({ onFetch });
  const inject = jest.fn();
  const restart = jest.fn();
  bridge.setRestartHandler(restart);
  bridge.attach(inject);
  const ready = (csp = true) => bridge.onMessage(JSON.stringify({ t: "ready", protocol: 1, csp }));
  const done = (id: string, frame: object) => bridge.onMessage(JSON.stringify({ t: "done", id, ms: 1, ...frame }));
  return { bridge, inject, restart, ready, done, onFetch };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("SandboxBridge", () => {
  it("waits for the page, loads a plugin once per page, and runs it", async () => {
    const { bridge, inject, ready, done } = setup();
    const first = bridge.run(PLUGIN, ["550", "movie", null, null], ENV, 1000);
    await jest.advanceTimersByTimeAsync(0);
    expect(inject).not.toHaveBeenCalled();
    ready();
    await jest.advanceTimersByTimeAsync(0);
    expect(framesOf(inject).map((f) => f.t)).toEqual(["load", "run"]);
    done(runIds(inject)[0], { ok: true, result: [1] });
    await expect(first).resolves.toEqual([1]);
    const second = bridge.run(PLUGIN, [], ENV, 1000);
    await jest.advanceTimersByTimeAsync(0);
    expect(framesOf(inject).map((f) => f.t)).toEqual(["load", "run", "run"]);
    done(runIds(inject)[1], { ok: true, result: [] });
    await second;
  });

  it("loads plugin sources again on a new page", async () => {
    const { bridge, ready, done } = setup();
    ready();
    const p = bridge.run(PLUGIN, [], ENV, 1000);
    await jest.advanceTimersByTimeAsync(0);
    const next = jest.fn();
    bridge.attach(next);
    await expect(p).rejects.toMatchObject({ code: "crashed" });
    ready();
    const q = bridge.run(PLUGIN, [], ENV, 1000);
    await jest.advanceTimersByTimeAsync(0);
    expect(framesOf(next).map((f) => f.t)).toEqual(["load", "run"]);
    done(runIds(next)[0], { ok: true, result: null });
    await q;
  });

  it("refuses to run plugins when the page could not prove its CSP blocks network", async () => {
    const { bridge, inject, ready } = setup();
    ready(false);
    await expect(bridge.run(PLUGIN, [], ENV, 1000)).rejects.toMatchObject({ code: "unsafe" });
    expect(inject).not.toHaveBeenCalled();
  });

  it("answers a worker's fetch for the plugin that owns the call", async () => {
    const payload = { status: 200, url: "https://a.test/", redirected: false, headers: {}, body: "x", encoding: "text" };
    const onFetch = jest.fn().mockResolvedValueOnce(payload).mockRejectedValueOnce(Object.assign(new Error("Blocked URL (host)"), { code: "blocked" }));
    const { bridge, inject, ready, done } = setup(onFetch);
    ready();
    const p = bridge.run(PLUGIN, [], ENV, 1000);
    await jest.advanceTimersByTimeAsync(0);
    const id = runIds(inject)[0];
    bridge.onMessage(JSON.stringify({ t: "fetch", id, reqId: 7, req: { url: "https://a.test/" } }));
    bridge.onMessage(JSON.stringify({ t: "fetch", id, reqId: 8, req: { url: "http://10.0.0.1/" } }));
    await jest.advanceTimersByTimeAsync(0);
    expect(onFetch).toHaveBeenCalledWith(PLUGIN.key, { url: "https://a.test/" });
    expect(framesOf(inject).filter((f) => f.t === "fetchResult")).toEqual([
      { t: "fetchResult", id, reqId: 7, ok: true, res: payload },
      { t: "fetchResult", id, reqId: 8, ok: false, error: "Blocked URL (host)", code: "blocked" },
    ]);
    done(id, { ok: true, result: [] });
    await p;
  });

  it("ignores frames for calls it does not know", () => {
    const { bridge, onFetch, ready } = setup();
    ready();
    expect(() => bridge.onMessage(JSON.stringify({ t: "done", id: "nope", ok: true, result: 1, ms: 1 }))).not.toThrow();
    bridge.onMessage(JSON.stringify({ t: "fetch", id: "nope", reqId: 1, req: {} }));
    bridge.onMessage("not json");
    expect(onFetch).not.toHaveBeenCalled();
  });

  it("a plugin's own error rejects with code plugin", async () => {
    const { bridge, inject, ready, done } = setup();
    ready();
    const p = bridge.run(PLUGIN, [], ENV, 1000);
    await jest.advanceTimersByTimeAsync(0);
    done(runIds(inject)[0], { ok: false, error: "Plugin has no getStreams" });
    await expect(p).rejects.toMatchObject({ code: "plugin", message: "Plugin has no getStreams" });
  });

  it("kills a call past its deadline and ignores a late answer", async () => {
    const { bridge, inject, ready, done } = setup();
    ready();
    const p = bridge.run(PLUGIN, [], ENV, 1000);
    const settled = p.catch((e) => e);
    await jest.advanceTimersByTimeAsync(1000);
    expect(await settled).toMatchObject({ code: "timeout" });
    const id = runIds(inject)[0];
    expect(framesOf(inject)).toContainEqual({ t: "kill", id });
    expect(() => done(id, { ok: true, result: 1 })).not.toThrow();
  });

  it(`restarts the page after ${RESTART_AFTER_TIMEOUTS} timeouts in a row; an answer in between resets the count`, async () => {
    const { bridge, inject, restart, ready, done } = setup();
    ready();
    const a = bridge.run(PLUGIN, [], ENV, 1000).catch(() => null);
    const b = bridge.run(PLUGIN, [], ENV, 1000).catch(() => null);
    await jest.advanceTimersByTimeAsync(1000);
    await Promise.all([a, b]);
    const c = bridge.run(PLUGIN, [], ENV, 5000);
    await jest.advanceTimersByTimeAsync(0);
    done(runIds(inject)[2], { ok: true, result: 1 });
    await c;
    const d = bridge.run(PLUGIN, [], ENV, 1000).catch(() => null);
    await jest.advanceTimersByTimeAsync(1000);
    await d;
    expect(restart).not.toHaveBeenCalled();
    const e = bridge.run(PLUGIN, [], ENV, 1000).catch(() => null);
    const f = bridge.run(PLUGIN, [], ENV, 1000).catch(() => null);
    await jest.advanceTimersByTimeAsync(1000);
    await Promise.all([e, f]);
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it("fails calls when the page never becomes ready", async () => {
    const { bridge } = setup();
    const settled = bridge.run(PLUGIN, [], ENV, 1000).catch((e) => e);
    await jest.advanceTimersByTimeAsync(READY_TIMEOUT_MS);
    expect(await settled).toMatchObject({ code: "not-ready" });
  });

  it("a crashed page fails running calls and asks for a restart", async () => {
    const { bridge, restart, ready } = setup();
    ready();
    const p = bridge.run(PLUGIN, [], ENV, 1000).catch((e) => e);
    await jest.advanceTimersByTimeAsync(0);
    bridge.crashed();
    expect(await p).toMatchObject({ code: "crashed" });
    expect(restart).toHaveBeenCalledTimes(1);
    expect(bridge.getState()).toMatchObject({ attached: false, ready: false, running: 0 });
  });
});

describe("frameScript", () => {
  it("escapes line separators so the injected script always parses", () => {
    const js = frameScript({ t: "load", key: "k", source: "a\u2028b\u2029c" });
    expect(js).not.toMatch(/[\u2028\u2029]/);
    const inject = jest.fn();
    inject(js);
    expect(framesOf(inject)).toEqual([{ t: "load", key: "k", source: "a\u2028b\u2029c" }]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest services/plugins/sandboxBridge`
Expected: FAIL — `Cannot find module './sandboxBridge'`.

- [ ] **Step 3: Implement** — `services/plugins/sandboxBridge.ts`

```ts
import { SANDBOX_PROTOCOL, type DocFrame, type FetchResultPayload, type HostFrame, type RunEnv } from "./sandbox/protocol";

/**
 * The app's side of the plugin sandbox (spec §5.4): queues calls until the page is ready, loads each plugin's source
 * once per page, runs calls with a deadline, answers the workers' fetches, and recovers from a dead or stuck page.
 */
export type SandboxErrorCode = "timeout" | "not-ready" | "crashed" | "plugin" | "unsafe";

export class SandboxError extends Error {
  code: SandboxErrorCode;
  constructor(code: SandboxErrorCode, message: string) {
    super(message);
    this.name = "SandboxError";
    this.code = code;
  }
}

export interface SandboxPlugin {
  key: string;
  source: string;
}

export interface SandboxState {
  attached: boolean;
  ready: boolean;
  csp: boolean;
  generation: number;
  running: number;
}

export interface BridgeDeps {
  onFetch(pluginKey: string, req: unknown): Promise<FetchResultPayload>;
  onLog?(pluginKey: string, level: string, msg: string): void;
}

export const READY_TIMEOUT_MS = 15_000;
export const RESTART_AFTER_TIMEOUTS = 3;

/** A frame as a script for WebView.injectJavaScript (U+2028/2029 escaped so the literal always parses). */
export function frameScript(frame: HostFrame): string {
  const literal = JSON.stringify(JSON.stringify(frame)).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return `window.__bearoom&&window.__bearoom(${literal});true;`;
}

interface Call {
  pluginKey: string;
  resolve(v: unknown): void;
  reject(e: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

interface Waiter {
  resolve(): void;
  reject(e: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

export class SandboxBridge {
  private inject: ((js: string) => void) | null = null;
  private ready = false;
  private csp = false;
  private generation = 0;
  private loaded = new Set<string>();
  private calls = new Map<string, Call>();
  private waiters = new Set<Waiter>();
  private seq = 0;
  private timeoutsInARow = 0;
  private restart: () => void = () => {};
  private listeners = new Set<() => void>();
  private snapshot: SandboxState = { attached: false, ready: false, csp: false, generation: 0, running: 0 };

  constructor(private readonly deps: BridgeDeps) {}

  setRestartHandler(fn: () => void): void {
    this.restart = fn;
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getState = (): SandboxState => this.snapshot;

  /** A freshly mounted page; it announces `ready` when its CSP check is done. */
  attach(inject: (js: string) => void): void {
    this.inject = inject;
    this.ready = false;
    this.csp = false;
    this.loaded.clear();
    this.generation++;
    this.failCalls("crashed", "The sandbox page was replaced");
    this.emit();
  }

  detach(): void {
    this.inject = null;
    this.ready = false;
    this.loaded.clear();
    this.failCalls("crashed", "The sandbox went away");
    this.emit();
  }

  /** The page's process died (Android renderer gone / iOS content process terminated): drop it and mount a new one. */
  crashed(): void {
    this.detach();
    this.restart();
  }

  onMessage(raw: string): void {
    let m: DocFrame;
    try {
      m = JSON.parse(raw) as DocFrame;
    } catch {
      return;
    }
    if (m.t === "ready") {
      this.ready = m.protocol === SANDBOX_PROTOCOL;
      this.csp = m.csp === true;
      if (this.ready) {
        for (const w of this.waiters) {
          clearTimeout(w.timer);
          w.resolve();
        }
        this.waiters.clear();
      }
      this.emit();
      return;
    }
    const call = this.calls.get(m.id);
    if (!call) return;
    if (m.t === "fetch") {
      const { id, reqId } = m;
      this.deps.onFetch(call.pluginKey, m.req).then(
        (res) => this.send({ t: "fetchResult", id, reqId, ok: true, res }),
        (e: Error & { code?: string }) =>
          this.send({ t: "fetchResult", id, reqId, ok: false, error: e?.message ?? "fetch failed", code: e?.code ?? "network" }),
      );
    } else if (m.t === "log") {
      this.deps.onLog?.(call.pluginKey, m.level, m.msg);
    } else if (m.t === "done") {
      this.calls.delete(m.id);
      clearTimeout(call.timer);
      this.timeoutsInARow = 0;
      if (m.ok) call.resolve(m.result);
      else call.reject(new SandboxError("plugin", m.error));
      this.emit();
    }
  }

  async run(plugin: SandboxPlugin, args: unknown[], env: RunEnv, timeoutMs: number): Promise<unknown> {
    await this.whenReady();
    if (!this.csp) throw new SandboxError("unsafe", "The sandbox does not block direct network; refusing to run plugins");
    if (!this.loaded.has(plugin.key)) {
      this.send({ t: "load", key: plugin.key, source: plugin.source });
      this.loaded.add(plugin.key);
    }
    const id = `c${++this.seq}`;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => this.expire(id), timeoutMs);
      this.calls.set(id, { pluginKey: plugin.key, resolve, reject, timer });
      this.send({ t: "run", id, key: plugin.key, args, env });
      this.emit();
    });
  }

  private whenReady(): Promise<void> {
    if (this.ready) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          this.waiters.delete(waiter);
          reject(new SandboxError("not-ready", "The sandbox did not start"));
        }, READY_TIMEOUT_MS),
      };
      this.waiters.add(waiter);
    });
  }

  private expire(id: string): void {
    const call = this.calls.get(id);
    if (!call) return;
    this.calls.delete(id);
    this.send({ t: "kill", id });
    call.reject(new SandboxError("timeout", "The plugin took too long"));
    this.emit();
    if (++this.timeoutsInARow >= RESTART_AFTER_TIMEOUTS) {
      this.timeoutsInARow = 0;
      this.crashed();
    }
  }

  private failCalls(code: SandboxErrorCode, message: string): void {
    for (const c of this.calls.values()) {
      clearTimeout(c.timer);
      c.reject(new SandboxError(code, message));
    }
    this.calls.clear();
  }

  private send(frame: HostFrame): void {
    this.inject?.(frameScript(frame));
  }

  private emit(): void {
    this.snapshot = { attached: this.inject !== null, ready: this.ready, csp: this.csp, generation: this.generation, running: this.calls.size };
    this.listeners.forEach((l) => l());
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx jest services/plugins/sandboxBridge`
Expected: PASS (11 tests).

- [ ] **Step 5: Write the failing component test** — `components/plugins/PluginSandbox.test.tsx`

```tsx
import { SANDBOX_HTML } from "@/services/plugins/sandbox/runtime.generated";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import PluginSandbox, { SANDBOX_ORIGIN } from "./PluginSandbox";

const mockInject = jest.fn();
let mockProps: Record<string, any> = {};
let mockMounts = 0;
jest.mock("react-native-webview", () => {
  const React = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  const WebView = React.forwardRef(function MockWebView(props: Record<string, unknown>, ref: unknown) {
    mockProps = props;
    React.useImperativeHandle(ref, () => ({ injectJavaScript: mockInject }));
    React.useEffect(() => {
      mockMounts++;
    }, []);
    return React.createElement(View, { testID: "sandbox-webview" });
  });
  return { __esModule: true, default: WebView, WebView };
});

function fakeBridge() {
  let restart = () => {};
  return {
    attach: jest.fn(),
    detach: jest.fn(),
    onMessage: jest.fn(),
    crashed: jest.fn(() => restart()),
    setRestartHandler: jest.fn((fn: () => void) => {
      restart = fn;
    }),
  };
}

function render(bridge: ReturnType<typeof fakeBridge>) {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(<PluginSandbox bridge={bridge} />);
  });
  return r;
}

beforeEach(() => {
  mockMounts = 0;
  mockInject.mockReset();
});

describe("PluginSandbox", () => {
  it("connects the WebView to the bridge both ways", () => {
    const bridge = fakeBridge();
    render(bridge);
    const inject = bridge.attach.mock.calls[0][0] as (js: string) => void;
    inject("x();");
    expect(mockInject).toHaveBeenCalledWith("x();");
    mockProps.onMessage({ nativeEvent: { data: '{"t":"ready"}' } });
    expect(bridge.onMessage).toHaveBeenCalledWith('{"t":"ready"}');
  });

  it("loads only the sandbox page, with storage, cookies, files and pop-ups off", () => {
    render(fakeBridge());
    expect(mockProps.source).toEqual({ html: SANDBOX_HTML, baseUrl: SANDBOX_ORIGIN });
    expect(mockProps).toMatchObject({
      javaScriptEnabled: true,
      domStorageEnabled: false,
      cacheEnabled: false,
      incognito: true,
      thirdPartyCookiesEnabled: false,
      sharedCookiesEnabled: false,
      allowFileAccess: false,
      allowFileAccessFromFileURLs: false,
      allowUniversalAccessFromFileURLs: false,
      setSupportMultipleWindows: false,
      javaScriptCanOpenWindowsAutomatically: false,
    });
  });

  it("refuses to navigate anywhere but the sandbox page", () => {
    render(fakeBridge());
    expect(mockProps.onShouldStartLoadWithRequest({ url: SANDBOX_ORIGIN })).toBe(true);
    expect(mockProps.onShouldStartLoadWithRequest({ url: "about:blank" })).toBe(true);
    expect(mockProps.onShouldStartLoadWithRequest({ url: "https://evil.test/" })).toBe(false);
  });

  it.each(["onRenderProcessGone", "onContentProcessDidTerminate"])("mounts a fresh WebView after %s", (event) => {
    const bridge = fakeBridge();
    render(bridge);
    expect(mockMounts).toBe(1);
    act(() => mockProps[event]());
    expect(bridge.crashed).toHaveBeenCalledTimes(1);
    expect(mockMounts).toBe(2);
    expect(bridge.detach).toHaveBeenCalledTimes(1);
    expect(bridge.attach).toHaveBeenCalledTimes(2);
  });

  it("detaches when unmounted", () => {
    const bridge = fakeBridge();
    const r = render(bridge);
    act(() => r.unmount());
    expect(bridge.detach).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx jest components/plugins/PluginSandbox`
Expected: FAIL — `Cannot find module './PluginSandbox'`.

- [ ] **Step 7: Implement** — `components/plugins/PluginSandbox.tsx`

```tsx
/**
 * The one hidden WebView that runs plugin code (spec §5.4). It is invisible and untouchable, loads only the sandbox
 * page, keeps no storage or cookies, and is replaced when its process dies (spec §7 F9).
 */
import type { SandboxBridge } from "@/services/plugins/sandboxBridge";
import { SANDBOX_HTML } from "@/services/plugins/sandbox/runtime.generated";
import React, { useLayoutEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import WebView from "react-native-webview";

export const SANDBOX_ORIGIN = "https://plugin-sandbox.invalid/";

type Bridge = Pick<SandboxBridge, "attach" | "detach" | "onMessage" | "crashed" | "setRestartHandler">;

export default function PluginSandbox({ bridge }: { bridge: Bridge }) {
  const ref = useRef<WebView>(null);
  const [generation, setGeneration] = useState(0);

  // Layout effect: attached before the page can load and announce `ready`.
  useLayoutEffect(() => {
    bridge.setRestartHandler(() => setGeneration((g) => g + 1));
    bridge.attach((js) => ref.current?.injectJavaScript(js));
    return () => bridge.detach();
  }, [bridge, generation]);

  return (
    <View style={styles.host} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <WebView
        key={generation}
        ref={ref}
        source={{ html: SANDBOX_HTML, baseUrl: SANDBOX_ORIGIN }}
        onMessage={(e) => bridge.onMessage(e.nativeEvent.data)}
        onShouldStartLoadWithRequest={(r: { url: string }) => r.url === SANDBOX_ORIGIN || r.url === "about:blank"}
        onRenderProcessGone={() => bridge.crashed()}
        onContentProcessDidTerminate={() => bridge.crashed()}
        javaScriptEnabled
        domStorageEnabled={false}
        cacheEnabled={false}
        incognito
        thirdPartyCookiesEnabled={false}
        sharedCookiesEnabled={false}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        mediaPlaybackRequiresUserAction
        style={styles.web}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: -10, top: -10, width: 1, height: 1, opacity: 0, overflow: "hidden" },
  web: { width: 1, height: 1, backgroundColor: "transparent" },
});
```

- [ ] **Step 8: Run the tests and typecheck**

Run: `npx jest services/plugins/sandboxBridge components/plugins && npx tsc --noEmit`
Expected: PASS; tsc prints nothing.

- [ ] **Step 9: Commit**

```bash
git add services/plugins/sandboxBridge.ts services/plugins/sandboxBridge.test.ts components/plugins
git commit -m "feat(plugins): sandbox bridge + hidden PluginSandbox WebView (deadlines, crash recovery, CSP gate)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Registry (pinned install, last-known-good) and stream normaliser

**Files:**
- Modify: `src/types/worker.types.ts` (add `PluginRepoRow`; `AppConfig.pluginRepos?`)
- Create: `services/plugins/store.ts`
- Create: `services/plugins/registry.ts`, `services/plugins/registry.test.ts`
- Create: `services/plugins/streams.ts`, `services/plugins/streams.test.ts`

**Interfaces:**
- Consumes: `CookieJar` (Task 3), `cleanHeaders`, `hasHeader` (Task 3); `sha256Hex` (`utils/sha256.ts`, tests only).
- Produces:
  - `src/types/worker.types.ts`: `interface PluginRepoRow { id: string; manifestUrl: string; version: number; files: { path: string; sha256: string }[]; enabled: boolean; down: boolean; allowPlugins: string[] | null }`
  - `store.ts`: `interface PluginStore { get(k): string | undefined; set(k, v): void; has(k): boolean; remove(k): void; keys(): string[] }`, `mmkvPluginStore()`, `memoryPluginStore()`
  - `registry.ts`:
    - types: `type Download = (url: string) => Promise<{ status: number; body: string; sha256: string }>`, `interface RepoStatus { id: string; state: "ok" | "degraded" | "failed" | "down"; version: number | null; wanted: number; detail?: string }`, `interface LoadedPlugin { key: string; repoId: string; pluginId: string; name: string; source: string; supportedTypes: ("movie" | "tv")[]; contentLanguage: string[] }`
    - install: `installRepo(repo: PluginRepoRow, store: PluginStore, download: Download): Promise<RepoStatus>`
    - load: `loadPlugins(repo: PluginRepoRow, store: PluginStore): LoadedPlugin[]` — plugin `key` = `${repoId}/${pluginId}@${sha256.slice(0, 8)}`
    - housekeeping: `collectGarbage(store: PluginStore, keepRepoIds: string[]): void`, `readInstalled(store, id)`
    - paths: `fileUrl(manifestUrl, path): string | null`, `manifestPath(manifestUrl): string`
  - `streams.ts`:
    - `interface PluginStream { pluginKey: string; repoId: string; pluginId: string; name: string; title: string; url: string; quality?: string; headers: Record<string, string>; subtitles: { url: string; language?: string; label: string }[]; language?: string; size?: string }`
    - `normaliseStreams(plugin: { key: string; repoId: string; pluginId: string }, raw: unknown, jar: CookieJar): PluginStream[] | null`
    - `cleanText(v: unknown, max?: number): string`; `MAX_STREAMS_PER_PLUGIN = 200`

- [ ] **Step 1: Add the app-side repo type**

In `src/types/worker.types.ts`, above `AppConfig`:

```ts
/** An operator-listed plugin repo from /config (worker/src/pluginRepos.ts). Every file is pinned by sha256. */
export interface PluginRepoRow {
    id: string;
    manifestUrl: string;
    version: number;
    /** Paths relative to the manifest's folder; the manifest itself is one of them. */
    files: { path: string; sha256: string }[];
    enabled: boolean;
    /** True = unload remotely (files stay on the device). */
    down: boolean;
    /** Only these plugin ids may run; null = every enabled plugin in the manifest. */
    allowPlugins: string[] | null;
}
```

and in `AppConfig`, after `flags?`:

```ts
    /** Plugin repos to install (enabled rows only). Absent on old workers. */
    pluginRepos?: PluginRepoRow[];
```

- [ ] **Step 2: Write the failing registry test** — `services/plugins/registry.test.ts`

```ts
import type { PluginRepoRow } from "@/src/types/worker.types";
import { sha256Hex } from "@/utils/sha256";
import { collectGarbage, fileUrl, installRepo, loadPlugins, readInstalled } from "./registry";
import { memoryPluginStore } from "./store";

const BASE = "https://cdn.test/repo/abc/";
const v1: Record<string, string> = {
  "manifest.json": JSON.stringify({
    name: "Repo",
    scrapers: [
      { id: "alpha", name: "Alpha", filename: "providers/alpha.js", supportedTypes: ["movie"], enabled: true, contentLanguage: ["hi"] },
      { id: "beta", name: "Beta", filename: "providers/beta.js" },
      { id: "off", filename: "providers/off.js", enabled: false },
      { id: "unpinned", filename: "providers/unpinned.js" },
      { id: "outside", filename: "https://evil.test/x.js" },
    ],
  }),
  "providers/alpha.js": "module.exports = { getStreams: async () => [] };",
  "providers/beta.js": "module.exports = { getStreams: async () => ['b1'] };",
  "providers/off.js": "module.exports = {};",
  "providers/unpinned.js": "module.exports = {};",
};
const PINNED = ["manifest.json", "providers/alpha.js", "providers/beta.js", "providers/off.js"];

const pin = (contents: Record<string, string>, paths = PINNED) => paths.map((path) => ({ path, sha256: sha256Hex(contents[path]) }));
const repo = (over: Partial<PluginRepoRow> = {}): PluginRepoRow => ({
  id: "r",
  manifestUrl: `${BASE}manifest.json`,
  version: 1,
  files: pin(v1),
  enabled: true,
  down: false,
  allowPlugins: null,
  ...over,
});
function server(contents: Record<string, string>) {
  return jest.fn(async (url: string) => {
    const body = url.startsWith(BASE) ? contents[url.slice(BASE.length)] : undefined;
    return body == null ? { status: 404, body: "", sha256: "" } : { status: 200, body, sha256: sha256Hex(body) };
  });
}
const ids = (store: ReturnType<typeof memoryPluginStore>, row = repo()) => loadPlugins(row, store).map((p) => p.pluginId);

describe("installRepo + loadPlugins", () => {
  it("installs every pinned file and loads only the enabled, pinned plugins", async () => {
    const store = memoryPluginStore();
    await expect(installRepo(repo(), store, server(v1))).resolves.toEqual({ id: "r", state: "ok", version: 1, wanted: 1 });
    const plugins = loadPlugins(repo(), store);
    expect(plugins.map((p) => p.pluginId)).toEqual(["alpha", "beta"]);
    expect(plugins[0]).toMatchObject({
      key: `r/alpha@${sha256Hex(v1["providers/alpha.js"]).slice(0, 8)}`,
      name: "Alpha",
      source: v1["providers/alpha.js"],
      supportedTypes: ["movie"],
      contentLanguage: ["hi"],
    });
    expect(plugins[1]).toMatchObject({ name: "Beta", supportedTypes: ["movie", "tv"], contentLanguage: [] });
  });

  it("downloads nothing again for the installed version", async () => {
    const store = memoryPluginStore();
    await installRepo(repo(), store, server(v1));
    const again = server(v1);
    await expect(installRepo(repo(), store, again)).resolves.toMatchObject({ state: "ok" });
    expect(again).not.toHaveBeenCalled();
  });

  it("a hash mismatch on update keeps the last good version running", async () => {
    const store = memoryPluginStore();
    await installRepo(repo(), store, server(v1));
    const v2 = { ...v1, "providers/beta.js": "module.exports = { getStreams: async () => ['b2'] };" };
    const pinnedToSomethingElse = repo({ version: 2, files: pin(v2).map((f) => (f.path === "providers/beta.js" ? { ...f, sha256: "0".repeat(64) } : f)) });
    await expect(installRepo(pinnedToSomethingElse, store, server(v2))).resolves.toMatchObject({
      state: "degraded",
      version: 1,
      wanted: 2,
      detail: "hash mismatch for providers/beta.js",
    });
    expect(loadPlugins(pinnedToSomethingElse, store).find((p) => p.pluginId === "beta")?.source).toBe(v1["providers/beta.js"]);
  });

  it("a good update changes the plugin key, so the sandbox loads the new code", async () => {
    const store = memoryPluginStore();
    await installRepo(repo(), store, server(v1));
    const before = loadPlugins(repo(), store).find((p) => p.pluginId === "beta")!.key;
    const v2 = { ...v1, "providers/beta.js": "module.exports = { getStreams: async () => ['b2'] };" };
    await installRepo(repo({ version: 2, files: pin(v2) }), store, server(v2));
    const after = loadPlugins(repo({ version: 2, files: pin(v2) }), store).find((p) => p.pluginId === "beta")!;
    expect(after.key).not.toBe(before);
    expect(after.source).toBe(v2["providers/beta.js"]);
  });

  it("a failed first install leaves nothing to run", async () => {
    const store = memoryPluginStore();
    await expect(installRepo(repo(), store, server({}))).resolves.toMatchObject({ state: "failed", version: null, detail: "HTTP 404 for manifest.json" });
    expect(loadPlugins(repo(), store)).toEqual([]);
  });

  it("refuses a repo whose manifest is not pinned, or is not a manifest", async () => {
    const store = memoryPluginStore();
    await expect(installRepo(repo({ files: pin(v1, ["providers/alpha.js"]) }), store, server(v1))).resolves.toMatchObject({ state: "failed", detail: "manifest not pinned" });
    const junk = { ...v1, "manifest.json": "nope" };
    await expect(installRepo(repo({ files: pin(junk) }), store, server(junk))).resolves.toMatchObject({ state: "failed", detail: "manifest unreadable" });
  });

  it("down unloads a repo without downloading, and keeps its files for when it comes back", async () => {
    const store = memoryPluginStore();
    await installRepo(repo(), store, server(v1));
    const download = server(v1);
    await expect(installRepo(repo({ down: true }), store, download)).resolves.toMatchObject({ state: "down", version: 1 });
    expect(download).not.toHaveBeenCalled();
    expect(ids(store, repo({ down: true }))).toEqual([]);
    expect(ids(store)).toEqual(["alpha", "beta"]);
  });

  it("allowPlugins narrows which plugins run", async () => {
    const store = memoryPluginStore();
    await installRepo(repo(), store, server(v1));
    expect(ids(store, repo({ allowPlugins: ["beta"] }))).toEqual(["beta"]);
  });
});

describe("fileUrl", () => {
  it("keeps files inside the repo folder", () => {
    expect(fileUrl(`${BASE}manifest.json`, "providers/a.js")).toBe(`${BASE}providers/a.js`);
    expect(fileUrl(`${BASE}manifest.json`, "../x.js")).toBeNull();
    expect(fileUrl(`${BASE}manifest.json`, "https://evil.test/x.js")).toBeNull();
  });
});

describe("collectGarbage", () => {
  it("drops repos that left /config and files nothing points at", async () => {
    const store = memoryPluginStore();
    await installRepo(repo(), store, server(v1));
    const other = { "manifest.json": JSON.stringify({ scrapers: [] }), "providers/z.js": "z" };
    await installRepo(repo({ id: "r2", files: pin(other, ["manifest.json", "providers/z.js"]) }), store, server(other));
    collectGarbage(store, ["r"]);
    expect(readInstalled(store, "r2")).toBeNull();
    expect(store.has(`blob:${sha256Hex("z")}`)).toBe(false);
    expect(ids(store)).toEqual(["alpha", "beta"]);
  });
});
```

- [ ] **Step 3: Write the failing normaliser test** — `services/plugins/streams.test.ts`

```ts
import { CookieJar } from "./cookieJar";
import { MAX_STREAMS_PER_PLUGIN, normaliseStreams } from "./streams";

const P = { key: "r/p@1", repoId: "r", pluginId: "p" };
const jar = () => new CookieJar(() => 0);

describe("normaliseStreams", () => {
  it("maps a Nuvio stream and strips zero-width padding", () => {
    expect(
      normaliseStreams(
        P,
        [
          {
            name: "Vid\u200Brock • Hindi",
            title: "Jawan\n  1080p",
            url: "https://cdn.test/a.m3u8",
            quality: 1080,
            headers: { Referer: "https://r.test/" },
            language: "Hindi",
            size: "1.2 GB",
            subtitles: [{ url: "https://s.test/en.vtt", lang: "en", label: "English" }],
          },
        ],
        jar(),
      ),
    ).toEqual([
      {
        pluginKey: "r/p@1",
        repoId: "r",
        pluginId: "p",
        name: "Vidrock • Hindi",
        title: "Jawan 1080p",
        url: "https://cdn.test/a.m3u8",
        quality: "1080",
        headers: { Referer: "https://r.test/" },
        subtitles: [{ url: "https://s.test/en.vtt", language: "en", label: "English" }],
        language: "Hindi",
        size: "1.2 GB",
      },
    ]);
  });

  it("returns null when the answer is not a list", () => {
    expect(normaliseStreams(P, { streams: [] }, jar())).toBeNull();
    expect(normaliseStreams(P, null, jar())).toBeNull();
  });

  it("drops entries without a usable http(s) URL", () => {
    const out = normaliseStreams(
      P,
      [null, 5, "x", { url: "magnet:?xt=urn:btih:abc" }, { url: "javascript:alert(1)" }, { url: "file:///x" }, { url: "/relative.m3u8" }, { infoHash: "abc" }, { url: "https://ok.test/x.mp4" }],
      jar(),
    );
    expect(out?.map((s) => [s.url, s.name])).toEqual([["https://ok.test/x.mp4", "p"]]);
  });

  it(`keeps at most ${MAX_STREAMS_PER_PLUGIN} streams per plugin and cuts long strings`, () => {
    const many = Array.from({ length: 10_000 }, (_, i) => ({ url: `https://ok.test/${i}`, name: "x".repeat(10_000) }));
    const out = normaliseStreams(P, many, jar())!;
    expect(out).toHaveLength(MAX_STREAMS_PER_PLUGIN);
    expect(out[0].name).toHaveLength(200);
  });

  it("takes Stremio proxy headers and drops header injection", () => {
    const out = normaliseStreams(P, [{ url: "https://ok.test/", behaviorHints: { proxyHeaders: { request: { Origin: "https://o.test", "X-Bad": "a\r\nb" } } } }], jar());
    expect(out?.[0].headers).toEqual({ Origin: "https://o.test" });
  });

  it("attaches the plugin's jar cookies when it set no Cookie, and keeps its own", () => {
    const j = jar();
    j.store([{ name: "cf", value: "1", domain: "cdn.test", path: "/", hostOnly: false, secure: true, expiresAt: 0 }]);
    const out = normaliseStreams(P, [{ url: "https://v.cdn.test/a.mpd" }, { url: "https://v.cdn.test/b.mpd", headers: { cookie: "own=1" } }], j)!;
    expect(out[0].headers).toEqual({ Cookie: "cf=1" });
    expect(out[1].headers).toEqual({ cookie: "own=1" });
  });

  it("keeps only http(s) subtitles and labels them", () => {
    const out = normaliseStreams(P, [{ url: "https://ok.test/", subtitles: [{ url: "https://s.test/fr.srt", language: "fr" }, { url: "ftp://x" }, { url: "https://s.test/x.vtt" }] }], jar());
    expect(out?.[0].subtitles).toEqual([
      { url: "https://s.test/fr.srt", language: "fr", label: "fr" },
      { url: "https://s.test/x.vtt", language: undefined, label: "Subtitles" },
    ]);
  });
});
```

- [ ] **Step 4: Run them to verify they fail**

Run: `npx jest services/plugins/registry services/plugins/streams`
Expected: FAIL — `Cannot find module './registry'` / `'./streams'`.

- [ ] **Step 5: Implement**

`services/plugins/store.ts`:

```ts
import { createMMKV } from "react-native-mmkv";

/**
 * Where installed plugin files live (spec §5.4): content-addressed blobs (`blob:<sha256>`, written only after the hash
 * checked out) plus one pointer per repo (`repo:<id>`) naming its last good version. A separate MMKV instance, so a
 * few hundred KB of plugin code never slows the app's preferences store.
 */
export interface PluginStore {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  has(key: string): boolean;
  remove(key: string): void;
  keys(): string[];
}

export function mmkvPluginStore(): PluginStore {
  const m = createMMKV({ id: "plugins" });
  return {
    get: (k) => m.getString(k),
    set: (k, v) => m.set(k, v),
    has: (k) => m.contains(k),
    remove: (k) => {
      m.remove(k);
    },
    keys: () => m.getAllKeys(),
  };
}

export function memoryPluginStore(): PluginStore {
  const m = new Map<string, string>();
  return {
    get: (k) => m.get(k),
    set: (k, v) => {
      m.set(k, v);
    },
    has: (k) => m.has(k),
    remove: (k) => {
      m.delete(k);
    },
    keys: () => [...m.keys()],
  };
}
```

`services/plugins/registry.ts`:

```ts
import type { PluginRepoRow } from "@/src/types/worker.types";
import type { PluginStore } from "./store";

/**
 * Installs operator-listed plugin repos (spec §5.4): every file is downloaded once per content hash and checked
 * against the sha256 /config pins; the repo's pointer moves only when the whole new version checked out, so a bad
 * update leaves the last good version running (spec §7 F10). A plugin runs only from a file the operator pinned.
 */
export type Download = (url: string) => Promise<{ status: number; body: string; sha256: string }>;

export interface InstalledRepo {
  id: string;
  version: number;
  manifestUrl: string;
  /** path → sha256 */
  files: Record<string, string>;
}

export type RepoState = "ok" | "degraded" | "failed" | "down";

export interface RepoStatus {
  id: string;
  state: RepoState;
  /** The version that runs (last good), or null when none ever installed. */
  version: number | null;
  wanted: number;
  detail?: string;
}

export interface LoadedPlugin {
  /** `${repoId}/${pluginId}@${sha8}` — changes with the code, so a new version is loaded afresh. */
  key: string;
  repoId: string;
  pluginId: string;
  name: string;
  source: string;
  supportedTypes: ("movie" | "tv")[];
  contentLanguage: string[];
}

interface ManifestEntry {
  id: string;
  name?: unknown;
  filename: string;
  supportedTypes?: unknown;
  enabled?: unknown;
  contentLanguage?: unknown;
}

const MAX_FILE_CHARS = 4 * 1024 * 1024;
const repoKey = (id: string) => `repo:${id}`;
const blobKey = (sha: string) => `blob:${sha}`;
const pathOf = (url: string) => url.split(/[?#]/)[0];

export function manifestPath(manifestUrl: string): string {
  const p = pathOf(manifestUrl);
  return p.slice(p.lastIndexOf("/") + 1);
}

function baseOf(manifestUrl: string): string {
  const p = pathOf(manifestUrl);
  return p.slice(0, p.lastIndexOf("/") + 1);
}

/** A repo file's URL, or null when the path would leave the repo's folder. */
export function fileUrl(manifestUrl: string, path: string): string | null {
  const base = baseOf(manifestUrl);
  try {
    const u = new URL(path, base).toString();
    return u.startsWith(base) ? u : null;
  } catch {
    return null;
  }
}

export function readInstalled(store: PluginStore, id: string): InstalledRepo | null {
  try {
    const raw = store.get(repoKey(id));
    return raw ? (JSON.parse(raw) as InstalledRepo) : null;
  } catch {
    return null;
  }
}

function parseManifest(raw: string | undefined): ManifestEntry[] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { scrapers?: unknown };
    if (!Array.isArray(v.scrapers)) return null;
    return v.scrapers.filter(
      (s): s is ManifestEntry => !!s && typeof (s as ManifestEntry).id === "string" && typeof (s as ManifestEntry).filename === "string",
    );
  } catch {
    return null;
  }
}

function sameFiles(installed: Record<string, string>, wanted: { path: string; sha256: string }[]): boolean {
  return Object.keys(installed).length === wanted.length && wanted.every((f) => installed[f.path] === f.sha256);
}

export async function installRepo(repo: PluginRepoRow, store: PluginStore, download: Download): Promise<RepoStatus> {
  const current = readInstalled(store, repo.id);
  const base = { id: repo.id, wanted: repo.version };
  if (repo.down) return { ...base, state: "down", version: current?.version ?? null };
  if (current && current.version === repo.version && sameFiles(current.files, repo.files)) {
    return { ...base, state: "ok", version: current.version };
  }
  try {
    const manifestFile = repo.files.find((f) => f.path === manifestPath(repo.manifestUrl));
    if (!manifestFile) throw new Error("manifest not pinned");
    for (const f of repo.files) {
      if (store.has(blobKey(f.sha256))) continue; // a blob is only ever written after its hash checked out
      const url = fileUrl(repo.manifestUrl, f.path);
      if (!url) throw new Error(`${f.path} is outside the repo`);
      const res = await download(url);
      if (res.status !== 200) throw new Error(`HTTP ${res.status} for ${f.path}`);
      if (res.sha256 !== f.sha256) throw new Error(`hash mismatch for ${f.path}`);
      if (res.body.length > MAX_FILE_CHARS) throw new Error(`${f.path} is too large`);
      store.set(blobKey(f.sha256), res.body);
    }
    if (!parseManifest(store.get(blobKey(manifestFile.sha256)))) throw new Error("manifest unreadable");
    const next: InstalledRepo = {
      id: repo.id,
      version: repo.version,
      manifestUrl: repo.manifestUrl,
      files: Object.fromEntries(repo.files.map((f) => [f.path, f.sha256])),
    };
    store.set(repoKey(repo.id), JSON.stringify(next));
    return { ...base, state: "ok", version: repo.version };
  } catch (e) {
    return { ...base, state: current ? "degraded" : "failed", version: current?.version ?? null, detail: (e as Error).message };
  }
}

function typesOf(v: unknown): ("movie" | "tv")[] {
  const out = Array.isArray(v) ? v.filter((t): t is "movie" | "tv" => t === "movie" || t === "tv") : [];
  return out.length ? out : ["movie", "tv"];
}

/** The plugins this row allows from the repo's installed (last good) version. */
export function loadPlugins(repo: PluginRepoRow, store: PluginStore): LoadedPlugin[] {
  if (repo.down) return [];
  const inst = readInstalled(store, repo.id);
  if (!inst) return [];
  const manifestSha = inst.files[manifestPath(inst.manifestUrl)];
  const entries = manifestSha ? parseManifest(store.get(blobKey(manifestSha))) : null;
  if (!entries) return [];
  const base = baseOf(inst.manifestUrl);
  const out: LoadedPlugin[] = [];
  for (const s of entries) {
    if (s.enabled === false) continue;
    if (repo.allowPlugins && !repo.allowPlugins.includes(s.id)) continue;
    const url = fileUrl(inst.manifestUrl, s.filename);
    const sha = url ? inst.files[url.slice(base.length)] : undefined;
    if (!sha) continue; // in the manifest but not pinned by the operator: never runs
    const source = store.get(blobKey(sha));
    if (source == null) continue;
    out.push({
      key: `${repo.id}/${s.id}@${sha.slice(0, 8)}`,
      repoId: repo.id,
      pluginId: s.id,
      name: typeof s.name === "string" && s.name ? s.name : s.id,
      source,
      supportedTypes: typesOf(s.supportedTypes),
      contentLanguage: Array.isArray(s.contentLanguage) ? s.contentLanguage.filter((l): l is string => typeof l === "string") : [],
    });
  }
  return out;
}

/** Forget repos /config no longer lists and every blob no installed repo points at. */
export function collectGarbage(store: PluginStore, keepRepoIds: string[]): void {
  const keep = new Set(keepRepoIds);
  const live = new Set<string>();
  for (const k of store.keys()) {
    if (!k.startsWith("repo:")) continue;
    const id = k.slice("repo:".length);
    if (!keep.has(id)) {
      store.remove(k);
      continue;
    }
    const inst = readInstalled(store, id);
    if (inst) Object.values(inst.files).forEach((sha) => live.add(sha));
  }
  for (const k of store.keys()) if (k.startsWith("blob:") && !live.has(k.slice("blob:".length))) store.remove(k);
}
```

`services/plugins/streams.ts`:

```ts
import type { CookieJar } from "./cookieJar";
import { cleanHeaders, hasHeader } from "./urlGuard";

/**
 * A plugin's raw answer → streams Bearoom can hand on (spec §5.3–5.4). Plugin output is untrusted: anything that is
 * not an http(s) stream is dropped, strings are cleaned and capped, and the plugin's own jar cookies become the
 * stream's Cookie header (the Cookie-gated DASH case) unless the plugin set one.
 */
export interface PluginStreamSubtitle {
  url: string;
  language?: string;
  label: string;
}

export interface PluginStream {
  pluginKey: string;
  repoId: string;
  pluginId: string;
  /** Source line, e.g. "Vidrock • Hindi". */
  name: string;
  title: string;
  url: string;
  quality?: string;
  /** What the player must send for this stream. */
  headers: Record<string, string>;
  subtitles: PluginStreamSubtitle[];
  language?: string;
  size?: string;
}

export const MAX_STREAMS_PER_PLUGIN = 200;
const ZERO_WIDTH = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;
const HTTP = /^https?:\/\//i;

export function cleanText(v: unknown, max = 200): string {
  if (typeof v !== "string" && typeof v !== "number") return "";
  return String(v).replace(ZERO_WIDTH, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function subtitlesOf(v: unknown): PluginStreamSubtitle[] {
  if (!Array.isArray(v)) return [];
  const out: PluginStreamSubtitle[] = [];
  for (const t of v) {
    if (out.length >= 50) break;
    const sub = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
    const url = typeof sub.url === "string" ? sub.url.trim() : "";
    if (!HTTP.test(url)) continue;
    const language = cleanText(sub.lang ?? sub.language, 20) || undefined;
    out.push({ url, language, label: cleanText(sub.label ?? sub.name, 60) || language || "Subtitles" });
  }
  return out;
}

export function normaliseStreams(plugin: { key: string; repoId: string; pluginId: string }, raw: unknown, jar: CookieJar): PluginStream[] | null {
  if (!Array.isArray(raw)) return null;
  const out: PluginStream[] = [];
  for (const item of raw) {
    if (out.length >= MAX_STREAMS_PER_PLUGIN) break;
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    const url = typeof s.url === "string" ? s.url.trim() : "";
    if (!HTTP.test(url) || url.length > 8192) continue; // magnets, torrents, relative and script URLs
    const hints = s.behaviorHints as { proxyHeaders?: { request?: unknown } } | undefined;
    const headers = cleanHeaders(s.headers ?? hints?.proxyHeaders?.request);
    if (!hasHeader(headers, "cookie")) {
      const fromJar = jar.header(url);
      if (fromJar) headers.Cookie = fromJar;
    }
    out.push({
      pluginKey: plugin.key,
      repoId: plugin.repoId,
      pluginId: plugin.pluginId,
      name: cleanText(s.name) || plugin.pluginId,
      title: cleanText(s.title, 300),
      url,
      quality: cleanText(s.quality, 40) || undefined,
      headers,
      subtitles: subtitlesOf(s.subtitles),
      language: cleanText(s.language, 40) || undefined,
      size: cleanText(s.size, 40) || undefined,
    });
  }
  return out;
}
```

- [ ] **Step 6: Run them to verify they pass**

Run: `npx jest services/plugins/registry services/plugins/streams && npx tsc --noEmit`
Expected: PASS (registry 10, streams 7); tsc prints nothing.

- [ ] **Step 7: Commit**

```bash
git add src/types/worker.types.ts services/plugins/store.ts services/plugins/registry.ts services/plugins/registry.test.ts services/plugins/streams.ts services/plugins/streams.test.ts
git commit -m "feat(plugins): pinned registry with last-known-good, and a stream normaliser for untrusted output

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `PluginHost` — fan-out with the spec's budgets

**Files:**
- Create: `services/plugins/PluginHost.ts`, `services/plugins/PluginHost.test.ts`

**Interfaces:**
- Consumes: `LoadedPlugin` (Task 6), `PluginStream` (Task 6), `SandboxError.code` values (Task 5).
- Produces:
  - `interface ResolveRequest { tmdbId: string; type: "movie" | "tv"; season?: number; episode?: number }`
  - `type FailureReason = "timeout" | "error" | "bad-shape" | "empty-fast" | "unsafe" | "not-ready" | "crashed"`
  - `interface PluginFailure { pluginKey: string; reason: FailureReason; detail?: string; ms: number }`
  - `interface HostResult { streams: PluginStream[]; failures: PluginFailure[]; ran: string[]; complete: boolean }`
  - `BUDGET = { parallel: 12, perPluginMs: 15_000, overallMs: 20_000, earlyCount: 3, earlyIdleMs: 1_200, cacheMs: 900_000, emptyFastMs: 100 }`
  - `class PluginHost`:
    - `constructor(deps: { plugins(): LoadedPlugin[]; run(p, req, timeoutMs): Promise<unknown>; normalise(p, raw): PluginStream[] | null; now(): number })`
    - `getStreams(req, opts?: { onStreams?(pluginKey, streams): void }): Promise<HostResult>`
    - `clearCache(): void`
  - `titleKey(req: ResolveRequest): string`

- [ ] **Step 1: Write the failing test** — `services/plugins/PluginHost.test.ts`

```ts
import { BUDGET, PluginHost, titleKey, type ResolveRequest } from "./PluginHost";
import type { LoadedPlugin } from "./registry";
import type { PluginStream } from "./streams";

const REQ: ResolveRequest = { tmdbId: "550", type: "movie" };
const plugin = (id: string, types: ("movie" | "tv")[] = ["movie", "tv"]): LoadedPlugin => ({
  key: `r/${id}@1`,
  repoId: "r",
  pluginId: id,
  name: id,
  source: "",
  supportedTypes: types,
  contentLanguage: [],
});
const stream = (pluginKey: string, url: string): PluginStream => ({ pluginKey, repoId: "r", pluginId: pluginKey, name: url, title: "", url, headers: {}, subtitles: [] });

function harness(plugins: LoadedPlugin[]) {
  const pending = new Map<string, { resolve(v: unknown): void; reject(e: unknown): void }>();
  const run = jest.fn((p: LoadedPlugin, _req: ResolveRequest, _timeoutMs: number) => new Promise((resolve, reject) => pending.set(p.key, { resolve, reject })));
  const host = new PluginHost({
    plugins: () => plugins,
    run,
    normalise: (p, raw) => (Array.isArray(raw) ? raw.map((u) => stream(p.key, String(u))) : null),
    now: () => Date.now(),
  });
  /** Let `afterMs` pass, then the plugin answers. */
  const answer = async (id: string, value: unknown, afterMs = 200) => {
    await jest.advanceTimersByTimeAsync(afterMs);
    pending.get(`r/${id}@1`)!.resolve(value);
    await jest.advanceTimersByTimeAsync(0);
  };
  return { host, run, pending, answer };
}

beforeEach(() => jest.useFakeTimers({ now: 0 }));
afterEach(() => jest.useRealTimers());

describe("PluginHost.getStreams", () => {
  it("collects every plugin's streams and calls the run complete", async () => {
    const { host, answer } = harness([plugin("a"), plugin("b")]);
    const seen: string[] = [];
    const out = host.getStreams(REQ, { onStreams: (key, list) => seen.push(`${key}:${list.length}`) });
    await answer("a", ["u1"]);
    await answer("b", ["u2", "u3"]);
    const r = await out;
    expect(r).toMatchObject({ complete: true, failures: [], ran: ["r/a@1", "r/b@1"] });
    expect(r.streams.map((s) => s.url)).toEqual(["u1", "u2", "u3"]);
    expect(seen).toEqual(["r/a@1:1", "r/b@1:2"]);
  });

  it("runs at most 12 plugins at once, each with the per-plugin budget", async () => {
    const { host, run, answer } = harness(Array.from({ length: 15 }, (_, i) => plugin(`p${i}`)));
    void host.getStreams(REQ);
    await jest.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(BUDGET.parallel);
    expect(run.mock.calls[0][2]).toBe(BUDGET.perPluginMs);
    await answer("p0", ["x"]);
    expect(run).toHaveBeenCalledTimes(BUDGET.parallel + 1);
  });

  it("returns early at 3 streams + 1.2 s of quiet; a straggler still fills the cache", async () => {
    const { host, run, answer } = harness([plugin("a"), plugin("slow")]);
    const out = host.getStreams(REQ);
    await answer("a", ["1", "2", "3"]);
    await jest.advanceTimersByTimeAsync(BUDGET.earlyIdleMs);
    const r = await out;
    expect(r.complete).toBe(false);
    expect(r.streams).toHaveLength(3);
    await answer("slow", ["4"]);
    run.mockClear();
    const again = await host.getStreams(REQ);
    expect(run).not.toHaveBeenCalled();
    expect(again).toMatchObject({ complete: true });
    expect(again.streams.map((s) => s.url)).toEqual(["1", "2", "3", "4"]);
  });

  it("stops at the 20 s overall budget with what it has", async () => {
    const { host, answer } = harness([plugin("a"), plugin("hung")]);
    const out = host.getStreams(REQ);
    await answer("a", ["1"]);
    await jest.advanceTimersByTimeAsync(BUDGET.overallMs);
    const r = await out;
    expect(r.complete).toBe(false);
    expect(r.streams.map((s) => s.url)).toEqual(["1"]);
  });

  it("an empty answer in under 100 ms is a failure and runs again next time; a slower empty answer is a real 'none'", async () => {
    const { host, run, answer } = harness([plugin("fast"), plugin("slow")]);
    const out = host.getStreams(REQ);
    await answer("fast", [], 10);
    await answer("slow", [], 300);
    const r = await out;
    expect(r.failures).toEqual([expect.objectContaining({ pluginKey: "r/fast@1", reason: "empty-fast" })]);
    run.mockClear();
    void host.getStreams(REQ);
    await jest.advanceTimersByTimeAsync(0);
    expect(run.mock.calls.map((c) => c[0].key)).toEqual(["r/fast@1"]);
    await answer("fast", [], 200);
  });

  it("a non-list answer and thrown errors are failures, with reasons", async () => {
    const { host, pending } = harness([plugin("shape"), plugin("boom"), plugin("late")]);
    const out = host.getStreams(REQ);
    await jest.advanceTimersByTimeAsync(150);
    pending.get("r/shape@1")!.resolve({ nope: 1 });
    pending.get("r/boom@1")!.reject(new Error("kaput"));
    pending.get("r/late@1")!.reject(Object.assign(new Error("slow"), { code: "timeout" }));
    const r = await out;
    expect(r.failures.map((f) => [f.pluginKey, f.reason])).toEqual([
      ["r/shape@1", "bad-shape"],
      ["r/boom@1", "error"],
      ["r/late@1", "timeout"],
    ]);
    expect(r.complete).toBe(true);
  });

  it("caches per title for 15 minutes", async () => {
    const { host, run, answer } = harness([plugin("a")]);
    const out = host.getStreams(REQ);
    await answer("a", ["1"]);
    await out;
    await jest.advanceTimersByTimeAsync(BUDGET.cacheMs - 1000);
    await host.getStreams(REQ);
    expect(run).toHaveBeenCalledTimes(1);
    void host.getStreams({ tmdbId: "550", type: "movie", season: undefined });
    void host.getStreams({ tmdbId: "1396", type: "tv", season: 1, episode: 1 });
    await jest.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2); // another title runs; the same title is still cached
    await jest.advanceTimersByTimeAsync(2000);
    void host.getStreams(REQ);
    await jest.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("runs only plugins that support the title's type, and answers at once with none", async () => {
    const { host, run } = harness([plugin("tvonly", ["tv"])]);
    await expect(host.getStreams(REQ)).resolves.toEqual({ streams: [], failures: [], ran: [], complete: true });
    expect(run).not.toHaveBeenCalled();
  });
});

describe("titleKey", () => {
  it("tells films and episodes apart", () => {
    expect(titleKey({ tmdbId: "550", type: "movie" })).toBe("movie:550");
    expect(titleKey({ tmdbId: "1396", type: "tv", season: 1, episode: 2 })).toBe("tv:1396:1:2");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest services/plugins/PluginHost`
Expected: FAIL — `Cannot find module './PluginHost'`.

- [ ] **Step 3: Implement** — `services/plugins/PluginHost.ts`

```ts
import type { LoadedPlugin } from "./registry";
import type { PluginStream } from "./streams";

/**
 * Asks every loaded plugin for a title's streams within the spec's budgets (§5.4, Cove): ≤ 12 at once, 15 s each,
 * 20 s overall; returns early once ≥ 3 streams arrived and 1.2 s passed with nothing new. Plugins still running then
 * finish into a 15-minute per-title cache. Failures are never cached, and an empty answer in under 100 ms counts as
 * one (a silent contract break, e.g. a missing global).
 */
export interface ResolveRequest {
  tmdbId: string;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
}

export type FailureReason = "timeout" | "error" | "bad-shape" | "empty-fast" | "unsafe" | "not-ready" | "crashed";

export interface PluginFailure {
  pluginKey: string;
  reason: FailureReason;
  detail?: string;
  ms: number;
}

export interface HostResult {
  streams: PluginStream[];
  failures: PluginFailure[];
  /** Plugins started for this call (cached answers are not listed). */
  ran: string[];
  /** True when every plugin answered before the call returned. */
  complete: boolean;
}

export const BUDGET = {
  parallel: 12,
  perPluginMs: 15_000,
  overallMs: 20_000,
  earlyCount: 3,
  earlyIdleMs: 1_200,
  cacheMs: 15 * 60_000,
  emptyFastMs: 100,
} as const;

export interface HostDeps {
  plugins(): LoadedPlugin[];
  run(plugin: LoadedPlugin, req: ResolveRequest, timeoutMs: number): Promise<unknown>;
  normalise(plugin: LoadedPlugin, raw: unknown): PluginStream[] | null;
  now(): number;
}

export function titleKey(req: ResolveRequest): string {
  return req.type === "movie" ? `movie:${req.tmdbId}` : `tv:${req.tmdbId}:${req.season ?? 0}:${req.episode ?? 0}`;
}

const SANDBOX_REASONS = new Set<FailureReason>(["timeout", "unsafe", "not-ready", "crashed"]);

function reasonOf(e: unknown): FailureReason {
  const code = (e as { code?: unknown })?.code;
  return typeof code === "string" && SANDBOX_REASONS.has(code as FailureReason) ? (code as FailureReason) : "error";
}

export class PluginHost {
  private cache = new Map<string, { at: number; streams: PluginStream[] }>();

  constructor(private readonly deps: HostDeps) {}

  getStreams(req: ResolveRequest, opts: { onStreams?(pluginKey: string, streams: PluginStream[]): void } = {}): Promise<HostResult> {
    const title = titleKey(req);
    const plugins = this.deps.plugins().filter((p) => p.supportedTypes.includes(req.type));
    const streams: PluginStream[] = [];
    const failures: PluginFailure[] = [];
    const ran: string[] = [];
    return new Promise<HostResult>((resolve) => {
      let finished = false;
      let settled = 0;
      let idle: ReturnType<typeof setTimeout> | undefined;
      const finish = (complete: boolean) => {
        if (finished) return;
        finished = true;
        clearTimeout(overall);
        clearTimeout(idle);
        resolve({ streams: [...streams], failures: [...failures], ran: [...ran], complete });
      };
      const overall = setTimeout(() => finish(false), BUDGET.overallMs);
      const add = (p: LoadedPlugin, list: PluginStream[]) => {
        if (finished || !list.length) return;
        streams.push(...list);
        opts.onStreams?.(p.key, list);
        if (streams.length >= BUDGET.earlyCount) {
          clearTimeout(idle);
          idle = setTimeout(() => finish(false), BUDGET.earlyIdleMs);
        }
      };
      const settle = () => {
        if (++settled === plugins.length) finish(true);
      };
      if (!plugins.length) {
        finish(true);
        return;
      }
      const queue: LoadedPlugin[] = [];
      for (const p of plugins) {
        const hit = this.cache.get(`${title}|${p.key}`);
        if (hit && this.deps.now() - hit.at < BUDGET.cacheMs) {
          add(p, hit.streams);
          settle();
        } else queue.push(p);
      }
      let inFlight = 0;
      const pump = () => {
        while (inFlight < BUDGET.parallel && queue.length) {
          const p = queue.shift()!;
          inFlight++;
          ran.push(p.key);
          void this.runOne(p, req, title, failures, add).finally(() => {
            inFlight--;
            settle();
            pump();
          });
        }
      };
      pump();
    });
  }

  clearCache(): void {
    this.cache.clear();
  }

  private async runOne(
    p: LoadedPlugin,
    req: ResolveRequest,
    title: string,
    failures: PluginFailure[],
    add: (p: LoadedPlugin, list: PluginStream[]) => void,
  ): Promise<void> {
    const started = this.deps.now();
    try {
      const raw = await this.deps.run(p, req, BUDGET.perPluginMs);
      const ms = this.deps.now() - started;
      const list = this.deps.normalise(p, raw);
      if (list === null) {
        failures.push({ pluginKey: p.key, reason: "bad-shape", ms });
        return;
      }
      if (list.length === 0 && ms < BUDGET.emptyFastMs) {
        failures.push({ pluginKey: p.key, reason: "empty-fast", ms });
        return;
      }
      this.cache.set(`${title}|${p.key}`, { at: this.deps.now(), streams: list });
      add(p, list);
    } catch (e) {
      failures.push({ pluginKey: p.key, reason: reasonOf(e), detail: String((e as Error)?.message ?? e).slice(0, 200), ms: this.deps.now() - started });
    }
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx jest services/plugins/PluginHost`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add services/plugins/PluginHost.ts services/plugins/PluginHost.test.ts
git commit -m "feat(plugins): PluginHost fan-out with Cove budgets, early return and a per-title cache

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Wire the host into the app

**Files:**
- Create: `services/plugins/index.ts`
- Create: `services/plugins/demand.ts`, `services/plugins/demand.test.ts`
- Create: `src/features/plugins/PluginBootstrap.tsx`, `src/features/plugins/PluginBootstrap.test.tsx`
- Modify: `src/store/features/providers/providersSlice.ts` (+ `providersSlice.test.ts`), `src/store/features/providers/hooks.ts`
- Modify: `App.tsx` (mount `<PluginBootstrap />`)

**Interfaces:**
- Consumes: everything from Tasks 2–7; `API_URL` (`contexts/movieContext/movieContext.tsx`, the TMDB proxy).
- Produces:
  - `@/services/plugins`:
    - singletons: `sandboxBridge: SandboxBridge`, `pluginHost: PluginHost`
    - repos: `syncRepos(rows: PluginRepoRow[]): Promise<RepoStatus[]>`, `activePlugins(): LoadedPlugin[]`, `repoStatuses(): RepoStatus[]`, `subscribeRepos(fn): () => void`
    - helpers: `jarFor(pluginKey: string): CookieJar`, `runInSandbox(key: string, source: string, args: unknown[], timeoutMs: number): Promise<unknown>`
  - `@/services/plugins/demand`: `holdSandbox(): () => void`, `useSandboxDemand(): number`
  - `usePluginRepos(): PluginRepoRow[]` (providers hooks); `ProvidersState.pluginRepos: PluginRepoRow[]`

- [ ] **Step 1: Write the failing tests**

`services/plugins/demand.test.ts`:

```ts
import { holdSandbox, sandboxDemand } from "./demand";

describe("sandbox demand", () => {
  it("counts holders, and a release only counts once", () => {
    const a = holdSandbox();
    const b = holdSandbox();
    expect(sandboxDemand()).toBe(2);
    a();
    a();
    expect(sandboxDemand()).toBe(1);
    b();
    expect(sandboxDemand()).toBe(0);
  });
});
```

Append inside `describe("providers slice", …)` in `src/store/features/providers/providersSlice.test.ts`:

```ts
  const repo = { id: "open-movies", manifestUrl: "https://h.test/manifest.json", version: 1, files: [], enabled: true, down: false, allowPlugins: null };

  it("keeps /config's plugin repos, from the device cache too", () => {
    expect(reducer(initial(), hydrateFromCache(cfg({ pluginRepos: [repo] }))).pluginRepos).toEqual([repo]);
    expect(reduceConfig(initial(), cfg({ pluginRepos: [repo] })).pluginRepos).toEqual([repo]);
    expect(reduceConfig(initial(), cfg()).pluginRepos).toEqual([]); // an old worker without the field
  });

  it("an outage answer keeps the plugin repos it had", () => {
    const live = reduceConfig(initial(), cfg({ pluginRepos: [repo] }));
    expect(reduceConfig(live, cfg({ providers: [] })).pluginRepos).toEqual([repo]);
  });
```

`src/features/plugins/PluginBootstrap.test.tsx`:

```tsx
import { holdSandbox } from "@/services/plugins/demand";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import PluginBootstrap from "./PluginBootstrap";

const mockSync = jest.fn(async (..._repos: unknown[]) => []);
jest.mock("@/services/plugins", () => ({ sandboxBridge: { tag: "bridge" }, syncRepos: (...a: unknown[]) => mockSync(...a) }));
jest.mock("@/components/plugins/PluginSandbox", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: () => <View testID="plugin-sandbox" /> };
});
let mockFlags = { embedApiLane: false, nativeLane: false, pluginHost: false };
const mockRepos = [{ id: "open-movies" }];
jest.mock("@/src/store/features/providers/hooks", () => ({ useFeatureFlags: () => mockFlags, usePluginRepos: () => mockRepos }));
let mockAvailable = true;
jest.mock("@/modules/bearoom-fetch", () => ({
  get nativeFetchAvailable() {
    return mockAvailable;
  },
}));

const sandboxes = (r: ReactTestRenderer) => r.root.findAll((n) => typeof n.type === "string" && n.props.testID === "plugin-sandbox");
const mounted: ReactTestRenderer[] = [];
function render() {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(<PluginBootstrap />);
  });
  mounted.push(r);
  return r;
}

afterEach(() => {
  act(() => mounted.splice(0).forEach((r) => r.unmount()));
});

beforeEach(() => {
  mockSync.mockClear();
  mockFlags = { embedApiLane: false, nativeLane: false, pluginHost: false };
  mockAvailable = true;
});

describe("PluginBootstrap", () => {
  it("does nothing while the plugin-host flag is off", () => {
    expect(sandboxes(render())).toHaveLength(0);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("mounts the sandbox and installs /config's repos (the cached list offline) when the flag is on", () => {
    mockFlags = { ...mockFlags, pluginHost: true };
    expect(sandboxes(render())).toHaveLength(1);
    expect(mockSync).toHaveBeenCalledWith(mockRepos);
  });

  it("a dev screen can hold the sandbox open with the flag off, without installing anything", () => {
    const release = holdSandbox();
    const r = render();
    expect(sandboxes(r)).toHaveLength(1);
    expect(mockSync).not.toHaveBeenCalled();
    act(() => release());
    expect(sandboxes(r)).toHaveLength(0);
  });

  it("never mounts in a binary without BearoomFetch", () => {
    mockAvailable = false;
    mockFlags = { ...mockFlags, pluginHost: true };
    expect(sandboxes(render())).toHaveLength(0);
    expect(mockSync).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest services/plugins/demand src/store/features/providers src/features/plugins`
Expected: FAIL — missing `./demand`, `./PluginBootstrap`; `pluginRepos` undefined in the slice tests.

- [ ] **Step 3: Implement**

`services/plugins/demand.ts`:

```ts
import { useSyncExternalStore } from "react";

/** Lets a dev screen (the Plugin Lab) keep the sandbox mounted while the plugin-host flag is off. */
let count = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function holdSandbox(): () => void {
  count++;
  emit();
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    count--;
    emit();
  };
}

export function sandboxDemand(): number {
  return count;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useSandboxDemand(): number {
  return useSyncExternalStore(subscribe, sandboxDemand);
}
```

`services/plugins/index.ts`:

```ts
/**
 * The app's one plugin host (spec §5.4), wired to the real parts: BearoomFetch, the MMKV plugin store, the sandbox
 * bridge (PluginSandbox attaches the WebView) and the repos /config lists.
 */
import { API_URL as TMDB_PROXY_URL } from "@/contexts/movieContext/movieContext";
import { fetchOnce } from "@/modules/bearoom-fetch";
import type { PluginRepoRow } from "@/src/types/worker.types";
import { CookieJar } from "./cookieJar";
import { Limiter } from "./limiter";
import { PluginHost } from "./PluginHost";
import { pluginFetch, toPluginFetchRequest, type PluginFetchDeps } from "./pluginFetch";
import { collectGarbage, installRepo, loadPlugins, type LoadedPlugin, type RepoStatus } from "./registry";
import type { RunEnv } from "./sandbox/protocol";
import { SandboxBridge } from "./sandboxBridge";
import { mmkvPluginStore } from "./mmkvStore";
import { normaliseStreams } from "./streams";

const store = mmkvPluginStore();
const fetchDeps: PluginFetchDeps = { fetchOnce, limiter: new Limiter(2, 24), tmdbProxyBase: TMDB_PROXY_URL };
const jars = new Map<string, CookieJar>();

/** One jar per plugin (repo/plugin), shared across its versions; never shared between plugins. */
export function jarFor(pluginKey: string): CookieJar {
  const id = pluginKey.split("@")[0];
  let jar = jars.get(id);
  if (!jar) {
    jar = new CookieJar();
    jars.set(id, jar);
  }
  return jar;
}

const ENV: RunEnv = { tmdbApiKey: "bearoom-proxy", settings: {}, debug: __DEV__ };
const URLISH = /\bhttps?:\/\/\S+/gi;

export const sandboxBridge = new SandboxBridge({
  onFetch: async (pluginKey, req) => {
    const r = await pluginFetch(jarFor(pluginKey), toPluginFetchRequest(req), fetchDeps);
    return { status: r.status, url: r.url, redirected: r.redirected, headers: r.headers, body: r.body, encoding: r.encoding };
  },
  // Dev builds only, and never with a URL in it: stream URLs and tokens must not reach any log.
  onLog: __DEV__ ? (key, level, msg) => console.log(`[plugin ${key}] ${level}: ${msg.replace(URLISH, "<url>")}`) : undefined,
});

const registryJar = new CookieJar();
async function download(url: string) {
  const r = await pluginFetch(registryJar, { url }, fetchDeps);
  return { status: r.status, body: r.body, sha256: r.sha256 };
}

let rows: PluginRepoRow[] = [];
let statuses: RepoStatus[] = [];
let syncing: Promise<RepoStatus[]> = Promise.resolve([]);
const repoListeners = new Set<() => void>();

/** Install what /config lists (one repo at a time; a failure keeps the last good version), then drop the rest. */
export function syncRepos(next: PluginRepoRow[]): Promise<RepoStatus[]> {
  rows = next;
  const run = async () => {
    const out: RepoStatus[] = [];
    for (const repo of next) out.push(await installRepo(repo, store, download));
    collectGarbage(store, next.map((r) => r.id));
    statuses = out;
    repoListeners.forEach((l) => l());
    return out;
  };
  syncing = syncing.then(run, run);
  return syncing;
}

export function activePlugins(): LoadedPlugin[] {
  return rows.flatMap((r) => loadPlugins(r, store));
}

export function repoStatuses(): RepoStatus[] {
  return statuses;
}

export function subscribeRepos(fn: () => void): () => void {
  repoListeners.add(fn);
  return () => {
    repoListeners.delete(fn);
  };
}

export const pluginHost = new PluginHost({
  plugins: activePlugins,
  run: (p, req, timeoutMs) =>
    sandboxBridge.run({ key: p.key, source: p.source }, [req.tmdbId, req.type, req.season ?? null, req.episode ?? null], ENV, timeoutMs),
  normalise: (p, raw) => normaliseStreams(p, raw, jarFor(p.key)),
  now: Date.now,
});

/** Code through the real sandbox and fetch path, outside the registry — the dev Plugin Lab's self-test only. */
export function runInSandbox(key: string, source: string, args: unknown[], timeoutMs: number): Promise<unknown> {
  return sandboxBridge.run({ key, source }, args, ENV, timeoutMs);
}
```

`src/features/plugins/PluginBootstrap.tsx`:

```tsx
import PluginSandbox from "@/components/plugins/PluginSandbox";
import { nativeFetchAvailable } from "@/modules/bearoom-fetch";
import { sandboxBridge, syncRepos } from "@/services/plugins";
import { useSandboxDemand } from "@/services/plugins/demand";
import { useFeatureFlags, usePluginRepos } from "@/src/store/features/providers/hooks";
import React, { useEffect } from "react";
import { Platform } from "react-native";

/**
 * Headless (spec §5.4): while /config's `pluginHost` flag is on, keeps the plugin sandbox mounted and the installed
 * repos in step with /config.pluginRepos — the device's cached copy when offline, so nothing downloads until a
 * download can work. A dev screen can hold the sandbox open with the flag off (no installs then).
 */
export default function PluginBootstrap() {
  const { pluginHost } = useFeatureFlags();
  const repos = usePluginRepos();
  const demand = useSandboxDemand();
  const supported = Platform.OS !== "web" && nativeFetchAvailable;

  useEffect(() => {
    if (supported && pluginHost) void syncRepos(repos);
  }, [supported, pluginHost, repos]);

  return supported && (pluginHost || demand > 0) ? <PluginSandbox bridge={sandboxBridge} /> : null;
}
```

`providersSlice.ts`: import `PluginRepoRow`; add to `ProvidersState`:

```ts
    /** Operator-listed plugin repos from /config (or the device's cached copy). */
    pluginRepos: PluginRepoRow[];
```

`initialState.pluginRepos: []`; in `applyConfig` add `state.pluginRepos = cfg.pluginRepos ?? [];`; in `reduceConfig`'s returned object add `pluginRepos: payload.pluginRepos ?? [],`.

`hooks.ts`:

```ts
/** Plugin repos to install (empty until the operator lists one). */
export function usePluginRepos(): PluginRepoRow[] {
    return useAppSelector((s) => s.providers.pluginRepos);
}
```

`App.tsx`: import `PluginBootstrap from "@/src/features/plugins/PluginBootstrap"` and render `<PluginBootstrap />` directly after `<ConfigBootstrap />`.

- [ ] **Step 4: Run them to verify they pass, then the whole suite**

Run: `npx jest services/plugins/demand src/store/features/providers src/features/plugins && npx jest && npx tsc --noEmit && npm run lint`
Expected: the new tests PASS; full suite green; tsc and lint clean.

- [ ] **Step 5: Commit**

```bash
git add services/plugins/index.ts services/plugins/demand.ts services/plugins/demand.test.ts src/features/plugins src/store/features/providers App.tsx
git commit -m "feat(plugins): mount the sandbox and sync /config's repos behind the pluginHost flag

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Bearoom's own "Open Movies" repo, pinned and listed

**Files:**
- Create: `plugin-repos/open-movies/manifest.json`, `plugin-repos/open-movies/providers/open-movies.js`, `plugin-repos/open-movies/open-movies.test.ts`
- Create: `scripts/pin-plugin-repo.mjs`
- Modify: `eslint.config.js` (globals for `plugin-repos/**/*.js`)
- Data: one `plugin_repos` row (Supabase MCP `execute_sql`)

**Interfaces:**
- Consumes: `runPlugin`, `ShimRequest`, `WorkerIo` (Task 4) in the test; `/config.pluginRepos` (Task 1); the registry (Task 6).
- Produces: repo `open-movies` (one plugin, `open-movies`, movies only):

  | Film | TMDB id | Streams |
  |---|---|---|
  | Big Buck Bunny | 10378 | Mux HLS |
  | Tears of Steel | 133701 | Mux HLS, plus the Blender MOV with six SRT subtitles |
  | Sintel | 45745 | Shaka DASH (Android only) |

  Every other title gets an empty answer. `scripts/pin-plugin-repo.mjs <manifestUrl> --id <id> --version <n>` prints the row JSON and an upsert.

- [ ] **Step 1: Write the failing test** — `plugin-repos/open-movies/open-movies.test.ts`

```ts
import { runPlugin, type ShimRequest, type WorkerIo } from "@/services/plugins/sandbox/workerCore";
import { readFileSync } from "fs";
import { join } from "path";

const SOURCE = readFileSync(join(__dirname, "providers/open-movies.js"), "utf8");
const ENV = { tmdbApiKey: "bearoom-proxy", settings: {}, debug: false };

function network(streamStatus: (url: string) => number, tmdb: { id: number } | null) {
  const calls: ShimRequest[] = [];
  const io: WorkerIo = {
    fetch: async (req) => {
      calls.push(req);
      const tmdbCall = req.url.startsWith("https://api.themoviedb.org/");
      const status = tmdbCall ? (tmdb ? 200 : 503) : streamStatus(req.url);
      return { status, url: req.url, redirected: false, headers: {}, body: tmdbCall ? JSON.stringify(tmdb ?? {}) : "", encoding: "text" };
    },
    log: () => {},
  };
  return { calls, io };
}
const run = (id: string, type: string, io: WorkerIo) => runPlugin(SOURCE, [id, type, null, null], ENV, io, { cheerio: {}, CryptoJS: {} }) as Promise<Record<string, unknown>[]>;

describe("Open Movies", () => {
  it("offers Big Buck Bunny once TMDB confirms the title and the stream answers", async () => {
    const net = network(() => 206, { id: 10378 });
    await expect(run("10378", "movie", net.io)).resolves.toEqual([
      {
        name: "Open Movies • HLS",
        title: "Big Buck Bunny · 720p",
        url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
        quality: "720p",
        language: "en",
        headers: {},
        subtitles: [],
      },
    ]);
    expect(net.calls[0].url).toBe("https://api.themoviedb.org/3/movie/10378?api_key=bearoom-proxy");
    expect(net.calls[1].headers).toEqual({ Range: "bytes=0-1023" });
  });

  it("Tears of Steel comes as HLS and as a progressive file with six subtitle languages", async () => {
    const out = await run("133701", "movie", network(() => 200, { id: 133701 }).io);
    expect(out.map((s) => s.name)).toEqual(["Open Movies • HLS", "Open Movies • MOV"]);
    expect((out[1].subtitles as { label: string }[]).map((s) => s.label)).toEqual(["English", "German", "Spanish", "French", "Italian", "Russian"]);
  });

  it("Sintel comes as DASH", async () => {
    const out = await run("45745", "movie", network(() => 200, { id: 45745 }).io);
    expect(out).toEqual([expect.objectContaining({ name: "Open Movies • DASH", url: "https://storage.googleapis.com/shaka-demo-assets/sintel/dash.mpd" })]);
  });

  it("answers nothing, with no network at all, for other titles and for series", async () => {
    const net = network(() => 200, { id: 550 });
    await expect(run("550", "movie", net.io)).resolves.toEqual([]);
    await expect(run("10378", "tv", net.io)).resolves.toEqual([]);
    expect(net.calls).toHaveLength(0);
  });

  it("answers nothing when TMDB cannot confirm the title", async () => {
    await expect(run("10378", "movie", network(() => 200, null).io)).resolves.toEqual([]);
    await expect(run("10378", "movie", network(() => 200, { id: 1 }).io)).resolves.toEqual([]);
  });

  it("skips a stream that does not answer", async () => {
    await expect(run("10378", "movie", network(() => 404, { id: 10378 }).io)).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest plugin-repos/open-movies`
Expected: FAIL — `ENOENT … providers/open-movies.js`.

- [ ] **Step 3: Write the repo**

`plugin-repos/open-movies/manifest.json`:

```json
{
  "name": "Bearoom Open Movies",
  "version": "1.0.0",
  "description": "Blender Foundation open films (CC BY) from their publishers' public test streams. Bearoom's own fixture repo.",
  "scrapers": [
    {
      "id": "open-movies",
      "name": "Open Movies",
      "description": "Big Buck Bunny, Tears of Steel, Sintel",
      "version": "1.0.0",
      "supportedTypes": ["movie"],
      "filename": "providers/open-movies.js",
      "enabled": true,
      "contentLanguage": ["en"],
      "formats": ["m3u8", "mpd", "mov"]
    }
  ]
}
```

`plugin-repos/open-movies/providers/open-movies.js`:

```js
// Bearoom Open Movies: a fixed list of Blender Foundation open films (CC BY) on publisher-hosted public test streams.
// Not a scraper. It confirms the title through TMDB (through the host's proxy) and checks each stream answers.
const TOS_SUBS = "https://download.blender.org/demo/movies/ToS/subtitles/";
const FILMS = {
  10378: {
    title: "Big Buck Bunny",
    streams: [{ label: "HLS", quality: "720p", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" }],
  },
  133701: {
    title: "Tears of Steel",
    streams: [
      { label: "HLS", quality: "1080p", url: "https://test-streams.mux.dev/tos_ismc/main.m3u8" },
      {
        label: "MOV",
        quality: "720p",
        url: "https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov",
        subtitles: [
          { url: TOS_SUBS + "TOS-en.srt", lang: "en", label: "English" },
          { url: TOS_SUBS + "TOS-de.srt", lang: "de", label: "German" },
          { url: TOS_SUBS + "TOS-es.srt", lang: "es", label: "Spanish" },
          { url: TOS_SUBS + "TOS-fr-orig.srt", lang: "fr", label: "French" },
          { url: TOS_SUBS + "TOS-it.srt", lang: "it", label: "Italian" },
          { url: TOS_SUBS + "TOS-ru.srt", lang: "ru", label: "Russian" },
        ],
      },
    ],
  },
  45745: {
    title: "Sintel",
    streams: [{ label: "DASH", quality: "1080p", url: "https://storage.googleapis.com/shaka-demo-assets/sintel/dash.mpd" }],
  },
};

async function getStreams(tmdbId, mediaType) {
  const film = mediaType === "movie" ? FILMS[Number(tmdbId)] : undefined;
  if (!film) return [];
  const meta = await fetch("https://api.themoviedb.org/3/movie/" + tmdbId + "?api_key=" + TMDB_API_KEY)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  if (!meta || meta.id !== Number(tmdbId)) return [];
  const out = [];
  for (const s of film.streams) {
    const res = await fetch(s.url, { headers: { Range: "bytes=0-1023" } }).catch(() => null);
    if (!res || (res.status !== 200 && res.status !== 206)) continue;
    out.push({
      name: "Open Movies • " + s.label,
      title: film.title + " · " + s.quality,
      url: s.url,
      quality: s.quality,
      language: "en",
      headers: {},
      subtitles: s.subtitles || [],
    });
  }
  return out;
}

module.exports = { getStreams };
```

In `eslint.config.js`, after the `plugins/**/*.js` block:

```js
  {
    // Plugin repos run in the sandbox worker (Nuvio contract): CommonJS plus the host's globals.
    files: ['plugin-repos/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { module: 'writable', fetch: 'readonly', TMDB_API_KEY: 'readonly', console: 'readonly' },
    },
  },
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx jest plugin-repos/open-movies && npm run lint`
Expected: PASS (6 tests); lint clean.

- [ ] **Step 5: Write the pin script** — `scripts/pin-plugin-repo.mjs`

```js
// Pins a plugin repo for the operator's plugin_repos table (spec §5.4):
//   node scripts/pin-plugin-repo.mjs <https manifest URL> --id <repo-id> [--version <n>]
// Downloads the manifest and every enabled scraper file it names, hashes the exact bytes, and prints the row plus an
// upsert that leaves the repo DISABLED. Pin commit-addressed URLs (a commit SHA in the path), never a branch.
import { createHash } from "node:crypto";

const [manifestUrl, ...rest] = process.argv.slice(2);
if (!manifestUrl?.startsWith("https://")) {
  console.error("usage: node scripts/pin-plugin-repo.mjs <https manifest URL> --id <repo-id> [--version <n>]");
  process.exit(1);
}
const opt = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : fallback;
};
const base = manifestUrl.slice(0, manifestUrl.lastIndexOf("/") + 1);
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

const manifestBytes = await get(manifestUrl);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const files = [{ path: manifestUrl.slice(base.length), sha256: sha(manifestBytes) }];
for (const s of manifest.scrapers ?? []) {
  if (s.enabled === false) continue;
  const url = new URL(s.filename, base).toString();
  if (!url.startsWith(base)) {
    console.error(`skipping ${s.id}: ${s.filename} is outside the repo folder`);
    continue;
  }
  files.push({ path: url.slice(base.length), sha256: sha(await get(url)) });
}
const id = opt("id", "repo");
const version = Number(opt("version", "1"));
console.log(JSON.stringify({ id, manifestUrl, version, files }, null, 2));
console.log(
  `\n-- Review, then run as the operator (the repo stays disabled until enabled on purpose):\n` +
    `insert into public.plugin_repos (id, manifest_url, version, files, enabled)\n` +
    `values ('${id}', '${manifestUrl}', ${version}, '${JSON.stringify(files)}'::jsonb, false)\n` +
    `on conflict (id) do update set manifest_url = excluded.manifest_url, version = excluded.version, files = excluded.files, updated_at = now();`,
);
```

- [ ] **Step 6: Commit and push (raw.githubusercontent.com serves the commit)**

```bash
git add plugin-repos scripts/pin-plugin-repo.mjs eslint.config.js
git commit -m "feat(plugins): Bearoom's own Open Movies repo (Blender films on publisher test streams) + pin script

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin feat/improvements
```

- [ ] **Step 7: Pin it at that commit and list it**

Run: `node scripts/pin-plugin-repo.mjs "https://raw.githubusercontent.com/Priyanshu-Agrawal/NetPrime-Party/$(git rev-parse HEAD)/plugin-repos/open-movies/manifest.json" --id open-movies --version 1`, and check that the printed hashes equal `shasum -a 256 plugin-repos/open-movies/manifest.json plugin-repos/open-movies/providers/open-movies.js`.
Run the printed upsert via Supabase MCP `execute_sql`, then `update public.plugin_repos set enabled = true where id = 'open-movies';`.
Expected: after ≤ 60 s, `curl -s "$EXPO_PUBLIC_WORKER_URL/config"` shows `pluginRepos` with `open-movies`, version 1, 2 files.

---

### Task 10: Plugin Lab self-test on the phone, and the 2A gate

**Files:**
- Create: `src/features/dev/pluginSelfTest.ts`, `src/features/dev/pluginSelfTest.test.ts`
- Create: `src/screens/PluginLabScreen.tsx`
- Modify: `src/navigation/types.ts` (`RootStack.PluginLab: undefined`), `src/navigation/RootNavigator.tsx`, `src/navigation/actions.ts` (`openPluginLab()`), `src/screens/TestStreamsScreen.tsx` (header button "Plugin lab")
- Modify: `docs/project-board.md` (Phase 2A section), `docs/BACKLOG.md`
- Memory: `phase2-sources-kickoff` → progress; new `phase2a-status`

**Interfaces:**
- Consumes:
  - `runInSandbox`, `pluginHost`, `sandboxBridge`, `repoStatuses`, `subscribeRepos` (Task 8)
  - `holdSandbox` (Task 8)
  - `useTestStreamsEnabled` (`src/features/dev/testStreamsGate.ts`)
- Produces:
  - `type Outcome = { ok: true; value: unknown } | { ok: false; code?: string; message: string }`
  - `interface SelfTestCase { name: string; source: string; timeoutMs?: number; check(o: Outcome): string | null }`
  - `interface SelfTestResult { name: string; pass: boolean; detail: string; ms: number }`
  - `SELF_TEST: SelfTestCase[]`
  - `runSelfTest(run: (key: string, source: string, timeoutMs: number) => Promise<unknown>, onResult?: (r: SelfTestResult) => void, now?: () => number): Promise<SelfTestResult[]>`

- [ ] **Step 1: Write the failing test** — `src/features/dev/pluginSelfTest.test.ts`

```ts
import { runSelfTest, SELF_TEST } from "./pluginSelfTest";

const byName = (prefix: string) => SELF_TEST.find((c) => c.name.startsWith(prefix))!;

describe("plugin self-test cases", () => {
  it("every case is valid JavaScript", () => {
    for (const c of SELF_TEST) expect(() => new Function("module", c.source)).not.toThrow();
  });

  it.each(["A private IP", "A name that resolves", "A redirect to a private"])("%s passes only when the request was blocked", (prefix) => {
    const c = byName(prefix);
    expect(c.check({ ok: true, value: "refused: Blocked URL (host)" })).toBeNull();
    expect(c.check({ ok: true, value: "refused: Blocked non-public address" })).toBeNull();
    expect(c.check({ ok: true, value: "reached" })).not.toBeNull();
    expect(c.check({ ok: true, value: "refused: Unable to resolve host" })).not.toBeNull();
  });

  it("the runaway case passes only on a timeout", () => {
    const c = byName("A runaway");
    expect(c.timeoutMs).toBe(3000);
    expect(c.check({ ok: false, code: "timeout", message: "x" })).toBeNull();
    expect(c.check({ ok: true, value: 1 })).not.toBeNull();
  });

  it("the globals case lists anything left behind", () => {
    const c = byName("Network and storage");
    expect(c.check({ ok: true, value: ["XMLHttpRequest:undefined", "WebSocket:undefined"] })).toBeNull();
    expect(c.check({ ok: true, value: ["XMLHttpRequest:function"] })).toContain("XMLHttpRequest:function");
  });
});

describe("runSelfTest", () => {
  it("runs every case in order, each as its own plugin, and reports as it goes", async () => {
    const run = jest.fn(async () => Promise.reject(Object.assign(new Error("nope"), { code: "plugin" })));
    const seen: string[] = [];
    const out = await runSelfTest(run, (r) => seen.push(r.name));
    expect(out).toHaveLength(SELF_TEST.length);
    expect(out.every((r) => !r.pass)).toBe(true);
    expect(seen).toEqual(SELF_TEST.map((c) => c.name));
    expect(new Set(run.mock.calls.map((c) => c[0])).size).toBe(SELF_TEST.length);
    expect(run.mock.calls.find((c) => (c[1] as string).includes("for (;;)"))?.[2]).toBe(3000);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/features/dev/pluginSelfTest`
Expected: FAIL — `Cannot find module './pluginSelfTest'`.

- [ ] **Step 3: Implement** — `src/features/dev/pluginSelfTest.ts`

```ts
/**
 * Dev-only proof, on a real device, that the plugin host's protections hold (spec §8). Every case runs through the
 * real sandbox page, bridge and BearoomFetch; the expectations are pure so jest pins them. Uses public echo services
 * (httpbin.org, nip.io, example.com) — never anything of the user's.
 */
export type Outcome = { ok: true; value: unknown } | { ok: false; code?: string; message: string };

export interface SelfTestCase {
  name: string;
  source: string;
  timeoutMs?: number;
  /** null = pass, else what went wrong. */
  check(o: Outcome): string | null;
}

export interface SelfTestResult {
  name: string;
  pass: boolean;
  detail: string;
  ms: number;
}

const plugin = (body: string) => `module.exports = { getStreams: async () => { ${body} } };`;
const explain = (o: Outcome) => (o.ok ? `got ${String(JSON.stringify(o.value)).slice(0, 160)}` : `${o.code ?? "error"}: ${o.message}`);
const blocked = (o: Outcome) => (o.ok && /^refused: .*blocked/i.test(String(o.value)) ? null : explain(o));
const equals = (want: unknown) => (o: Outcome) => (o.ok && JSON.stringify(o.value) === JSON.stringify(want) ? null : explain(o));
const refuse = (url: string) => plugin(`return fetch(${JSON.stringify(url)}).then(() => "reached", (e) => "refused: " + e.message);`);

export const SELF_TEST: SelfTestCase[] = [
  {
    name: "Network and storage globals are gone",
    source: plugin(
      `return ["XMLHttpRequest","WebSocket","EventSource","importScripts","indexedDB","caches","Worker","ReactNativeWebView"]` +
        `.map((n) => n + ":" + typeof self[n]);`,
    ),
    check: (o) => {
      if (!o.ok || !Array.isArray(o.value)) return explain(o);
      const left = (o.value as string[]).filter((s) => !s.endsWith(":undefined"));
      return left.length ? `still there: ${left.join(", ")}` : null;
    },
  },
  {
    name: "cheerio and CryptoJS work",
    source: plugin(`const $ = require("cheerio").load("<p class=a>hi</p>"); return [$("p.a").text(), CryptoJS.MD5("a").toString()];`),
    check: equals(["hi", "0cc175b9c0f1b6a831c399e269772661"]),
  },
  { name: "A private IP is refused", source: refuse("http://192.168.1.1/"), check: blocked },
  { name: "A name that resolves to a private address is refused", source: refuse("http://127.0.0.1.nip.io/"), check: blocked },
  { name: "A redirect to a private address is refused", source: refuse("https://httpbin.org/redirect-to?url=http%3A%2F%2F10.0.0.1%2F"), check: blocked },
  {
    name: "redirect: manual hands back the 3xx",
    source: plugin(
      `const r = await fetch("https://httpbin.org/redirect-to?url=https%3A%2F%2Fexample.com%2F", { redirect: "manual" }); return [r.status, r.headers.get("location")];`,
    ),
    check: equals([302, "https://example.com/"]),
  },
  {
    name: "Redirects are followed hop by hop",
    source: plugin(`const r = await fetch("https://httpbin.org/redirect-to?url=https%3A%2F%2Fexample.com%2F"); return [r.status, r.redirected, r.url];`),
    check: equals([200, true, "https://example.com/"]),
  },
  {
    name: "A plugin's cookie jar carries its cookies",
    source: plugin(
      `await fetch("https://httpbin.org/cookies/set?bearoom=1", { redirect: "manual" }); const r = await fetch("https://httpbin.org/cookies"); return (await r.json()).cookies;`,
    ),
    check: equals({ bearoom: "1" }),
  },
  {
    name: "TMDB calls go through the app's proxy",
    source: plugin(`const r = await fetch("https://api.themoviedb.org/3/movie/550?api_key=" + TMDB_API_KEY); return (await r.json()).title;`),
    check: equals("Fight Club"),
  },
  {
    name: "A runaway plugin is stopped",
    source: plugin(`for (;;) {}`),
    timeoutMs: 3000,
    check: (o) => (!o.ok && o.code === "timeout" ? null : explain(o)),
  },
  { name: "The sandbox still answers after a kill", source: plugin(`return 42;`), check: equals(42) },
];

export async function runSelfTest(
  run: (key: string, source: string, timeoutMs: number) => Promise<unknown>,
  onResult?: (r: SelfTestResult) => void,
  now: () => number = Date.now,
): Promise<SelfTestResult[]> {
  const out: SelfTestResult[] = [];
  for (const [i, c] of SELF_TEST.entries()) {
    const started = now();
    let o: Outcome;
    try {
      o = { ok: true, value: await run(`selftest/${i}@1`, c.source, c.timeoutMs ?? 15_000) };
    } catch (e) {
      o = { ok: false, code: (e as { code?: string })?.code, message: (e as Error)?.message ?? String(e) };
    }
    const problem = c.check(o);
    const r: SelfTestResult = { name: c.name, pass: problem === null, detail: problem ?? "ok", ms: now() - started };
    out.push(r);
    onResult?.(r);
  }
  return out;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx jest src/features/dev/pluginSelfTest`
Expected: PASS (7 tests).

- [ ] **Step 5: The Plugin Lab screen** — `src/screens/PluginLabScreen.tsx`

```tsx
/** Dev-only Plugin Lab: sandbox state, installed repos, the on-device self-test, and a resolve probe (spec §5.4). */
import { runSelfTest, type SelfTestResult } from "@/src/features/dev/pluginSelfTest";
import { useTestStreamsEnabled } from "@/src/features/dev/testStreamsGate";
import { pluginHost, repoStatuses, runInSandbox, sandboxBridge, subscribeRepos } from "@/services/plugins";
import { holdSandbox } from "@/services/plugins/demand";
import type { HostResult } from "@/services/plugins/PluginHost";
import { IconButton } from "@/src/ui";
import { colors, font, ms, radius, spacing } from "@/theme/bearoom";
import { pressedStyle } from "@/theme/styles/interaction";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState, useSyncExternalStore } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function hostOf(url: string): string {
  try {
    return new URL(url).host; // never the full URL: screenshots of this screen must not carry tokens
  } catch {
    return "?";
  }
}

function Button({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && pressedStyle, disabled && styles.disabled]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export default function PluginLabScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const enabled = useTestStreamsEnabled();
  const sandbox = useSyncExternalStore(sandboxBridge.subscribe, sandboxBridge.getState);
  const repos = useSyncExternalStore(subscribeRepos, repoStatuses);
  const [busy, setBusy] = useState(false);
  const [tests, setTests] = useState<SelfTestResult[]>([]);
  const [tmdbId, setTmdbId] = useState("10378");
  const [type, setType] = useState<"movie" | "tv">("movie");
  const [result, setResult] = useState<(HostResult & { ms: number }) | null>(null);

  useEffect(() => (enabled ? holdSandbox() : undefined), [enabled]);

  const selfTest = async () => {
    setBusy(true);
    setTests([]);
    await runSelfTest((key, source, timeoutMs) => runInSandbox(key, source, [], timeoutMs), (r) => setTests((prev) => [...prev, r]));
    setBusy(false);
  };

  const resolve = async () => {
    setBusy(true);
    setResult(null);
    pluginHost.clearCache();
    const started = Date.now();
    const r = await pluginHost.getStreams({ tmdbId: tmdbId.trim(), type, season: type === "tv" ? 1 : undefined, episode: type === "tv" ? 1 : undefined });
    setResult({ ...r, ms: Date.now() - started });
    setBusy(false);
  };

  const passed = tests.filter((t) => t.pass).length;
  return (
    <View style={[styles.root, { paddingTop: insets.top + ms(8) }]}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <IconButton accessibilityLabel="Go back" onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={ms(22)} color={colors.text} />
        </IconButton>
        <Text style={styles.title}>Plugin lab</Text>
      </View>
      {!enabled ? (
        <Text style={styles.dim}>The plugin lab is switched off.</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.lg }}>
          <Text style={styles.section}>SANDBOX</Text>
          <Text style={styles.line}>
            {!sandbox.attached ? "Not mounted" : !sandbox.ready ? "Starting…" : sandbox.csp ? "Ready · direct network blocked" : "Ready · CSP NOT enforced"}
            {`  ·  page ${sandbox.generation}  ·  ${sandbox.running} running`}
          </Text>

          <Text style={styles.section}>REPOS</Text>
          {repos.length ? (
            repos.map((r) => (
              <Text key={r.id} style={styles.line}>
                {`${r.id} · ${r.state} · runs v${r.version ?? "–"}${r.wanted !== r.version ? ` (wants v${r.wanted})` : ""}${r.detail ? ` · ${r.detail}` : ""}`}
              </Text>
            ))
          ) : (
            <Text style={styles.dim}>None listed (or the plugin-host flag is off).</Text>
          )}

          <Text style={styles.section}>SELF-TEST</Text>
          <Button label={busy ? "Running…" : "Run self-test"} onPress={selfTest} disabled={busy} />
          {tests.length ? <Text style={styles.line}>{`${passed}/${tests.length} passed`}</Text> : null}
          {tests.map((t) => (
            <Text key={t.name} style={[styles.line, !t.pass && styles.fail]}>
              {`${t.pass ? "✓" : "✗"} ${t.name} · ${t.ms} ms${t.pass ? "" : `\n   ${t.detail}`}`}
            </Text>
          ))}

          <Text style={styles.section}>RESOLVE</Text>
          <View style={styles.row}>
            <TextInput
              accessibilityLabel="TMDB id"
              value={tmdbId}
              onChangeText={setTmdbId}
              keyboardType="number-pad"
              style={styles.input}
              placeholderTextColor={colors.textFaint}
            />
            <Button label={type === "movie" ? "Movie" : "TV S1E1"} onPress={() => setType(type === "movie" ? "tv" : "movie")} />
            <Button label="Resolve" onPress={resolve} disabled={busy} />
          </View>
          {result ? (
            <>
              <Text style={styles.line}>{`${result.streams.length} streams · ${result.failures.length} failures · ${(result.ms / 1000).toFixed(1)} s · ${result.complete ? "complete" : "returned early"}`}</Text>
              {result.streams.map((s, i) => (
                <Text key={`${s.pluginKey}-${i}`} style={styles.line}>
                  {`${s.name} · ${s.quality ?? "?"} · ${hostOf(s.url)} · subs ${s.subtitles.length}${s.headers.Cookie ? " · cookie" : ""}`}
                </Text>
              ))}
              {result.failures.map((f) => (
                <Text key={f.pluginKey} style={[styles.line, styles.fail]}>{`${f.pluginKey} · ${f.reason} · ${f.ms} ms`}</Text>
              ))}
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", gap: ms(12), paddingHorizontal: spacing.lg },
  title: { color: colors.text, fontFamily: font.headline, fontSize: ms(20) },
  section: { color: colors.textDim, fontFamily: font.label, fontSize: ms(11), letterSpacing: 1.2, marginTop: spacing.sm },
  line: { color: colors.text, fontFamily: font.body, fontSize: ms(13) },
  fail: { color: colors.danger },
  dim: { color: colors.textFaint, fontFamily: font.body, fontSize: ms(13), padding: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  input: {
    flex: 1,
    color: colors.text,
    fontFamily: font.body,
    fontSize: ms(14),
    paddingHorizontal: spacing.md,
    paddingVertical: ms(8),
    borderRadius: radius.md,
    backgroundColor: colors.surfaceStrong,
  },
  button: { paddingHorizontal: spacing.md, paddingVertical: ms(9), borderRadius: radius.pill, backgroundColor: colors.surfaceStrong },
  buttonText: { color: colors.text, fontFamily: font.bodySemi, fontSize: ms(13) },
  disabled: { opacity: 0.5 },
});
```

If `colors.danger` or `radius.md` doesn't exist in `theme/bearoom`, use the nearest existing token (check `theme/bearoom.ts`) and say so in a ruling.

Navigation:
- `src/navigation/types.ts`: add `PluginLab: undefined;` to the root stack param list, next to `TestStreams`.
- `RootNavigator.tsx`: `<RootStack.Screen name="PluginLab" component={PluginLabScreen} />` next to `TestStreams`.
- `actions.ts`: `export function openPluginLab() { navigate("PluginLab"); }`.
- `TestStreamsScreen.tsx`: when `enabled`, add a header button with `accessibilityLabel="Open plugin lab"` and the text "Plugin lab", which calls `openPluginLab()`.

- [ ] **Step 6: Full checks**

Run: `npx jest && npx tsc --noEmit && npm run lint && (cd worker && npx vitest run && npx tsc --noEmit)`
Expected: everything green.

- [ ] **Step 7: Commit**

```bash
git add src/features/dev/pluginSelfTest.ts src/features/dev/pluginSelfTest.test.ts src/screens/PluginLabScreen.tsx src/screens/TestStreamsScreen.tsx src/navigation
git commit -m "feat(dev): Plugin Lab — sandbox state, repos, on-device self-test, resolve probe

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Device gate (Nothing Phone; no emulator, no simulator)**

1. **Install.** Build a release with the dev entries: `cd android && EXPO_PUBLIC_TEST_STREAMS=1 JAVA_TOOL_OPTIONS=-Djava.net.preferIPv4Stack=true ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a`. Install with `adb -s P2228K000422 install -r android/app/build/outputs/apk/release/app-release.apk`.
2. **Self-test.** Open Profile → Test streams (dev) → Plugin lab, then run the self-test.
   **Expected:** SANDBOX reads "Ready · direct network blocked", and the self-test shows **11/11 passed**. Take a screenshot.
3. **Turn the host on.** Set KV `flags:v1` to `{"nativeLane":true,"pluginHost":true}` with `env -u CLOUDFLARE_API_TOKEN npx wrangler kv key put --binding CONFIG_LKG flags:v1 '{"nativeLane":true,"pluginHost":true}' --remote` (from `worker/`). Wait 60 s and cold-start the app.
   **Expected:** REPOS reads `open-movies · ok · runs v1`.
4. **Resolve.** Run Resolve on four titles. Expected streams:

   | TMDB id | Film | Expected |
   |---|---|---|
   | 10378 | Big Buck Bunny | 1 stream (HLS · 720p · test-streams.mux.dev) |
   | 133701 | Tears of Steel | 2 streams (the MOV has subs 6) |
   | 45745 | Sintel | 1 stream (DASH) |
   | 550 | Fight Club | 0 streams and one `empty-fast` failure, recorded in the board as the expected behaviour for a title the repo doesn't have |

5. **Last-known-good.** In `plugin_repos`, set `version = 2` and set the plugin file's `sha256` to 64 zeros. Wait 60 s, cold-start, and resolve 10378 again.
   **Expected:**
   - REPOS reads `open-movies · degraded · runs v1 (wants v2) · hash mismatch for providers/open-movies.js`;
   - the resolve still returns 1 stream.

   Restore the row (version 1, real hashes) and check it reads `ok` again.
6. **Playback cost.** With the sandbox mounted, play the `tos-24p` test stream for 30 s with the controls hidden. Measure the SurfaceFlinger cadence with the method in memory `perf-measurement-method`.
   **Expected:** ≥ 98 % of frames on rhythm (the Phase 1B number). The idle sandbox costs nothing per frame.
7. **Memory.** Record the sandbox's renderer memory: `adb -s P2228K000422 shell dumpsys meminfo | grep -i sandboxed`.

- [ ] **Step 9: Docs and memory**

- `docs/project-board.md`: add a "Phase 2A — plugin host core" section. Include the gate table (self-test 11/11, Open Movies results, the LKG check, the cadence and memory numbers) and the rulings.
- `docs/BACKLOG.md`: carry anything deferred.
- Memory: write `phase2a-status`, update `phase2-sources-kickoff` (2A done → 2B next), index both in MEMORY.md, and refresh `.remember/remember.md`.

```bash
git add docs/project-board.md docs/BACKLOG.md
git commit -m "docs: Phase 2A plugin host — gate numbers and rulings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin feat/improvements
```
