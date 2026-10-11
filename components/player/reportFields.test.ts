import { stageFor } from "./reportFields";

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
