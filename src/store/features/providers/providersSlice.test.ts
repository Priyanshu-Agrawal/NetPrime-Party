import reducer, { hydrateFromCache, reduceConfig } from "@/src/store/features/providers/providersSlice";
import type { AppConfig } from "@/src/types/worker.types";

const row = (id: string) =>
  ({
    id,
    name: id,
    enabled: true,
    priority: 1,
    url_movie: `https://${id}/m/\${id}`,
    url_tv: null,
    allowed_domain: `https://${id}`,
    hijack: { supported: false },
    script_version: null,
  }) as unknown as AppConfig["providers"][number];
const cfg = (over: Partial<AppConfig> = {}): AppConfig => ({
  appVersion: "2.1.0",
  maintenanceMode: false,
  providers: [row("a")],
  ...over,
});
const initial = () => reducer(undefined, { type: "@@init" });

describe("providers slice", () => {
  it("hydrates from the device cache on a cold start", () => {
    const s = reducer(initial(), hydrateFromCache(cfg()));
    expect(s.providers.map((p) => p.id)).toEqual(["a"]);
    expect(s.source).toBe("cache");
  });
  it("a live answer replaces the cached one", () => {
    const s = reduceConfig(reducer(initial(), hydrateFromCache(cfg())), cfg({ providers: [row("b")] }));
    expect(s.providers.map((p) => p.id)).toEqual(["b"]);
    expect(s.source).toBe("live");
    expect(s.stale).toBe(false);
  });
  it("hydrateFromCache is ignored after live data", () => {
    const live = reduceConfig(initial(), cfg({ providers: [row("b")] }));
    expect(reducer(live, hydrateFromCache(cfg())).providers.map((p) => p.id)).toEqual(["b"]);
  });
  it("an outage answer keeps the cached providers and marks them stale", () => {
    const s = reduceConfig(reducer(initial(), hydrateFromCache(cfg())), cfg({ providers: [] }));
    expect(s.providers.map((p) => p.id)).toEqual(["a"]);
    expect(s.stale).toBe(true);
  });
  it("an explicit killswitch empties the app", () => {
    const s = reduceConfig(reducer(initial(), hydrateFromCache(cfg())), cfg({ providers: [], killswitch: true }));
    expect(s.providers).toEqual([]);
  });
  it("a worker's last-known-good answer is applied but flagged stale", () => {
    const s = reduceConfig(initial(), cfg({ stale: true }));
    expect(s.providers.map((p) => p.id)).toEqual(["a"]);
    expect(s.stale).toBe(true);
  });
  it("the real getConfig fulfilled action goes through the same rules (Immer path)", () => {
    const fulfilled = (payload: AppConfig) => ({
      type: "workerApi/executeQuery/fulfilled",
      payload,
      meta: {
        arg: { endpointName: "getConfig", type: "query", originalArgs: undefined, queryCacheKey: "getConfig(undefined)" },
        requestId: "r1",
        requestStatus: "fulfilled" as const,
        fulfilledTimeStamp: 0,
        baseQueryMeta: {},
      },
    });
    const cached = reducer(initial(), hydrateFromCache(cfg()));
    const outage = reducer(cached, fulfilled(cfg({ providers: [] })));
    expect(outage.providers.map((p) => p.id)).toEqual(["a"]);
    expect(outage.stale).toBe(true);
    const live = reducer(outage, fulfilled(cfg({ providers: [row("c")] })));
    expect(live.providers.map((p) => p.id)).toEqual(["c"]);
    expect(live.source).toBe("live");
  });
  it("flags default off and follow /config", () => {
    expect(initial().flags.nativeLane).toBe(false);
    const s = reduceConfig(initial(), cfg({ flags: { embedApiLane: true, nativeLane: false, pluginHost: false } }));
    expect(s.flags.embedApiLane).toBe(true);
  });
});
