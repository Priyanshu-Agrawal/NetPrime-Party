import type { Provider } from "./providerRegistry";
import {
  countsAsProgress,
  decideMoveOn,
  isFeatureAfterAd,
  isStalledStart,
  nextBindableProvider,
  onBindAction,
  pickInitialProvider,
} from "./providerPick";

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

describe("decideMoveOn", () => {
  const vf = list[1];
  const live = { os: "android" as const, reason: "bind" as const, playbackStarted: false, focused: true };

  it("moves to the next provider our skin can bind", () => {
    expect(decideMoveOn(list, list[0], new Set(), live)).toEqual({ kind: "next", provider: vf });
  });
  it("never moves away from a plain embed (it can't bind, so the user sees its own page)", () => {
    expect(decideMoveOn(list, list[3], new Set(), live)).toEqual({ kind: "stay" });
  });
  it("keeps a source that crashed after playback started, so it can be retried in place", () => {
    expect(decideMoveOn(list, vf, new Set(), { ...live, reason: "fatal", playbackStarted: true })).toEqual({
      kind: "stay",
    });
  });
  it("moves on from a source that crashed before anything played", () => {
    expect(decideMoveOn(list, list[0], new Set(), { ...live, reason: "fatal" })).toEqual({
      kind: "next",
      provider: vf,
    });
  });
  it("does nothing while the player is hidden behind another screen", () => {
    expect(decideMoveOn(list, list[0], new Set(), { ...live, focused: false })).toEqual({ kind: "stay" });
  });
  it("says so when no bindable provider is left", () => {
    expect(decideMoveOn(list, vf, new Set(["dead"]), live)).toEqual({ kind: "exhausted" });
  });
});

describe("countsAsProgress", () => {
  const tick = (currentTime: number, paused = false) => ({ event: "tick" as const, currentTime, paused });
  it("counts a playing video's ticks", () => {
    expect(countsAsProgress(10, tick(11))).toBe(true);
  });
  it("ignores a position jump while paused (a provider's own resume, or ours)", () => {
    expect(countsAsProgress(0, tick(2400, true))).toBe(false);
  });
  it("ignores a jump bigger than one tick (a seek, not playback)", () => {
    expect(countsAsProgress(0, tick(2400))).toBe(false);
  });
  it("only counts ticks", () => {
    expect(countsAsProgress(10, { event: "playing" as const, currentTime: 11, paused: false })).toBe(false);
  });
});

describe("isFeatureAfterAd", () => {
  it("is true when a much longer video replaces the bound one", () => {
    expect(isFeatureAfterAd(30, 8349)).toBe(true);
  });
  it("is false for a same-length swap (quality change) or an unknown previous length", () => {
    expect(isFeatureAfterAd(8349, 8349)).toBe(false);
    expect(isFeatureAfterAd(0, 8349)).toBe(false);
  });
});

describe("onBindAction", () => {
  it("starts playback on bind only while the player is on screen", () => {
    expect(onBindAction({ focused: true })).toBe("play");
    expect(onBindAction({ focused: false })).toBe("pause");
  });
});
