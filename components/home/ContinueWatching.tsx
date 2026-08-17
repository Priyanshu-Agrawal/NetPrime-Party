/**
 * "Continue Watching" home rail — reads local watch history with resume progress.
 */
import { getWatchHistory, type HistoryItem } from "@/utils/history";
import { colors, ms, radius, spacing } from "@/theme/bearoom";
import { gradients } from "@/theme/styles/gradients";
import { layout } from "@/theme/styles/layout";
import { pressedStyle } from "@/theme/styles/interaction";
import { SectionHeader, Text } from "@/src/ui";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { openPlayer } from "@/src/navigation/actions";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";

const CARD_W = ms(210);
const CARD_H = ms(118);

export function ContinueWatching() {
  const [items, setItems] = useState<HistoryItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getWatchHistory()
        .then((list: HistoryItem[]) => {
          if (!active) return;
          const sorted = [...list]
            .filter((i) => i.id)
            .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
            .slice(0, 15);
          setItems(sorted);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, []),
  );

  if (items.length === 0) return null;

  const resume = (item: HistoryItem) => {
    openPlayer({
      id: item.id,
      type: item.type === "tv" ? "tv" : "movie",
      ...(item.season ? { season: item.season } : {}),
      ...(item.episode ? { ep: item.episode } : {}),
      title: item.title,
      poster_path: item.poster_path || "",
    });
  };

  return (
    <View style={styles.rail}>
      <SectionHeader title="Continue watching" />
      <FlatList
        data={items}
        horizontal
        keyExtractor={(i, idx) => `${i.id}-${i.season ?? ""}-${i.episode ?? ""}-${idx}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const progress =
            item.durationSec && item.positionSec
              ? Math.min(1, item.positionSec / item.durationSec)
              : 0;
          const uri = item.poster_path
            ? `https://image.tmdb.org/t/p/w342${item.poster_path}`
            : undefined;
          return (
            <Pressable
              style={({ pressed }) => [styles.card, pressed && pressedStyle]}
              onPress={() => resume(item)}
            >
              {uri ? (
                <Image
                  source={{ uri }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={300}
                />
              ) : (
                <View style={[StyleSheet.absoluteFill, styles.noPoster]}>
                  <Ionicons name="film-outline" size={ms(24)} color={colors.textFaint} />
                </View>
              )}
              <LinearGradient colors={[...gradients.continueWatching]} style={StyleSheet.absoluteFill} />
              <View style={styles.playBadge}>
                <Ionicons name="play" size={ms(18)} color={colors.text} />
              </View>
              <View style={styles.meta}>
                {item.type === "tv" && item.season ? (
                  <Text variant="caption" honey style={styles.sub}>
                    S{item.season}
                    {item.episode ? ` · E${item.episode}` : ""}
                  </Text>
                ) : null}
                <Text variant="label" numberOfLines={1}>
                  {item.title}
                </Text>
              </View>
              {progress > 0 ? (
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                </View>
              ) : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { marginTop: spacing.xl },
  list: { paddingHorizontal: spacing.lg, gap: layout.railGap },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    justifyContent: "flex-end",
  },
  noPoster: { alignItems: "center", justifyContent: "center" },
  playBadge: {
    position: "absolute",
    top: layout.railGap,
    right: layout.railGap,
    width: ms(32),
    height: ms(32),
    borderRadius: radius.pill,
    backgroundColor: colors.scrim,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  meta: { paddingHorizontal: layout.railGap, paddingBottom: layout.railGap },
  sub: { fontSize: ms(10), letterSpacing: 0.3, marginBottom: ms(2) },
  progressTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: ms(3),
    backgroundColor: colors.progressTrack,
  },
  progressFill: {
    height: ms(3),
    backgroundColor: colors.honey,
    shadowColor: colors.honey,
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
});

export default ContinueWatching;
