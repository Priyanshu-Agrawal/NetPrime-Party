import {
  CONFIG_CACHE_KEY,
  loadCachedConfig,
  saveCachedConfig,
  shouldAcceptConfig,
} from "@/src/store/features/providers/configCache";
import type { AppConfig } from "@/src/types/worker.types";

const row = { id: "vidfast" } as unknown as AppConfig["providers"][number];
const cfg = (over: Partial<AppConfig> = {}): AppConfig => ({
  appVersion: "2.1.0",
  maintenanceMode: false,
  providers: [row],
  ...over,
});

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getString: (k: string) => map.get(k),
    set: (k: string, v: string | number | boolean) => void map.set(k, String(v)),
  };
}

describe("shouldAcceptConfig", () => {
  it("accepts a list with providers", () => expect(shouldAcceptConfig(cfg())).toBe(true));
  it("accepts an explicit killswitch", () =>
    expect(shouldAcceptConfig(cfg({ providers: [], killswitch: true }))).toBe(true));
  it("rejects an empty list without a killswitch (an outage, or an old worker's error path)", () =>
    expect(shouldAcceptConfig(cfg({ providers: [] }))).toBe(false));
});

describe("loadCachedConfig", () => {
  it("returns null when nothing is stored", () => expect(loadCachedConfig(fakeStorage())).toBeNull());
  it("round-trips a saved config", () => {
    const s = fakeStorage();
    saveCachedConfig(cfg(), s);
    expect(loadCachedConfig(s)?.providers).toEqual([row]);
  });
  it("rejects malformed JSON (a half-written cache)", () =>
    expect(loadCachedConfig(fakeStorage({ [CONFIG_CACHE_KEY]: '{"providers":[' }))).toBeNull());
  it("rejects a providers list holding non-objects (would crash the reducer on every launch)", () =>
    expect(
      loadCachedConfig(
        fakeStorage({ [CONFIG_CACHE_KEY]: JSON.stringify({ maintenanceMode: false, providers: [null] }) }),
      ),
    ).toBeNull());
  it("rejects a value without a providers array (an older or foreign shape)", () =>
    expect(
      loadCachedConfig(fakeStorage({ [CONFIG_CACHE_KEY]: JSON.stringify({ maintenanceMode: false }) })),
    ).toBeNull());
});

describe("saveCachedConfig", () => {
  it("never persists an outage answer", () => {
    const s = fakeStorage();
    saveCachedConfig(cfg({ providers: [] }), s);
    saveCachedConfig(cfg({ stale: true }), s);
    expect(s.map.size).toBe(0);
  });
  it("persists a killswitch first learned during an outage (stale), so old providers can't come back", () => {
    const s = fakeStorage();
    saveCachedConfig(cfg(), s);
    saveCachedConfig(cfg({ providers: [], killswitch: true, stale: true }), s);
    expect(loadCachedConfig(s)?.providers).toEqual([]);
  });
  it("persists a killswitch so the app stays empty offline too", () => {
    const s = fakeStorage();
    saveCachedConfig(cfg({ providers: [], killswitch: true }), s);
    expect(loadCachedConfig(s)?.killswitch).toBe(true);
  });
  it("swallows a storage failure", () => {
    const s = {
      getString: () => undefined,
      set: () => {
        throw new Error("disk full");
      },
    };
    expect(() => saveCachedConfig(cfg(), s)).not.toThrow();
  });
});
