import { hijackCapabilities, isHijackable, isPartyCapable, NO_CAPABILITIES } from "@/components/player/capabilities";

const prov = (supported: boolean, scriptVersion: string | null) =>
  ({ hijack: { supported }, scriptVersion }) as const;

describe("party capability rules", () => {
  it("hijackable needs hijack.supported", () => {
    expect(isHijackable(prov(true, null))).toBe(true);
    expect(isHijackable(prov(false, "v1"))).toBe(false);
    expect(isHijackable(undefined)).toBe(false);
  });
  it("party-capable needs a hijack AND a served bridge script", () => {
    expect(isPartyCapable(prov(true, "videasy@abc"))).toBe(true);
    expect(isPartyCapable(prov(true, null))).toBe(false);
  });
});

describe("hijackCapabilities", () => {
  it("a bridged provider can sync, nudge rate, seek precisely and drive its menus", () => {
    expect(hijackCapabilities(prov(true, "v1"))).toEqual({
      fractionalRate: true,
      preciseSeek: true,
      audioTracks: true,
      qualitySelect: true,
      subtitles: false,
      partySync: true,
    });
  });
  it("an unbridged embed can do nothing we control", () => {
    expect(hijackCapabilities(prov(true, null))).toEqual(NO_CAPABILITIES);
    expect(hijackCapabilities(undefined)).toEqual(NO_CAPABILITIES);
  });
});
