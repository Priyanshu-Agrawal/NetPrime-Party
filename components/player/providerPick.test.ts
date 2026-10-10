import type { Provider } from "./providerRegistry";
import { isStalledStart, nextBindableProvider, pickInitialProvider } from "./providerPick";

const prov = (id: string, bind: "both" | "ios" | "none"): Provider => ({
  id,
  name: id,
  urls: { movie: "", tv: "" },
  allowedDomain: `${id}.test`,
  hijack:
    bind === "none"
      ? { supported: false }
      : { supported: true, videoLocation: bind === "both" ? "top" : "cross-origin-iframe" },
  scriptVersion: bind === "none" ? null : "generic@1",
});

const list = [prov("dead", "both"), prov("vf", "both"), prov("vc", "ios"), prov("plain", "none")];

describe("pickInitialProvider", () => {
  it("honours an explicit pick that hasn't failed", () => {
    expect(pickInitialProvider(list, { requestedId: "plain", failed: new Set(), os: "android" })?.id).toBe("plain");
  });
  it("skips an explicit pick that failed for this title", () => {
    expect(pickInitialProvider(list, { requestedId: "dead", failed: new Set(["dead"]), os: "android" })?.id).toBe("vf");
  });
  it("prefers a provider our skin can bind on this platform", () => {
    expect(pickInitialProvider(list, { failed: new Set(["dead"]), os: "android" })?.id).toBe("vf");
  });
  it("falls back to a plain embed only when nothing binds", () => {
    // On Android the iOS-only "vc" is a plain embed too, so leave it out to pin the tier rule.
    const noVc = list.filter((p) => p.id !== "vc");
    expect(pickInitialProvider(noVc, { failed: new Set(["dead", "vf"]), os: "android" })?.id).toBe("plain");
  });
  it("treats a provider that can't bind here as a plain embed", () => {
    expect(pickInitialProvider(list, { failed: new Set(["dead", "vf"]), os: "android" })?.id).toBe("vc");
  });
  it("starts over at the top of the bindable list when everything failed", () => {
    const all = new Set(list.map((p) => p.id));
    expect(pickInitialProvider(list, { failed: all, os: "android" })?.id).toBe("dead");
  });
});

describe("nextBindableProvider", () => {
  it("moves to the next untried provider that binds here", () => {
    expect(nextBindableProvider(list, "dead", new Set(["dead"]), "android")?.id).toBe("vf");
  });
  it("can use an iOS-only provider on iOS", () => {
    expect(nextBindableProvider(list, "vf", new Set(["dead", "vf"]), "ios")?.id).toBe("vc");
  });
  it("returns undefined when every bindable provider was tried", () => {
    expect(nextBindableProvider(list, "vf", new Set(["dead", "vf"]), "android")).toBeUndefined();
  });
});

describe("isStalledStart", () => {
  it("is false before anyone asked to play", () => {
    expect(isStalledStart({ playIntentAt: null, lastProgressAt: null, now: 100_000 })).toBe(false);
  });
  it("is false while playback advances", () => {
    expect(isStalledStart({ playIntentAt: 0, lastProgressAt: 90_000, now: 100_000 })).toBe(false);
  });
  it("is true when nothing advanced for the window after a play intent", () => {
    expect(isStalledStart({ playIntentAt: 0, lastProgressAt: null, now: 30_000 })).toBe(true);
    expect(isStalledStart({ playIntentAt: 0, lastProgressAt: 2_000, now: 30_000 })).toBe(true);
  });
  it("gives a fresh play intent the full window", () => {
    expect(isStalledStart({ playIntentAt: 20_000, lastProgressAt: null, now: 30_000 })).toBe(false);
  });
});
