/**
 * Route-level tests: the real /config and /scripts handlers, with Supabase (fetch),
 * the edge cache (caches.default) and Workers KV stubbed. These exercise the I/O
 * paths the pure configResolve tests can't reach.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "./index";
import type { KvLike } from "./configResolve";

type Row = Record<string, unknown>;
const row = (id: string): Row => ({
  id,
  name: id,
  enabled: true,
  priority: 1,
  url_movie: `https://${id}/m/\${id}`,
  url_tv: null,
  allowed_domain: `https://${id}`,
  hijack: { supported: false },
  script_version: null,
});

/** Supabase stub: decides the response per REST resource. */
type SupaMode = { providers: "ok" | "503" | "throw" | "not-array"; rows?: Row[]; scripts?: Row[] };

function stubSupabase(mode: SupaMode) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("provider_health")) return new Response("[]", { status: 200 });
    if (mode.providers === "throw") throw new TypeError("network down");
    if (mode.providers === "503") return new Response("paused", { status: 503 });
    if (mode.providers === "not-array") return new Response(JSON.stringify({ message: "gateway says hi" }), { status: 200 });
    if (url.includes("bridge_script")) return new Response(JSON.stringify(mode.scripts ?? []), { status: 200 });
    return new Response(JSON.stringify(mode.rows ?? [row("a"), row("b")]), { status: 200 });
  });
  return calls;
}

function stubEdgeCache(hit?: unknown) {
  const store = new Map<string, Response>();
  vi.stubGlobal("caches", {
    default: {
      match: async (req: Request) => (hit !== undefined && req.url.endsWith("/providers") ? new Response(JSON.stringify(hit)) : store.get(req.url)?.clone()),
      put: async (req: Request, res: Response) => void store.set(req.url, res),
      delete: async () => true,
    },
  });
}

function fakeKv(initial: Record<string, string> = {}, opts: { getThrows?: boolean; putThrows?: boolean } = {}) {
  const store: Record<string, string> = { ...initial };
  const kv: KvLike & { store: Record<string, string> } = {
    store,
    get: async (k) => {
      if (opts.getThrows) throw new Error("kv get boom");
      return store[k] ?? null;
    },
    put: async (k, v) => {
      if (opts.putThrows) throw new Error("kv put boom");
      store[k] = v;
    },
  };
  return kv;
}

const baseEnv = { SUPABASE_URL: "https://supa.test", SUPABASE_ANON_KEY: "anon" };

async function call(path: string, env: Record<string, unknown>) {
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => void pending.push(p), passThroughOnException: () => {} };
  const res = await app.request(path, {}, env, ctx as never);
  await Promise.allSettled(pending);
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

beforeEach(() => stubEdgeCache());
afterEach(() => vi.unstubAllGlobals());

describe("GET /config", () => {
  it("live answer: providers plus every field installed apps read", async () => {
    stubSupabase({ providers: "ok" });
    const { status, body } = await call("/config", { ...baseEnv, CONFIG_LKG: fakeKv() });
    expect(status).toBe(200);
    expect(body.providers.map((p: Row) => p.id)).toEqual(["a", "b"]);
    expect(body).toMatchObject({ stale: false, killswitch: false, maintenanceMode: false });
    expect(typeof body.appVersion).toBe("string");
    expect("region" in body).toBe(true);
  });

  it("Supabase 503 with a stored copy serves it, marked stale", async () => {
    stubSupabase({ providers: "503" });
    const kv = fakeKv({ "providers:lkg:v1": JSON.stringify({ providers: [row("a"), row("b")], savedAt: "x" }) });
    const { body } = await call("/config", { ...baseEnv, CONFIG_LKG: kv });
    expect(body).toMatchObject({ stale: true, killswitch: false });
    expect(body.providers).toHaveLength(2);
  });

  it("KV read throwing during an outage still answers 200, stale, not a killswitch", async () => {
    stubSupabase({ providers: "throw" });
    const { status, body } = await call("/config", { ...baseEnv, CONFIG_LKG: fakeKv({}, { getThrows: true }) });
    expect(status).toBe(200);
    expect(body).toMatchObject({ stale: true, killswitch: false, providers: [] });
  });

  it("no KV binding during an outage still answers 200, stale, not a killswitch", async () => {
    stubSupabase({ providers: "503" });
    const { status, body } = await call("/config", { ...baseEnv });
    expect(status).toBe(200);
    expect(body).toMatchObject({ stale: true, killswitch: false, providers: [] });
  });

  it("KV write throwing never breaks a live answer", async () => {
    stubSupabase({ providers: "ok" });
    const { status, body } = await call("/config", { ...baseEnv, CONFIG_LKG: fakeKv({}, { putThrows: true }) });
    expect(status).toBe(200);
    expect(body.providers).toHaveLength(2);
  });

  it("an edge-cache hit is served without asking Supabase", async () => {
    stubEdgeCache([row("cached")]);
    const calls = stubSupabase({ providers: "ok" });
    const { body } = await call("/config", { ...baseEnv, CONFIG_LKG: fakeKv() });
    expect(body.providers.map((p: Row) => p.id)).toEqual(["cached"]);
    expect(calls.filter((u) => u.includes("/rest/v1/providers"))).toHaveLength(0);
  });

  it("a 2xx body that is not a list is an outage: never served, never stored", async () => {
    stubSupabase({ providers: "not-array" });
    const kv = fakeKv({ "providers:lkg:v1": JSON.stringify({ providers: [row("a")], savedAt: "x" }) });
    const { body } = await call("/config", { ...baseEnv, CONFIG_LKG: kv });
    expect(body).toMatchObject({ stale: true, killswitch: false });
    expect(body.providers.map((p: Row) => p.id)).toEqual(["a"]);
    expect(JSON.parse(kv.store["providers:lkg:v1"]).providers.map((p: Row) => p.id)).toEqual(["a"]);
  });

  it("flags come from KV (flags:v1) so a deploy can't reset an emergency switch", async () => {
    stubSupabase({ providers: "ok" });
    const kv = fakeKv({ "flags:v1": JSON.stringify({ embedApiLane: true, nativeLane: "yes", bogus: true }) });
    const { body } = await call("/config", { ...baseEnv, CONFIG_LKG: kv });
    expect(body.flags).toEqual({ embedApiLane: true, nativeLane: false, pluginHost: false });
  });
});

describe("GET /scripts", () => {
  const script = { id: "videasy", script_version: "videasy@1", bridge_script: "window.__vlBridge=1" };

  it("live answer is mirrored to KV", async () => {
    stubSupabase({ providers: "ok", scripts: [script] });
    const kv = fakeKv();
    const { body } = await call("/scripts", { ...baseEnv, CONFIG_LKG: kv });
    expect(body).toEqual([{ id: "videasy", version: "videasy@1", script: "window.__vlBridge=1" }]);
    expect(kv.store["scripts:lkg:v1"]).toBeDefined();
  });

  it("during an outage serves the stored scripts, so a party never binds without its bridge", async () => {
    stubSupabase({ providers: "503" });
    const kv = fakeKv({
      "scripts:lkg:v1": JSON.stringify({ items: [{ id: "videasy", version: "videasy@1", script: "s" }], savedAt: "x" }),
    });
    const { body } = await call("/scripts", { ...baseEnv, CONFIG_LKG: kv });
    expect(body).toEqual([{ id: "videasy", version: "videasy@1", script: "s" }]);
  });
});
