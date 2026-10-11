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

const SOURCE_ID = /^([a-z0-9][a-z0-9-]{1,40})\/([A-Za-z0-9._-]{1,80})$/;

/** `repoId/pluginId` of a repo the operator lists (not down) that allows that plugin. */
export function isPluginSourceId(id: string, repos: PluginRepo[]): boolean {
  const m = SOURCE_ID.exec(id);
  if (!m || m[2].includes("..")) return false;
  return repos.some((r) => r.id === m[1] && !r.down && (r.allowPlugins == null || r.allowPlugins.includes(m[2])));
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
