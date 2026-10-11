import type { PluginRepoRow } from "@/src/types/worker.types";
import { CookieJar } from "./cookieJar";
import { scorecardHost } from "./devScorecard";

const MANIFEST = JSON.stringify({
  name: "Cand",
  scrapers: [
    { id: "plain", name: "Plain", filename: "providers/plain.js", supportedTypes: ["movie"] },
    { id: "packed", name: "Packed", filename: "providers/packed.js", supportedTypes: ["movie"] },
  ],
});
const FILES: Record<string, string> = {
  "manifest.json": MANIFEST,
  "providers/plain.js": "async function getStreams(id) {\n  return [];\n}\nmodule.exports = { getStreams };\n",
  "providers/packed.js": "var a=1;".repeat(8000),
};
const BASE = "https://codeberg.org/x/y/raw/commit/abc/";
const shaOf = (path: string) => `sha-${path}`.padEnd(64, "0").slice(0, 64);
const ROW: PluginRepoRow = {
  id: "cand",
  manifestUrl: `${BASE}manifest.json`,
  version: 1,
  files: Object.keys(FILES).map((path) => ({ path, sha256: shaOf(path) })),
  enabled: false,
  down: false,
  allowPlugins: ["plain", "packed"],
};
const download = jest.fn(async (url: string) => {
  const path = url.slice(BASE.length);
  return { status: 200, body: Buffer.from(FILES[path]).toString("base64"), sha256: shaOf(path) };
});

describe("scorecardHost", () => {
  it("installs a disabled candidate in memory only and runs its plugins through the given sandbox", async () => {
    const run = jest.fn(async () => [{ name: "Plain • English", title: "x", url: "https://cdn.example.net/a.m3u8", quality: "720p" }]);
    const jars = new Map<string, CookieJar>();
    const { host, plugins, status, obfuscated } = await scorecardHost(ROW, { download, run, jarFor: (k) => jars.get(k) ?? new CookieJar() });
    expect(status.state).toBe("ok");
    expect(plugins.map((p) => p.pluginId)).toEqual(["plain", "packed"]);
    expect(obfuscated).toEqual(["packed"]);
    const r = await host.getStreams({ tmdbId: "1", type: "movie" });
    expect(run).toHaveBeenCalledTimes(2);
    expect(r.streams.map((s) => s.pluginId)).toEqual(["plain", "packed"]);
  });

  it("a file whose hash doesn't match fails the candidate with no plugins", async () => {
    const bad = { ...ROW, files: ROW.files.map((f) => (f.path === "providers/plain.js" ? { ...f, sha256: "f".repeat(64) } : f)) };
    const { plugins, status } = await scorecardHost(bad, { download, run: jest.fn(), jarFor: () => new CookieJar() });
    expect(status.state).toBe("failed");
    expect(status.detail).toMatch(/hash mismatch/);
    expect(plugins).toEqual([]);
  });

  it("each scorecard run starts from a fresh store (nothing is kept between runs)", async () => {
    download.mockClear();
    await scorecardHost(ROW, { download, run: jest.fn(), jarFor: () => new CookieJar() });
    await scorecardHost(ROW, { download, run: jest.fn(), jarFor: () => new CookieJar() });
    expect(download).toHaveBeenCalledTimes(6);
  });
});
