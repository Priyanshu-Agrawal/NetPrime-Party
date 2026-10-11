import { findStream, streamsFor, TEST_STREAMS } from "./testStreams";
import { testStreamsEnabled } from "./testStreamsGate";

describe("test streams", () => {
  it("are all https and have unique ids", () => {
    expect(new Set(TEST_STREAMS.map((s) => s.id)).size).toBe(TEST_STREAMS.length);
    for (const s of TEST_STREAMS) {
      expect(s.source.uri.startsWith("https://")).toBe(true);
      for (const t of s.sidecar ?? []) expect(t.url.startsWith("https://")).toBe(true);
    }
  });

  it("hide DASH on iOS (AVPlayer has no DASH)", () => {
    expect(streamsFor("ios").some((s) => s.source.contentType === "dash")).toBe(false);
    expect(streamsFor("android").some((s) => s.source.contentType === "dash")).toBe(true);
  });

  it("cover what the gate needs: languages, ladders, sidecar subtitles, a broken one", () => {
    expect(findStream("angel-hls")?.note).toMatch(/audio en\/de\/it\/fr\/es/);
    expect(findStream("tos-sidecar")?.sidecar?.length).toBeGreaterThanOrEqual(5);
    expect(findStream("broken")).toBeDefined();
    expect(findStream("nope")).toBeUndefined();
  });
});

describe("testStreamsEnabled", () => {
  it.each([
    [{ nativeLane: true }, true, false, true],
    [{ nativeLane: true }, false, true, true],
    [{ nativeLane: true }, false, false, false], // a shipped release build never shows them
    [{ nativeLane: false }, true, true, false], // the remote switch wins
  ])("%o dev=%s build=%s → %s", (flags, dev, build, out) => {
    expect(testStreamsEnabled(flags, dev, build)).toBe(out);
  });
});
