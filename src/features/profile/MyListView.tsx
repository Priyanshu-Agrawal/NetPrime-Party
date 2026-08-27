/**
 * My List — saved titles from Details (bookmark / + My List).
 */
import { bearAlert } from "@/components/ui/BearAlert";
import { Appear, LibraryScreenHeader, PosterCard, Screen, Text } from "@/src/ui";
import { colors, glow, ms, radius, spacing } from "@/theme/bearoom";
import { gridColumnWidth, layout } from "@/theme/styles/layout";
import { img } from "@/utils/tmdbDetails";
import { getWatchlist, removeFromWatchlist, type WatchlistItem } from "@/utils/watchlist";
import { Ionicons } from "@expo/vector-icons";
import { openDetails } from "@/src/navigation/actions";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";

const COLS = 3;
const CARD_W = gridColumnWidth(COLS);

export default function MyListScreen() {
  const [items, setItems] = useState<WatchlistItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      setItems(getWatchlist());
    }, []),
  );

  const open = (item: WatchlistItem) => {
    openDetails(
      { id: Number(item.id), media_type: item.type, title: item.title, name: item.title, poster_path: item.poster_path },
      item.type,
    );
  };

  const remove = (item: WatchlistItem) =>
    bearAlert(item.title, "Remove from My List?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          removeFromWatchlist(item.id, item.type);
          setItems(getWatchlist());
        },
      },
    ]);

  return (
    <Screen edges={["top"]}>
      <Appear index={0} variant="drop">
        <LibraryScreenHeader title="My List" />
      </Appear>

      {items.length === 0 ? (
        <Appear index={1} style={styles.empty}>
          <View style={styles.heroWrap}>
            <View style={styles.heroGlow} />
            <View style={styles.heroRing}>
              <Ionicons name="paw" size={ms(32)} color={colors.honey} />
            </View>
          </View>
          <Text variant="h2" style={styles.emptyTitle}>Your list is empty</Text>
          <Text variant="bodyDim" style={styles.emptySub}>
            Save movies & shows from their details page to find them here.
          </Text>
        </Appear>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => `${i.type}:${i.id}`}
          numColumns={COLS}
          showsVerticalScrollIndicator={false}
          columnWrapperStyle={{ gap: layout.gridGap }}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <PosterCard
              width={CARD_W}
              poster={img(item.poster_path, "w342") ?? undefined}
              title={item.title}
              kind={item.type}
              onPress={() => open(item)}
              onLongPress={() => remove(item)}
            />
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm - 2,
    paddingBottom: spacing.xxxl + 12,
    gap: layout.gridGap,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xxxl,
    gap: spacing.xs,
    paddingBottom: ms(60),
  },
  heroWrap: { alignItems: "center", justifyContent: "center", marginBottom: ms(16) },
  heroGlow: {
    position: "absolute",
    width: ms(120),
    height: ms(120),
    borderRadius: radius.pill,
    backgroundColor: colors.honeyGlow,
    opacity: 0.15,
  },
  heroRing: {
    width: ms(76),
    height: ms(76),
    borderRadius: radius.pill,
    backgroundColor: colors.honeySoft,
    borderWidth: 1,
    borderColor: colors.honey,
    alignItems: "center",
    justifyContent: "center",
    ...glow.honey,
  },
  emptyTitle: { textAlign: "center", marginBottom: spacing.xs },
  emptySub: { textAlign: "center", lineHeight: ms(19) },
});
