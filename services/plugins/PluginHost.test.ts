import { BUDGET, PluginHost, titleKey, type ResolveRequest } from "./PluginHost";
import type { LoadedPlugin } from "./registry";
import type { PluginStream } from "./streams";

const REQ: ResolveRequest = { tmdbId: "550", type: "movie" };
const plugin = (id: string, types: ("movie" | "tv")[] = ["movie", "tv"]): LoadedPlugin => ({
  key: `r/${id}@1`,
  repoId: "r",
  pluginId: id,
  name: id,
  source: "",
  supportedTypes: types,
  contentLanguage: [],
});
const stream = (pluginKey: string, url: string): PluginStream => ({ pluginKey, repoId: "r", pluginId: pluginKey, name: url, title: "", url, headers: {}, subtitles: [] });

function harness(plugins: LoadedPlugin[]) {
  const pending = new Map<string, { resolve(v: unknown): void; reject(e: unknown): void }>();
  const run = jest.fn((p: LoadedPlugin, _req: ResolveRequest, _timeoutMs: number) => new Promise((resolve, reject) => pending.set(p.key, { resolve, reject })));
  const host = new PluginHost({
    plugins: () => plugins,
    run,
    normalise: (p, raw) => (Array.isArray(raw) ? raw.map((u) => stream(p.key, String(u))) : null),
    now: () => Date.now(),
  });
  /** Let `afterMs` pass, then the plugin answers. */
  const answer = async (id: string, value: unknown, afterMs = 200) => {
    await jest.advanceTimersByTimeAsync(afterMs);
    pending.get(`r/${id}@1`)!.resolve(value);
    await jest.advanceTimersByTimeAsync(0);
  };
  return { host, run, pending, answer };
}

beforeEach(() => jest.useFakeTimers({ now: 0 }));
afterEach(() => jest.useRealTimers());

describe("PluginHost.getStreams", () => {
  it("collects every plugin's streams and calls the run complete", async () => {
    const { host, answer } = harness([plugin("a"), plugin("b")]);
    const seen: string[] = [];
    const out = host.getStreams(REQ, { onStreams: (key, list) => seen.push(`${key}:${list.length}`) });
    await answer("a", ["u1"]);
    await answer("b", ["u2", "u3"]);
    const r = await out;
    expect(r).toMatchObject({ complete: true, failures: [], ran: ["r/a@1", "r/b@1"] });
    expect(r.streams.map((s) => s.url)).toEqual(["u1", "u2", "u3"]);
    expect(seen).toEqual(["r/a@1:1", "r/b@1:2"]);
  });

  it("runs at most 12 plugins at once, each with the per-plugin budget", async () => {
    const { host, run, answer } = harness(Array.from({ length: 15 }, (_, i) => plugin(`p${i}`)));
    void host.getStreams(REQ);
    await jest.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(BUDGET.parallel);
    expect(run.mock.calls[0][2]).toBe(BUDGET.perPluginMs);
    await answer("p0", ["x"]);
    expect(run).toHaveBeenCalledTimes(BUDGET.parallel + 1);
  });

  it("returns early at 3 streams + 1.2 s of quiet; a straggler still fills the cache", async () => {
    const { host, run, answer } = harness([plugin("a"), plugin("slow")]);
    const out = host.getStreams(REQ);
    await answer("a", ["1", "2", "3"]);
    await jest.advanceTimersByTimeAsync(BUDGET.earlyIdleMs);
    const r = await out;
    expect(r.complete).toBe(false);
    expect(r.streams).toHaveLength(3);
    await answer("slow", ["4"]);
    run.mockClear();
    const again = await host.getStreams(REQ);
    expect(run).not.toHaveBeenCalled();
    expect(again).toMatchObject({ complete: true });
    expect(again.streams.map((s) => s.url)).toEqual(["1", "2", "3", "4"]);
  });

  it("stops at the 20 s overall budget with what it has", async () => {
    const { host, answer } = harness([plugin("a"), plugin("hung")]);
    const out = host.getStreams(REQ);
    await answer("a", ["1"]);
    await jest.advanceTimersByTimeAsync(BUDGET.overallMs);
    const r = await out;
    expect(r.complete).toBe(false);
    expect(r.streams.map((s) => s.url)).toEqual(["1"]);
  });

  it("an empty answer in under 100 ms is a failure and runs again next time; a slower empty answer is a real 'none'", async () => {
    const { host, run, answer } = harness([plugin("fast"), plugin("slow")]);
    const out = host.getStreams(REQ);
    await answer("fast", [], 10);
    await answer("slow", [], 300);
    const r = await out;
    expect(r.failures).toEqual([expect.objectContaining({ pluginKey: "r/fast@1", reason: "empty-fast" })]);
    run.mockClear();
    void host.getStreams(REQ);
    await jest.advanceTimersByTimeAsync(0);
    expect(run.mock.calls.map((c) => c[0].key)).toEqual(["r/fast@1"]);
    await answer("fast", [], 200);
  });

  it("a non-list answer and thrown errors are failures, with reasons", async () => {
    const { host, pending } = harness([plugin("shape"), plugin("boom"), plugin("late")]);
    const out = host.getStreams(REQ);
    await jest.advanceTimersByTimeAsync(150);
    pending.get("r/shape@1")!.resolve({ nope: 1 });
    pending.get("r/boom@1")!.reject(new Error("kaput"));
    pending.get("r/late@1")!.reject(Object.assign(new Error("slow"), { code: "timeout" }));
    const r = await out;
    expect(r.failures.map((f) => [f.pluginKey, f.reason])).toEqual([
      ["r/shape@1", "bad-shape"],
      ["r/boom@1", "error"],
      ["r/late@1", "timeout"],
    ]);
    expect(r.complete).toBe(true);
  });

  it("caches per title for 15 minutes", async () => {
    const { host, run, answer } = harness([plugin("a")]);
    const out = host.getStreams(REQ);
    await answer("a", ["1"]);
    await out;
    await jest.advanceTimersByTimeAsync(BUDGET.cacheMs - 1000);
    await host.getStreams(REQ);
    expect(run).toHaveBeenCalledTimes(1);
    void host.getStreams({ tmdbId: "550", type: "movie", season: undefined });
    void host.getStreams({ tmdbId: "1396", type: "tv", season: 1, episode: 1 });
    await jest.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2); // another title runs; the same title is still cached
    await jest.advanceTimersByTimeAsync(2000);
    void host.getStreams(REQ);
    await jest.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("runs only plugins that support the title's type, and answers at once with none", async () => {
    const { host, run } = harness([plugin("tvonly", ["tv"])]);
    await expect(host.getStreams(REQ)).resolves.toEqual({ streams: [], failures: [], ran: [], complete: true });
    expect(run).not.toHaveBeenCalled();
  });
});

describe("titleKey", () => {
  it("tells films and episodes apart", () => {
    expect(titleKey({ tmdbId: "550", type: "movie" })).toBe("movie:550");
    expect(titleKey({ tmdbId: "1396", type: "tv", season: 1, episode: 2 })).toBe("tv:1396:1:2");
  });
});
