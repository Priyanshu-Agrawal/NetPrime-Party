/** Route wrapper for the native lane. Phase 1B: opens a dev test stream; anything else goes back. */
import { GLASS_OVER_VIDEO, VIDEO_SURFACE } from "@/components/player/native/surface";
import { findStream } from "@/src/features/dev/testStreams";
import { useTestStreamsEnabled } from "@/src/features/dev/testStreamsGate";
import { NativePlayerView } from "@/src/features/player/NativePlayerView";
import type { PlayerStackParamList } from "@/src/navigation/types";
import { colors, font, ms } from "@/theme/bearoom";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function NativePlayerScreen() {
  const route = useRoute<RouteProp<PlayerStackParamList, "NativePlayer">>();
  const navigation = useNavigation();
  const enabled = useTestStreamsEnabled();
  const stream = enabled ? findStream(route.params?.streamId) : undefined;

  if (!stream) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>This stream isn’t available.</Text>
        <Pressable accessibilityRole="button" onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={styles.back}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <NativePlayerView
      key={stream.id}
      title={stream.title}
      source={stream.source}
      sidecarSubtitles={stream.sidecar}
      sourceLabel={stream.title}
      startedAt={route.params?.startedAt}
      surfaceType={VIDEO_SURFACE}
      glassOverVideo={GLASS_OVER_VIDEO}
      devHud
      onClose={() => navigation.goBack()}
      onOpenSource={() => navigation.goBack()}
    />
  );
}

const styles = StyleSheet.create({
  missing: { flex: 1, alignItems: "center", justifyContent: "center", gap: ms(12), backgroundColor: colors.bg },
  missingText: { color: colors.text, fontFamily: font.body, fontSize: ms(15) },
  back: { color: colors.honey, fontFamily: font.headlineSemi, fontSize: ms(15) },
});
