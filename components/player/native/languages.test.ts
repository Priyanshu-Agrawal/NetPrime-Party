import { languageName, normalizeLanguage, trackLabels } from "./languages";

describe("normalizeLanguage", () => {
  it.each([
    ["en", "en"],
    ["EN", "en"],
    ["eng", "en"],
    ["hin", "hi"],
    ["en_US", "en"],
    ["pt-BR", "pt-br"],
    ["und", undefined],
    ["", undefined],
    [undefined, undefined],
    ["english", undefined],
  ])("%s → %s", (input, out) => {
    expect(normalizeLanguage(input as string | undefined)).toBe(out);
  });
});

describe("languageName", () => {
  it("names known codes and shows unknown ones as an upper-case code", () => {
    expect(languageName("hi")).toBe("Hindi");
    expect(languageName("pt-br")).toBe("Portuguese (Brazil)");
    expect(languageName("xx")).toBe("XX");
  });
});

describe("trackLabels", () => {
  it("names languages and numbers repeats (Angel One has two English mixes)", () => {
    expect(
      trackLabels([
        { language: "en", label: "stream_5" },
        { language: "de" },
        { language: "it" },
        { language: "fr" },
        { language: "es" },
        { language: "en", label: "stream_6" },
      ]),
    ).toEqual(["English", "German", "Italian", "French", "Spanish", "English · 2"]);
  });

  it("falls back to the track's own label, then a number — never a guessed language", () => {
    expect(trackLabels([{ language: "und", label: "Commentary" }, { language: null, name: "" }])).toEqual([
      "Commentary",
      "Track 2",
    ]);
  });
});
