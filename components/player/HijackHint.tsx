/**
 * Small hint shown under the solo player's control bar:
 *  - provider NOT hijackable → grey note pointing to supported servers;
 *  - provider hijackable but UNSTABLE (internal server picker) → amber warning.
 */
import {
  isHijackable,
  isUnstable,
  type Provider,
} from "@/components/player/providerRegistry";
import React from "react";
import { StyleSheet, Text } from "react-native";

export function HijackHint({ provider }: { provider: Provider }) {
  if (!isHijackable(provider)) {
    return (
      <Text style={[styles.hint, styles.grey]}>
        Watch Party isn’t supported on {provider.name}. Tap the server button and
        pick one marked with a “Party” badge (e.g. VidFast, VidCore, NetPrime).
      </Text>
    );
  }
  if (isUnstable(provider)) {
    return (
      <Text style={[styles.hint, styles.amber]}>
        ⚠︎ {provider.name} has its own server list that can go offline — parties on
        it may be unreliable. A single-player server (VidFast, VidCore) is steadier.
      </Text>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  hint: {
    fontSize: 10,
    paddingHorizontal: 14,
    paddingBottom: 6,
    backgroundColor: "#0a0a0a",
  },
  grey: { color: "#666" },
  amber: { color: "#e0a316" },
});

export default HijackHint;
