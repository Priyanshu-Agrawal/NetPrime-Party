import AppHeader from "@/components/ui/AppHeader";
import { Chip, PosterCard, Text } from "@/src/ui";
import { colors, ms, radius, spacing } from "@/theme/bearoom";
import { gridColumnWidth, layout } from "@/theme/styles/layout";
import { gradients } from "@/theme/styles/gradients";
import { pressedStyle } from "@/theme/styles/interaction";
import { textVariant } from "@/theme/styles/typography";
import { API_HEADERS, API_URL } from "@/contexts/movieContext/movieContext";
import { openDetails, openJoinParty } from "@/src/navigation/actions";
import { itemTitle, type MediaItem } from "@/utils/tmdbLists";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const COLS = 3;
const CARD_W = gridColumnWidth(COLS);

const PROVIDERS = [
  { name: "Trending", id: null as number | null },
  { name: "Netflix", id: 8 },
  { name: "Prime Video", id: 9 },
  { name: "Apple TV+", id: 350 },
  { name: "Disney+", id: 337 },
  { name: "Max", id: 1899 },
];

const TRENDING = ["Sci-Fi", "Cozy nights", "A24", "Comedy", "New & hot", "Feel-good"];

const MOODS: { label: string; icon: keyof typeof Ionicons.glyphMap; query: string; party?: boolean }[] = [
  { label: "Movie night", icon: "film", query: "adventure" },
  { label: "Something cozy", icon: "cafe", query: "romance" },
  { label: "Watch with friends", icon: "people", query: "", party: true },
  { label: "Critically acclaimed", icon: "ribbon", query: "award" },
];

const SKELETON_DATA = Array.from({ length: 12 }, (_, i) => ({
  __skeleton: true as const,
  id: `sk-${i}`,
}));

function SkeletonCard() {
  const op = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(op, { toValue: 0.9, duration: 650, useNativeDriver: true }),
        Animated.timing(op, { toValue: 0.4, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [op]);
  return (
    <View style={{ width: CARD_W, marginBottom: spacing.lg }}>
      <Animated.View style={[styles.skBox, { opacity: op }]} />
      <Animated.View style={[styles.skLine, { width: "75%", marginTop: spacing.sm - 1, opacity: op }]} />
    </View>
  );
}

const SearchScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<number | null>(null);

  const inputRef = useRef<TextInput>(null);
  const latestCallIdRef = useRef<number>(0);
  const currentAbortControllerRef = useRef<AbortController | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- data (logic unchanged) ---------------------------------------------
  const fetchInitial = useCallback(
    async (providerId: number | null = selectedProvider): Promise<void> => {
      setSearchLoading(true);
      setSearchError(null);
      try {
        if (!providerId) {
          const response = await fetch(`${API_URL}trending/all/day?language=en-US&page=1`, {
            headers: API_HEADERS,
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();
          setSearchResults((data.results ?? []).filter((m: MediaItem) => m.poster_path));
        } else {
          const [tvRes, movieRes] = await Promise.all([
            fetch(`${API_URL}discover/tv?language=en-US&sort_by=popularity.desc&watch_region=US&with_watch_providers=${providerId}`, { headers: API_HEADERS }),
            fetch(`${API_URL}discover/movie?language=en-US&sort_by=popularity.desc&watch_region=US&with_watch_providers=${providerId}`, { headers: API_HEADERS }),
          ]);
          if (!tvRes.ok || !movieRes.ok) throw new Error(`HTTP error`);
          const tvData = await tvRes.json();
          const movieData = await movieRes.json();
          const combined = [
            ...(tvData.results ?? []).map((x: MediaItem) => ({ ...x, media_type: "tv" as const })),
            ...(movieData.results ?? []).map((x: MediaItem) => ({ ...x, media_type: "movie" as const })),
          ]
            .filter((m: any) => m.poster_path)
            .sort((a: any, b: any) => (b.popularity ?? 0) - (a.popularity ?? 0));
          setSearchResults(combined as MediaItem[]);
        }
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : "An unknown error occurred.");
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    },
    [selectedProvider],
  );

  const handleSearch = useCallback(
    async (query: string) => {
      const thisCallId = ++latestCallIdRef.current;
      setSearchQuery(query);
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
      if (currentAbortControllerRef.current) {
        currentAbortControllerRef.current.abort();
        currentAbortControllerRef.current = null;
      }
      if (!query) {
        setSearchError(null);
        setSearchLoading(false);
        fetchInitial();
        latestCallIdRef.current = 0;
        return;
      }
      if (!searchLoading) setSearchLoading(true);
      setSearchError(null);
      searchTimeoutRef.current = setTimeout(async () => {
        if (thisCallId !== latestCallIdRef.current) {
          setSearchLoading(false);
          return;
        }
        const controller = new AbortController();
        currentAbortControllerRef.current = controller;
        try {
          const response = await fetch(
            `${API_URL}search/multi?query=${encodeURIComponent(query)}&language=en-US`,
            { headers: API_HEADERS, signal: controller.signal },
          );
          if (thisCallId !== latestCallIdRef.current || controller.signal.aborted) return;
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();
          if (thisCallId === latestCallIdRef.current) {
            setSearchResults(
              (data.results ?? []).filter(
                (item: any) => item.poster_path && item.media_type !== "person",
              ),
            );
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
          if (thisCallId === latestCallIdRef.current) {
            setSearchError(err instanceof Error ? err.message : "Unknown error");
            setSearchResults([]);
          }
        } finally {
          if (thisCallId === latestCallIdRef.current) setSearchLoading(false);
          currentAbortControllerRef.current = null;
        }
      }, 450);
    },
    [fetchInitial, searchLoading],
  );

  useEffect(() => {
    fetchInitial();
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (currentAbortControllerRef.current) currentAbortControllerRef.current.abort();
    };
  }, [fetchInitial]);

  // --- UI ------------------------------------------------------------------
  const renderCard = ({ item }: { item: MediaItem }) => {
    const uri = item.poster_path
      ? `https://image.tmdb.org/t/p/w342${item.poster_path}`
      : undefined;
    const isTv = item.media_type === "tv";
    return (
      <PosterCard
        width={CARD_W}
        poster={uri}
        title={itemTitle(item)}
        rating={item.vote_average ?? undefined}
        kind={isTv ? "tv" : "movie"}
        onPress={() => openDetails(item, "movie")}
        imageTransition={250}
      />
    );
  };

  const BrowseHeader = (
    <View>
      {/* Trending searches */}
      <Text variant="h3" style={styles.sectionTitle}>
        Trending searches
      </Text>
      <View style={styles.trendWrap}>
        {TRENDING.map((t) => (
          <Chip key={t} label={t} active={searchQuery === t} onPress={() => handleSearch(t)} />
        ))}
      </View>

      <Text variant="h3" style={styles.sectionTitle}>
        Browse by mood
      </Text>
      <View style={styles.moodGrid}>
        {MOODS.map((m) => (
          <Pressable
            key={m.label}
            style={({ pressed }) => [styles.moodTile, pressed && pressedStyle]}
            onPress={() => (m.party ? openJoinParty() : handleSearch(m.query))}
          >
            <View style={styles.moodIcon}>
              <Ionicons name={m.icon} size={ms(20)} color={colors.honey} />
            </View>
            <Text variant="h3" style={styles.moodLabel}>
              {m.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text variant="h3" style={styles.sectionTitle}>
        {selectedProvider ? "Popular on this service" : "Trending today"}
      </Text>
      <FlatList
        horizontal
        data={PROVIDERS}
        keyExtractor={(p) => p.name}
        showsHorizontalScrollIndicator={false}
        style={styles.provList}
        contentContainerStyle={styles.provRow}
        renderItem={({ item: p }) => (
          <Chip
            label={p.name}
            active={selectedProvider === p.id}
            onPress={() => {
              setSelectedProvider(p.id);
              fetchInitial(p.id);
            }}
          />
        )}
      />
    </View>
  );

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      <AppHeader onSearchPress={() => inputRef.current?.focus()} />

      {/* Search input */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={20} color={colors.textDim} />
        <TextInput
          ref={inputRef}
          placeholder="Search movies, shows, people…"
          placeholderTextColor={colors.textDim}
          style={styles.input}
          value={searchQuery}
          onChangeText={handleSearch}
          autoCorrect={false}
          returnKeyType="search"
          selectionColor={colors.honey}
        />
        {searchQuery ? (
          <Pressable onPress={() => handleSearch("")} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textDim} />
          </Pressable>
        ) : (
          <Ionicons name="options-outline" size={20} color={colors.textDim} />
        )}
      </View>

      {searchError ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.textFaint} />
          <Text variant="body" danger>
            {searchError}
          </Text>
        </View>
      ) : (
        <FlatList
          data={(searchLoading ? SKELETON_DATA : searchResults) as any[]}
          renderItem={({ item }) =>
            (item as any).__skeleton ? <SkeletonCard /> : renderCard({ item })
          }
          keyExtractor={(item: any, i) => (item.__skeleton ? item.id : `${item.id}-${i}`)}
          numColumns={COLS}
          columnWrapperStyle={{ gap: layout.gridGap }}
          contentContainerStyle={styles.grid}
          ListHeaderComponent={!searchQuery ? BrowseHeader : null}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            searchQuery && !searchLoading ? (
              <View style={styles.center}>
                <Ionicons name="search" size={40} color={colors.textFaint} />
                <Text variant="bodyDim">{`No results for “${searchQuery}”`}</Text>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md + 2,
    height: ms(50),
    borderRadius: radius.lg,
  },
  input: { flex: 1, ...textVariant("body"), fontSize: ms(15) },

  sectionTitle: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    fontSize: ms(17),
  },
  trendWrap: { flexDirection: "row", flexWrap: "wrap", gap: layout.railGap, paddingHorizontal: spacing.lg },

  moodGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, paddingHorizontal: spacing.lg },
  moodTile: {
    flexGrow: 1,
    flexBasis: "47%",
    height: ms(100),
    borderRadius: radius.lg,
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md + 2,
    justifyContent: "space-between",
  },
  moodIcon: {
    width: ms(40),
    height: ms(40),
    borderRadius: radius.pill,
    backgroundColor: colors.honeySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  moodLabel: { fontSize: ms(15) },

  provList: { flexGrow: 0, marginBottom: ms(18) },
  provRow: { paddingHorizontal: spacing.lg, gap: spacing.sm },

  grid: { paddingHorizontal: spacing.lg, paddingTop: layout.railGap, paddingBottom: ms(120) },

  skBox: { width: CARD_W, height: CARD_W * 1.5, borderRadius: radius.md, backgroundColor: colors.bgElevated },
  skLine: { height: ms(10), borderRadius: ms(5), backgroundColor: colors.bgElevated },

  center: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.xxxl + 20, gap: spacing.md },
});

export default React.memo(SearchScreen);
