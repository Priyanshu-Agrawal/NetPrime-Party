import { describe, expect, it } from "vitest";
import { parseFlags } from "./flags";

describe("parseFlags", () => {
  it("defaults every lane off", () => {
    expect(parseFlags({})).toEqual({ embedApiLane: false, nativeLane: false, pluginHost: false });
  });
  it("accepts 1/true/on/yes in any case, with whitespace", () => {
    expect(parseFlags({ FLAG_EMBED_API_LANE: "1", FLAG_NATIVE_LANE: " TRUE ", FLAG_PLUGIN_HOST: "on" })).toEqual({
      embedApiLane: true,
      nativeLane: true,
      pluginHost: true,
    });
  });
  it("treats anything else as off (a typo must never switch a lane on)", () => {
    expect(parseFlags({ FLAG_EMBED_API_LANE: "0", FLAG_NATIVE_LANE: "tru", FLAG_PLUGIN_HOST: "" })).toEqual({
      embedApiLane: false,
      nativeLane: false,
      pluginHost: false,
    });
  });
});
