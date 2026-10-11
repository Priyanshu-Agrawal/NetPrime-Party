/**
 * The scorecard's own plugin host (dev only): a pinned candidate row is installed into an in-memory store and run
 * through the given sandbox — never the user's registry, its MMKV store, /config or the app's plugin host. "Enabled"
 * exists only inside this run. Candidate keys are namespaced (`scorecard:<id>`), so their sandbox entries and cookie
 * jars never meet the app's. The host waits for every plugin (no early return) so each one is measured, and starts no
 * plugin once the run is stopped or over its data budget.
 */
import type { PluginRepoRow } from "@/src/types/worker.types";
import type { CookieJar } from "./cookieJar";
import { BUDGET, PluginHost, type ResolveRequest } from "./PluginHost";
import { installRepo, loadPlugins, type Download, type LoadedPlugin, type RepoStatus } from "./registry";
import { looksObfuscated } from "./scorecard";
import { memoryPluginStore, type PluginStore } from "./store";
import { normaliseStreams } from "./streams";

export interface ScorecardHostDeps {
  download: Download;
  run(plugin: LoadedPlugin, req: ResolveRequest, timeoutMs: number): Promise<unknown>;
  /** The jar the sandbox's fetches for this plugin use (its cookies ride on its streams). */
  jarFor(pluginKey: string): CookieJar;
  /** Stopped by the user or over the data budget: plugins not yet started never start. */
  shouldStop?(): boolean;
}

/** This session's installs, by pinned files: a re-run doesn't download the repo again. Memory only. */
const installs = new Map<string, PluginStore>();

export async function scorecardHost(
  row: PluginRepoRow,
  deps: ScorecardHostDeps,
): Promise<{ host: PluginHost; plugins: LoadedPlugin[]; status: RepoStatus; obfuscated: string[] }> {
  const pin = `${row.id}|${row.files.map((f) => `${f.path}=${f.sha256}`).join(",")}`;
  const store = installs.get(pin) ?? memoryPluginStore();
  const live = { ...row, id: `scorecard:${row.id}`, enabled: true, down: false };
  const status = await installRepo(live, store, deps.download);
  if (status.state === "ok") installs.set(pin, store);
  const plugins = status.version == null ? [] : loadPlugins(live, store);
  const host = new PluginHost({
    budget: { earlyCount: Infinity, overallMs: Math.ceil(Math.max(1, plugins.length) / BUDGET.parallel) * BUDGET.perPluginMs + 10_000 },
    plugins: () => plugins,
    run: (p, req, timeoutMs) =>
      deps.shouldStop?.() ? Promise.reject(Object.assign(new Error("scorecard stopped"), { code: "not-ready" })) : deps.run(p, req, timeoutMs),
    normalise: (p, raw) => normaliseStreams(p, raw, deps.jarFor(p.key)),
    now: Date.now,
  });
  return { host, plugins, status: { ...status, id: row.id }, obfuscated: plugins.filter((p) => looksObfuscated(p.source)).map((p) => p.pluginId) };
}
