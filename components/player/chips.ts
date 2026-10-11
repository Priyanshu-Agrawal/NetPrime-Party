import type { ControlChips } from "./PlayerControls";
import type { QualityLevel, SubtitleTrack } from "./types";

/** The controls' quick chip from the current track lists. */
export function controlChips(
  audios: QualityLevel[],
  qualities: QualityLevel[],
  subtitles: SubtitleTrack[],
  qualityOverride?: string,
): ControlChips {
  return {
    audio: audios.find((a) => a.active)?.label,
    quality: qualityOverride ?? qualities.find((q) => q.active)?.label,
    subtitles: subtitles.find((s) => s.selected)?.label ?? null,
  };
}
