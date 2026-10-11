/**
 * The scorecard's own plugin host (dev only): a pinned candidate row is installed into a fresh in-memory store and run
 * through the given sandbox — never the user's registry, its MMKV store, /config or the app's plugin host. "Enabled"
 * exists only inside this run; nothing is kept afterwards.
 */
import type { PluginRepoRow } from "@/src/types/worker.types";
import type { CookieJar } from "./cookieJar";
import { PluginHost, type ResolveRequest } from "./PluginHost";
import { installRepo, loadPlugins, type Download, type LoadedPlugin, type RepoStatus } from "./registry";
import { looksObfuscated } from "./scorecard";
import { memoryPluginStore } from "./store";
import { normaliseStreams } from "./streams";

export interface ScorecardHostDeps {
  download: Download;
  run(plugin: LoadedPlugin, req: ResolveRequest, timeoutMs: number): Promise<unknown>;
  /** The jar the sandbox's fetches for this plugin use (its cookies ride on its streams). */
  jarFor(pluginKey: string): CookieJar;
}

export async function scorecardHost(
  row: PluginRepoRow,
  deps: ScorecardHostDeps,
): Promise<{ host: PluginHost; plugins: LoadedPlugin[]; status: RepoStatus; obfuscated: string[] }> {
  const store = memoryPluginStore();
  const live = { ...row, enabled: true, down: false };
  const status = await installRepo(live, store, deps.download);
  const plugins = status.version == null ? [] : loadPlugins(live, store);
  const host = new PluginHost({
    plugins: () => plugins,
    run: deps.run,
    normalise: (p, raw) => normaliseStreams(p, raw, deps.jarFor(p.key)),
    now: Date.now,
  });
  return { host, plugins, status, obfuscated: plugins.filter((p) => looksObfuscated(p.source)).map((p) => p.pluginId) };
}
