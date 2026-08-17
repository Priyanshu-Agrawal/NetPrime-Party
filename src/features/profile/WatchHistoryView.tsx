import { openPlayer } from "@/src/navigation/actions";
import type { PlayerStackParamList } from "@/src/navigation/types";
import { Badge, Screen, Text } from "@/src/ui";
import { colors, ms, radius, spacing } from "@/theme/bearoom";
import { layout } from "@/theme/styles/layout";
import { pressedStyle } from "@/theme/styles/interaction";
import { getWatchHistory } from "@/utils/history";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";

export default function WatchHistory() {
  const [items, setItems] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setItems(await getWatchHistory());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function openItem(item: any) {
    const type = item.type === "tv" ? "tv" : "movie";
    const params: PlayerStackParamList["Player"] = {
      id: String(item.id ?? ""),
      type,
      title: item.title || item.name || "",
      poster_path: item.poster_path || "",
    };
    if (type === "tv") {
      if (item.season != null) params.season = String(item.season);
      if (item.episode != null) params.ep = String(item.episode);
    }
    openPlayer(params);
  }

  return (
    <Screen edges={["top"]} style={styles.screen}>
      <View style={styles.headerWrap}>
        <Text variant="overline" honey>
          Library
        </Text>
        <Text variant="h1">Watch History</Text>
        <Text variant="bodyDim" style={styles.subtitle}>
          Your recently watched movies and shows will appear here.
        </Text>
      </View>

      <FlatList
        data={items}
        contentContainerStyle={items.length === 0 ? styles.emptyContainer : styles.listContent}
        keyExtractor={(item, idx) => (item.id ? String(item.id) : String(idx))}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load()} tintColor={colors.honey} />
        }
        renderItem={({ item }) => {
          const label =
            item.type === "tv"
              ? `Season ${item.season ?? "-"} • Episode ${item.episode ?? "-"}`
              : "Movie";
          return (
            <Pressable
              style={({ pressed }) => [styles.card, pressed && pressedStyle]}
              onPress={() => openItem(item)}
            >
              <View style={styles.posterWrap}>
                {item.poster_path ? (
                  <Image
                    source={{ uri: `https://image.tmdb.org/t/p/w185${item.poster_path}` }}
                    style={styles.poster}
                    contentFit="cover"
                    transition={0}
                  />
                ) : (
                  <View style={[styles.poster, styles.posterFallback]}>
                    <Ionicons name="film-outline" size={ms(26)} color={colors.textFaint} />
                  </View>
                )}
              </View>
              <View style={styles.cardBody}>
                <Text variant="h3" numberOfLines={2}>
                  {item.title || item.name || "Untitled"}
                </Text>
                <Text variant="caption" style={styles.cardMeta}>
                  {label}
                </Text>
                <View style={styles.badgeRow}>
                  <Badge label={item.type === "tv" ? "Series" : "Film"} tone="muted" />
                  <Badge label="Resume" tone="accent" icon="play" />
                </View>
              </View>
              <Ionicons name="chevron-forward" size={ms(22)} color={colors.textDim} />
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="time-outline" size={ms(30)} color={colors.textFaint} />
            </View>
            <Text variant="h2">No watch history yet</Text>
            <Text variant="bodyDim" style={styles.emptyText}>
              Your recently watched movies and shows will appear here.
            </Text>
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.lg },
  headerWrap: { paddingHorizontal: layout.screenPadding, paddingBottom: spacing.md + 2 },
  subtitle: { marginTop: spacing.sm },
  listContent: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  emptyContainer: { flexGrow: 1, paddingHorizontal: layout.screenPadding, paddingBottom: spacing.xxl },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.xl + 2,
    padding: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.surface,
  },
  posterWrap: {
    width: ms(56),
    height: ms(84),
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surfaceStrong,
  },
  poster: { width: "100%", height: "100%" },
  posterFallback: { alignItems: "center", justifyContent: "center" },
  cardBody: { flex: 1, minHeight: ms(84), justifyContent: "center", gap: spacing.xs + 1 },
  cardMeta: { marginBottom: spacing.sm - 2 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing.xxxl + 20 },
  emptyIcon: {
    width: ms(76),
    height: ms(76),
    borderRadius: radius.xl,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
    backgroundColor: colors.surfaceStrong,
  },
  emptyText: { textAlign: "center", maxWidth: ms(280), marginTop: spacing.sm },
});
