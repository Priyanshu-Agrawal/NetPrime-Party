/**
 * CollectionScreen (D2) — a TMDB collection / franchise: backdrop + overview,
 * then its parts as a poster grid sorted by release date. Reached from the
 * "Part of X" chip on a movie, the Home Franchises rail, or search.
 *
 * Reuses the shared grid pattern (Screen + LibraryScreenHeader + 3-col FlatList
 * of PosterCards), like TrendingShowsView. "Add all to queue" is intentionally
 * omitted until the watch-party queue (P1) ships.
 */
import { openDetails } from "@/src/navigation/actions";
import { useCollectionQuery } from "@/src/store/services/tmdbApi";
import { Button, LibraryScreenHeader, PosterCard, PosterSkeleton, Screen, Text } from "@/src/ui";
import { colors, ms, radius, spacing } from "@/theme/bearoom";
import { absoluteFill, gridColumnWidth, layout } from "@/theme/styles/layout";
import { itemTitle, type MediaItem } from "@/utils/tmdbLists";
import { useRoute, type RouteProp } from "@react-navigation/native";
import type { PlayerStackParamList } from "@/src/navigation/types";
import { Image } from "expo-image";
import React, { useMemo } from "react";
import { FlatList, StyleSheet, View } from "react-native";

const COLS = 3;
const CARD_W = gridColumnWidth(COLS);
const SKELETON = Array.from({ length: 9 }, (_, i) => ({ __skeleton: true as const, id: `sk-${i}` }));

export default function CollectionScreen() {
  const route = useRoute<RouteProp<PlayerStackParamList, "Collection">>();
  const { id } = route.params;
  const { data, isLoading, isError, refetch } = useCollectionQuery(id);

  // Parts, poster-only, oldest → newest (chronological franchise order).
  const parts = useMemo<MediaItem[]>(() => {
    const p = (data?.parts ?? []) as MediaItem[];
    return p
      .filter((x) => x.poster_path)
      .slice()
      .sort((a, b) => (a.release_date ?? "").localeCompare(b.release_date ?? ""));
  }, [data]);

  if (isError && !data) {
    return (
      <Screen edges={["top"]}>
        <LibraryScreenHeader title="Collection" />
        <View style={styles.centered}>
          <Text variant="body" danger>Couldn&apos;t load this collection.</Text>
          <Button label="Retry" onPress={() => refetch()} style={{ marginTop: spacing.lg }} />
        </View>
      </Screen>
    );
  }

  const backdrop = data?.backdrop_path ? `https://image.tmdb.org/t/p/w780${data.backdrop_path}` : null;
  const Header = (
    <View>
      {backdrop ? (
        <View style={styles.backdropWrap}>
          <Image source={backdrop} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
          <View style={styles.backdropScrim} />
        </View>
      ) : null}
      {data?.overview ? (
        <Text variant="bodyDim" style={styles.overview} numberOfLines={5}>
          {data.overview}
        </Text>
      ) : null}
    </View>
  );

  const listData = isLoading ? SKELETON : parts;

  return (
    <Screen edges={["top"]}>
      <LibraryScreenHeader title={data?.name ?? "Collection"} />
      <FlatList
        data={listData as any[]}
        keyExtractor={(item: any, i) => (item.__skeleton ? item.id : `${item.id}-${i}`)}
        numColumns={COLS}
        columnWrapperStyle={{ gap: layout.gridGap }}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={Header}
        renderItem={({ item }: { item: any }) =>
          item.__skeleton ? (
            <View style={styles.gridItem}>
              <PosterSkeleton />
            </View>
          ) : (
            <View style={styles.gridItem}>
              <PosterCard
                width={CARD_W}
                poster={item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : undefined}
                title={itemTitle(item)}
                rating={item.vote_average ?? undefined}
                kind="movie"
                onPress={() => openDetails(item, "movie")}
                imageTransition={250}
              />
            </View>
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: ms(120) },
  gridItem: { width: CARD_W, marginBottom: spacing.lg },
  backdropWrap: {
    height: ms(170),
    borderRadius: radius.lg,
    overflow: "hidden",
    marginBottom: spacing.md,
    backgroundColor: colors.bgElevated,
  },
  backdropScrim: { ...absoluteFill, backgroundColor: colors.scrim },
  overview: { marginBottom: spacing.md, lineHeight: ms(20) },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: layout.screenPadding },
});
