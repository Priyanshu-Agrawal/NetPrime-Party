import React from "react";
import { View, FlatList, StyleSheet } from "react-native";
import { Appear, Chip, Text } from "@/src/ui";
import { ms, spacing } from "@/theme/bearoom";
import { layout } from "@/theme/styles/layout";
import { useGenreListQuery } from "@/src/store/services/tmdbApi";

// Free-text quick searches (kept — these drive a text search, not the catalog).
const TRENDING = ["Sci-Fi", "Cozy nights", "A24", "Comedy", "New & hot", "Feel-good"];

const PROVIDERS = [
  { name: "Trending", id: null as number | null },
  { name: "Netflix", id: 8 },
  { name: "Prime Video", id: 9 },
  { name: "Apple TV+", id: 350 },
  { name: "Disney+", id: 337 },
  { name: "Max", id: 1899 },
];

// D4 sort presets → mapped to per-kind TMDB sort_by in tmdbApi's DISCOVER_SORT.
const SORTS = [
  { key: "popular", label: "Popular" },
  { key: "rating", label: "Top Rated" },
  { key: "newest", label: "Newest" },
];

interface Props {
  searchQuery: string;
  onSearch: (query: string) => void;
  selectedProvider: number | null;
  onSelectProvider: (providerId: number | null) => void;
  selectedGenre: number | null;
  onSelectGenre: (genreId: number | null) => void;
  sort: string;
  onSelectSort: (sort: string) => void;
}

const BrowseHeader = React.memo((props: Props) => {
  const {
    searchQuery, onSearch,
    selectedProvider, onSelectProvider,
    selectedGenre, onSelectGenre,
    sort, onSelectSort,
  } = props;
  // Movie genres drive the catalog filter (ids differ movie vs tv, so browse
  // skews movie — fine here; TV-genre browse lives on the Home genre row).
  const { data: genres } = useGenreListQuery("movie");

  return (
    <View>
      {/* Trending searches (free text) */}
      <Appear index={0}>
        <Text variant="h3" style={[styles.sectionTitle, styles.firstSectionTitle]}>
          Trending searches
        </Text>
        <View style={styles.wrap}>
          {TRENDING.map((t) => (
            <Chip key={t} label={t} active={searchQuery === t} onPress={() => onSearch(t)} />
          ))}
        </View>
      </Appear>

      {/* Browse by genre — filters the grid IN PLACE (tap active to clear). */}
      {genres && genres.length > 0 ? (
        <Appear index={1}>
          <Text variant="h3" style={styles.sectionTitle}>Browse by genre</Text>
          <FlatList
            horizontal
            data={genres}
            keyExtractor={(g) => String(g.id)}
            showsHorizontalScrollIndicator={false}
            style={styles.hList}
            contentContainerStyle={styles.hRow}
            renderItem={({ item }) => (
              <Chip
                label={item.name}
                active={selectedGenre === item.id}
                onPress={() => onSelectGenre(item.id)}
              />
            )}
          />
        </Appear>
      ) : null}

      {/* Sort */}
      <Appear index={2}>
        <Text variant="h3" style={styles.sectionTitle}>Sort by</Text>
        <View style={styles.wrap}>
          {SORTS.map((s) => (
            <Chip key={s.key} label={s.label} active={sort === s.key} onPress={() => onSelectSort(s.key)} />
          ))}
        </View>
      </Appear>

      {/* Streaming service */}
      <Appear index={3}>
        <Text variant="h3" style={styles.sectionTitle}>
          {selectedProvider ? "Popular on this service" : "Streaming service"}
        </Text>
        <FlatList
          horizontal
          data={PROVIDERS}
          keyExtractor={(p) => p.name}
          showsHorizontalScrollIndicator={false}
          style={styles.hList}
          contentContainerStyle={styles.hRow}
          renderItem={({ item: p }) => (
            <Chip label={p.name} active={selectedProvider === p.id} onPress={() => onSelectProvider(p.id)} />
          )}
        />
      </Appear>
    </View>
  );
});

BrowseHeader.displayName = "BrowseHeader";

const styles = StyleSheet.create({
  sectionTitle: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    fontSize: ms(17),
  },
  firstSectionTitle: { marginTop: 0 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: layout.railGap, paddingHorizontal: spacing.lg },
  hList: { flexGrow: 0, marginBottom: ms(4) },
  hRow: { paddingHorizontal: spacing.lg, gap: spacing.sm },
});

export default BrowseHeader;
