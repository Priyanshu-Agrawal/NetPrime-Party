import type { PlaybackCandidate } from "@/services/playback/candidate";
import { pendingHostStream } from "./pendingHostStream";
import { advancesOnEnd, nativeSeed, roomLane } from "./roomLane";

const cand = { key: "s/p:k1", sourceId: "s/p", languages: ["en"], url: "https://cdn.example.net/a.m3u8", headers: {} } as unknown as PlaybackCandidate;
const TITLE = { tmdbId: "10378", type: "movie" as const, name: "Big Buck Bunny" };
const pluginItem = { id: "movie:10378", ref: { source: "plugin", tmdbId: "10378", type: "movie", pluginId: "s/p", streamId: "s/p:k1" }, status: "queued" };
const tmdbItem = { id: "movie:550", ref: { source: "tmdb", tmdbId: "550", type: "movie", providerId: "vidfast" }, status: "queued" };

describe("roomLane", () => {
  it("a plugin item plays natively, a provider item in the web player, nothing else is empty", () => {
    expect(roomLane({ queue: [pluginItem], currentItemId: "movie:10378", media: null } as never)).toBe("native");
    expect(roomLane({ queue: [tmdbItem], currentItemId: "movie:550", media: { tmdbId: "550", type: "movie", providerId: "vidfast" } } as never)).toBe("web");
    expect(roomLane({ queue: [], currentItemId: null, media: null } as never)).toBe("empty");
    expect(roomLane(null)).toBe("empty");
  });
});

describe("nativeSeed", () => {
  it("puts the host's stream in the room as a plugin item — no URL in it", () => {
    const seed = nativeSeed({ candidate: cand, title: TITLE }, { queue: [], currentItemId: null } as never);
    expect(seed).toEqual({
      id: "movie:10378",
      item: { ref: { source: "plugin", tmdbId: "10378", type: "movie", pluginId: "s/p", streamId: "s/p:k1", language: "en" }, title: "Big Buck Bunny" },
    });
    expect(JSON.stringify(seed)).not.toMatch(/https?:/);
  });

  it("does nothing once the room already plays it", () => {
    expect(nativeSeed({ candidate: cand, title: TITLE }, { queue: [pluginItem], currentItemId: "movie:10378" } as never)).toBeNull();
    expect(nativeSeed(null, { queue: [], currentItemId: null } as never)).toBeNull();
  });
});

describe("pendingHostStream", () => {
  it("keeps the host's stream for its room until taken, and forgets it after 30 min", () => {
    pendingHostStream.set("ABCD", { candidate: cand, title: TITLE }, 0);
    expect(pendingHostStream.peek("ABCD", 1000)?.candidate).toBe(cand);
    expect(pendingHostStream.take("ABCD", 2000)).toBe(cand);
    expect(pendingHostStream.take("ABCD", 3000)).toBeNull();
    pendingHostStream.set("WXYZ", { candidate: cand, title: TITLE }, 0);
    expect(pendingHostStream.peek("WXYZ", 31 * 60_000)).toBeNull();
  });
});

describe("advancesOnEnd", () => {
  it("the host of a native room moves the queue on when the film ends; nobody else does", () => {
    expect(advancesOnEnd("ended", "native", true)).toBe(true);
    expect(advancesOnEnd("ended", "native", false)).toBe(false);
    expect(advancesOnEnd("ended", "web", true)).toBe(false);
    expect(advancesOnEnd("pause", "native", true)).toBe(false);
  });
});

