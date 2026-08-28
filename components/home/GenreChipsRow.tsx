/**
 * GenreChipsRow — the `genreRow` Home-feed section: a quick discovery entry point
 * (placed high in the feed, not buried among content rails). A Movie/TV toggle
 * (shared animated KindToggle) switches which TMDB genre set the chips browse;
 * each chip opens a discover-by-genre grid (the shared RailSeeAll grid) via
 * openGenre(). The header + toggle stay put while a toggled kind's genres load
 * (no self-hide — that would strand the toggle); the chip area shows a short
 * placeholder until they arrive.
 */
import { Ionicons } from "@expo/vector-icons";
import { Chip, Text } from "@/src/ui";
import { KindToggle, type MediaKind } from "@/components/home/KindToggle";
import { colors, ms, spacing } from "@/theme/bearoom";
import { useGenreListQuery } from "@/src/store/services/tmdbApi";
import { openGenre } from "@/src/navigation/actions";
import React, { useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";

export function GenreChipsRow({
  title,
  kind = "movie",
}: {
  title?: string;
  kind?: MediaKind;
}) {
  const [activeKind, setActiveKind] = useState<MediaKind>(kind);
  const { data: genres } = useGenreListQuery(activeKind);

  return (
    <View style={styles.rail}>
      {/* Header — title + animated Movie/TV toggle (mirrors SectionHeader's row layout). */}
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <Ionicons name="grid" size={ms(16)} color={colors.honey} />
          <Text variant="h2" style={styles.title} numberOfLines={1}>
            {title ?? "Browse by Genre"}
          </Text>
        </View>
        <KindToggle value={activeKind} onChange={setActiveKind} />
      </View>

      {genres && genres.length > 0 ? (
        <FlatList
          data={genres}
          horizontal
          keyExtractor={(g) => String(g.id)}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Chip label={item.name} onPress={() => openGenre(item.id, item.name, activeKind)} />
          )}
        />
      ) : (
        <View style={styles.placeholder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { marginTop: spacing.xl },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm + 2,
  },
  titleWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm - 2, flexShrink: 1 },
  title: { fontSize: ms(18), letterSpacing: -0.2 },
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  placeholder: { height: ms(34), marginHorizontal: spacing.lg },
});

export default GenreChipsRow;
