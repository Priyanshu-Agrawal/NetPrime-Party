import { DEFAULT_ORDER, getTitleLanguage, languageOrder, resolveOrder, setTitleLanguage, titleKeyOf } from "./languagePrefs";

// MMKV can't load under jest (native module); every test passes its own in-memory store.
jest.mock("@/services/storage/universalStorage", () => ({ universalStorage: { getString: () => undefined, set: () => {} } }));
jest.mock("@/utils/prefs", () => ({ getPreferredAudio: () => null }));

function memory() {
  const m = new Map<string, string>();
  return { getString: (k: string) => m.get(k), set: (k: string, v: string | number | boolean) => void m.set(k, String(v)) };
}

describe("languageOrder", () => {
  it("defaults to Hindi, then the original audio", () => {
    expect(languageOrder(null)).toEqual(["hi", "original"]);
    expect(DEFAULT_ORDER).toEqual(["hi", "original"]);
  });

  it("follows the audio language the user last picked", () => {
    expect(languageOrder("Tamil")).toEqual(["ta", "original"]);
    expect(languageOrder("Original")).toEqual(["original"]);
    expect(languageOrder("Original audio (this source)")).toEqual(["original"]);
    expect(languageOrder("Klingon")).toEqual(["hi", "original"]);
  });

  it.each([
    ["Bengali", "bn"],
    ["Marathi", "mr"],
    ["Gujarati", "gu"],
    ["Chinese", "zh"],
    ["Malayalam", "ml"],
    ["Kannada", "kn"],
    ["Punjabi", "pa"],
    ["Urdu", "ur"],
  ])("reads %s as %s (never a lookalike)", (label, code) => expect(languageOrder(label)).toEqual([code, "original"]));

  it("doesn't read a non-language label as one", () => {
    expect(languageOrder("Spatial Audio")).toEqual(["hi", "original"]);
  });
});

describe("resolveOrder", () => {
  it("puts the title's own choice first and turns 'original' into the title's language", () => {
    expect(resolveOrder(["hi", "original"], "en", "ta")).toEqual(["ta", "hi", "en"]);
    expect(resolveOrder(["hi", "original"], "hi")).toEqual(["hi"]);
    expect(resolveOrder(["original"], undefined)).toEqual([]);
  });
});

describe("per-title language", () => {
  it("remembers per show (not per episode)", () => {
    const s = memory();
    expect(titleKeyOf("tv", "1396")).toBe("tv:1396");
    setTitleLanguage("tv:1396", "hi", s);
    expect(getTitleLanguage("tv:1396", s)).toBe("hi");
    expect(getTitleLanguage("movie:1", s)).toBeNull();
  });

  it("keeps the 300 most recent titles", () => {
    const s = memory();
    for (let i = 0; i < 305; i++) setTitleLanguage(`movie:${i}`, "en", s);
    expect(getTitleLanguage("movie:0", s)).toBeNull();
    expect(getTitleLanguage("movie:304", s)).toBe("en");
    setTitleLanguage("movie:10", "ta", s); // re-picking moves a title to the front
    for (let i = 305; i < 600; i++) setTitleLanguage(`movie:${i}`, "en", s);
    expect(getTitleLanguage("movie:10", s)).toBe("ta");
  });
});
