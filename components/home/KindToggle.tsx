/**
 * KindToggle — an animated Movie/TV segmented control (a honey thumb that slides
 * under the labels, Reanimated `withTiming` + a selection haptic). Shared by the
 * Home feed's "Browse by Genre" (Movies/TV) and "Popular in {region}" (Movies/
 * Series) rows. Labels are overridable; the two segments stay equal-width via
 * `minWidth`, so the 50%-wide thumb lands cleanly on either side.
 */
import * as Haptics from "expo-haptics";
import { Text } from "@/src/ui";
import { colors, font, ms, radius } from "@/theme/bearoom";
import React, { useState } from "react";
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

export type MediaKind = "movie" | "tv";

export function KindToggle({
  value,
  onChange,
  movieLabel = "Movies",
  tvLabel = "TV",
}: {
  value: MediaKind;
  onChange: (k: MediaKind) => void;
  movieLabel?: string;
  tvLabel?: string;
}) {
  const kinds: { key: MediaKind; label: string }[] = [
    { key: "movie", label: movieLabel },
    { key: "tv", label: tvLabel },
  ];
  const [trackW, setTrackW] = useState(0);
  const pos = useSharedValue(value === "tv" ? 1 : 0); // 0 = movie, 1 = tv

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pos.value * (trackW / 2) }],
  }));

  const onTrackLayout = (e: LayoutChangeEvent) => setTrackW(e.nativeEvent.layout.width);

  const select = (i: number, k: MediaKind) => {
    if (k === value) return;
    pos.value = withTiming(i, { duration: 200 });
    Haptics.selectionAsync().catch(() => {});
    onChange(k);
  };

  return (
    <View style={styles.track} onLayout={onTrackLayout}>
      {trackW > 0 ? <Animated.View style={[styles.thumb, thumbStyle]} /> : null}
      {kinds.map((k, i) => {
        const active = value === k.key;
        return (
          <Pressable
            key={k.key}
            onPress={() => select(i, k.key)}
            style={styles.segment}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{k.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    backgroundColor: colors.surfaceStrong,
    borderRadius: radius.pill,
    position: "relative",
    overflow: "hidden",
  },
  thumb: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: "50%",
    borderRadius: radius.pill,
    backgroundColor: colors.honey,
  },
  segment: {
    minWidth: ms(58),
    paddingHorizontal: ms(14),
    paddingVertical: ms(6),
    alignItems: "center",
    justifyContent: "center",
  },
  segmentText: { fontFamily: font.label, fontSize: ms(12), color: colors.textDim },
  segmentTextActive: { color: colors.onHoney },
});

export default KindToggle;
