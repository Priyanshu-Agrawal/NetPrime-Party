import { buildEmbedUrl, type EmbedProvider } from "./embedUrl";

const videasy: EmbedProvider = {
  id: "videasy",
  urls: { movie: "https://p.test/movie/${id}", tv: "https://p.test/tv/${id}/${season}/${episode}" },
  hijack: { supported: true },
};
const vidfast: EmbedProvider = {
  id: "vidfast",
  urls: { movie: "https://vf.test/movie/${id}", tv: "https://vf.test/tv/${id}/${season}/${episode}" },
  hijack: { supported: true, autoplayParam: "autoPlay=false" },
};

describe("buildEmbedUrl", () => {
  it("fills the movie template", () => {
    expect(buildEmbedUrl(vidfast, { tmdbId: "550", type: "movie" })).toBe("https://vf.test/movie/550");
  });

  it("fills season and episode for TV", () => {
    expect(buildEmbedUrl(vidfast, { tmdbId: "1396", type: "tv", season: 1, episode: 2 })).toBe(
      "https://vf.test/tv/1396/1/2",
    );
  });

  it("lets videasy auto-advance episodes when watching alone", () => {
    const url = buildEmbedUrl(videasy, { tmdbId: "1396", type: "tv", season: 1, episode: 1 });
    expect(url).toContain("nextEpisode=true");
    expect(url).toContain("autoplayNextEpisode=true");
  });

  it("never lets videasy auto-advance inside a party (the host owns the queue)", () => {
    const url = buildEmbedUrl(videasy, { tmdbId: "1396", type: "tv", season: 1, episode: 1 }, { party: true });
    expect(url).not.toContain("nextEpisode=true");
    expect(url).not.toContain("autoplayNextEpisode=true");
    expect(url).toContain("episodeSelector=true");
  });

  it("adds the autoplay-off param and startAt only in a party", () => {
    const m = { tmdbId: "550", type: "movie" as const, startAt: 125.7 };
    expect(buildEmbedUrl(vidfast, m)).toBe("https://vf.test/movie/550");
    expect(buildEmbedUrl(vidfast, m, { party: true })).toBe("https://vf.test/movie/550?autoPlay=false&startAt=125");
  });
});
