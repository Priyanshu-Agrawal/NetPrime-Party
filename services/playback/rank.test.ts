import type { PlaybackCandidate } from "./candidate";
import { languageRank, rankCandidates } from "./rank";

const c = (key: string, over: Partial<PlaybackCandidate> = {}): PlaybackCandidate => ({
  key,
  sourceId: "r/p",
  label: key,
  url: `https://a.example.net/${key}.m3u8`,
  headers: {},
  container: "hls",
  languages: [],
  platforms: { ios: true, android: true },
  subtitles: [],
  verdict: "ok",
  order: 0,
  ...over,
});
const keys = (list: PlaybackCandidate[]) => list.map((x) => x.key);
const ctx = (over: Partial<Parameters<typeof rankCandidates>[1]> = {}) => ({ platform: "android" as const, languages: ["hi", "en"], isDown: () => false, ...over });

describe("rankCandidates", () => {
  it("drops rejected candidates and those this platform can't play", () => {
    const list = [c("ok"), c("rej", { verdict: "rejected" }), c("dash", { platforms: { ios: false, android: true } })];
    expect(keys(rankCandidates(list, ctx()))).toEqual(["ok", "dash"]);
    expect(keys(rankCandidates(list, ctx({ platform: "ios" })))).toEqual(["ok"]);
  });

  it("orders by the wanted languages; unknown sits between them and other languages", () => {
    const list = [c("ta", { languages: ["ta"] }), c("unknown"), c("en", { languages: ["en"] }), c("hi", { languages: ["en", "hi"] })];
    expect(keys(rankCandidates(list, ctx()))).toEqual(["hi", "en", "unknown", "ta"]);
  });

  it("sinks down sources within the same language, then prefers verified, then taller, then earlier", () => {
    const list = [
      c("down", { languages: ["hi"], sourceId: "r/down", order: 0 }),
      c("unverified", { languages: ["hi"], verdict: "unverified", order: 1 }),
      c("720", { languages: ["hi"], quality: { label: "720p", height: 720 }, order: 2 }),
      c("1080", { languages: ["hi"], quality: { label: "1080p", height: 1080 }, order: 3 }),
      c("late1080", { languages: ["hi"], quality: { label: "1080p", height: 1080 }, order: 4 }),
    ];
    expect(keys(rankCandidates(list, ctx({ isDown: (id) => id === "r/down" })))).toEqual(["1080", "late1080", "720", "unverified", "down"]);
  });

  it("languageRank", () => {
    expect(languageRank(c("x", { languages: ["en"] }), ["hi", "en"])).toBe(1);
    expect(languageRank(c("x"), ["hi", "en"])).toBe(2);
    expect(languageRank(c("x", { languages: ["ta"] }), ["hi", "en"])).toBe(3);
  });
});
