import type { HostFrame } from "./sandbox/protocol";
import { frameScript, MAX_CALL_BYTES, MAX_FETCHES_PER_CALL, PING_TIMEOUT_MS, READY_TIMEOUT_MS, SandboxBridge } from "./sandboxBridge";

const ENV = { tmdbApiKey: "k", settings: {}, debug: false };
const PLUGIN = { key: "r/p@abc", source: "module.exports = { getStreams: () => [] };" };

/** What the bridge injected, decoded back into frames. */
function framesOf(inject: jest.Mock): HostFrame[] {
  return inject.mock.calls.map(([js]: [string]) => {
    const m = /^window\.__bearoom&&window\.__bearoom\(([\s\S]*)\);true;$/.exec(js);
    if (!m) throw new Error(`unexpected script ${js}`);
    return JSON.parse(JSON.parse(m[1])) as HostFrame;
  });
}
const runIds = (inject: jest.Mock) => framesOf(inject).flatMap((f) => (f.t === "run" ? [f.id] : []));

function setup(onFetch: jest.Mock = jest.fn()) {
  const bridge = new SandboxBridge({ onFetch });
  const inject = jest.fn();
  const restart = jest.fn();
  bridge.setRestartHandler(restart);
  bridge.attach(inject);
  const ready = (csp = true) => bridge.onMessage(JSON.stringify({ t: "ready", protocol: 1, csp }));
  const done = (id: string, frame: object) => bridge.onMessage(JSON.stringify({ t: "done", id, ms: 1, ...frame }));
  return { bridge, inject, restart, ready, done, onFetch };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("SandboxBridge", () => {
  it("waits for the page, loads a plugin once per page, and runs it", async () => {
    const { bridge, inject, ready, done } = setup();
    const first = bridge.run(PLUGIN, ["550", "movie", null, null], ENV, 1000);
    await jest.advanceTimersByTimeAsync(0);
    expect(inject).not.toHaveBeenCalled();
    ready();
    await jest.advanceTimersByTimeAsync(0);
    expect(framesOf(inject).map((f) => f.t)).toEqual(["load", "run"]);
    done(runIds(inject)[0], { ok: true, result: [1] });
    await expect(first).resolves.toEqual([1]);
    const second = bridge.run(PLUGIN, [], ENV, 1000);
    await jest.advanceTimersByTimeAsync(0);
    expect(framesOf(inject).map((f) => f.t)).toEqual(["load", "run", "run"]);
    done(runIds(inject)[1], { ok: true, result: [] });
    await second;
  });

  it("loads plugin sources again on a new page", async () => {
    const { bridge, ready, done } = setup();
    ready();
    const p = bridge.run(PLUGIN, [], ENV, 1000);
    await jest.advanceTimersByTimeAsync(0);
    const next = jest.fn();
    bridge.attach(next);
    await expect(p).rejects.toMatchObject({ code: "crashed" });
    ready();
    const q = bridge.run(PLUGIN, [], ENV, 1000);
    await jest.advanceTimersByTimeAsync(0);
    expect(framesOf(next).map((f) => f.t)).toEqual(["load", "run"]);
    done(runIds(next)[0], { ok: true, result: null });
    await q;
  });

  it("refuses to run plugins when the page could not prove its CSP blocks network", async () => {
    const { bridge, inject, ready } = setup();
    ready(false);
    await expect(bridge.run(PLUGIN, [], ENV, 1000)).rejects.toMatchObject({ code: "unsafe" });
    expect(inject).not.toHaveBeenCalled();
  });

  it("answers a worker's fetch for the plugin that owns the call", async () => {
    const payload = { status: 200, url: "https://a.test/", redirected: false, headers: {}, body: "x", encoding: "text" };
    const onFetch = jest.fn().mockResolvedValueOnce(payload).mockRejectedValueOnce(Object.assign(new Error("Blocked URL (host)"), { code: "blocked" }));
    const { bridge, inject, ready, done } = setup(onFetch);
    ready();
    const p = bridge.run(PLUGIN, [], ENV, 1000);
    await jest.advanceTimersByTimeAsync(0);
    const id = runIds(inject)[0];
    bridge.onMessage(JSON.stringify({ t: "fetch", id, reqId: 7, req: { url: "https://a.test/" } }));
    bridge.onMessage(JSON.stringify({ t: "fetch", id, reqId: 8, req: { url: "http://10.0.0.1/" } }));
    await jest.advanceTimersByTimeAsync(0);
    expect(onFetch).toHaveBeenCalledWith(PLUGIN.key, { url: "https://a.test/" }, expect.any(Function));
    expect(framesOf(inject).filter((f) => f.t === "fetchResult")).toEqual([
      { t: "fetchResult", id, reqId: 7, ok: true, res: payload },
      { t: "fetchResult", id, reqId: 8, ok: false, error: "Blocked URL (host)", code: "blocked" },
    ]);
    done(id, { ok: true, result: [] });
    await p;
  });

  it(`gives one call at most ${MAX_FETCHES_PER_CALL} fetches`, async () => {
    const payload = { status: 200, url: "u", redirected: false, headers: {}, body: "", encoding: "text" };
    const onFetch = jest.fn().mockResolvedValue(payload);
    const { bridge, inject, ready, done } = setup(onFetch);
    ready();
    const p = bridge.run(PLUGIN, [], ENV, 60_000);
    await jest.advanceTimersByTimeAsync(0);
    const id = runIds(inject)[0];
    for (let reqId = 1; reqId <= MAX_FETCHES_PER_CALL + 1; reqId++) bridge.onMessage(JSON.stringify({ t: "fetch", id, reqId, req: { url: "https://a.example.net/" } }));
    await jest.advanceTimersByTimeAsync(0);
    expect(onFetch).toHaveBeenCalledTimes(MAX_FETCHES_PER_CALL);
    expect(framesOf(inject).find((f) => f.t === "fetchResult" && f.reqId === MAX_FETCHES_PER_CALL + 1)).toMatchObject({ ok: false, code: "budget" });
    done(id, { ok: true, result: [] });
    await p;
  });

  it("caps the bytes one call's responses can bring in", async () => {
    const half = { status: 200, url: "u", redirected: false, headers: {}, body: "x".repeat(MAX_CALL_BYTES / 2 + 1), encoding: "text" };
    const onFetch = jest.fn().mockResolvedValue(half);
    const { bridge, inject, ready, done } = setup(onFetch);
    ready();
    const p = bridge.run(PLUGIN, [], ENV, 60_000);
    await jest.advanceTimersByTimeAsync(0);
    const id = runIds(inject)[0];
    bridge.onMessage(JSON.stringify({ t: "fetch", id, reqId: 1, req: {} }));
    await jest.advanceTimersByTimeAsync(0);
    bridge.onMessage(JSON.stringify({ t: "fetch", id, reqId: 2, req: {} }));
    await jest.advanceTimersByTimeAsync(0);
    const results = framesOf(inject).filter((f) => f.t === "fetchResult");
    expect(results.map((f) => (f as { ok: boolean }).ok)).toEqual([true, false]);
    expect(results[1]).toMatchObject({ code: "budget" });
    done(id, { ok: true, result: [] });
    await p;
  });

  it("tells the fetch layer when the call that asked is gone", async () => {
    const onFetch = jest.fn(() => new Promise<never>(() => {}));
    const { bridge, inject, ready, done } = setup(onFetch);
    ready();
    const p = bridge.run(PLUGIN, [], ENV, 60_000);
    await jest.advanceTimersByTimeAsync(0);
    const id = runIds(inject)[0];
    bridge.onMessage(JSON.stringify({ t: "fetch", id, reqId: 1, req: {} }));
    const alive = (onFetch.mock.calls[0] as unknown[])[2] as () => boolean;
    expect(alive()).toBe(true);
    done(id, { ok: true, result: [] });
    await p;
    expect(alive()).toBe(false);
  });

  it("ignores frames for calls it does not know", () => {
    const { bridge, onFetch, ready } = setup();
    ready();
    expect(() => bridge.onMessage(JSON.stringify({ t: "done", id: "nope", ok: true, result: 1, ms: 1 }))).not.toThrow();
    bridge.onMessage(JSON.stringify({ t: "fetch", id: "nope", reqId: 1, req: {} }));
    bridge.onMessage("not json");
    expect(onFetch).not.toHaveBeenCalled();
  });

  it("a plugin's own error rejects with code plugin", async () => {
    const { bridge, inject, ready, done } = setup();
    ready();
    const p = bridge.run(PLUGIN, [], ENV, 1000);
    await jest.advanceTimersByTimeAsync(0);
    done(runIds(inject)[0], { ok: false, error: "Plugin has no getStreams" });
    await expect(p).rejects.toMatchObject({ code: "plugin", message: "Plugin has no getStreams" });
  });

  it("kills a call past its deadline and ignores a late answer", async () => {
    const { bridge, inject, ready, done } = setup();
    ready();
    const p = bridge.run(PLUGIN, [], ENV, 1000);
    const settled = p.catch((e) => e);
    await jest.advanceTimersByTimeAsync(1000);
    expect(await settled).toMatchObject({ code: "timeout" });
    const id = runIds(inject)[0];
    expect(framesOf(inject)).toContainEqual({ t: "kill", id });
    expect(() => done(id, { ok: true, result: 1 })).not.toThrow();
  });

  it("after killing a call it pings the page; a page that answers keeps every other call alive", async () => {
    const { bridge, inject, restart, ready, done } = setup();
    ready();
    const slow = bridge.run(PLUGIN, [], ENV, 1000).catch((e) => e);
    const healthy = bridge.run(PLUGIN, [], ENV, 60_000);
    await jest.advanceTimersByTimeAsync(1000);
    expect(await slow).toMatchObject({ code: "timeout" });
    const ping = framesOf(inject).find((f) => f.t === "ping");
    expect(ping).toBeDefined();
    bridge.onMessage(JSON.stringify({ t: "pong", n: (ping as { n: number }).n }));
    await jest.advanceTimersByTimeAsync(PING_TIMEOUT_MS * 2);
    expect(restart).not.toHaveBeenCalled();
    done(runIds(inject)[1], { ok: true, result: "still here" });
    await expect(healthy).resolves.toBe("still here");
  });

  it("a page that doesn't answer the ping is replaced", async () => {
    const { bridge, restart, ready } = setup();
    ready();
    const slow = bridge.run(PLUGIN, [], ENV, 1000).catch(() => null);
    await jest.advanceTimersByTimeAsync(1000);
    await slow;
    await jest.advanceTimersByTimeAsync(PING_TIMEOUT_MS);
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it("fails calls when the page never becomes ready, and replaces the page", async () => {
    const { bridge, restart } = setup();
    const settled = bridge.run(PLUGIN, [], ENV, 1000).catch((e) => e);
    await jest.advanceTimersByTimeAsync(READY_TIMEOUT_MS);
    expect(await settled).toMatchObject({ code: "not-ready" });
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it("a crashed page fails running calls and asks for a restart", async () => {
    const { bridge, restart, ready } = setup();
    ready();
    const p = bridge.run(PLUGIN, [], ENV, 1000).catch((e) => e);
    await jest.advanceTimersByTimeAsync(0);
    bridge.crashed();
    expect(await p).toMatchObject({ code: "crashed" });
    expect(restart).toHaveBeenCalledTimes(1);
    expect(bridge.getState()).toMatchObject({ attached: false, ready: false, running: 0 });
  });
});

describe("frameScript", () => {
  it("escapes line separators so the injected script always parses", () => {
    const js = frameScript({ t: "load", key: "k", source: "a\u2028b\u2029c" });
    expect(js).not.toMatch(/[\u2028\u2029]/);
    const inject = jest.fn();
    inject(js);
    expect(framesOf(inject)).toEqual([{ t: "load", key: "k", source: "a\u2028b\u2029c" }]);
  });
});
