import { foundLanguages, playButton } from "./languagePreview";

const done = (langs: string[][], complete = true) => ({ langs, complete });

describe("playButton", () => {
  it("says nothing before the preview starts", () => {
    expect(playButton("off", null, ["hi"])).toEqual({ label: "Play", others: [] });
    expect(playButton("waiting", null, ["hi"])).toEqual({ label: "Play", others: [] });
  });

  it("is still Play while checking", () => {
    expect(playButton("checking", null, ["hi"])).toEqual({ label: "Play", note: "Checking languages…", others: [] });
  });

  it("names the preferred language when a stream has it, and offers the others", () => {
    expect(playButton("done", done([["hi"], ["en"], ["ta", "en"]]), ["hi", "en"])).toEqual({
      label: "Play in Hindi",
      others: [
        { code: "en", label: "English" },
        { code: "ta", label: "Tamil" },
      ],
    });
  });

  it("says the preferred language is missing only after a complete answer that found other languages", () => {
    expect(playButton("done", done([["en"]]), ["hi", "en"])).toEqual({ label: "Play", note: "Hindi not available for this title", others: [] });
    expect(playButton("done", done([["en"]], false), ["hi", "en"])).toEqual({ label: "Play", others: [] });
  });

  it("claims nothing when no native stream answered or none says its language", () => {
    expect(playButton("done", done([]), ["hi", "en"])).toEqual({ label: "Play", others: [] });
    expect(playButton("done", done([[], []]), ["hi", "en"])).toEqual({ label: "Play", others: [] });
  });

  it("offers languages outside the wanted list", () => {
    expect(playButton("done", done([["ja"]]), ["hi", "en"])).toEqual({
      label: "Play",
      note: "Hindi not available for this title",
      others: [{ code: "ja", label: "Japanese" }],
    });
  });
});

describe("multi-audio streams", () => {
  it("a stream with Hindi as its second language still plays in Hindi", () => {
    expect(playButton("done", done([["ta", "hi"]]), ["hi", "ta"])).toEqual({ label: "Play in Hindi", others: [{ code: "ta", label: "Tamil" }] });
  });
});

describe("foundLanguages", () => {
  it("takes every language once, best stream first", () => {
    expect(foundLanguages(done([["hi", "en"], ["ta"], ["hi"]]))).toEqual(["hi", "en", "ta"]);
  });
});
