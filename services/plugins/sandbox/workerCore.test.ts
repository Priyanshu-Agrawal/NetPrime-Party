import { makeResponse, runPlugin, serialiseResult, ShimHeaders, type WorkerIo } from "./workerCore";

const ENV = { tmdbApiKey: "bearoom-proxy", settings: { a: 1 }, debug: false };
const LIBS = { cheerio: { load: () => "cheerio" }, CryptoJS: { MD5: () => "md5" } };

function io(over: Partial<WorkerIo> = {}) {
  const logs: string[] = [];
  const base: WorkerIo = {
    fetch: jest.fn(async () => ({
      status: 200,
      url: "https://x.test/",
      redirected: false,
      headers: { "content-type": "application/json" },
      body: '{"a":1}',
      encoding: "text" as const,
    })),
    log: (level, msg) => logs.push(`${level}:${msg}`),
  };
  return Object.assign(base, over, { logs });
}

const run = (source: string, args: unknown[] = ["550", "movie", null, null], i = io(), env = ENV, scope: Record<string, unknown> = {}) =>
  runPlugin(source, args, env, i, LIBS, scope);

describe("runPlugin", () => {
  it("calls module.exports.getStreams with the Nuvio arguments", async () => {
    await expect(run("module.exports = { getStreams: async (id, type, s, e) => [id, type, s, e] };", ["1396", "tv", 1, 2])).resolves.toEqual(["1396", "tv", 1, 2]);
  });

  it("accepts exports.getStreams and a bare top-level function", async () => {
    await expect(run("exports.getStreams = () => 'a';")).resolves.toBe("a");
    await expect(run("async function getStreams() { return 'b'; }")).resolves.toBe("b");
  });

  it("gives plugins the globals Nuvio plugins read bare, and puts them on the worker scope", async () => {
    const scope: Record<string, unknown> = {};
    await expect(
      run("module.exports.getStreams = () => [TMDB_API_KEY, SCRAPER_SETTINGS.a, CryptoJS.MD5(), cheerio.load()];", undefined, io(), ENV, scope),
    ).resolves.toEqual(["bearoom-proxy", 1, "md5", "cheerio"]);
    expect(scope.TMDB_API_KEY).toBe("bearoom-proxy");
    expect(typeof scope.fetch).toBe("function");
  });

  it("resolves cheerio (and its RN aliases) and crypto-js, and nothing else", async () => {
    await expect(
      run(
        "const a = require('cheerio'), b = require('react-native-cheerio'), c = require('cheerio-without-node-native'), k = require('crypto-js');" +
          "module.exports.getStreams = () => [a.load(), b.load(), c.load(), k.MD5()];",
      ),
    ).resolves.toEqual(["cheerio", "cheerio", "cheerio", "md5"]);
    await expect(run("require('fs'); module.exports.getStreams = () => 1;")).rejects.toThrow("Cannot find module 'fs'");
  });

  it("fails when the plugin has no getStreams", async () => {
    await expect(run("module.exports = {};")).rejects.toThrow("no getStreams");
  });

  it("keeps console silent unless debugging, then forwards", async () => {
    const quiet = io();
    await run("module.exports.getStreams = () => { console.log('hi', { a: 1 }); return 1; };", undefined, quiet);
    expect(quiet.logs).toEqual([]);
    const loud = io();
    await run("module.exports.getStreams = () => { console.warn('hi', { a: 1 }); return 1; };", undefined, loud, { ...ENV, debug: true });
    expect(loud.logs).toEqual(['warn:hi {"a":1}']);
  });
});

describe("the fetch shim", () => {
  it("sends method, headers and body, and answers like a Response", async () => {
    const i = io();
    const out = await run(
      `module.exports.getStreams = async () => {
         const r = await fetch("https://api.test/x", { method: "post", headers: { "X-A": "1" }, body: "q=1" });
         return [r.ok, r.status, r.headers.get("Content-Type"), await r.json()];
       };`,
      undefined,
      i,
    );
    expect(out).toEqual([true, 200, "application/json", { a: 1 }]);
    expect(i.fetch).toHaveBeenCalledWith({ url: "https://api.test/x", method: "POST", headers: { "X-A": "1" }, body: "q=1", redirect: "follow", responseType: "text" });
  });

  it("takes headers as pairs or a Headers-like object, and URLSearchParams bodies", async () => {
    const i = io();
    await run(
      `module.exports.getStreams = async () => {
         await fetch("https://a.test/", { headers: [["A", "1"]] });
         await fetch("https://a.test/", { method: "POST", headers: { forEach(cb) { cb("2", "B"); } }, body: new URLSearchParams({ q: "x" }) });
         await fetch("https://a.test/", { redirect: "manual" });
         return 1;
       };`,
      undefined,
      i,
    );
    const calls = (i.fetch as jest.Mock).mock.calls.map((c) => c[0]);
    expect(calls[0].headers).toEqual({ A: "1" });
    expect(calls[1]).toMatchObject({ body: "q=x", headers: { B: "2", "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" } });
    expect(calls[2].redirect).toBe("manual");
  });

  it("rejects with a TypeError when the host refuses, like a real fetch", async () => {
    const i = io({ fetch: jest.fn(async () => Promise.reject(Object.assign(new Error("Blocked URL (host)"), { code: "blocked" }))) });
    await expect(
      run(`module.exports.getStreams = () => fetch("http://10.0.0.1/").then(() => "reached", (e) => (e instanceof TypeError ? "TypeError:" + e.message : "other"));`, undefined, i),
    ).resolves.toBe("TypeError:Blocked URL (host)");
  });

  it("an aborted signal rejects with AbortError", async () => {
    await expect(
      run(`module.exports.getStreams = () => { const c = new AbortController(); c.abort(); return fetch("https://a.test/", { signal: c.signal }).catch((e) => e.name); };`),
    ).resolves.toBe("AbortError");
  });
});

describe("serialiseResult", () => {
  it("passes plain data, and fails cycles and throwing getters inside the plugin's own call", () => {
    expect(serialiseResult([{ a: 1, f: () => 1 }])).toEqual([{ a: 1 }]);
    expect(serialiseResult(undefined)).toBeNull();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => serialiseResult(cyclic)).toThrow();
    expect(() =>
      serialiseResult({
        get boom() {
          throw new Error("getter");
        },
      }),
    ).toThrow("getter");
  });
});

describe("makeResponse and ShimHeaders", () => {
  it("decodes base64 bodies for arrayBuffer", async () => {
    const r = makeResponse({ status: 206, url: "u", redirected: false, headers: {}, body: "AAEC", encoding: "base64" });
    expect(Array.from(new Uint8Array(await r.arrayBuffer()))).toEqual([0, 1, 2]);
    expect(r.ok).toBe(true);
  });

  it("ShimHeaders is case-insensitive and iterable", () => {
    const h = new ShimHeaders({ "Content-Type": "a" });
    h.append("x-y", "1");
    h.append("X-Y", "2");
    expect(h.get("content-type")).toBe("a");
    expect(h.get("x-y")).toBe("1, 2");
    expect([...h]).toEqual([["content-type", "a"], ["x-y", "1, 2"]]);
  });
});
