import { describe, expect, it } from "vitest";
import {
  LKG_KEY,
  parseLkg,
  resolveProviders,
  serializeLkg,
  writeLkgIfChanged,
  type KvLike,
} from "./configResolve";
import type { Provider } from "./schemas";

const p = (id: string) => ({ id }) as unknown as Provider;
const now = new Date("2026-10-10T12:00:00Z");

function fakeKv(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };
  const puts: string[] = [];
  const kv: KvLike = {
    get: async (k) => store[k] ?? null,
    put: async (k, v) => {
      store[k] = v;
      puts.push(k);
    },
  };
  return { kv, store, puts };
}

describe("resolveProviders", () => {
  it("serves a live non-empty answer as-is", () => {
    expect(resolveProviders({ ok: true, providers: [p("a")] }, null)).toEqual({
      providers: [p("a")],
      stale: false,
      killswitch: false,
      source: "live",
    });
  });
  it("treats a live EMPTY answer as the deliberate killswitch", () => {
    expect(resolveProviders({ ok: true, providers: [] }, { items: [p("a")], savedAt: "" })).toEqual({
      providers: [],
      stale: false,
      killswitch: true,
      source: "live",
    });
  });
  it("serves last-known-good when Supabase did not answer", () => {
    expect(resolveProviders({ ok: false, reason: "timeout" }, { items: [p("a")], savedAt: "x" })).toEqual({
      providers: [p("a")],
      stale: true,
      killswitch: false,
      source: "lkg",
    });
  });
  it("an empty last-known-good stays a killswitch through an outage", () => {
    expect(resolveProviders({ ok: false, reason: "503" }, { items: [], savedAt: "x" })).toEqual({
      providers: [],
      stale: true,
      killswitch: true,
      source: "lkg",
    });
  });
  it("KV read failure degrades to source none, never a killswitch", () => {
    expect(resolveProviders({ ok: false, reason: "503" }, null)).toEqual({
      providers: [],
      stale: true,
      killswitch: false,
      source: "none",
    });
  });
  it("keeps the payload shape old clients read (providers is always an array)", () => {
    for (const r of [
      resolveProviders({ ok: false, reason: "x" }, null),
      resolveProviders({ ok: true, providers: [] }, null),
    ]) {
      expect(Array.isArray(r.providers)).toBe(true);
    }
  });
});

describe("parseLkg", () => {
  it("round-trips serializeLkg", () => {
    expect(parseLkg(serializeLkg([p("a")], now))).toEqual({ items: [p("a")], savedAt: now.toISOString() });
  });
  it("still reads the first deployed format ({ providers })", () => {
    expect(parseLkg(JSON.stringify({ providers: [p("a")], savedAt: "x" }))?.items).toEqual([p("a")]);
  });
  it("rejects null, junk and shapes without a list", () => {
    expect(parseLkg(null)).toBeNull();
    expect(parseLkg("{not json")).toBeNull();
    expect(parseLkg(JSON.stringify({ savedAt: "x" }))).toBeNull();
  });
});

describe("writeLkgIfChanged", () => {
  it("writes when nothing is stored", async () => {
    const { kv, store } = fakeKv();
    expect(await writeLkgIfChanged(kv, [p("a")], now)).toBe(true);
    expect(parseLkg(store[LKG_KEY])?.items).toEqual([p("a")]);
  });
  it("skips the write when the list is unchanged (KV write budget)", async () => {
    const { kv, puts } = fakeKv({ [LKG_KEY]: serializeLkg([p("a")], now) });
    expect(await writeLkgIfChanged(kv, [p("a")], new Date())).toBe(false);
    expect(puts).toHaveLength(0);
  });
  it("a reorder alone is not a change (health ordering flaps; KV writes are budgeted)", async () => {
    const { kv, puts } = fakeKv({ [LKG_KEY]: serializeLkg([p("a"), p("b")], now) });
    expect(await writeLkgIfChanged(kv, [p("b"), p("a")], now)).toBe(false);
    expect(puts).toHaveLength(0);
  });
  it("writes when the list changed, including to empty (a new killswitch)", async () => {
    const { kv, puts } = fakeKv({ [LKG_KEY]: serializeLkg([p("a")], now) });
    expect(await writeLkgIfChanged(kv, [], now)).toBe(true);
    expect(puts).toEqual([LKG_KEY]);
  });
});
