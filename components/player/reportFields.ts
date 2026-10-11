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

/** Playback position after which a session counts as a success (the health denominator). */
export const SUCCESS_AFTER_SEC = 30;

/**
 * The success report, once due: the video is past 30 s AND has really progressed (a resumed title starts past 30 s,
 * so position alone isn't playback). Carries the time from the player's mount to that first progress.
 */
export function successReport(currentTime: number, firstProgressAt: number | null, mountedAt: number): { ttffMs: number } | null {
  if (currentTime < SUCCESS_AFTER_SEC || firstProgressAt == null) return null;
  return { ttffMs: Math.max(0, firstProgressAt - mountedAt) };
}
