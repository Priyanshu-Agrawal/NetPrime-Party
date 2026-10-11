import { stageFor, successReport } from "./reportFields";

describe("stageFor", () => {
  it.each([
    ["success", "playing"],
    ["playback_stall", "playing"],
    ["manual_switch", "playing"],
    ["no_bind", "bind"],
    ["http_error", "load"],
    ["render_crash", "load"],
    ["not_found", "load"],
    ["captcha_block", "load"],
  ] as const)("%s → %s", (outcome, stage) => expect(stageFor(outcome)).toBe(stage));
});

describe("successReport", () => {
  const MOUNT = 1_000;
  it("waits for real playback past 30 s, then carries the time to first progress", () => {
    expect(successReport(12, 4_000, MOUNT)).toBeNull(); // not 30 s in yet
    expect(successReport(31, 4_000, MOUNT)).toEqual({ ttffMs: 3_000 });
  });

  it("a resumed title (already past 30 s) waits for the first real progress, so TTFF is never missing", () => {
    expect(successReport(616, null, MOUNT)).toBeNull();
    expect(successReport(617, 9_500, MOUNT)).toEqual({ ttffMs: 8_500 });
  });
});
