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

  it("rejects an unknown lane or a negative ttff", () => {
    expect(() => ReportRequestSchema.parse({ ...base, lane: "satellite" })).toThrow();
    expect(() => ReportRequestSchema.parse({ ...base, ttffMs: -1 })).toThrow();
  });
});
