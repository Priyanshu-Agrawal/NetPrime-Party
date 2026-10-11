import { useFeatureFlags } from "@/src/store/features/providers/hooks";
import type { FeatureFlags } from "@/src/types/worker.types";

/** Baked in at bundle time; set only for local measurement builds (`EXPO_PUBLIC_TEST_STREAMS=1`), never for a shipped one. */
const BUILD_FLAG = process.env.EXPO_PUBLIC_TEST_STREAMS === "1";

/** Test streams show in dev builds or flagged local builds, and only while the remote `nativeLane` switch is on. */
export function testStreamsEnabled(flags: Pick<FeatureFlags, "nativeLane">, dev: boolean = __DEV__, build: boolean = BUILD_FLAG): boolean {
  return flags.nativeLane && (dev || build);
}

export function useTestStreamsEnabled(): boolean {
  return testStreamsEnabled(useFeatureFlags());
}
