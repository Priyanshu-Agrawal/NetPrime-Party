import type { PluginStream } from "@/services/plugins/streams";
import { candidateKey, containerOf, heightOf, platformsOf, toCandidates, urlShape } from "./candidate";

const stream = (over: Partial<PluginStream> = {}): PluginStream => ({
  pluginKey: "r/p@1",
  repoId: "r",
  pluginId: "p",
  name: "Vidrock • Hindi",
  title: "Jawan 1080p",
  url: "https://cdn3.example.net/hls/9f8e7d6c5b4a/1080/index.m3u8?token=abc",
  headers: { Referer: "https://r.example.net/" },
  subtitles: [],
  ...over,
});

describe("containerOf / platformsOf", () => {
  it.each([
    ["https://a.example.net/x/master.m3u8?t=1", "hls"],
    ["https://a.example.net/x/manifest.mpd", "dash"],
    ["https://a.example.net/film.MP4", "mp4"],
    ["https://a.example.net/film.mov", "mp4"],
    ["https://a.example.net/film.mkv", "unsupported"],
    ["https://a.example.net/play?id=9", "unknown"],
  ])("%s → %s", (url, want) => expect(containerOf(url)).toBe(want));

  it("keeps DASH off iPhone and unsupported files off both", () => {
    expect(platformsOf("dash")).toEqual({ ios: false, android: true });
    expect(platformsOf("unsupported")).toEqual({ ios: false, android: false });
    expect(platformsOf("hls")).toEqual({ ios: true, android: true });
  });
});

describe("heightOf", () => {
  it.each([
    ["1080P", 1080],
    ["FHD", 1080],
    ["720p", 720],
    ["HD", 720],
    ["4K HDR", 2160],
    ["480p", 480],
    ["SD", 480],
    ["Auto", undefined],
    [undefined, undefined],
  ])("%s → %s", (label, want) => expect(heightOf(label)).toBe(want));
});

describe("candidate keys", () => {
  it("survive a re-resolve: fresh tokens, CDN numbers and query strings don't change them", () => {
    const a = "https://cdn3.example.net/hls/9f8e7d6c5b4a3210/1080/index.m3u8?token=abc";
    const b = "https://cdn7.example.net/hls/0a1b2c3d4e5f6789/1080/index.m3u8?token=xyz";
    expect(urlShape(a)).toBe(urlShape(b));
    expect(candidateKey("r/p", "Vidrock • Hindi", a)).toBe(candidateKey("r/p", "vidrock  •  hindi", b));
  });

  it("differ by source and by label", () => {
    const u = "https://a.example.net/x.m3u8";
    expect(candidateKey("r/p", "Hindi", u)).not.toBe(candidateKey("r/q", "Hindi", u));
    expect(candidateKey("r/p", "Hindi", u)).not.toBe(candidateKey("r/p", "Tamil", u));
  });
});

describe("toCandidates", () => {
  it("maps a plugin stream to an unverified candidate", () => {
    const [c] = toCandidates([stream({ quality: "1080p", subtitles: [{ url: "https://s.example.net/en.vtt", language: "English", label: "English" }] })], { titleName: "Jawan" });
    expect(c).toMatchObject({
      sourceId: "r/p",
      label: "Vidrock • Hindi",
      container: "hls",
      languages: ["hi"],
      quality: { label: "1080p", height: 1080 },
      platforms: { ios: true, android: true },
      subtitles: [{ id: "0", url: "https://s.example.net/en.vtt", label: "English", language: "en" }],
      verdict: "unverified",
      order: 0,
      headers: { Referer: "https://r.example.net/" },
    });
    expect(c.key.startsWith("r/p:")).toBe(true);
  });

  it("drops duplicate URLs and keeps keys unique", () => {
    const out = toCandidates(
      [
        stream({ url: "https://a.example.net/1/x.m3u8" }),
        stream({ url: "https://a.example.net/1/x.m3u8", pluginKey: "r/q@1", pluginId: "q" }),
        stream({ url: "https://a.example.net/2/x.m3u8" }),
      ],
      {},
    );
    expect(out).toHaveLength(2);
    expect(new Set(out.map((c) => c.key)).size).toBe(2);
    expect(out.map((c) => c.order)).toEqual([0, 1]);
  });

  it("rejects files no player here can open", () => {
    expect(toCandidates([stream({ url: "https://a.example.net/film.mkv" })], {})[0]).toMatchObject({ verdict: "rejected", rejectReason: "platform" });
  });

  it("takes the height from the name when the plugin gives no quality", () => {
    expect(toCandidates([stream({ name: "Castle - Tamil - 720P" })], {})[0].quality).toEqual({ label: "720p", height: 720 });
  });
});
