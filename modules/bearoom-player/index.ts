import { requireOptionalNativeModule } from "expo-modules-core";

interface NativeBearoomPlayer {
  setMaxVideoSize(player: object, maxWidth: number, maxHeight: number): void;
  clearMaxVideoSize(player: object): void;
}

const native = requireOptionalNativeModule<NativeBearoomPlayer>("BearoomPlayer");

/** True when this binary carries the module (manual quality is offered only then). */
export const qualityCapAvailable = !!native;

/**
 * Manual quality for expo-video: caps adaptive selection at a size; `null` lifts the cap (Auto). Audio and subtitle
 * renditions keep playing — nothing reloads. Returns false where the module is missing.
 */
export function setQualityCap(player: object, cap: { maxWidth: number; maxHeight: number } | null): boolean {
  if (!native) return false;
  if (cap) native.setMaxVideoSize(player, cap.maxWidth, cap.maxHeight);
  else native.clearMaxVideoSize(player);
  return true;
}
