import AppHeader from "@/components/ui/AppHeader";
import { colors, ms, font, radius } from "@/theme/bearoom";
import { API_HEADERS, API_URL } from "@/contexts/movieContext/movieContext";
import { detailsRoute, itemTitle, itemYear, type MediaItem } from "@/utils/tmdbLists";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");
const GAP = 10;
const COLS = 3;
const CARD_W = (width - 16 * 2 - GAP * (COLS - 1)) / COLS;

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
    <View style={styles.card}>
      <Animated.View style={[styles.poster, styles.skBox, { opacity: op }]} />
      <Animated.View style={[styles.skLine, { width: "75%", marginTop: 7, opacity: op }]} />
    </View>
  );
}

const Search: React.FC = () => {
  const router = useRouter();
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
      <Pressable
        style={styles.card}
        onPress={() => router.push(detailsRoute(item, "movie") as any)}
      >
        <View style={styles.posterWrap}>
          {uri ? (
            <Image source={{ uri }} style={styles.poster} contentFit="cover" cachePolicy="memory-disk" transition={250} />
          ) : (
            <View style={[styles.poster, styles.noPoster]}>
              <Ionicons name="film-outline" size={22} color={colors.textFaint} />
            </View>
          )}
          {item.vote_average ? (
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={9} color={colors.honey} />
              <Text style={styles.ratingText}>{item.vote_average.toFixed(1)}</Text>
            </View>
          ) : null}
          <View style={styles.typeTag}>
            <Text style={styles.typeTagText}>{isTv ? "TV" : "MOVIE"}</Text>
          </View>
        </View>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {itemTitle(item)}
        </Text>
      </Pressable>
    );
  };

  const BrowseHeader = (
    <View>
      {/* Trending searches */}
      <Text style={styles.sectionTitle}>Trending searches</Text>
      <View style={styles.trendWrap}>
        {TRENDING.map((t, i) => (
          <Pressable
            key={t}
            onPress={() => handleSearch(t)}
            style={[styles.trendChip, i < 2 && styles.trendChipHot]}
          >
            <Text style={[styles.trendText, i < 2 && styles.trendTextHot]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      {/* Browse by mood */}
      <Text style={styles.sectionTitle}>Browse by mood</Text>
      <View style={styles.moodGrid}>
        {MOODS.map((m) => (
          <Pressable
            key={m.label}
            style={styles.moodTile}
            onPress={() => (m.party ? router.push("/joinParty") : handleSearch(m.query))}
          >
            <View style={styles.moodIcon}>
              <Ionicons name={m.icon} size={20} color={colors.honey} />
            </View>
            <Text style={styles.moodLabel}>{m.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Provider filters */}
      <Text style={styles.sectionTitle}>
        {selectedProvider ? "Popular on this service" : "Trending today"}
      </Text>
      <FlatList
        horizontal
        data={PROVIDERS}
        keyExtractor={(p) => p.name}
        showsHorizontalScrollIndicator={false}
        style={styles.provList}
        contentContainerStyle={styles.provRow}
        renderItem={({ item: p }) => {
          const active = selectedProvider === p.id;
          return (
            <Pressable
              onPress={() => {
                setSelectedProvider(p.id);
                fetchInitial(p.id);
              }}
              style={[styles.provChip, active && styles.provChipActive]}
            >
              <Text style={[styles.provText, active && styles.provTextActive]}>{p.name}</Text>
            </Pressable>
          );
        }}
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
          <Text style={styles.errText}>{searchError}</Text>
        </View>
      ) : (
        <FlatList
          data={(searchLoading ? SKELETON_DATA : searchResults) as any[]}
          renderItem={({ item }) =>
            (item as any).__skeleton ? <SkeletonCard /> : renderCard({ item })
          }
          keyExtractor={(item: any, i) => (item.__skeleton ? item.id : `${item.id}-${i}`)}
          numColumns={COLS}
          columnWrapperStyle={{ gap: GAP }}
          contentContainerStyle={styles.grid}
          ListHeaderComponent={!searchQuery ? BrowseHeader : null}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            searchQuery && !searchLoading ? (
              <View style={styles.center}>
                <Ionicons name="search" size={40} color={colors.textFaint} />
                <Text style={styles.emptyText}>No results for “{searchQuery}”</Text>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  brand: { color: colors.text, fontFamily: font.headlineXbold, fontSize: ms(20), letterSpacing: 0.2 },
  brandAccent: { color: colors.honey },
  hostLink: { color: colors.honey, fontFamily: font.label, fontSize: ms(13) },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    marginHorizontal: 16,
    marginTop: 4,
    paddingHorizontal: 14,
    height: 50,
    borderRadius: radius.lg,
  },
  input: { flex: 1, color: colors.text, fontFamily: font.body, fontSize: ms(15) },

  sectionTitle: {
    color: colors.text,
    fontFamily: font.headline,
    fontSize: ms(17),
    paddingHorizontal: 16,
    marginTop: 20,
    marginBottom: 12,
  },
  trendWrap: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 16 },
  trendChip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  trendChipHot: { backgroundColor: colors.honeySoft, borderColor: colors.honey },
  trendText: { color: colors.textDim, fontFamily: font.bodyMed, fontSize: ms(13) },
  trendTextHot: { color: colors.text },

  moodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: 16 },
  moodTile: {
    flexGrow: 1,
    flexBasis: "47%",
    height: 100,
    borderRadius: radius.lg,
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 14,
    justifyContent: "space-between",
  },
  moodIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.honeySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  moodLabel: { color: colors.text, fontFamily: font.headlineSemi, fontSize: ms(15) },

  provList: { flexGrow: 0, marginBottom: 18 },
  provRow: { paddingHorizontal: 16, gap: 8 },
  provChip: {
    height: 38,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  provChipActive: { backgroundColor: colors.honeySoft, borderColor: colors.honey },
  provText: { color: colors.textDim, fontFamily: font.bodySemi, fontSize: ms(13) },
  provTextActive: { color: colors.honey },

  grid: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 120 },
  card: { width: CARD_W, marginBottom: 16 },
  posterWrap: { borderRadius: radius.md, overflow: "hidden" },
  poster: { width: CARD_W, height: CARD_W * 1.5, borderRadius: radius.md, backgroundColor: colors.bgElevated },
  noPoster: { alignItems: "center", justifyContent: "center" },
  ratingBadge: {
    position: "absolute",
    top: 5,
    right: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: colors.scrim,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  ratingText: { color: colors.honey, fontFamily: font.bodySemi, fontSize: ms(9) },
  typeTag: {
    position: "absolute",
    bottom: 5,
    left: 5,
    backgroundColor: colors.scrim,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.sm,
  },
  typeTagText: { color: colors.text, fontFamily: font.label, fontSize: ms(8), letterSpacing: 0.4 },
  cardTitle: { color: colors.text, fontFamily: font.bodyMed, fontSize: ms(12), marginTop: 6 },

  skBox: { backgroundColor: colors.bgElevated },
  skLine: { height: 10, borderRadius: 5, backgroundColor: colors.bgElevated },

  center: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 12 },
  errText: { color: colors.danger, fontFamily: font.body, fontSize: ms(14) },
  emptyText: { color: colors.textDim, fontFamily: font.body, fontSize: ms(14) },
});

export const options = { animation: "fade" };

export default React.memo(Search);
