/**
 * A titled horizontal rail of poster cards for the home screen. Self-fetching:
 * each rail loads its own TMDB list endpoint so rows appear progressively.
 * Bearoom compact skin: dense 2:3 posters, honey rating badge, optional honey
 * section icon (fire / heart / etc).
 */
import {
  fetchList,
  itemTitle,
  type MediaItem,
} from "@/utils/tmdbLists";
import { colors, ms, font, radius } from "@/theme/bearoom";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { navigateDetails } from "@/src/navigation/navigationRef";
import React, { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

const POSTER_W = ms(112);
const POSTER_H = POSTER_W * 1.5;

function PosterCard({
  item,
  fallbackType,
}: {
  item: MediaItem;
  fallbackType: "movie" | "tv";
}) {
  const uri = item.poster_path
    ? `https://image.tmdb.org/t/p/w342${item.poster_path}`
    : undefined;
  const openDetails = () => navigateDetails(item, fallbackType);
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
      onPress={openDetails}
    >
      <View style={styles.posterWrap}>
        {uri ? (
          <Image
            source={{ uri }}
            style={styles.poster}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={300}
          />
        ) : (
          <View style={[styles.poster, styles.noPoster]}>
            <Ionicons name="film-outline" size={26} color={colors.textFaint} />
          </View>
        )}
        {item.vote_average ? (
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={9} color={colors.honey} />
            <Text style={styles.ratingText}>{item.vote_average.toFixed(1)}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {itemTitle(item)}
      </Text>
    </Pressable>
  );
}

export function MediaRail({
  title,
  path,
  kind,
  icon,
  onSeeAll,
}: {
  title: string;
  path: string;
  kind: "movie" | "tv";
  icon?: keyof typeof Ionicons.glyphMap;
  onSeeAll?: () => void;
}) {
  const [items, setItems] = useState<MediaItem[] | null>(null);

  useEffect(() => {
    let aborted = false;
    fetchList(path)
      .then((r) => !aborted && setItems(r))
      .catch(() => !aborted && setItems([]));
    return () => {
      aborted = true;
    };
  }, [path]);

  if (items && items.length === 0) return null;

  return (
    <View style={styles.rail}>
      <View style={styles.head}>
        <View style={styles.headLeft}>
          {icon ? <Ionicons name={icon} size={16} color={colors.honey} /> : null}
          <Text style={styles.railTitle}>{title}</Text>
        </View>
        {onSeeAll ? (
          <Pressable onPress={onSeeAll} style={styles.seeAll} hitSlop={8}>
            <Text style={styles.seeAllText}>See all</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.textDim} />
          </Pressable>
        ) : null}
      </View>
      {items === null ? (
        <View style={styles.skeletonRow}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.poster, styles.skeleton]} />
          ))}
        </View>
      ) : (
        <FlatList
          data={items}
          horizontal
          keyExtractor={(m) => String(m.id)}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <PosterCard item={item} fallbackType={kind} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { marginTop: 20 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  headLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  railTitle: {
    color: colors.text,
    fontFamily: font.headlineSemi,
    fontSize: ms(18),
    letterSpacing: -0.2,
  },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 2 },
  seeAllText: { color: colors.textDim, fontFamily: font.bodySemi, fontSize: ms(12) },
  list: { paddingHorizontal: 16, gap: 10 },
  skeletonRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16 },
  skeleton: { backgroundColor: colors.bgElevated },
  card: { width: POSTER_W },
  posterWrap: { borderRadius: radius.lg, overflow: "hidden" },
  poster: {
    width: POSTER_W,
    height: POSTER_H,
    borderRadius: radius.lg,
    backgroundColor: colors.bgElevated,
  },
  noPoster: { alignItems: "center", justifyContent: "center" },
  ratingBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: colors.scrim,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  ratingText: { color: colors.text, fontFamily: font.bodySemi, fontSize: ms(9) },
  title: {
    color: colors.text,
    fontFamily: font.bodyMed,
    fontSize: ms(12),
    marginTop: 6,
  },
});

export default MediaRail;
