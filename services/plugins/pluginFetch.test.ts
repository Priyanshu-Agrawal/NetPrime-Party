import { NativeFetchError, type NativeRequest, type NativeResponse } from "@/modules/bearoom-fetch";
import { CookieJar } from "./cookieJar";
import { Limiter } from "./limiter";
import { MAX_HOPS, pluginFetch, rewriteTmdb, toPluginFetchRequest } from "./pluginFetch";

const res = (over: Partial<NativeResponse> = {}): NativeResponse => ({
  status: 200,
  url: "",
  headers: {},
  cookies: [],
  body: "ok",
  encoding: "text",
  truncated: false,
  sha256: "h",
  ...over,
});

function setup(answers: Record<string, NativeResponse | Error>) {
  const seen: NativeRequest[] = [];
  const fetchOnce = jest.fn(async (req: NativeRequest) => {
    seen.push(req);
    const a = answers[req.url];
    if (!a) throw new Error(`unexpected ${req.url}`);
    if (a instanceof Error) throw a;
    return a;
  });
  return { seen, jar: new CookieJar(() => 0), deps: { fetchOnce, limiter: new Limiter(2, 24), tmdbProxyBase: "https://tmdb.proxy.test/" } };
}

describe("pluginFetch", () => {
  it("returns a plain answer with the native limits", async () => {
    const { seen, jar, deps } = setup({ "https://a.example.net/x": res({ body: "hi", headers: { "content-type": "text/plain" } }) });
    const out = await pluginFetch(jar, { url: "https://a.example.net/x" }, deps);
    expect(out).toMatchObject({ status: 200, url: "https://a.example.net/x", redirected: false, body: "hi", headers: { "content-type": "text/plain" } });
    expect(seen[0]).toMatchObject({ method: "GET", timeoutMs: 8000, maxBytes: 20 * 1024 * 1024, responseType: "text" });
  });

  it("follows a relative redirect and reports where it landed", async () => {
    const { jar, deps } = setup({
      "https://a.example.net/x": res({ status: 302, headers: { location: "/y" } }),
      "https://a.example.net/y": res({ body: "landed" }),
    });
    await expect(pluginFetch(jar, { url: "https://a.example.net/x" }, deps)).resolves.toMatchObject({ status: 200, url: "https://a.example.net/y", redirected: true, body: "landed" });
  });

  it("redirect: manual hands the 3xx back to the plugin", async () => {
    const { jar, deps } = setup({ "https://a.example.net/x": res({ status: 302, headers: { location: "https://b.example.net/" } }) });
    await expect(pluginFetch(jar, { url: "https://a.example.net/x", redirect: "manual" }, deps)).resolves.toMatchObject({ status: 302, headers: { location: "https://b.example.net/" } });
  });

  it("redirect: error refuses a redirect", async () => {
    const { jar, deps } = setup({ "https://a.example.net/x": res({ status: 301, headers: { location: "/y" } }) });
    await expect(pluginFetch(jar, { url: "https://a.example.net/x", redirect: "error" }, deps)).rejects.toMatchObject({ code: "redirects" });
  });

  it(`stops after ${MAX_HOPS} hops`, async () => {
    const answers: Record<string, NativeResponse> = {};
    for (let i = 0; i <= MAX_HOPS + 1; i++) answers[`https://a.example.net/${i}`] = res({ status: 302, headers: { location: `/${i + 1}` } });
    const { seen, jar, deps } = setup(answers);
    await expect(pluginFetch(jar, { url: "https://a.example.net/0" }, deps)).rejects.toMatchObject({ code: "redirects" });
    expect(seen).toHaveLength(MAX_HOPS + 1);
  });

  it("refuses a redirect to a private address before asking the network", async () => {
    const { seen, jar, deps } = setup({ "https://a.example.net/x": res({ status: 302, headers: { location: "http://192.168.1.1/admin" } }) });
    await expect(pluginFetch(jar, { url: "https://a.example.net/x" }, deps)).rejects.toMatchObject({ code: "blocked" });
    expect(seen).toHaveLength(1);
  });

  it("maps native failures to plugin-facing codes", async () => {
    const { jar, deps } = setup({
      "https://blocked.example.net/": new NativeFetchError("ERR_BLOCKED_ADDRESS", "no"),
      "https://slow.example.net/": new NativeFetchError("ERR_TIMEOUT", "slow"),
    });
    await expect(pluginFetch(jar, { url: "https://blocked.example.net/" }, deps)).rejects.toMatchObject({ name: "PluginFetchError", code: "blocked" });
    await expect(pluginFetch(jar, { url: "https://slow.example.net/" }, deps)).rejects.toMatchObject({ code: "timeout" });
  });

  it("303 after POST continues as GET without the body", async () => {
    const { seen, jar, deps } = setup({
      "https://a.example.net/form": res({ status: 303, headers: { location: "/done" } }),
      "https://a.example.net/done": res(),
    });
    await pluginFetch(jar, { url: "https://a.example.net/form", method: "POST", body: "a=1", headers: { "Content-Type": "application/x-www-form-urlencoded" } }, deps);
    expect(seen[1]).toMatchObject({ method: "GET", body: undefined });
    expect(seen[1].headers).not.toHaveProperty("Content-Type");
  });

  it("307 keeps the method and the body", async () => {
    const { seen, jar, deps } = setup({
      "https://a.example.net/api": res({ status: 307, headers: { location: "/api2" } }),
      "https://a.example.net/api2": res(),
    });
    await pluginFetch(jar, { url: "https://a.example.net/api", method: "POST", body: "{}" }, deps);
    expect(seen[1]).toMatchObject({ method: "POST", body: "{}" });
  });

  it("never carries credentials across hosts", async () => {
    const { seen, jar, deps } = setup({
      "https://a.example.net/x": res({ status: 302, headers: { location: "https://b.example.net/y" } }),
      "https://b.example.net/y": res(),
    });
    await pluginFetch(jar, { url: "https://a.example.net/x", headers: { Authorization: "Bearer t", Cookie: "s=1", Referer: "https://a.example.net/" } }, deps);
    expect(seen[0].headers).toMatchObject({ Authorization: "Bearer t", Cookie: "s=1" });
    expect(seen[1].headers).toEqual({ Referer: "https://a.example.net/" });
  });

  it("stores response cookies and sends them back to that site; a plugin's own Cookie wins", async () => {
    const { seen, jar, deps } = setup({
      "https://a.example.net/login": res({ cookies: [{ name: "sid", value: "42", domain: "a.example.net", path: "/", hostOnly: true, secure: true, expiresAt: 0 }] }),
      "https://a.example.net/api": res(),
    });
    await pluginFetch(jar, { url: "https://a.example.net/login" }, deps);
    await pluginFetch(jar, { url: "https://a.example.net/api" }, deps);
    expect(seen[1].headers).toEqual({ Cookie: "sid=42" });
    await pluginFetch(jar, { url: "https://a.example.net/api", headers: { cookie: "mine=1" } }, deps);
    expect(seen[2].headers).toEqual({ cookie: "mine=1" });
  });

  it("sends direct TMDB calls through the app's proxy without api_key", async () => {
    const { seen, jar, deps } = setup({ "https://tmdb.proxy.test/movie/550?language=en": res({ body: "{}" }) });
    const out = await pluginFetch(jar, { url: "https://api.themoviedb.org/3/movie/550?api_key=k&language=en" }, deps);
    expect(seen[0].url).toBe("https://tmdb.proxy.test/movie/550?language=en");
    expect(out.url).toBe("https://api.themoviedb.org/3/movie/550?api_key=k&language=en");
  });

  it("TMDB calls through the app's own proxy never queue behind a busy backend", async () => {
    const { jar, deps } = setup({ "https://tmdb.proxy.test/movie/1": res({ body: "{}" }) });
    deps.limiter = new Limiter(1, 1);
    void deps.limiter.run("busy", () => new Promise(() => {})); // every slot taken, forever
    await expect(pluginFetch(jar, { url: "https://api.themoviedb.org/3/movie/1" }, deps)).resolves.toMatchObject({ status: 200 });
  });

  it("a request queued for a call that already ended never goes out", async () => {
    const { seen, jar, deps } = setup({ "https://a.example.net/x": res() });
    deps.limiter = new Limiter(1, 1);
    let open!: () => void;
    void deps.limiter.run("example.net", () => new Promise<void>((r) => (open = r)));
    const out = pluginFetch(jar, { url: "https://a.example.net/x" }, deps, () => false);
    open();
    await expect(out).rejects.toMatchObject({ code: "network", message: "cancelled" });
    expect(seen).toHaveLength(0);
  });

  it("refuses bodies over 20 MiB", async () => {
    const { jar, deps } = setup({ "https://a.example.net/big": res({ truncated: true }) });
    await expect(pluginFetch(jar, { url: "https://a.example.net/big" }, deps)).rejects.toMatchObject({ code: "too-large" });
  });
});

describe("rewriteTmdb", () => {
  it("leaves other hosts alone", () => {
    const u = new URL("https://example.com/3/movie/1");
    expect(rewriteTmdb(u, "https://p.test/")).toBe(u);
  });
});

describe("toPluginFetchRequest", () => {
  it("refuses request bodies over 1 MiB", () => {
    expect(() => toPluginFetchRequest({ url: "https://a.example.net/", method: "POST", body: "x".repeat(1024 * 1024 + 1) })).toThrow(
      expect.objectContaining({ code: "bad-request" }),
    );
  });

  it("fills defaults and keeps only string headers", () => {
    expect(toPluginFetchRequest({ url: "https://a.example.net/", headers: { A: "1", B: 2 } })).toEqual({
      url: "https://a.example.net/",
      method: "GET",
      headers: { A: "1" },
      body: undefined,
      redirect: "follow",
      responseType: "text",
    });
  });

  it.each([[{}], [{ url: 5 }], [{ url: "https://a.example.net/", method: "CONNECT" }], [null]])("refuses %j", (v) => {
    expect(() => toPluginFetchRequest(v)).toThrow(expect.objectContaining({ code: "bad-request" }));
  });
});
