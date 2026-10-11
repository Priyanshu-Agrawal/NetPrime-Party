import { languageOf, streamLanguages, textLanguages } from "./languages";

describe("textLanguages", () => {
  it.each([
    ["Vidrock • Hindi", ["hi"]],
    ["Castle - Tamil - 1080P", ["ta"]],
    ["[Hindi + English] Dual Audio", ["hi", "en"]],
    ["English, Hindi", ["en", "hi"]],
    ["HIN AAC 2.0", ["hi"]],
    ["Español Latino", ["es"]],
    ["Japanese (jpn) + English subs", ["ja"]],
    ["Tamil + Hindi Subs", ["ta"]],
    ["Korean • English Subtitles", ["ko"]],
    ["Hindi ESub", ["hi"]],
    ["ENG-SUB Korean", ["ko"]],
    ["Subs: English | Hindi Dub", ["hi"]],
    ["Hindi Soft Subs + Tamil", ["ta"]],
  ])("%s → %j", (text, want) => expect(textLanguages(text)).toEqual(want));

  it("reads native-script names", () => {
    expect(textLanguages("हिंदी 720p")).toEqual(["hi"]);
    expect(textLanguages("தமிழ்")).toEqual(["ta"]);
  });

  it.each(["this is fine", "Ben 10", "Multi Audio", "Dual Audio 1080p", "HD", "The Mallard", "The Spa", "Tai Chi Master", "Todo por amor", "Tha Carter"])("guesses nothing from %s", (text) => {
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
    expect(streamLanguages({ language: "Hindi", name: "Vidrock", title: "Also English" }, {})).toEqual(["hi", "en"]);
  });

  it("ignores language words that are only the film's own title — dotted file names and the original title too", () => {
    expect(streamLanguages({ name: "Open • English Vinglish 1080p", title: "" }, { titleName: "English Vinglish" })).toEqual([]);
    expect(streamLanguages({ name: "English Vinglish • Hindi", title: "" }, { titleName: "English Vinglish" })).toEqual(["hi"]);
    expect(streamLanguages({ name: "English.Vinglish.2012.1080p.WEB-DL", title: "" }, { titleName: "English Vinglish" })).toEqual([]);
    expect(streamLanguages({ name: "English-Vinglish", title: "" }, { titleName: "English Vinglish" })).toEqual([]);
    expect(streamLanguages({ name: "Hindi.Medium.2017.Tamil", title: "" }, { titleName: "Hindi Medium" })).toEqual(["ta"]);
    expect(streamLanguages({ name: "Hindi Medium", title: "" }, { titleName: "Something Else", originalTitle: "Hindi Medium" })).toEqual([]);
  });

  it("a subtitle mention isn't the stream's audio, with or without a title to strip", () => {
    expect(streamLanguages({ name: "Vidrock", title: "English | Subs: Hindi" }, { titleName: "Jawan" })).toEqual(["en"]);
    expect(streamLanguages({ name: "Vidrock", title: "Subtitles - Hindi" }, { titleName: "Jawan" })).toEqual([]);
    expect(streamLanguages({ name: "Jawan.2023 • English • Subs: Hindi", title: "" }, { titleName: "Jawan" })).toEqual(["en"]);
    expect(streamLanguages({ name: "ENG-SUB Korean", title: "" }, { titleName: "Parasite" })).toEqual(["ko"]);
  });

  it("removes the title only on word boundaries", () => {
    expect(streamLanguages({ name: "Thailand Thai dub", title: "" }, { titleName: "Land" })).toEqual(["th"]);
  });
});
