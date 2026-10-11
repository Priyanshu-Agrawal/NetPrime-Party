import type { PlaybackCandidate } from "@/services/playback/candidate";
import type { HostResult, ResolveRequest } from "./PluginHost";
import { looksObfuscated, scoreRepo, type BenchTitle, type ScoreDeps } from "./scorecard";
import type { PluginStream } from "./streams";

const stream = (plugin: string, url: string, name = "English"): PluginStream => ({
  pluginKey: `r/${plugin}@1`,
  repoId: "r",
  pluginId: plugin,
  name,
  title: "",
  url,
  headers: {},
  subtitles: [],
});
const TITLES: BenchTitle[] = [
  { tmdbId: "1", type: "movie", name: "One", runtimeMin: 100 },
  { tmdbId: "2", type: "movie", name: "Two", runtimeMin: 120 },
];

function deps(byTitle: Record<string, HostResult>, verdicts: Record<string, Partial<PlaybackCandidate>> = {}, over: Partial<ScoreDeps> = {}): ScoreDeps {
  let t = 0;
  return {
    pluginIds: [],
    getStreams: jest.fn(async (req: ResolveRequest, opts?: Parameters<ScoreDeps["getStreams"]>[1]) => {
      const r = byTitle[req.tmdbId];
      t += 500;
      if (r.streams.length) opts?.onStreams?.(r.streams[0].pluginKey, r.streams);
      for (const key of new Set(r.streams.map((x) => x.pluginKey))) opts?.onSettled?.(key);
      for (const key of r.ran) opts?.onSettled?.(key);
      for (const f of r.failures) opts?.onSettled?.(f.pluginKey, f);
      return r;
    }),
    probe: jest.fn(async (c: PlaybackCandidate) => ({ ...c, verdict: "ok" as const, ...verdicts[c.url] })),
    platform: "android",
    now: () => t,
    bytesUsed: () => 0,
    budgetBytes: 1e9,
    stopped: () => false,
    probeLimit: 8,
    ...over,
  };
}
/** `ran` here = plugins that answered with nothing (settled, no failure, no streams). */
const answeredEmpty = (keys: string[], h: HostResult): HostResult => ({ ...h, ran: keys });
const host = (streams: PluginStream[], failures: HostResult["failures"] = []): HostResult => ({ streams, failures, ran: [], complete: true });

describe("scoreRepo", () => {
  it("counts streams, playable streams and wrong content per title and per plugin", async () => {
    const report = await scoreRepo(
      TITLES,
      deps(
        {
          "1": host([stream("a", "https://x.example.net/1.m3u8"), stream("b", "https://y.example.net/2.m3u8")]),
          "2": host([stream("a", "https://x.example.net/3.m3u8"), stream("a", "https://x.example.net/4.mpd")]),
        },
        {
          "https://y.example.net/2.m3u8": { verdict: "rejected", rejectReason: "duration" },
          "https://x.example.net/4.mpd": { verdict: "unverified" },
        },
      ),
    );
    expect(report.titles.map((t) => [t.name, t.streams, t.playable, t.wrong])).toEqual([
      ["One", 2, 1, 1],
      ["Two", 2, 1, 0],
    ]);
    const a = report.plugins.find((p) => p.pluginId === "a")!;
    const b = report.plugins.find((p) => p.pluginId === "b")!;
    expect(a).toMatchObject({ titlesWithStreams: 2, streams: 3, playable: 2, wrong: 0 });
    expect(b).toMatchObject({ titlesWithStreams: 1, streams: 1, playable: 0, wrong: 1 });
    expect(report.stoppedBy).toBe("done");
  });

  it("counts Hindi only for playable streams that carry it", async () => {
    const report = await scoreRepo(
      [TITLES[0]],
      deps(
        { "1": host([stream("a", "https://x.example.net/h.m3u8", "Hindi"), stream("a", "https://x.example.net/h2.m3u8", "Hindi")]) },
        { "https://x.example.net/h2.m3u8": { verdict: "rejected", rejectReason: "unreachable" } },
      ),
    );
    expect(report.titles[0].hindiPlayable).toBe(1);
    expect(report.plugins[0].hindiPlayable).toBe(1);
  });

  it("a stream that plays only on Android isn't playable on iPhone", async () => {
    const report = await scoreRepo(
      [TITLES[0]],
      deps({ "1": host([stream("a", "https://x.example.net/m.mpd")]) }, { "https://x.example.net/m.mpd": { platforms: { ios: false, android: true } } }, { platform: "ios" }),
    );
    expect(report.titles[0].playable).toBe(0);
  });

  it("records the time to the first stream", async () => {
    const report = await scoreRepo([TITLES[0]], deps({ "1": host([stream("a", "https://x.example.net/1.m3u8")]) }));
    expect(report.titles[0].firstStreamMs).toBe(500);
  });

  it("tallies each plugin's failures by reason", async () => {
    const report = await scoreRepo(
      [TITLES[0]],
      deps({ "1": host([], [{ pluginKey: "r/c@1", reason: "timeout", ms: 15000 }, { pluginKey: "r/c@1", reason: "error", ms: 10 }]) }),
    );
    expect(report.plugins.find((p) => p.pluginId === "c")!.failures).toEqual({ timeout: 1, error: 1 });
  });

  it("stops at the data budget before starting another title", async () => {
    let bytes = 0;
    const d = deps(
      { "1": host([stream("a", "https://x.example.net/1.m3u8")]), "2": host([stream("a", "https://x.example.net/2.m3u8")]) },
      {},
      { bytesUsed: () => bytes, budgetBytes: 1000 },
    );
    (d.getStreams as jest.Mock).mockImplementation(async (req: ResolveRequest) => {
      bytes += 2000;
      return req.tmdbId === "1" ? host([stream("a", "https://x.example.net/1.m3u8")]) : host([]);
    });
    const report = await scoreRepo(TITLES, d);
    expect(report.titles.map((t) => t.name)).toEqual(["One"]);
    expect(d.probe).not.toHaveBeenCalled(); // over budget after the plugins ran: probes skipped too
    expect(report.stoppedBy).toBe("budget");
    expect(report.bytes).toBe(2000);
  });

  it("stops when the user asks", async () => {
    let stop = false;
    const d = deps({ "1": host([]), "2": host([]) }, {}, { stopped: () => stop, onProgress: () => (stop = true) });
    const report = await scoreRepo(TITLES, d);
    expect(report.titles).toHaveLength(1);
    expect(report.stoppedBy).toBe("user");
  });

  it("probes at most probeLimit candidates per title", async () => {
    const many = Array.from({ length: 12 }, (_, i) => stream("a", `https://h${i}.example.net/${i}.m3u8`));
    const d = deps({ "1": host(many) }, {}, { probeLimit: 5 });
    await scoreRepo([TITLES[0]], d);
    expect(d.probe).toHaveBeenCalledTimes(5);
  });
});

describe("scoreRepo accounts for every plugin and probes fairly", () => {
  it("every loaded plugin gets a row: streams, answered empty, failed, or never ran", async () => {
    const report = await scoreRepo(
      [TITLES[0]],
      deps(
        { "1": answeredEmpty(["r/b@1"], host([stream("a", "https://x.example.net/1.m3u8")], [{ pluginKey: "r/c@1", reason: "timeout", ms: 15000 }])) },
        {},
        { pluginIds: ["a", "b", "c", "d"] },
      ),
    );
    const row = (id: string) => report.plugins.find((p) => p.pluginId === id)!;
    expect(row("a")).toMatchObject({ answered: 1, empty: 0, streams: 1 });
    expect(row("b")).toMatchObject({ answered: 1, empty: 1, streams: 0 });
    expect(row("c")).toMatchObject({ answered: 0, failures: { timeout: 1 } });
    expect(row("d")).toMatchObject({ answered: 0, notRun: 1 });
  });

  it("every plugin gets a probe before any gets a second", async () => {
    const d = deps(
      {
        "1": host([
          stream("a", "https://a1.example.net/1.m3u8", "Hindi"),
          stream("a", "https://a2.example.net/2.m3u8", "Hindi"),
          stream("a", "https://a3.example.net/3.m3u8", "Hindi"),
          stream("b", "https://b1.example.net/4.m3u8", "English"),
        ]),
      },
      {},
      { probeLimit: 2 },
    );
    const report = await scoreRepo([TITLES[0]], d);
    expect((d.probe as jest.Mock).mock.calls.map(([c]) => c.sourceId).sort()).toEqual(["r/a", "r/b"]);
    expect(report.plugins.find((p) => p.pluginId === "a")).toMatchObject({ streams: 3, probed: 1 });
    expect(report.titles[0]).toMatchObject({ streams: 4, probed: 2 });
  });

  it("an unverified stream (no time to check, moov at the end) is counted apart from playable", async () => {
    const report = await scoreRepo(
      [TITLES[0]],
      deps({ "1": host([stream("a", "https://x.example.net/f.mp4")]) }, { "https://x.example.net/f.mp4": { verdict: "unverified" } }),
    );
    expect(report.titles[0]).toMatchObject({ playable: 0, unverified: 1 });
    expect(report.plugins[0]).toMatchObject({ playable: 0, unverified: 1 });
  });
});

describe("looksObfuscated", () => {
  it("plain code is readable", () => {
    expect(looksObfuscated('async function getStreams(id, type) {\n  const res = await fetch("https://api.example.net/" + id);\n  return [];\n}\n')).toBe(false);
  });
  it("a long one-line bundle is not", () => {
    expect(looksObfuscated("var a=1;".repeat(8000))).toBe(true);
  });
  it("_0x identifier soup is not", () => {
    expect(looksObfuscated(Array.from({ length: 30 }, (_, i) => `var _0x${(0x1a2b + i).toString(16)}=${i};`).join("\n"))).toBe(true);
  });
  it("a giant string payload is not", () => {
    expect(looksObfuscated(`const p = "${"A".repeat(6000)}";\nrun(p);\n`)).toBe(true);
  });
});
