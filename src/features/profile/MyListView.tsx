/**
 * My List — saved titles from Details (bookmark / + My List).
 */
import { bearAlert } from "@/components/ui/BearAlert";
import { IconButton, PosterCard, Screen, Text } from "@/src/ui";
import { colors, ms, spacing } from "@/theme/bearoom";
import { gridColumnWidth, layout } from "@/theme/styles/layout";
import { img } from "@/utils/tmdbDetails";
import { getWatchlist, removeFromWatchlist, type WatchlistItem } from "@/utils/watchlist";
import { Ionicons } from "@expo/vector-icons";
import { goBack, openDetails } from "@/src/navigation/actions";
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
      <View style={styles.header}>
        <IconButton onPress={goBack} size={ms(38)}>
          <Ionicons name="chevron-back" size={ms(21)} color={colors.text} />
        </IconButton>
        <Text variant="h2">My List</Text>
        <View style={{ width: ms(38) }} />
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="bookmark-outline" size={ms(40)} color={colors.textFaint} />
          <Text variant="h3">Your list is empty</Text>
          <Text variant="bodyDim" style={styles.emptySub}>
            Save movies & shows from their details page to find them here.
          </Text>
        </View>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingBottom: layout.railGap,
  },
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
    gap: layout.railGap,
  },
  emptySub: { textAlign: "center", lineHeight: ms(19) },
});
