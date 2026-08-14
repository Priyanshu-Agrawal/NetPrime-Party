/**
 * My List — the titles the user saved from Details (bookmark / + My List).
 * A responsive poster grid backed by utils/watchlist (MMKV). Long-press a poster
 * to remove it; tap to open its details.
 */
import GlassIconButton from "@/components/ui/GlassIconButton";
import PosterCard from "@/components/ui/PosterCard";
import { colors, font, ms } from "@/theme/bearoom";
import { img } from "@/utils/tmdbDetails";
import { getWatchlist, removeFromWatchlist, type WatchlistItem } from "@/utils/watchlist";
import { bearAlert } from "@/components/ui/BearAlert";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Dimensions, FlatList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");
const COLS = 3;
const GAP = ms(12);
const PAD = ms(16);
const CARD_W = Math.floor((width - PAD * 2 - GAP * (COLS - 1)) / COLS);

export default function MyList() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<WatchlistItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      setItems(getWatchlist());
    }, []),
  );

  const open = (item: WatchlistItem) =>
    router.push({
      pathname: item.type === "tv" ? "/(player)/tvDetails" : "/(player)/details",
      params: { id: item.id },
    });

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
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + ms(6) }]}>
        <GlassIconButton onPress={() => router.back()} size={38}>
          <Ionicons name="chevron-back" size={ms(21)} color={colors.text} />
        </GlassIconButton>
        <Text style={styles.title}>My List</Text>
        <View style={{ width: ms(38) }} />
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="bookmark-outline" size={ms(40)} color={colors.textFaint} />
          <Text style={styles.emptyTitle}>Your list is empty</Text>
          <Text style={styles.emptySub}>Save movies & shows from their details page to find them here.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => `${i.type}:${i.id}`}
          numColumns={COLS}
          showsVerticalScrollIndicator={false}
          columnWrapperStyle={{ gap: GAP }}
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: ms(12),
    paddingBottom: ms(10),
  },
  title: { color: colors.text, fontFamily: font.headline, fontSize: ms(20) },
  grid: { paddingHorizontal: PAD, paddingTop: ms(6), paddingBottom: ms(40), gap: GAP },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: ms(40), gap: ms(10) },
  emptyTitle: { color: colors.text, fontFamily: font.headlineSemi, fontSize: ms(17), marginTop: ms(4) },
  emptySub: { color: colors.textDim, fontFamily: font.body, fontSize: ms(13), textAlign: "center", lineHeight: ms(19) },
});
