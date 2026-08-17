import { useMovieContext } from "@/contexts/movieContext";
import type { Series } from "@/contexts/movieContext/types";
import { goBack, openDetails } from "@/src/navigation/actions";
import { Button, IconButton, PosterCard, Screen, Text } from "@/src/ui";
import { colors, glow, ms, radius, spacing } from "@/theme/bearoom";
import { gradients } from "@/theme/styles/gradients";
import { gridColumnWidth, layout } from "@/theme/styles/layout";
import { pressedStyle } from "@/theme/styles/interaction";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { createShimmerPlaceholder } from "react-native-shimmer-placeholder";

const CARD_W = gridColumnWidth(2, layout.screenPadding + spacing.sm, spacing.lg);
const ShimmerPlaceholder = createShimmerPlaceholder(LinearGradient);

export default function TrendingShowsScreen() {
  const {
    series,
    loadingSeries,
    error,
    seriesCurrentPage,
    seriesTotalPages,
    fetchPopularSeries,
    seriesHasMore,
  } = useMovieContext();

  const flatListRef = useRef<FlatList>(null);
  const [showGoToTop, setShowGoToTop] = useState(false);

  if (error && series.length === 0) {
    return (
      <Screen edges={["top"]}>
        <View style={styles.header}>
          <IconButton onPress={goBack} size={38}>
            <Ionicons name="chevron-back" size={ms(21)} color={colors.text} />
          </IconButton>
          <Text variant="h2">Trending Shows</Text>
          <View style={{ width: ms(38) }} />
        </View>
        <View style={styles.centered}>
          <Text variant="body" danger>
            {error}
          </Text>
          <Button label="Retry" onPress={() => fetchPopularSeries(1)} style={{ marginTop: spacing.lg }} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={["top"]}>
      <View style={styles.header}>
        <IconButton onPress={goBack} size={38}>
          <Ionicons name="chevron-back" size={ms(21)} color={colors.text} />
        </IconButton>
        <Text variant="h2">Trending Shows</Text>
        <View style={{ width: ms(38) }} />
      </View>

      <FlatList
        ref={flatListRef}
        onScroll={(e) => setShowGoToTop(e.nativeEvent.contentOffset.y > 400)}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        data={series}
        keyExtractor={(item) => item.id.toString()}
        numColumns={2}
        contentContainerStyle={styles.container}
        columnWrapperStyle={styles.columnWrapper}
        onEndReached={() => {
          if (!loadingSeries && seriesHasMore && seriesCurrentPage < seriesTotalPages) {
            fetchPopularSeries(seriesCurrentPage + 1);
          }
        }}
        onEndReachedThreshold={0.5}
        renderItem={({ item }: { item: Series }) => (
          <PosterCard
            width={CARD_W}
            poster={item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : undefined}
            title={item.name || (item as any).title}
            rating={item.vote_average ?? undefined}
            kind="tv"
            onPress={() => openDetails({ id: item.id, media_type: "tv" }, "tv")}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.lg }} />}
        ListFooterComponent={
          loadingSeries ? (
            <View style={styles.shimmerRow}>
              <ShimmerPlaceholder shimmerColors={[...gradients.shimmerDark]} style={styles.shimmer} />
              <ShimmerPlaceholder shimmerColors={[...gradients.shimmerDark]} style={styles.shimmer} />
            </View>
          ) : null
        }
      />

      {showGoToTop ? (
        <Pressable
          style={({ pressed }) => [styles.fab, pressed && pressedStyle]}
          onPress={() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true })}
        >
          <Ionicons name="arrow-up" size={ms(18)} color={colors.onHoney} />
          <Text variant="label" style={{ color: colors.onHoney }}>
            Top
          </Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm + 2,
  },
  container: { paddingHorizontal: spacing.sm + 2, paddingBottom: spacing.xl },
  columnWrapper: { justifyContent: "space-between", gap: spacing.lg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: layout.screenPadding },
  shimmerRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.lg, gap: spacing.lg },
  shimmer: { height: ms(250), width: CARD_W, borderRadius: radius.lg },
  fab: {
    position: "absolute",
    bottom: spacing.xl + 5,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm - 2,
    backgroundColor: colors.honey,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    ...glow.honey,
  },
});
