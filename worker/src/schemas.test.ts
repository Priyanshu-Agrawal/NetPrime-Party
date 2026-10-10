import { describe, expect, it } from "vitest";
import { HijackSchema } from "./schemas";

describe("HijackSchema", () => {
  it("keeps the per-platform and start-click fields", () => {
    const parsed = HijackSchema.parse({
      supported: true,
      videoLocation: "cross-origin-iframe",
      platforms: { ios: true, android: false },
      startSelectors: ["button.play"],
    });
    expect(parsed).toEqual({
      supported: true,
      videoLocation: "cross-origin-iframe",
      platforms: { ios: true, android: false },
      startSelectors: ["button.play"],
    });
  });
});
