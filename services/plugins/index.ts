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
import { pluginFetch, toPluginFetchRequest, type PluginFetchDeps, type PluginFetchRequest } from "./pluginFetch";
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
  onFetch: async (pluginKey, req, alive) => {
    const r = await pluginFetch(jarFor(pluginKey), toPluginFetchRequest(req), fetchDeps, alive);
    return { status: r.status, url: r.url, redirected: r.redirected, headers: r.headers, body: r.body, encoding: r.encoding };
  },
  // Dev builds only, and never with a URL in it: stream URLs and tokens must not reach any log.
  onLog: __DEV__ ? (key, level, msg) => console.log(`[plugin ${key}] ${level}: ${msg.replace(URLISH, "<url>")}`) : undefined,
});

/** The host's own fetch (the stream probe): the same per-hop guard and limits, and no plugin's cookies. */
export function hostFetch(req: PluginFetchRequest) {
  return pluginFetch(new CookieJar(), req, fetchDeps);
}

const registryJar = new CookieJar();
async function download(url: string) {
  const r = await pluginFetch(registryJar, { url, responseType: "base64" }, fetchDeps); // raw bytes: decoded strictly by the registry
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
