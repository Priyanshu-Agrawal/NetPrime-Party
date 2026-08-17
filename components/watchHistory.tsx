import { getWatchHistory } from "@/utils/history";
import { MaterialIcons } from "@expo/vector-icons";
import { openPlayer } from "@/src/navigation/actions";
import type { PlayerStackParamList } from "@/src/navigation/types";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeColor } from "@/contexts/colorContext/useThemeColor";
import { useColorScheme } from "@/contexts/colorContext/useColorScheme";

export default function WatchHistory() {
  const [items, setItems] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const isDark = (useColorScheme() ?? 'light') === 'dark';
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const tintColor = useThemeColor({}, 'tint');

  const overlayColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  const overlayColorStrong = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const borderColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const textMuted = isDark ? 'rgba(255,255,255,0.62)' : 'rgba(0,0,0,0.62)';
  const iconColor = isDark ? '#E6E1D6' : '#687076';

  const load = useCallback(async () => {
    const list = await getWatchHistory();
    setItems(list);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  const emptyMessage = useMemo(() => {
    return "Your recently watched movies and shows will appear here.";
  }, []);

  function openItem(item: any) {
    const type = item.type === "tv" ? "tv" : "movie";
    const params: PlayerStackParamList["Player"] = {
      id: String(item.id ?? ""),
      type,
      title: item.title || item.name || "",
      poster_path: item.poster_path || "",
    };

    if (type === "tv") {
      if (item.season !== undefined && item.season !== null) {
        params.season = String(item.season);
      }
      if (item.episode !== undefined && item.episode !== null) {
        params.ep = String(item.episode);
      }
    }

    openPlayer(params);
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor }]}>
      <View style={styles.headerWrap}>
        <Text style={[styles.kicker, { color: tintColor }]}>Library</Text>
        <Text style={[styles.title, { color: textColor }]}>Watch History</Text>
        <Text style={[styles.subtitle, { color: textMuted }]}>{emptyMessage}</Text>
      </View>

      <FlatList
        data={items}
        contentContainerStyle={
          items.length === 0 ? styles.emptyContainer : styles.listContent
        }
        keyExtractor={(item, idx) => (item.id ? String(item.id) : String(idx))}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={tintColor}
          />
        }
        renderItem={({ item }) => {
          const label =
            item.type === "tv"
              ? `Season ${item.season ?? "-"} • Episode ${item.episode ?? "-"}`
              : "Movie";

          return (
            <Pressable style={[styles.card, { backgroundColor: overlayColor, borderColor }]} onPress={() => openItem(item)}>
              <View style={[styles.posterWrap, { backgroundColor: overlayColorStrong }]}>
                {item.poster_path ? (
                  <Image
                    source={{
                      uri: `https://image.tmdb.org/t/p/w185${item.poster_path}`,
                    }}
                    style={styles.poster}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={200}
                  />
                ) : (
                  <View style={[styles.poster, styles.posterFallback, { backgroundColor: overlayColorStrong }]}>
                    <MaterialIcons name="movie" size={26} color={iconColor} />
                  </View>
                )}
              </View>

              <View style={styles.cardBody}>
                <Text style={[styles.cardTitle, { color: textColor }]} numberOfLines={2}>
                  {item.title || item.name || "Untitled"}
                </Text>
                <Text style={[styles.cardMeta, { color: textMuted }]}>{label}</Text>
                <View style={styles.badgeRow}>
                  <View style={[styles.badge, { backgroundColor: overlayColorStrong }]}>
                    <Text style={[styles.badgeText, { color: textColor }]}>
                      {item.type === "tv" ? "Series" : "Film"}
                    </Text>
                  </View>
                  <View style={[styles.badgeAccent, { backgroundColor: tintColor }]}>
                    <MaterialIcons
                      name="play-arrow"
                      size={16}
                      color={isDark ? "#120F0A" : "#FFFFFF"}
                    />
                    <Text style={[styles.badgeAccentText, { color: isDark ? "#120F0A" : "#FFFFFF" }]}>Resume</Text>
                  </View>
                </View>
              </View>

              <MaterialIcons name="chevron-right" size={24} color={textMuted} />
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: overlayColorStrong }]}>
              <MaterialIcons name="history" size={30} color={iconColor} />
            </View>
            <Text style={[styles.emptyTitle, { color: textColor }]}>No watch history yet</Text>
            <Text style={[styles.emptyText, { color: textMuted }]}>{emptyMessage}</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: 18,
  },
  headerWrap: {
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  kicker: {
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  subtitle: {
    marginTop: 8,
    lineHeight: 20,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 12,
  },
  emptyContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 22,
    padding: 12,
    gap: 12,
  },
  posterWrap: {
    width: 56,
    height: 84,
    borderRadius: 16,
    overflow: "hidden",
  },
  poster: {
    width: "100%",
    height: "100%",
  },
  posterFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: {
    flex: 1,
    minHeight: 84,
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 5,
  },
  cardMeta: {
    fontSize: 13,
    marginBottom: 10,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  badgeAccent: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
  },
  badgeAccentText: {
    fontSize: 12,
    fontWeight: "800",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 8,
  },
  emptyText: {
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 280,
  },
});
