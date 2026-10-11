import { BENCH_FULL, BENCH_SMOKE, CANDIDATE_REPOS } from "./scorecardData";

describe("scorecard data", () => {
  it("every candidate is disabled, commit-pinned, and every file has a sha256", () => {
    for (const r of CANDIDATE_REPOS) {
      expect(r.enabled).toBe(false);
      expect(r.manifestUrl).toMatch(/\/(raw\/commit\/[0-9a-f]{40,64}|[0-9a-f]{40})\/manifest\.json$/);
      expect(r.files.length).toBeGreaterThan(1);
      for (const f of r.files) expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(r.files.some((f) => f.path === "manifest.json")).toBe(true);
    }
  });

  it("has the 20 benchmark titles and a 4-title smoke set", () => {
    expect(BENCH_FULL).toHaveLength(20);
    expect(new Set(BENCH_FULL.map((t) => `${t.type}:${t.tmdbId}`)).size).toBe(20);
    expect(BENCH_SMOKE.map((t) => t.name)).toEqual(["Jawan", "Oppenheimer", "Breaking Bad S1E1", "Mirzapur S1E1"]);
  });
});
