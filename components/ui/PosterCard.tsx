/**
 * PosterCard — a rounded poster for rails and grids, with an optional honey
 * rating badge, a "TV" tag, and a continue-watching progress bar.
 */
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, font, radius } from "@/theme/bearoom";

interface Props {
  poster?: string;
  title?: string;
  rating?: number;
  kind?: "movie" | "tv";
  /** 0..1 continue-watching progress. */
  progress?: number;
  width?: number;
  onPress?: () => void;
  onLongPress?: () => void;
}

export function PosterCard({
  poster,
  title,
  rating,
  kind,
  progress,
  width = 116,
  onPress,
  onLongPress,
}: Props) {
  const height = width * 1.5;
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={{ width }}>
      <View style={[styles.card, { width, height }]}>
        {poster ? (
          <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceStrong }]} />
        )}
        {rating != null ? (
          <View style={styles.rating}>
            <Ionicons name="star" size={10} color={colors.honey} />
            <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
          </View>
        ) : null}
        {kind === "tv" ? (
          <View style={styles.tag}>
            <Text style={styles.tagText}>TV</Text>
          </View>
        ) : null}
        {progress != null ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(3, Math.round(progress * 100))}%` }]} />
          </View>
        ) : null}
      </View>
      {title ? (
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.bgElevated,
  },
  rating: {
    position: "absolute",
    top: 6,
    right: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.scrim,
  },
  ratingText: { fontFamily: font.bodySemi, fontSize: 10, color: colors.text },
  tag: {
    position: "absolute",
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.scrim,
  },
  tagText: { fontFamily: font.label, fontSize: 9, color: colors.text, letterSpacing: 0.5 },
  progressTrack: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: "rgba(0,0,0,0.5)",
    overflow: "hidden",
  },
  progressFill: { height: 3, borderRadius: radius.pill, backgroundColor: colors.honey },
  title: {
    marginTop: 6,
    fontFamily: font.bodyMed,
    fontSize: 12,
    color: colors.text,
  },
});

export default PosterCard;
