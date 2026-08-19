/**
 * A titled horizontal rail of poster cards for the home screen. Self-fetching:
 * each rail loads its own TMDB list endpoint so rows appear progressively.
 */
import { itemTitle } from "@/utils/tmdbLists";
import { colors, ms, radius, spacing } from "@/theme/bearoom";
import { layout } from "@/theme/styles/layout";
import { useListQuery } from "@/src/store/services/tmdbApi";
import { openDetails as openDetailsAction } from "@/src/navigation/actions";
import { PosterCard, PosterSkeleton, SectionHeader } from "@/src/ui";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { FlatList, StyleSheet, View } from "react-native";

const POSTER_W = ms(112);

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
  // RTK Query caches per-path and keeps it warm (keepUnusedDataFor), so
  // returning to Home never flashes skeleton→content. `data` is undefined
  // while first loading, [] when the endpoint has nothing.
  const { data: items } = useListQuery(path);

  if (items && items.length === 0) return null;

  return (
    <View style={styles.rail}>
      <SectionHeader title={title} icon={icon} onSeeAll={onSeeAll} />
      {items === undefined ? (
        <View style={styles.skeletonRow}>
          {[0, 1, 2, 3].map((i) => (
            <PosterSkeleton key={i} width={POSTER_W} />
          ))}
        </View>
      ) : (
        <FlatList
          data={items}
          horizontal
          keyExtractor={(m) => String(m.id)}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <PosterCard
              width={POSTER_W}
              poster={item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : undefined}
              title={itemTitle(item)}
              rating={item.vote_average ?? undefined}
              kind={kind}
              onPress={() => openDetailsAction(item, kind)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { marginTop: spacing.xl },
  list: { paddingHorizontal: spacing.lg, gap: layout.railGap },
  skeletonRow: { flexDirection: "row", gap: layout.railGap, paddingHorizontal: spacing.lg },
  skeleton: { borderRadius: radius.lg, backgroundColor: colors.bgElevated },
});

export default MediaRail;
