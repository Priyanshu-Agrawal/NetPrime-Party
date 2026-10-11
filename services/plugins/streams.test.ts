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
            url: "https://cdn.example.net/a.m3u8",
            quality: 1080,
            headers: { Referer: "https://r.example.net/" },
            language: "Hindi",
            size: "1.2 GB",
            subtitles: [{ url: "https://s.example.net/en.vtt", lang: "en", label: "English" }],
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
        url: "https://cdn.example.net/a.m3u8",
        quality: "1080",
        headers: { Referer: "https://r.example.net/" },
        subtitles: [{ url: "https://s.example.net/en.vtt", language: "en", label: "English" }],
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
      [null, 5, "x", { url: "magnet:?xt=urn:btih:abc" }, { url: "javascript:alert(1)" }, { url: "file:///x" }, { url: "/relative.m3u8" }, { infoHash: "abc" }, { url: "https://ok.example.net/x.mp4" }],
      jar(),
    );
    expect(out?.map((s) => [s.url, s.name])).toEqual([["https://ok.example.net/x.mp4", "p"]]);
  });

  it(`keeps at most ${MAX_STREAMS_PER_PLUGIN} streams per plugin and cuts long strings`, () => {
    const many = Array.from({ length: 10_000 }, (_, i) => ({ url: `https://ok.example.net/${i}`, name: "x".repeat(10_000) }));
    const out = normaliseStreams(P, many, jar())!;
    expect(out).toHaveLength(MAX_STREAMS_PER_PLUGIN);
    expect(out[0].name).toHaveLength(200);
  });

  it("takes Stremio proxy headers and drops header injection", () => {
    const out = normaliseStreams(P, [{ url: "https://ok.example.net/", behaviorHints: { proxyHeaders: { request: { Origin: "https://o.example.net", "X-Bad": "a\r\nb" } } } }], jar());
    expect(out?.[0].headers).toEqual({ Origin: "https://o.example.net" });
  });

  it("attaches the plugin's jar cookies when it set no Cookie, and keeps its own", () => {
    const j = jar();
    j.store([{ name: "cf", value: "1", domain: "cdn.example.net", path: "/", hostOnly: false, secure: true, expiresAt: 0 }]);
    const out = normaliseStreams(P, [{ url: "https://v.cdn.example.net/a.mpd" }, { url: "https://v.cdn.example.net/b.mpd", headers: { cookie: "own=1" } }], j)!;
    expect(out[0].headers).toEqual({ Cookie: "cf=1" });
    expect(out[1].headers).toEqual({ cookie: "own=1" });
  });

  it("drops streams and subtitles on private or local addresses (the video player would fetch them)", () => {
    const out = normaliseStreams(
      P,
      [
        { url: "http://192.168.1.10/a.m3u8" },
        { url: "http://router.local/x.m3u8" },
        { url: "http://127.0.0.1:8080/x.m3u8" },
        { url: "https://ok.test.example.net/x.m3u8", subtitles: [{ url: "http://10.0.0.1/s.vtt" }, { url: "https://s.example.net/en.vtt", lang: "en" }] },
      ],
      jar(),
    );
    expect(out?.map((s) => s.url)).toEqual(["https://ok.test.example.net/x.m3u8"]);
    expect(out?.[0].subtitles.map((t) => t.url)).toEqual(["https://s.example.net/en.vtt"]);
  });

  it("keeps only http(s) subtitles and labels them", () => {
    const out = normaliseStreams(P, [{ url: "https://ok.example.net/", subtitles: [{ url: "https://s.example.net/fr.srt", language: "fr" }, { url: "ftp://x" }, { url: "https://s.example.net/x.vtt" }] }], jar());
    expect(out?.[0].subtitles).toEqual([
      { url: "https://s.example.net/fr.srt", language: "fr", label: "fr" },
      { url: "https://s.example.net/x.vtt", language: undefined, label: "Subtitles" },
    ]);
  });
});
