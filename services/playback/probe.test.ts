import type { PlaybackCandidate } from "./candidate";
import { PROBE_BUDGET_MS, probeCandidate, type ProbeFetch, type ProbeResponse } from "./probe";

const cand = (over: Partial<PlaybackCandidate> = {}): PlaybackCandidate => ({
  key: "r/p:k",
  sourceId: "r/p",
  label: "Hindi",
  url: "https://a.example.net/x/master.m3u8",
  headers: { Referer: "https://r.example.net/" },
  container: "hls",
  languages: [],
  platforms: { ios: true, android: true },
  subtitles: [],
  verdict: "unverified",
  order: 0,
  ...over,
});
const text = (body: string, over: Partial<ProbeResponse> = {}): ProbeResponse => ({ status: 200, url: "", redirected: false, body, encoding: "text", ...over });
const bin = (bytes: number[] | string, over: Partial<ProbeResponse> = {}): ProbeResponse => ({
  status: 206,
  url: "",
  redirected: false,
  body: Buffer.from(typeof bytes === "string" ? bytes : Uint8Array.from(bytes)).toString("base64"),
  encoding: "base64",
  ...over,
});

/** Routes by "url|responseType" first, then by url. */
function server(routes: Record<string, ProbeResponse | Error | (() => Promise<ProbeResponse>)>) {
  const calls: { url: string; headers: Record<string, string>; opts: { maxBytes: number; responseType: string } }[] = [];
  const fetch: ProbeFetch = async (url, headers, opts) => {
    calls.push({ url, headers, opts });
    const r = routes[`${url}|${opts.responseType}`] ?? routes[url];
    if (!r) throw new Error(`no route ${url}`);
    if (r instanceof Error) throw r;
    const v = typeof r === "function" ? await r() : r;
    return { ...v, url: v.url || url };
  };
  return { fetch, calls };
}

const MASTER = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="Hindi",LANGUAGE="hi",URI="a/hi.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=1280x720
v/720.m3u8
`;
const mediaOf = (secs: number[], ended = true) => `#EXTM3U\n${secs.map((s, i) => `#EXTINF:${s},\nseg${i}.jpg`).join("\n")}\n${ended ? "#EXT-X-ENDLIST\n" : ""}`;
const FILM = { kind: "movie" as const, runtimeMin: 10 };

function box(type: string, payload: number[]): number[] {
  const size = 8 + payload.length;
  return [(size >>> 24) & 255, (size >>> 16) & 255, (size >>> 8) & 255, size & 255, ...[...type].map((ch) => ch.charCodeAt(0)), ...payload];
}
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const MP4_600S = [...box("ftyp", [105, 115, 111, 109, 0, 0, 2, 0]), ...box("moov", box("mvhd", [0, 0, 0, 0, ...u32(0), ...u32(0), ...u32(1000), ...u32(600_000), ...new Array(80).fill(0)]))];

describe("probeCandidate", () => {
  it("follows master → media → first segment and reads languages, height and length", async () => {
    const { fetch, calls } = server({
      "https://a.example.net/x/master.m3u8": text(MASTER),
      "https://a.example.net/x/v/720.m3u8": text(mediaOf([300, 300])),
      "https://a.example.net/x/v/seg0.jpg": bin([0xff, 0xd8, 0xff, 0xe0]),
    });
    const out = await probeCandidate(cand({ quality: { label: "1080P", height: 1080 } }), FILM, fetch);
    expect(out).toMatchObject({ verdict: "ok", durationSec: 600, languages: ["hi"], quality: { label: "720p", height: 720 }, container: "hls" });
    expect(calls.map((c) => c.url)).toEqual(["https://a.example.net/x/master.m3u8", "https://a.example.net/x/v/720.m3u8", "https://a.example.net/x/v/seg0.jpg"]);
    expect(calls[2].headers).toEqual({ Referer: "https://r.example.net/", Range: "bytes=0-2047" });
    expect(calls[2].opts).toEqual({ maxBytes: 4096, responseType: "base64" });
  });

  it("leaves a live playlist unverified", async () => {
    const { fetch } = server({ "https://a.example.net/x/master.m3u8": text(mediaOf([6, 6], false)), "https://a.example.net/x/seg0.jpg": bin([1, 2]) });
    await expect(probeCandidate(cand(), FILM, fetch)).resolves.toMatchObject({ verdict: "unverified", durationSec: undefined });
  });

  it("rejects an unreachable stream, an HTML page, and a segment that is really a page", async () => {
    expect(await probeCandidate(cand(), FILM, server({ "https://a.example.net/x/master.m3u8": text("", { status: 403 }) }).fetch)).toMatchObject({
      verdict: "rejected",
      rejectReason: "unreachable",
    });
    expect(await probeCandidate(cand(), FILM, server({ "https://a.example.net/x/master.m3u8": text("<!DOCTYPE html><html>login") }).fetch)).toMatchObject({
      verdict: "rejected",
      rejectReason: "html-body",
    });
    const seg = server({ "https://a.example.net/x/master.m3u8": text(mediaOf([600])), "https://a.example.net/x/seg0.jpg": bin("<html><body>no") });
    expect(await probeCandidate(cand(), FILM, seg.fetch)).toMatchObject({ verdict: "rejected", rejectReason: "html-body" });
  });

  it("rejects the wrong length: ±8 min for films, ±3 min for episodes", async () => {
    const routes = { "https://a.example.net/x/master.m3u8": text(mediaOf([600])), "https://a.example.net/x/seg0.jpg": bin([1]) };
    expect(await probeCandidate(cand(), { kind: "movie", runtimeMin: 120 }, server(routes).fetch)).toMatchObject({
      verdict: "rejected",
      rejectReason: "duration",
      durationSec: 600,
    });
    expect(await probeCandidate(cand(), { kind: "tv", runtimeMin: 6 }, server(routes).fetch)).toMatchObject({ verdict: "rejected", rejectReason: "duration" });
    expect(await probeCandidate(cand(), { kind: "tv", runtimeMin: 8 }, server(routes).fetch)).toMatchObject({ verdict: "ok" });
    expect(await probeCandidate(cand(), { kind: "movie" }, server(routes).fetch)).toMatchObject({ verdict: "ok" }); // runtime unknown: no check
  });

  it("DASH plays on Android only; length and languages come from the MPD", async () => {
    const mpd = `<MPD mediaPresentationDuration="PT10M"><Period><AdaptationSet contentType="audio" lang="ta"></AdaptationSet></Period></MPD>`;
    const out = await probeCandidate(cand({ url: "https://a.example.net/m.mpd", container: "dash", platforms: { ios: false, android: true } }), FILM, server({ "https://a.example.net/m.mpd": text(mpd) }).fetch);
    expect(out).toMatchObject({ verdict: "ok", durationSec: 600, languages: ["ta"], platforms: { ios: false, android: true }, container: "dash" });
  });

  it("reads an MP4's length from its first 64 KB with a Range request", async () => {
    const { fetch, calls } = server({ "https://a.example.net/f.mp4": bin(MP4_600S) });
    const out = await probeCandidate(cand({ url: "https://a.example.net/f.mp4", container: "mp4" }), FILM, fetch);
    expect(out).toMatchObject({ verdict: "ok", durationSec: 600, container: "mp4" });
    expect(calls[0].headers.Range).toBe("bytes=0-65535");
    expect(calls[0].opts).toEqual({ maxBytes: 65536, responseType: "base64" });
  });

  it("re-reads an extensionless playlist as text", async () => {
    const url = "https://a.example.net/play?id=9";
    const { fetch } = server({ [`${url}|base64`]: bin(mediaOf([600])), [`${url}|text`]: text(mediaOf([600])), "https://a.example.net/seg0.jpg": bin([1]) });
    await expect(probeCandidate(cand({ url, container: "unknown" }), FILM, fetch)).resolves.toMatchObject({ verdict: "ok", container: "hls", durationSec: 600 });
  });

  it("rejects Matroska for every platform", async () => {
    const out = await probeCandidate(cand({ url: "https://a.example.net/v", container: "unknown" }), FILM, server({ "https://a.example.net/v": bin([0x1a, 0x45, 0xdf, 0xa3, 1]) }).fetch);
    expect(out).toMatchObject({ verdict: "rejected", rejectReason: "platform", platforms: { ios: false, android: false } });
  });

  it("keeps a stream off iPhone when its Origin header only works before a redirect", async () => {
    const { fetch } = server({ "https://a.example.net/x/master.m3u8": text(mediaOf([600]), { redirected: true, url: "https://b.example.net/x/m.m3u8" }), "https://b.example.net/x/seg0.jpg": bin([1]) });
    const out = await probeCandidate(cand({ headers: { Origin: "https://r.example.net" } }), FILM, fetch);
    expect(out.platforms).toEqual({ ios: false, android: true });
  });

  it("a network error rejects as unreachable", async () => {
    await expect(probeCandidate(cand(), FILM, server({ "https://a.example.net/x/master.m3u8": new Error("boom") }).fetch)).resolves.toMatchObject({
      verdict: "rejected",
      rejectReason: "unreachable",
    });
  });

  it("running out of time leaves the candidate playable but unverified", async () => {
    jest.useFakeTimers();
    try {
      const { fetch } = server({ "https://a.example.net/x/master.m3u8": () => new Promise<ProbeResponse>(() => {}) });
      const out = probeCandidate(cand(), FILM, fetch);
      await jest.advanceTimersByTimeAsync(PROBE_BUDGET_MS);
      await expect(out).resolves.toMatchObject({ verdict: "unverified" });
    } finally {
      jest.useRealTimers();
    }
  });

  it("returns an already-rejected candidate untouched, without any request", async () => {
    const { fetch, calls } = server({});
    const c = cand({ verdict: "rejected", rejectReason: "platform" });
    await expect(probeCandidate(c, FILM, fetch)).resolves.toBe(c);
    expect(calls).toHaveLength(0);
  });
});
