import {
  hijackCapabilities,
  isBindableOn,
  isHijackable,
  isPartyCapable,
  NO_CAPABILITIES,
  settingsRows,
} from "@/components/player/capabilities";
import type { HijackCapability } from "@/components/player/hijackCapabilities";

const p = (hijack: HijackCapability, scriptVersion: string | null = "generic@1") => ({ hijack, scriptVersion });

describe("isHijackable", () => {
  it("needs hijack.supported", () => {
    expect(isHijackable(p({ supported: true }, null))).toBe(true);
    expect(isHijackable(p({ supported: false }))).toBe(false);
    expect(isHijackable(undefined)).toBe(false);
  });
});

describe("isBindableOn", () => {
  it("needs a served script", () => {
    expect(isBindableOn(p({ supported: true }, null), "android")).toBe(false);
  });
  it("needs hijack support", () => {
    expect(isBindableOn(p({ supported: false }), "android")).toBe(false);
  });
  it("treats a top-frame provider as bindable everywhere", () => {
    const top = p({ supported: true, videoLocation: "top" });
    expect(isBindableOn(top, "android")).toBe(true);
    expect(isBindableOn(top, "ios")).toBe(true);
  });
  it("treats a cross-origin-frame provider as iOS-only", () => {
    const xo = p({ supported: true, videoLocation: "cross-origin-iframe" });
    expect(isBindableOn(xo, "ios")).toBe(true);
    expect(isBindableOn(xo, "android")).toBe(false);
  });
  it("lets measured per-platform data override the location rule", () => {
    const measured = p({ supported: true, videoLocation: "top", platforms: { android: false, ios: true } });
    expect(isBindableOn(measured, "android")).toBe(false);
    expect(isBindableOn(measured, "ios")).toBe(true);
  });
});

describe("isPartyCapable", () => {
  it("party needs both platforms", () => {
    expect(isPartyCapable(p({ supported: true, videoLocation: "top" }))).toBe(true);
    expect(isPartyCapable(p({ supported: true, videoLocation: "cross-origin-iframe" }))).toBe(false);
    expect(isPartyCapable(p({ supported: true }, null))).toBe(false);
    expect(isPartyCapable(undefined)).toBe(false);
  });
});

describe("hijackCapabilities", () => {
  it("is empty when the provider can't bind on this platform", () => {
    expect(hijackCapabilities(p({ supported: true, videoLocation: "cross-origin-iframe" }), "android")).toEqual(
      NO_CAPABILITIES,
    );
    expect(hijackCapabilities(undefined, "ios")).toEqual(NO_CAPABILITIES);
  });
  it("keeps the legacy full set when the bridge reports nothing (videasy)", () => {
    expect(hijackCapabilities(p({ supported: true }), "android")).toEqual({
      fractionalRate: true,
      preciseSeek: true,
      audioTracks: true,
      qualitySelect: true,
      subtitles: false,
      partySync: true,
    });
  });
  it("uses what the generic bridge reports", () => {
    expect(
      hijackCapabilities(p({ supported: true }), "ios", { quality: false, audio: false, subtitles: true }),
    ).toEqual({
      fractionalRate: true,
      preciseSeek: true,
      audioTracks: false,
      qualitySelect: false,
      subtitles: true,
      partySync: true,
    });
  });
  it("is not party-capable on a single-platform provider", () => {
    expect(hijackCapabilities(p({ supported: true, videoLocation: "cross-origin-iframe" }), "ios").partySync).toBe(
      false,
    );
  });
});

describe("settingsRows", () => {
  it("shows Audio and Quality for the legacy bridge, which reports no capabilities", () => {
    expect(settingsRows(undefined)).toEqual({ showAudio: true, showQuality: true });
  });
  it("shows only the rows the bound video can switch", () => {
    expect(settingsRows({ quality: false, audio: false, subtitles: true })).toEqual({
      showAudio: false,
      showQuality: false,
    });
  });
});
