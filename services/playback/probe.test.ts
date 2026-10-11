import type { PlaybackCandidate } from "./candidate";
import { mergeProbe, PROBE_BUDGET_MS, ProbeCache, probeCandidate, type ProbeFetch, type ProbeResponse } from "./probe";

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
  const calls: { url: string; headers: Record<string, string>; opts: { maxBytes: number; responseType: string; alive?: () => boolean } }[] = [];
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
    expect(calls[2].opts).toMatchObject({ maxBytes: 4096, responseType: "base64" });
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
    expect(calls[0].opts).toMatchObject({ maxBytes: 65536, responseType: "base64" });
  });

  it("keeps a real QuickTime file whose first frame carries x264's settings as text (Tears of Steel's MOV)", async () => {
    // The file's real first bytes: ftyp qt, wide, mdat, then an SEI with the encoder's options in plain ASCII — 96% printable.
    const head = Buffer.from("000000146674797071742020000002007174202000000008776964651625daef6d646174000002c70605ffffc3dc45e9bde6d948b7962cd820d923eeef", "hex");
    const x264 = Buffer.from(
      "x264 - core 122 - H.264/MPEG-4 AVC codec - Copyleft 2003-2012 - http://www.videolan.org/x264.html - options: cabac=0 ref=2 deblock=1:0:0 analyse=0x1:0x111 me=dia subme=6 psy=0 mixed_ref=0 me_range=16 chroma_me=1 trellis=0 8x8dct=0 cqm=0 deadzone=21,11 fast_pskip=1 chroma_qp_offset=0 threads=1 sliced_threads=0 nr=0 decimate=1 interlaced=0 bluray_compat=0 constrained_intra=0 bframes=3 b_pyramid=0 b_adapt=1 b_bias=0 direct=3 weightb=0 open_gop=0 weightp=2 keyint=18 keyint_min=10 scenecut=40 intra_refresh=0 rc_lookahead=18 rc=cbr mbtree=0 bitrate=4000",
      "ascii",
    );
    const url = "https://a.example.net/tears_of_steel_720p.mov";
    const out = await probeCandidate(cand({ url, container: "mp4" }), FILM, server({ [url]: bin([...head, ...x264]) }).fetch);
    expect(out).toMatchObject({ verdict: "unverified", container: "mp4" });
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

  it("a passing network error or a busy server is not evidence: the stream stays playable, unverified", async () => {
    for (const r of [new Error("boom"), text("", { status: 503 }), text("", { status: 429 }), text("", { status: 408 })]) {
      await expect(probeCandidate(cand(), FILM, server({ "https://a.example.net/x/master.m3u8": r }).fetch)).resolves.toMatchObject({ verdict: "unverified" });
    }
  });

  it("a refused private address or a 404 is evidence: rejected", async () => {
    const blocked = Object.assign(new Error("Blocked URL (host)"), { code: "blocked" });
    await expect(probeCandidate(cand(), FILM, server({ "https://a.example.net/x/master.m3u8": blocked }).fetch)).resolves.toMatchObject({ verdict: "rejected", rejectReason: "unreachable" });
    await expect(probeCandidate(cand(), FILM, server({ "https://a.example.net/x/master.m3u8": text("", { status: 404 }) }).fetch)).resolves.toMatchObject({ verdict: "rejected", rejectReason: "unreachable" });
  });

  it.each([
    ["a BOM before an HTML page", "\uFEFF<!DOCTYPE html><html><body>login</body></html>"],
    ["a comment before the page", "<!-- cdn --><html><body>nope</body></html>"],
    ["XHTML", '<?xml version="1.0"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"></html>'],
    ["a JSON error", '{"error":"token expired"}'],
    ["plain text", "Access denied"],
    ["text that starts like a TS sync byte", "Gateway Timeout"],
    ["an empty body", ""],
  ])("rejects %s where a video should be", async (_, body) => {
    const url = "https://a.example.net/f.mp4";
    const out = await probeCandidate(cand({ url, container: "mp4" }), FILM, server({ [url]: bin(body) }).fetch);
    expect(out).toMatchObject({ verdict: "rejected", rejectReason: "html-body" });
  });

  it("rejects an HLS segment that is an error message, keeps disguised segments that are real media", async () => {
    const routes = (seg: ProbeResponse) => ({ "https://a.example.net/x/master.m3u8": text(mediaOf([600])), "https://a.example.net/x/seg0.jpg": seg });
    expect(await probeCandidate(cand(), FILM, server(routes(bin('{"error":"forbidden"}'))).fetch)).toMatchObject({ verdict: "rejected", rejectReason: "html-body" });
    expect(await probeCandidate(cand(), FILM, server(routes(bin([0x47, 0x40, 0x11, 0x10]))).fetch)).toMatchObject({ verdict: "ok" }); // MPEG-TS
    expect(await probeCandidate(cand(), FILM, server(routes(bin([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).fetch)).toMatchObject({ verdict: "ok" }); // PNG-wrapped
  });

  it("reads a namespaced MPD", async () => {
    const mpd = `<?xml version="1.0"?><mpd:MPD xmlns:mpd="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT10M"></mpd:MPD>`;
    const out = await probeCandidate(cand({ url: "https://a.example.net/m.mpd", container: "dash" }), FILM, server({ "https://a.example.net/m.mpd": text(mpd) }).fetch);
    expect(out).toMatchObject({ verdict: "ok", container: "dash", durationSec: 600 });
  });

  it("stops fetching once its budget is over", async () => {
    jest.useFakeTimers();
    try {
      let release!: () => void;
      const { fetch, calls } = server({
        "https://a.example.net/x/master.m3u8": () => new Promise<ProbeResponse>((r) => (release = () => r(text(MASTER)))),
        "https://a.example.net/x/v/720.m3u8": text(mediaOf([600])),
      });
      const out = probeCandidate(cand(), FILM, fetch);
      await jest.advanceTimersByTimeAsync(PROBE_BUDGET_MS);
      await expect(out).resolves.toMatchObject({ verdict: "unverified" });
      expect(calls[0].opts.alive?.()).toBe(false);
      release();
      await jest.advanceTimersByTimeAsync(0);
      expect(calls).toHaveLength(1); // the variant was never fetched after the budget ran out
    } finally {
      jest.useRealTimers();
    }
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

describe("mergeProbe", () => {
  it("keeps the current candidate's identity and takes only what the probe measured", () => {
    const current = cand({ key: "new-key", label: "New label", languages: ["hi"], headers: { Cookie: "fresh" } });
    const probed = cand({ key: "old-key", label: "Old label", languages: ["hi", "en"], verdict: "ok", durationSec: 600, container: "hls", quality: { label: "720p", height: 720 }, platforms: { ios: false, android: true } });
    expect(mergeProbe(current, probed)).toMatchObject({
      key: "new-key",
      label: "New label",
      headers: { Cookie: "fresh" },
      languages: ["hi", "en"],
      verdict: "ok",
      durationSec: 600,
      quality: { label: "720p", height: 720 },
      platforms: { ios: false, android: true },
    });
  });
});

describe("ProbeCache", () => {
  const FILM10 = { kind: "movie" as const, runtimeMin: 10 };

  it("keeps conclusive results for 15 minutes, keyed by URL and title context, and applies them to the current candidate", () => {
    const t = { now: 0 };
    const cache = new ProbeCache(() => t.now);
    const probed = cand({ verdict: "ok", durationSec: 600 });
    cache.set(probed, FILM10);
    expect(cache.get(cand({ label: "fresh" }), FILM10)).toMatchObject({ label: "fresh", verdict: "ok", durationSec: 600 });
    expect(cache.get(cand(), { kind: "movie" })).toBeUndefined(); // no runtime then: the length was never checked
    expect(cache.get(cand(), { kind: "tv", runtimeMin: 10 })).toBeUndefined();
    t.now = 15 * 60_000 + 1;
    expect(cache.get(cand(), FILM10)).toBeUndefined();
  });

  it("never keeps an inconclusive result", () => {
    const cache = new ProbeCache(() => 0);
    cache.set(cand({ verdict: "unverified" }), FILM10);
    expect(cache.get(cand(), FILM10)).toBeUndefined();
  });

  it("holds at most 500 entries, oldest out first", () => {
    const cache = new ProbeCache(() => 0);
    for (let i = 0; i < 501; i++) cache.set(cand({ url: `https://a.example.net/${i}.m3u8`, verdict: "ok" }), FILM10);
    expect(cache.get(cand({ url: "https://a.example.net/0.m3u8" }), FILM10)).toBeUndefined();
    expect(cache.get(cand({ url: "https://a.example.net/500.m3u8" }), FILM10)).toMatchObject({ verdict: "ok" });
  });
});
