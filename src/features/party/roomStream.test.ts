import type { PlaybackCandidate } from "@/services/playback/candidate";
import type { StreamHandoff } from "@/services/party/protocol";
import { guestFallback, hostSource, relocateSame, withinCut } from "./roomStream";

const H: StreamHandoff = { itemId: "movie:1", key: "s/p:k1", sourceId: "s/p", url: "https://cdn.example.net/a.m3u8", headers: { Referer: "https://r.example.net/" }, durationSec: 600, language: "hi" };
const cand = (over: Partial<PlaybackCandidate>): PlaybackCandidate => ({
  key: "s/p:k1",
  sourceId: "s/p",
  label: "Src",
  url: "https://cdn2.example.net/b.m3u8",
  headers: {},
  container: "hls",
  languages: ["hi"],
  platforms: { ios: true, android: true },
  subtitles: [],
  verdict: "ok",
  order: 0,
  ...over,
});
const resolved = (...ranked: PlaybackCandidate[]) => async () => ({ ranked, rejected: [], failures: [], complete: true });
const TITLE = { tmdbId: "1", type: "movie" as const };

describe("roomStream", () => {
  it("plays the host's stream first, with its headers", () => {
    expect(hostSource(H)).toEqual({ uri: H.url, headers: H.headers });
  });

  it("±2.5 s is the same cut; unknown on either side can't be checked", () => {
    expect(withinCut(600, 602)).toBe(true);
    expect(withinCut(600, 603)).toBe(false);
    expect(withinCut(undefined, 600)).toBe(true);
  });

  it("re-resolving finds the same stream key, else the same source in the room's language", async () => {
    expect((await relocateSame(H, resolved(cand({ key: "other", sourceId: "x/y" }), cand({})), TITLE, ["hi"]))?.key).toBe("s/p:k1");
    expect((await relocateSame(H, resolved(cand({ key: "s/p:k2", languages: ["en"] }), cand({ key: "s/p:k3" })), TITLE, ["hi"]))?.key).toBe("s/p:k3");
    expect(await relocateSame(H, resolved(cand({ key: "x", sourceId: "x/y" })), TITLE, ["hi"])).toBeNull();
  });

  it("a guest falls back to its own copy of the same stream when it is the same cut", async () => {
    expect(await guestFallback(H, async () => cand({ durationSec: 601 }))).toMatchObject({ kind: "local", candidate: { key: "s/p:k1" } });
  });

  it("a different cut, or nothing found, means this source won't play here", async () => {
    expect(await guestFallback(H, async () => cand({ durationSec: 630 }))).toEqual({ kind: "none", reason: "different-cut" });
    expect(await guestFallback(H, async () => null)).toEqual({ kind: "none", reason: "not-found" });
    expect(await guestFallback(H, async () => Promise.reject(new Error("offline")))).toEqual({ kind: "none", reason: "not-found" });
  });
});
