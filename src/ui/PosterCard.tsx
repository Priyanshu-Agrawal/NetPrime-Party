import { Image } from "expo-image";
import React from "react";
import { StyleSheet, View } from "react-native";
import { colors, layoutTokens, ms, radius, spacing } from "@/theme/bearoom";
import { GlassChip } from "./GlassChip";
import { RatingBadge } from "./RatingBadge";
import { Text } from "./Text";
import { BouncyPressable } from "./BouncyPressable";

interface Props {
  poster?: string;
  title?: string;
  rating?: number;
  kind?: "movie" | "tv";
  progress?: number;
  width?: number;
  onPress?: () => void;
  onLongPress?: () => void;
  imageTransition?: number;
}

export const PosterCard = React.memo(function PosterCard({
  poster,
  title,
  rating,
  kind,
  progress,
  width = ms(116),
  onPress,
  onLongPress,
  imageTransition = 300,
}: Props) {
  const height = width * layoutTokens.posterAspect;

  return (
    <BouncyPressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[{ width }]}
    >
      <View style={[styles.card, { width, height }]}>
        {poster ? (
          <Image
            source={poster}
            placeholder={{ blurhash: "L15#|n_3~pD%4nIW%M?c?HIW%MRj" }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            recyclingKey={poster}
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.placeholder]} />
        )}
        {rating != null ? <RatingBadge rating={rating} /> : null}
        {kind === "tv" ? (
          <View style={styles.tag}>
            <GlassChip label="TV" size="sm" blur={false} />
          </View>
        ) : null}
        {progress != null ? (
          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, { width: `${Math.max(3, Math.round(progress * 100))}%` }]}
            />
          </View>
        ) : null}
      </View>
      {title ? (
        <Text variant="caption" numberOfLines={1} style={styles.title}>
          {title}
        </Text>
      ) : null}
    </BouncyPressable>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.bgElevated,
  },
  placeholder: { backgroundColor: colors.surfaceStrong },
  tag: {
    position: "absolute",
    top: ms(6),
    right: ms(6),
  },
  progressTrack: {
    position: "absolute",
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    height: ms(3),
    borderRadius: radius.pill,
    backgroundColor: colors.scrim,
    overflow: "hidden",
  },
  progressFill: {
    height: ms(3),
    borderRadius: radius.pill,
    backgroundColor: colors.honey,
  },
  title: { marginTop: spacing.sm - 2, color: colors.text, fontSize: ms(12) },
});

export default PosterCard;
