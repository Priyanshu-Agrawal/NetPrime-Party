import type { PlaybackCandidate } from "@/services/playback/candidate";
import {
  bestIn,
  languageOptions,
  nativeReport,
  nextAfterFailure,
  preferenceNotice,
  primaryLanguage,
  sidecarsOf,
  sourceLine,
  switchNotice,
  toNativeSource,
} from "./nativeSession";

const c = (key: string, languages: string[], over: Partial<PlaybackCandidate> = {}): PlaybackCandidate => ({
  key,
  sourceId: "r/p",
  label: `Src ${key}`,
  url: `https://cdn.example.net/${key}.m3u8?token=secret`,
  headers: { Referer: "https://r.example.net/" },
  container: "hls",
  languages,
  platforms: { ios: true, android: true },
  subtitles: [],
  verdict: "ok",
  order: 0,
  ...over,
});

describe("toNativeSource / sidecarsOf", () => {
  it("hands the player the URL, the stream's headers and its container", () => {
    expect(toNativeSource(c("a", []))).toEqual({ uri: "https://cdn.example.net/a.m3u8?token=secret", headers: { Referer: "https://r.example.net/" }, contentType: "hls" });
    expect(toNativeSource(c("b", [], { container: "mp4", headers: {} }))).toEqual({ uri: "https://cdn.example.net/b.m3u8?token=secret", headers: undefined, contentType: "progressive" });
    expect(toNativeSource(c("d", [], { container: "dash" })).contentType).toBe("dash");
    expect(toNativeSource(c("u", [], { container: "unknown" })).contentType).toBe("auto");
  });

  it("turns plugin subtitles into sidecar tracks", () => {
    expect(sidecarsOf(c("a", [], { subtitles: [{ id: "0", url: "https://s.example.net/en.srt", label: "English", language: "en" }] }))).toEqual([
      { id: "0", url: "https://s.example.net/en.srt", label: "English", language: "en" },
    ]);
  });
});

describe("languageOptions", () => {
  it("offers one row per language in rank order, the playing one active; unknown reads as this source's original audio", () => {
    const ranked = [c("hi1", ["hi"]), c("en1", ["en", "hi"]), c("hi2", ["hi"]), c("unk", [])];
    expect(languageOptions(ranked, ranked[1])).toEqual([
      { code: "hi", label: "Hindi", active: false },
      { code: "en", label: "English", active: true },
      { code: null, label: "Original audio (this source)", active: false },
    ]);
  });
});

describe("bestIn / nextAfterFailure", () => {
  const ranked = [c("hi1", ["hi"]), c("hi2", ["hi"]), c("en1", ["en"])];

  it("picks the best candidate in a language, skipping failed ones", () => {
    expect(bestIn(ranked, "hi")?.key).toBe("hi1");
    expect(bestIn(ranked, "hi", new Set(["hi1"]))?.key).toBe("hi2");
    expect(bestIn(ranked, "ta")).toBeUndefined();
    expect(primaryLanguage(c("x", []))).toBeNull();
  });

  it("F6: same language first, then any other with languageLost, then nothing", () => {
    expect(nextAfterFailure(ranked, new Set(["hi1"]), "hi")).toEqual({ candidate: ranked[1], languageLost: false });
    expect(nextAfterFailure(ranked, new Set(["hi1", "hi2"]), "hi")).toEqual({ candidate: ranked[2], languageLost: true });
    expect(nextAfterFailure(ranked, new Set(["hi1", "hi2", "en1"]), "hi")).toBeNull();
    expect(nextAfterFailure([c("u1", []), c("u2", [])], new Set(["u1"]), null)).toEqual({ candidate: expect.objectContaining({ key: "u2" }), languageLost: false });
  });
});

describe("notices (spec §6.3)", () => {
  it("says once when the wanted language isn't what plays", () => {
    expect(preferenceNotice(["hi", "en"], "en", c("e", ["en"]))).toBe("Hindi isn't available for this title — playing original audio");
    expect(preferenceNotice(["hi", "en"], "te", c("t", ["ta"]))).toBe("Hindi isn't available for this title — playing Tamil");
    expect(preferenceNotice(["hi", "en"], "en", c("u", []))).toBe("Hindi isn't available for this title — playing original audio");
    expect(preferenceNotice(["hi", "en"], "en", c("h", ["hi"]))).toBeNull();
    expect(preferenceNotice(["en"], "en", c("e", ["en"]))).toBeNull();
    expect(preferenceNotice([], "en", c("e", ["en"]))).toBeNull();
  });

  it("names the new source and the language that was lost", () => {
    expect(switchNotice(c("x", ["en"], { label: "Vidrock • English" }), "hi")).toBe("Switched to Vidrock • English — Hindi isn't on this one.");
    expect(switchNotice(c("x", ["hi"], { label: "Castle" }), null)).toBe("Switched to Castle.");
  });
});

describe("sourceLine", () => {
  it("reads source · language · quality", () => {
    expect(sourceLine(c("x", ["en"], { label: "Open Movies • HLS", quality: { label: "1080p", height: 1080 } }))).toBe("Open Movies • HLS · English · 1080p");
    expect(sourceLine(c("x", [], { label: "Castle" }))).toBe("Castle");
  });
});

describe("nativeReport", () => {
  it("reports the source id on the native lane and nothing from the stream itself", () => {
    const r = nativeReport(c("x", ["en"], { sourceId: "open-movies/open-movies" }), { tmdbId: "10378", type: "movie" }, "success", { ttffMs: 840 });
    expect(r).toMatchObject({ providerId: "open-movies/open-movies", tmdbId: "10378", mediaType: "movie", outcome: "success", lane: "native", stage: "playing", ttffMs: 840 });
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/cdn\.example\.net|token|Referer/);
    expect(r).not.toHaveProperty("errorMessage");
  });
});
