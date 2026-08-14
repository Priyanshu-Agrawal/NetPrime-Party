import { Movie } from "@/contexts/movieContext";
import { API_HEADERS, API_URL } from "@/contexts/movieContext/movieContext";
import { detailsRoute, itemTitle, itemYear, type MediaItem } from "@/utils/tmdbLists";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");
const GAP = 12;
const COLS = 3;
const CARD_W = (width - 16 * 2 - GAP * (COLS - 1)) / COLS;

const C = {
  bg: "#0a0a0c",
  text: "#f2f2f4",
  sub: "#9aa0a6",
  gold: "#f5c518",
  accent: "#4ea1ff",
  input: "#17171b",
  chip: "#1c1c21",
  line: "#242430",
};

const PROVIDERS = [
  { name: "Trending", id: null as number | null },
  { name: "Netflix", id: 8 },
  { name: "Prime Video", id: 9 },
  { name: "Apple TV+", id: 350 },
  { name: "Disney+", id: 337 },
  { name: "Max", id: 1899 },
];

// Placeholder rows fed to the SAME FlatList while loading, so the grid keeps its
// position + card dimensions (no layout jump when real results replace them).
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
      <Animated.View style={[styles.skLine, { width: "42%", marginTop: 5, opacity: op }]} />
    </View>
  );
}

const Search: React.FC = () => {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<number | null>(null);

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
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.card}
        onPress={() => router.push(detailsRoute(item, "movie") as any)}
      >
        <View>
          {uri ? (
            <Image source={{ uri }} style={styles.poster} contentFit="cover" cachePolicy="memory-disk" transition={250} />
          ) : (
            <View style={[styles.poster, styles.noPoster]}>
              <Ionicons name="film-outline" size={24} color="#555" />
            </View>
          )}
          {item.vote_average ? (
            <View style={styles.ratingBadge}>
              <MaterialIcons name="star" size={9} color={C.gold} />
              <Text style={styles.ratingText}>{item.vote_average.toFixed(1)}</Text>
            </View>
          ) : null}
          {item.media_type === "tv" ? (
            <View style={styles.typeTag}>
              <Text style={styles.typeTagText}>TV</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {itemTitle(item)}
        </Text>
        <Text style={styles.cardYear}>{itemYear(item)}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      {/* Search input */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={C.sub} />
        <TextInput
          placeholder="Search movies & shows…"
          placeholderTextColor={C.sub}
          style={styles.input}
          value={searchQuery}
          onChangeText={handleSearch}
          autoCorrect={false}
          returnKeyType="search"
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => handleSearch("")} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={C.sub} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Provider filters (only in the browse/no-query state) */}
      {!searchQuery ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsRow}
          contentContainerStyle={styles.chipsContent}
        >
          {PROVIDERS.map((p) => {
            const active = selectedProvider === p.id;
            return (
              <TouchableOpacity
                key={p.name}
                onPress={() => {
                  setSelectedProvider(p.id);
                  fetchInitial(p.id);
                }}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      {!searchQuery ? (
        <Text style={styles.sectionLabel}>
          {selectedProvider ? "Popular on this service" : "Trending Today"}
        </Text>
      ) : null}

      {/* Results (the FlatList stays mounted; while loading it renders skeleton
          rows so the grid never unmounts/jumps) */}
      {searchError ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={40} color="#555" />
          <Text style={styles.errText}>{searchError}</Text>
        </View>
      ) : (
        <FlatList
          data={(searchLoading ? SKELETON_DATA : searchResults) as any[]}
          renderItem={({ item }) =>
            (item as any).__skeleton ? <SkeletonCard /> : renderCard({ item })
          }
          keyExtractor={(item: any, i) =>
            item.__skeleton ? item.id : `${item.id}-${i}`
          }
          numColumns={COLS}
          columnWrapperStyle={{ gap: GAP }}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            searchQuery && !searchLoading ? (
              <View style={styles.center}>
                <Ionicons name="search" size={40} color="#555" />
                <Text style={styles.emptyText}>No results for “{searchQuery}”</Text>
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.input,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 14,
    height: 46,
    borderRadius: 12,
  },
  input: { flex: 1, color: C.text, fontSize: 15 },

  chipsRow: { flexGrow: 0, marginTop: 14 },
  chipsContent: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
  chip: {
    height: 38,
    paddingHorizontal: 18,
    borderRadius: 999, // clamp to a perfect capsule regardless of height
    backgroundColor: "#26262e",
    alignItems: "center",
    justifyContent: "center",
    // No border: active + inactive are both pure solid-fill capsules so they
    // render identical edges (a filled chip with a same-color border rendered its
    // corners slightly rough / looked shorter than the outlined inactive ones).
  },
  chipActive: { backgroundColor: C.accent },
  chipText: {
    color: "#cfd2d6",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 16,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  chipTextActive: { color: "#fff" },

  sectionLabel: {
    color: C.text,
    fontSize: 16,
    fontWeight: "700",
    paddingHorizontal: 16,
    marginTop: 18,
    marginBottom: 10,
  },

  grid: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 90, gap: 16 },
  card: { width: CARD_W },
  poster: { width: CARD_W, height: CARD_W * 1.5, borderRadius: 10, backgroundColor: "#1a1a1e" },
  noPoster: { alignItems: "center", justifyContent: "center" },
  ratingBadge: {
    position: "absolute",
    top: 5,
    left: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 5,
  },
  ratingText: { color: "#fff", fontSize: 9, fontWeight: "700" },
  typeTag: {
    position: "absolute",
    top: 5,
    right: 5,
    backgroundColor: "rgba(78,161,255,0.9)",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  typeTagText: { color: "#fff", fontSize: 8, fontWeight: "800" },
  cardTitle: { color: C.text, fontSize: 12, fontWeight: "600", marginTop: 6 },
  cardYear: { color: C.sub, fontSize: 10.5, marginTop: 1 },

  skBox: { backgroundColor: "#1a1a1e" },
  skLine: { height: 11, borderRadius: 5, backgroundColor: "#1a1a1e" },

  center: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 12 },
  errText: { color: "#ff6b6b", fontSize: 14 },
  emptyText: { color: C.sub, fontSize: 14 },
});

export const options = { animation: "fade" };

export default React.memo(Search);
