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
