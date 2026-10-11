import { languageOf, streamLanguages, textLanguages } from "./languages";

describe("textLanguages", () => {
  it.each([
    ["Vidrock • Hindi", ["hi"]],
    ["Castle - Tamil - 1080P", ["ta"]],
    ["[Hindi + English] Dual Audio", ["hi", "en"]],
    ["English, Hindi", ["en", "hi"]],
    ["HIN AAC 2.0", ["hi"]],
    ["Español Latino", ["es"]],
    ["Japanese (jpn) + English subs", ["ja", "en"]],
  ])("%s → %j", (text, want) => expect(textLanguages(text)).toEqual(want));

  it("reads native-script names", () => {
    expect(textLanguages("हिंदी 720p")).toEqual(["hi"]);
    expect(textLanguages("தமிழ்")).toEqual(["ta"]);
  });

  it.each(["this is fine", "Ben 10", "Multi Audio", "Dual Audio 1080p", "HD", "The Mallard"])("guesses nothing from %s", (text) => {
    expect(textLanguages(text)).toEqual([]);
  });

  it("maps 'Original' to the title's original language, and to nothing when that is unknown", () => {
    expect(textLanguages("Original-Audio", "en")).toEqual(["en"]);
    expect(textLanguages("Original-Audio")).toEqual([]);
  });
});

describe("languageOf", () => {
  it.each([
    ["hi", "hi"],
    ["hin", "hi"],
    ["Hindi", "hi"],
    ["en-US", "en"],
    ["HD", undefined],
    ["Multi", undefined],
    [undefined, undefined],
  ])("%s → %s", (v, want) => expect(languageOf(v)).toBe(want));
});

describe("streamLanguages", () => {
  it("puts the plugin's declared language first", () => {
    expect(streamLanguages({ language: "Hindi", name: "Vidrock", title: "English subs" }, {})).toEqual(["hi", "en"]);
  });

  it("ignores language words that are only the film's own title", () => {
    expect(streamLanguages({ name: "Open • English Vinglish 1080p", title: "" }, { titleName: "English Vinglish" })).toEqual([]);
    expect(streamLanguages({ name: "English Vinglish • Hindi", title: "" }, { titleName: "English Vinglish" })).toEqual(["hi"]);
  });
});
