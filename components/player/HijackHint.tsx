/**
 * Small hint shown under the solo player's control bar.
 */
import {
  isPartyCapable,
  isUnstable,
  type Provider,
} from "@/components/player/providerRegistry";
import { colors } from "@/theme/bearoom";
import React from "react";
import { StyleSheet, Text } from "react-native";

export function HijackHint({ provider }: { provider: Provider }) {
  if (!isPartyCapable(provider)) {
    return (
      <Text style={[styles.hint, styles.grey]}>
        Watch Party isn’t supported on {provider.name}. Tap the server button and pick the server marked with a “Party” badge.
      </Text>
    );
  }
  if (isUnstable(provider)) {
    return (
      <Text style={[styles.hint, styles.amber]}>
        ⚠︎ {provider.name} has its own server list that can go offline — parties on it may be unreliable.
      </Text>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  hint: { fontSize: 10, paddingHorizontal: 14, paddingBottom: 6, backgroundColor: colors.hintBg },
  grey: { color: colors.textFaint },
  amber: { color: colors.honeyBright },
});

export default HijackHint;
