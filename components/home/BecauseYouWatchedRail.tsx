/**
 * "Because you watched {title}" home rail — seeded from the most recent local
 * watch-history entry, fetching that title's TMDB recommendations (falling back to
 * "similar" when recommendations are empty). Self-fetching + self-hiding: renders
 * `null` when there is no watch history yet, or the seed title has no recs/similar.
 */
import { openDetails } from "@/src/navigation/actions";
import { PosterCard, Text } from "@/src/ui";
import { useDetailsQuery } from "@/src/store/services/tmdbApi";
import { img } from "@/utils/tmdbDetails";
import { getWatchHistory, type HistoryItem } from "@/utils/history";
import { colors, ms, spacing } from "@/theme/bearoom";
import { Ionicons } from "@expo/vector-icons";
import { skipToken } from "@reduxjs/toolkit/query";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";

const POSTER_W = ms(112);

export function BecauseYouWatchedRail() {
  const [recent, setRecent] = useState<HistoryItem | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getWatchHistory()
        .then((list: HistoryItem[]) => {
          if (!active) return;
          const sorted = [...list]
            .filter((i) => i.id)
            .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
          setRecent(sorted[0] ?? null);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, []),
  );

  // HistoryItem.type is a plain string; normalize to the literal union the TMDB
  // details endpoint expects (same normalization ContinueWatching uses for openPlayer).
  const type: "movie" | "tv" = recent?.type === "tv" ? "tv" : "movie";

  // recent is nullable, so the query arg is only well-formed once it loads — use
  // skipToken (as PartyScreen's mediaDetails lookup does) rather than a dummy arg.
  const { data: details } = useDetailsQuery(recent ? { type, id: recent.id } : skipToken);

  const recs = ((details?.recommendations?.results ?? details?.similar?.results ?? []) as any[])
    .filter((m) => m.poster_path)
    .slice(0, 20);

  if (!recent || recs.length === 0) return null; // self-hide

  return (
    <View style={{ marginTop: spacing.lg }}>
      <View style={styles.header}>
        <View style={styles.eyebrowRow}>
          <Ionicons name="sparkles" size={ms(12)} color={colors.honey} />
          <Text variant="caption" honey style={styles.eyebrow}>
            Because you watched
          </Text>
        </View>
        <Text variant="h2" numberOfLines={1} style={styles.title}>
          {recent.title}
        </Text>
      </View>
      <FlatList
        data={recs}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}
        renderItem={({ item }) => (
          <PosterCard
            width={POSTER_W}
            poster={img(item.poster_path, "w342") ?? undefined}
            title={item.title || item.name}
            rating={item.vote_average ?? undefined}
            kind={type}
            onPress={() => openDetails({ id: item.id, media_type: type }, type)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm + 2 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: ms(3) },
  eyebrow: { fontSize: ms(11), letterSpacing: 0.8, textTransform: "uppercase" },
  title: { fontSize: ms(18), letterSpacing: -0.2 },
});

export default BecauseYouWatchedRail;
