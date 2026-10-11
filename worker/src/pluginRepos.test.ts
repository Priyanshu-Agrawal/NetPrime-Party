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
