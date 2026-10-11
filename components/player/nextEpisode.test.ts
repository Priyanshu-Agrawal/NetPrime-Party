import { nextEpisode } from "./nextEpisode";

const SEASONS = [
  { season_number: 0, episode_count: 3 }, // specials
  { season_number: 1, episode_count: 8 },
  { season_number: 2, episode_count: 9 },
];

describe("nextEpisode", () => {
  it("is the next episode in the season", () => expect(nextEpisode(SEASONS, 1, 3)).toEqual({ season: 1, ep: 4 }));
  it("rolls into the next season after the last episode", () => expect(nextEpisode(SEASONS, 1, 8)).toEqual({ season: 2, ep: 1 }));
  it("is nothing after the finale, or without season data", () => {
    expect(nextEpisode(SEASONS, 2, 9)).toBeNull();
    expect(nextEpisode(undefined, 1, 1)).toBeNull();
  });
  it("skips empty seasons and specials", () => {
    expect(nextEpisode([{ season_number: 1, episode_count: 2 }, { season_number: 2, episode_count: 0 }, { season_number: 3, episode_count: 5 }], 1, 2)).toEqual({ season: 3, ep: 1 });
  });
});
