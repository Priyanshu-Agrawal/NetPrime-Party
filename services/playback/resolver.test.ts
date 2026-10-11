import type { HostResult } from "@/services/plugins/PluginHost";
import type { PluginStream } from "@/services/plugins/streams";
import type { PlaybackCandidate } from "./candidate";
import type { ProbeContext } from "./probe";
import { PROBE_TOP, probeByBackend, resolvePlayback, sourceIdOf } from "./resolver";

const stream = (plugin: string, url: string, name = "Hindi"): PluginStream => ({
  pluginKey: `r/${plugin}@abc`,
  repoId: "r",
  pluginId: plugin,
  name,
  title: "",
  url,
  headers: {},
  subtitles: [],
});

function deps(host: HostResult, verdicts: Record<string, Partial<PlaybackCandidate>> = {}) {
  const recorded: [string, boolean][] = [];
  const probed: string[] = [];
  const warm = jest.fn();
  return {
    recorded,
    probed,
    warm,
    d: {
      getStreams: jest.fn(async (_req: unknown, _opts?: { onSettled?(pluginKey: string, failure?: { pluginKey: string; reason: string; ms: number }): void }) => host),
      probe: jest.fn(async (c: PlaybackCandidate, _ctx: ProbeContext) => {
        probed.push(c.url);
        return { ...c, verdict: "ok" as const, ...verdicts[c.url] };
      }),
      health: { isDown: () => false, record: (id: string, ok: boolean) => void recorded.push([id, ok]) },
      platform: "android" as const,
      languages: ["hi", "en"],
      warm,
    },
  };
}

describe("resolvePlayback", () => {
  it("keeps the sandbox warm, probes only the top candidates, and returns them ranked", async () => {
    const streams = [
      stream("a", "https://x.example.net/1.m3u8", "English"),
      stream("a", "https://x.example.net/2.m3u8", "Hindi"),
      stream("b", "https://y.example.net/3.m3u8", "Tamil"),
      stream("b", "https://y.example.net/4.m3u8"),
      stream("c", "https://z.example.net/5.m3u8", "Hindi"),
      stream("c", "https://z.example.net/6.mkv", "Hindi"),
    ];
    const { d, probed, warm } = deps(
      { streams, failures: [], ran: ["r/a@abc", "r/b@abc", "r/c@abc"], complete: true },
      { "https://x.example.net/2.m3u8": { verdict: "rejected", rejectReason: "duration" } },
    );
    const out = await resolvePlayback({ tmdbId: "1", type: "movie" }, d);
    expect(warm).toHaveBeenCalledTimes(1);
    expect(probed).toHaveLength(PROBE_TOP);
    expect(probed).not.toContain("https://z.example.net/6.mkv"); // rejected by its container, never probed
    expect(out.ranked.map((c) => c.url)).toEqual([
      "https://y.example.net/4.m3u8",
      "https://z.example.net/5.m3u8",
      "https://x.example.net/1.m3u8",
      "https://y.example.net/3.m3u8",
    ]);
    expect(out.rejected.map((c) => c.rejectReason).sort()).toEqual(["duration", "platform"]);
  });

  it("records health as each plugin settles — stragglers too; empty-fast and sandbox trouble don't count", async () => {
    let settle!: (pluginKey: string, failure?: { pluginKey: string; reason: string; ms: number }) => void;
    const { d, recorded } = deps({ streams: [stream("a", "https://x.example.net/1.m3u8")], failures: [], ran: ["r/a@abc", "r/slow@abc"], complete: false });
    d.getStreams.mockImplementation(async (_req: unknown, opts?: { onSettled?(pluginKey: string, failure?: { pluginKey: string; reason: string; ms: number }): void }) => {
      settle = opts!.onSettled!;
      settle("r/a@abc");
      settle("r/c@abc", { pluginKey: "r/c@abc", reason: "empty-fast", ms: 3 });
      settle("r/d@abc", { pluginKey: "r/d@abc", reason: "crashed", ms: 1 });
      return { streams: [stream("a", "https://x.example.net/1.m3u8")], failures: [], ran: ["r/a@abc", "r/slow@abc"], complete: false };
    });
    await resolvePlayback({ tmdbId: "1", type: "movie" }, d);
    expect(recorded).toEqual([["r/a", true]]); // the straggler is not counted as healthy just because it was started
    settle("r/slow@abc", { pluginKey: "r/slow@abc", reason: "timeout", ms: 15000 });
    expect(recorded).toEqual([
      ["r/a", true],
      ["r/slow", false],
    ]);
  });

  it("hands the probe the title's kind and runtime", async () => {
    const { d } = deps({ streams: [stream("a", "https://x.example.net/1.m3u8")], failures: [], ran: [], complete: true });
    await resolvePlayback({ tmdbId: "1", type: "tv", season: 1, episode: 2, runtimeMin: 47 }, d);
    expect(d.probe.mock.calls[0][1]).toEqual({ kind: "tv", runtimeMin: 47 });
    expect(d.getStreams).toHaveBeenCalledWith({ tmdbId: "1", type: "tv", season: 1, episode: 2 }, { onSettled: expect.any(Function) });
  });
});

describe("probeByBackend", () => {
  it("probes one backend at a time and different backends in parallel", async () => {
    const active = new Map<string, number>();
    let peakSame = 0;
    let peakAll = 0;
    const gates: (() => void)[] = [];
    const cands = ["https://a.x.example.net/1", "https://b.x.example.net/2", "https://y.example.org/3"].map(
      (url, i) => ({ key: String(i), url }) as PlaybackCandidate,
    );
    const run = probeByBackend(cands, async (c) => {
      const host = new URL(c.url).hostname.split(".").slice(-2).join(".");
      active.set(host, (active.get(host) ?? 0) + 1);
      peakSame = Math.max(peakSame, active.get(host)!);
      peakAll = Math.max(peakAll, [...active.values()].reduce((a, b) => a + b, 0));
      await new Promise<void>((r) => gates.push(r));
      active.set(host, active.get(host)! - 1);
      return c;
    });
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 0));
      gates.splice(0).forEach((g) => g());
    }
    await expect(run).resolves.toHaveLength(3);
    expect(peakSame).toBe(1);
    expect(peakAll).toBe(2);
  });

  it("sourceIdOf drops the version", () => {
    expect(sourceIdOf("open-movies/open-movies@1c8f6cac")).toBe("open-movies/open-movies");
  });
});
