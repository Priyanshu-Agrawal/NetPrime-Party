import type { ReportOutcome, ReportStage } from "@/src/types/worker.types";

/** Where a reported outcome happened (spec §5.7). */
export function stageFor(outcome: ReportOutcome): ReportStage {
  switch (outcome) {
    case "no_bind":
      return "bind";
    case "http_error":
    case "render_crash":
    case "not_found":
    case "captcha_block":
      return "load";
    default:
      return "playing";
  }
}
