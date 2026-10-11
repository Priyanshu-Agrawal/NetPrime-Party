import { describe, expect, it } from "vitest";
import { ReportRequestSchema } from "./schemas";
import { reportRow } from "./reportRow";

const base = { providerId: "vidfast", tmdbId: "550", mediaType: "movie", outcome: "success", platform: "android" } as const;

describe("reportRow", () => {
  it("maps the new fields to columns", () => {
    const body = ReportRequestSchema.parse({ ...base, lane: "embed", stage: "playing", ttffMs: 1800 });
    expect(reportRow(body, "IN", "h")).toMatchObject({ lane: "embed", stage: "playing", ttff_ms: 1800, country: "IN", client_hash: "h" });
  });

  it("leaves them out when the client didn't send them (older apps)", () => {
    const row = reportRow(ReportRequestSchema.parse(base), null, "h");
    expect(row).not.toHaveProperty("lane");
    expect(row).not.toHaveProperty("stage");
    expect(row).not.toHaveProperty("ttff_ms");
  });

  it("drops a bad lane, stage or ttff instead of losing the whole report", () => {
    for (const extra of [{ lane: "satellite" }, { stage: "warp" }, { ttffMs: -1 }, { ttffMs: 3_600_000 }, { ttffMs: 1.5 }]) {
      const body = ReportRequestSchema.parse({ ...base, ...extra });
      expect(body.outcome).toBe("success");
      const row = reportRow(body, null, "h");
      expect(row).not.toHaveProperty("lane");
      expect(row).not.toHaveProperty("stage");
      expect(row).not.toHaveProperty("ttff_ms");
    }
  });
});
