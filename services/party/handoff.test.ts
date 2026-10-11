import { isPluginItem, parseStreamHandoff, pluginRefFor, type QueueItem } from "@/services/party/protocol";

const ok = {
  itemId: "movie:10378",
  key: "open-movies/open-movies:abc",
  sourceId: "open-movies/open-movies",
  url: "https://cdn.example.net/bbb/master.m3u8",
  headers: { Referer: "https://r.example.net/" },
  durationSec: 634.5,
  language: "en",
};

describe("parseStreamHandoff", () => {
  it("accepts a well-formed handoff", () => {
    expect(parseStreamHandoff(ok)).toEqual(ok);
    expect(parseStreamHandoff({ ...ok, container: "dash" })).toEqual({ ...ok, container: "dash" });
  });

  it.each([
    ["a plain-http URL", { ...ok, url: "http://cdn.example.net/x.m3u8" }],
    ["a non-URL", { ...ok, url: "javascript:alert(1)" }],
    ["a non-string header", { ...ok, headers: { Referer: 5 } }],
    ["too many headers", { ...ok, headers: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`h${i}`, "v"])) }],
    ["an oversized URL", { ...ok, url: `https://cdn.example.net/${"a".repeat(5000)}` }],
    ["a negative length", { ...ok, durationSec: -3 }],
    ["an unknown container", { ...ok, container: "mkv" }],
    ["no item id", { ...ok, itemId: "" }],
    ["not an object", "hello"],
  ])("refuses %s", (_, raw) => {
    expect(parseStreamHandoff(raw)).toBeNull();
  });
});

describe("pluginRefFor", () => {
  it("names the source and the stream key, with the stream's first language", () => {
    expect(pluginRefFor({ sourceId: "eclipsia/karnis", key: "eclipsia/karnis:k1", languages: ["hi", "en"] }, { tmdbId: "1396", type: "tv", season: 1, episode: 2 })).toEqual({
      source: "plugin",
      tmdbId: "1396",
      type: "tv",
      season: 1,
      episode: 2,
      pluginId: "eclipsia/karnis",
      streamId: "eclipsia/karnis:k1",
      language: "hi",
    });
  });

  it("carries no URL — the queue (Postgres) never sees one", () => {
    const ref = pluginRefFor({ sourceId: "s/p", key: "s/p:k", languages: [] }, { tmdbId: "1", type: "movie" });
    expect(JSON.stringify(ref)).not.toMatch(/https?:/);
    expect(ref).not.toHaveProperty("language");
  });
});

describe("isPluginItem", () => {
  it("recognises a plugin queue item", () => {
    const item = { id: "movie:1", ref: { source: "plugin", tmdbId: "1", type: "movie", pluginId: "s/p" }, status: "queued" } as unknown as QueueItem;
    expect(isPluginItem(item)).toBe(true);
    expect(isPluginItem({ ...item, ref: { source: "tmdb", tmdbId: "1", type: "movie" } } as QueueItem)).toBe(false);
    expect(isPluginItem(null)).toBe(false);
  });
});
