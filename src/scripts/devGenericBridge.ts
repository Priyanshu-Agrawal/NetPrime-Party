/**
 * devGenericBridge.ts — DEV BUILDS ONLY. Lets the Phase 1A gate run before the generic
 * bridge is published to the live providers table: hijack-capable providers that have
 * no published script get a `<id>@dev-generic` version, and the script cache answers
 * them with the bundled generic bridge.
 *
 * Enabled by starting Metro with EXPO_PUBLIC_DEV_GENERIC_BRIDGE=1. Every use is guarded
 * by `__DEV__`, which release builds fold away before dependencies are collected, so the
 * bridge text never ships in a release binary.
 */
import type { Provider } from "@/components/player/providerRegistry";

export const DEV_BRIDGE_SUFFIX = "@dev-generic";

export function devBridgeEnabled(): boolean {
  return __DEV__ && process.env.EXPO_PUBLIC_DEV_GENERIC_BRIDGE === "1";
}

/** Give each unscripted hijack-capable provider (not videasy — it has its own bridge) the dev version. */
export function withDevBridge(providers: Provider[]): Provider[] {
  return providers.map((p) =>
    p.hijack.supported && !p.scriptVersion && p.id !== "videasy"
      ? { ...p, scriptVersion: `${p.id}${DEV_BRIDGE_SUFFIX}` }
      : p,
  );
}
