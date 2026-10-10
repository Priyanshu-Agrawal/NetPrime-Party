import { effectivePositionMs, type PlaybackAnchor } from "@/services/party/protocol";

const anchor = (over: Partial<PlaybackAnchor> = {}): PlaybackAnchor => ({
  status: "playing",
  positionMs: 10_000,
  rate: 1,
  anchorServerTimeMs: 1_000_000,
  epoch: 1,
  seq: 1,
  ...over,
});

describe("effectivePositionMs", () => {
  it("advances with server time while playing", () => {
    expect(effectivePositionMs(anchor(), 1_005_000)).toBe(15_000);
  });
  it("scales by rate", () => {
    expect(effectivePositionMs(anchor({ rate: 1.1 }), 1_010_000)).toBe(21_000);
  });
  it("is frozen while paused", () => {
    expect(effectivePositionMs(anchor({ status: "paused" }), 9_999_999)).toBe(10_000);
  });
  it("never goes negative", () => {
    expect(effectivePositionMs(anchor({ positionMs: 0 }), 0)).toBe(0);
  });
});
