/**
 * "Continue Watching" home rail — reads local watch history, shows in-progress
 * titles with a honey resume progress bar, and jumps straight back into the
 * player. Refreshes every time the home screen regains focus. Bearoom compact
 * skin: wide 2:1 glass thumbnails with a glowing honey progress bar.
 */
import { getWatchHistory, type HistoryItem } from "@/utils/history";
import { colors, ms, font, radius } from "@/theme/bearoom";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

const CARD_W = ms(210);
const CARD_H = ms(118);

export function ContinueWatching() {
  const router = useRouter();
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
    router.push({
      pathname: "/(player)/player",
      params: {
        id: item.id,
        type: item.type,
        ...(item.season ? { season: item.season } : {}),
        ...(item.episode ? { ep: item.episode } : {}),
        title: item.title,
        poster_path: item.poster_path || "",
      },
    });
  };

  return (
    <View style={styles.rail}>
      <View style={styles.head}>
        <Text style={styles.title}>Continue watching</Text>
        <Ionicons name="chevron-forward" size={15} color={colors.textDim} />
      </View>
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
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
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
                  <Ionicons name="film-outline" size={24} color={colors.textFaint} />
                </View>
              )}
              <LinearGradient
                colors={["transparent", "rgba(16,13,10,0.35)", "rgba(16,13,10,0.92)"]}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.playBadge}>
                <Ionicons name="play" size={18} color={colors.text} />
              </View>
              <View style={styles.meta}>
                {item.type === "tv" && item.season ? (
                  <Text style={styles.sub}>
                    S{item.season}
                    {item.episode ? ` · E${item.episode}` : ""}
                  </Text>
                ) : null}
                <Text style={styles.cardTitle} numberOfLines={1}>
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
  rail: { marginTop: 20 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  title: {
    color: colors.text,
    fontFamily: font.headlineSemi,
    fontSize: ms(18),
    letterSpacing: -0.2,
  },
  list: { paddingHorizontal: 16, gap: 10 },
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
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.scrim,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  meta: { paddingHorizontal: 10, paddingBottom: 10 },
  cardTitle: { color: colors.text, fontFamily: font.bodySemi, fontSize: ms(13) },
  sub: { color: colors.honey, fontFamily: font.bodySemi, fontSize: ms(10), letterSpacing: 0.3, marginBottom: 2 },
  progressTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: "rgba(246,239,227,0.2)",
  },
  progressFill: {
    height: 3,
    backgroundColor: colors.honey,
    shadowColor: colors.honey,
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
});

export default ContinueWatching;
