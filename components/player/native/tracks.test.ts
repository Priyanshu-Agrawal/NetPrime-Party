import {
  AUTO,
  audioLevels,
  capFor,
  inStreamSubtitles,
  mediaTracks,
  nativeCapabilities,
  qualityLevels,
  qualitySummary,
  tierOf,
  type NVideo,
} from "./tracks";

const v = (width: number, height: number, isSupported = true): NVideo => ({
  id: `${width}x${height}`,
  url: null,
  size: { width, height },
  isSupported,
});

// Apple BipBop advanced (fMP4) ladder, incl. three 1080p bitrates.
const BIPBOP = [v(960, 540), v(1920, 1080), v(1920, 1080), v(1920, 1080), v(1280, 720), v(768, 432), v(640, 360), v(480, 270)];

describe("tierOf", () => {
  it.each([
    [1920, 1080, 1080],
    [1920, 800, 1080], // scope film — labelled like YouTube does
    [1280, 534, 720],
    [960, 540, 540],
    [768, 576, 576],
    [640, 480, 480],
    [640, 360, 360],
    [480, 270, 360],
    [320, 240, 240],
    [224, 100, 144],
  ])("%ix%i → %ip", (w, h, t) => expect(tierOf(w, h)).toBe(t));
});

describe("qualityLevels", () => {
  it("lists Auto then each distinct tier, highest first", () => {
    expect(qualityLevels(BIPBOP, null).map((q) => q.label)).toEqual([AUTO, "1080p", "720p", "540p", "480p", "360p"]);
    expect(qualityLevels(BIPBOP, null)[0].active).toBe(true);
  });

  it("marks the capped tier active", () => {
    const levels = qualityLevels(BIPBOP, 720);
    expect(levels.find((q) => q.active)?.label).toBe("720p");
  });

  it("offers nothing when there is only one tier or unsupported variants", () => {
    expect(qualityLevels([v(1280, 720)], null)).toEqual([]);
    expect(qualityLevels([v(1280, 720), v(1920, 1080, false)], null)).toEqual([]);
  });
});

describe("qualitySummary / capFor", () => {
  it("summarises Auto with the playing tier, or the cap", () => {
    expect(qualitySummary(null, v(768, 576))).toBe("Auto (576p)");
    expect(qualitySummary(null, null)).toBe(AUTO);
    expect(qualitySummary(720, v(1920, 1080))).toBe("720p");
  });

  it("turns a label into a 16:9 size cap; Auto is no cap", () => {
    expect(capFor("720p")).toEqual({ tier: 720, maxWidth: 1280, maxHeight: 720 });
    expect(capFor("576p")).toEqual({ tier: 576, maxWidth: 1024, maxHeight: 576 });
    expect(capFor(AUTO)).toBeNull();
  });
});

const EN = { id: "a0", language: "en", label: "stream_5" };
const DE = { id: "a1", language: "de", label: "stream_4" };
const SUB_EN = { id: "s0", language: "en", label: "stream_0" };
const SUB_FR = { id: "s1", language: "fr", label: "stream_2" };

describe("track rows", () => {
  it("audio levels carry language names and the active one", () => {
    expect(audioLevels([EN, DE], DE)).toEqual([
      { label: "English", active: false },
      { label: "German", active: true },
    ]);
  });

  it("media tracks list audio then text with ISO-639-1 languages", () => {
    expect(mediaTracks([EN], EN, [SUB_FR], null)).toEqual([
      { id: "a0", language: "en", label: "English", kind: "audio", selected: true },
      { id: "s1", language: "fr", label: "French", kind: "text", selected: false },
    ]);
  });

  it("in-stream subtitle rows get index ids prefixed with in:", () => {
    expect(inStreamSubtitles([SUB_EN, SUB_FR], SUB_FR)).toEqual([
      { id: "in:0", label: "English", language: "en", selected: false },
      { id: "in:1", label: "French", language: "fr", selected: true },
    ]);
  });
});

describe("nativeCapabilities", () => {
  it("reports what this stream can switch", () => {
    const caps = nativeCapabilities({ audio: [EN, DE], text: [], video: BIPBOP }, 0, true);
    expect(caps).toEqual({
      fractionalRate: true,
      preciseSeek: true,
      audioTracks: true,
      qualitySelect: true,
      subtitles: false,
      partySync: false,
    });
  });

  it("hides manual quality without the native cap, and counts sidecar subtitles", () => {
    const caps = nativeCapabilities({ audio: [EN], text: [], video: BIPBOP }, 2, false);
    expect(caps.qualitySelect).toBe(false);
    expect(caps.audioTracks).toBe(false);
    expect(caps.subtitles).toBe(true);
  });
});
