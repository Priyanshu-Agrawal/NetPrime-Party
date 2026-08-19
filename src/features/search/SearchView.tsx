import AppHeader from "@/components/ui/AppHeader";
import { Chip, PosterCard, PosterSkeleton, Text } from "@/src/ui";
import { colors, ms, radius, spacing } from "@/theme/bearoom";
import { gridColumnWidth, layout } from "@/theme/styles/layout";
import { pressedStyle } from "@/theme/styles/interaction";
import { textVariant } from "@/theme/styles/typography";
import { openDetails, openJoinParty } from "@/src/navigation/actions";
import { itemTitle, type MediaItem } from "@/utils/tmdbLists";
import {
  useLazyDiscoverByProviderQuery,
  useLazySearchMultiQuery,
  useLazyTrendingAllDayQuery,
} from "@/src/store/services/tmdbApi";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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

function filterResults(items: unknown[]): MediaItem[] {
  return (items ?? []).filter(
    (item: any) => item?.poster_path && item?.media_type !== "person",
  ) as MediaItem[];
}

function mergeProviderResults(tvData: any, movieData: any): MediaItem[] {
  return [
    ...(tvData.results ?? []).map((x: MediaItem) => ({ ...x, media_type: "tv" as const })),
    ...(movieData.results ?? []).map((x: MediaItem) => ({ ...x, media_type: "movie" as const })),
  ]
    .filter((m) => m.poster_path)
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
}

const SearchScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const inputRef = useRef<TextInput>(null);
  const latestCallIdRef = useRef<number>(0);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lazy RTK Query triggers — cache each (path/provider, page) and dedupe.
  const [fetchTrending] = useLazyTrendingAllDayQuery();
  const [fetchDiscover] = useLazyDiscoverByProviderQuery();
  const [fetchSearch] = useLazySearchMultiQuery();
  const pageRef = useRef(1);
  const totalPagesRef = useRef(1);
  const queryRef = useRef("");
  const providerRef = useRef<number | null>(null);

  const hasMore = page < totalPages;

  const applyPageMeta = useCallback((nextPage: number, nextTotalPages: number) => {
    pageRef.current = nextPage;
    totalPagesRef.current = nextTotalPages;
    setPage(nextPage);
    setTotalPages(nextTotalPages);
  }, []);

  const fetchBrowse = useCallback(
    async (providerId: number | null, pageNum: number, append: boolean): Promise<void> => {
      if (!providerId) {
        const data = await fetchTrending({ page: pageNum }).unwrap();
        const batch = filterResults(data.results ?? []);
        setSearchResults((prev) => (append ? [...prev, ...batch] : batch));
        applyPageMeta(data.page ?? pageNum, data.total_pages ?? 1);
        return;
      }

      const { tv: tvData, movie: movieData } = await fetchDiscover({
        providerId,
        page: pageNum,
      }).unwrap();
      const batch = mergeProviderResults(tvData, movieData);
      setSearchResults((prev) => (append ? [...prev, ...batch] : batch));
      applyPageMeta(
        pageNum,
        Math.max(tvData.total_pages ?? 1, movieData.total_pages ?? 1),
      );
    },
    [applyPageMeta, fetchTrending, fetchDiscover],
  );

  const fetchSearchPage = useCallback(
    async (query: string, pageNum: number, append: boolean): Promise<void> => {
      // Snapshot the call id; if a newer search supersedes us mid-flight, drop
      // this (stale) result instead of overwriting the newer one. This replaces
      // the old AbortController — RTK Query owns request lifecycle now.
      const callId = latestCallIdRef.current;
      const data = await fetchSearch({ query, page: pageNum }).unwrap();
      if (callId !== latestCallIdRef.current) return;
      const batch = filterResults(data.results ?? []);
      setSearchResults((prev) => (append ? [...prev, ...batch] : batch));
      applyPageMeta(data.page ?? pageNum, data.total_pages ?? 1);
    },
    [applyPageMeta, fetchSearch],
  );

  const fetchInitial = useCallback(
    async (providerId: number | null = selectedProvider): Promise<void> => {
      setSearchLoading(true);
      setSearchError(null);
      providerRef.current = providerId;
      queryRef.current = "";
      try {
        await fetchBrowse(providerId, 1, false);
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : "An unknown error occurred.");
        setSearchResults([]);
        applyPageMeta(1, 1);
      } finally {
        setSearchLoading(false);
      }
    },
    [applyPageMeta, fetchBrowse, selectedProvider],
  );

  const loadMore = useCallback(async () => {
    if (loadingMore || searchLoading || pageRef.current >= totalPagesRef.current) return;
    setLoadingMore(true);
    setSearchError(null);
    try {
      const nextPage = pageRef.current + 1;
      if (queryRef.current) {
        await fetchSearchPage(queryRef.current, nextPage, true);
      } else {
        await fetchBrowse(providerRef.current, nextPage, true);
      }
    } catch {
      // Keep already-loaded rows visible if a later page fails.
    } finally {
      setLoadingMore(false);
    }
  }, [fetchBrowse, fetchSearchPage, loadingMore, searchLoading]);

  const handleSearch = useCallback(
    async (query: string) => {
      const thisCallId = ++latestCallIdRef.current;
      setSearchQuery(query);
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
      if (!query) {
        setSearchError(null);
        setSearchLoading(false);
        queryRef.current = "";
        fetchInitial();
        latestCallIdRef.current = 0;
        return;
      }
      queryRef.current = query;
      providerRef.current = null;
      if (!searchLoading) setSearchLoading(true);
      setSearchError(null);
      searchTimeoutRef.current = setTimeout(async () => {
        if (thisCallId !== latestCallIdRef.current) {
          setSearchLoading(false);
          return;
        }
        try {
          await fetchSearchPage(query, 1, false);
        } catch (err) {
          if (thisCallId === latestCallIdRef.current) {
            setSearchError(err instanceof Error ? err.message : "Unknown error");
            setSearchResults([]);
            applyPageMeta(1, 1);
          }
        } finally {
          if (thisCallId === latestCallIdRef.current) setSearchLoading(false);
        }
      }, 450);
    },
    [applyPageMeta, fetchInitial, fetchSearchPage, searchLoading],
  );

  useEffect(() => {
    fetchInitial();
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [fetchInitial]);

  // --- UI ------------------------------------------------------------------
  const listData = useMemo(
    () => (searchLoading ? SKELETON_DATA : searchResults),
    [searchLoading, searchResults],
  );

  const renderCard = ({ item }: { item: MediaItem }) => {
    const uri = item.poster_path
      ? `https://image.tmdb.org/t/p/w342${item.poster_path}`
      : undefined;
    const isTv = item.media_type === "tv";
    return (
      <View style={styles.gridItem}>
        <PosterCard
          width={CARD_W}
          poster={uri}
          title={itemTitle(item)}
          rating={item.vote_average ?? undefined}
          kind={isTv ? "tv" : "movie"}
          onPress={() => openDetails(item, "movie")}
          imageTransition={250}
        />
      </View>
    );
  };

  const BrowseHeader = (
    <View>
      {/* Trending searches */}
      <Text variant="h3" style={[styles.sectionTitle, styles.firstSectionTitle]}>
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
      <AppHeader showSearch={false} style={styles.header} />

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
          data={listData as any[]}
          renderItem={({ item }) =>
            (item as any).__skeleton ? <PosterSkeleton /> : renderCard({ item })
          }
          keyExtractor={(item: any, i) => (item.__skeleton ? item.id : `${item.id}-${i}`)}
          numColumns={COLS}
          columnWrapperStyle={{ gap: layout.gridGap }}
          contentContainerStyle={[styles.grid, searchQuery ? styles.gridResults : styles.gridBrowse]}
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
          onEndReached={() => {
            if (hasMore && !searchLoading && !loadingMore) void loadMore();
          }}
          onEndReachedThreshold={0.45}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerSkeletonRow}>
                {Array.from({ length: COLS }, (_, i) => (
                  <PosterSkeleton key={`footer-sk-${i}`} />
                ))}
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
  header: { paddingBottom: spacing.xs },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md + 2,
    height: ms(46),
    borderRadius: radius.lg,
  },
  input: { flex: 1, ...textVariant("body"), fontSize: ms(15) },

  sectionTitle: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    fontSize: ms(17),
  },
  firstSectionTitle: { marginTop: 0 },
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

  grid: { paddingHorizontal: spacing.lg, paddingBottom: ms(120) },
  gridBrowse: { paddingTop: spacing.xs },
  gridResults: { paddingTop: 0 },
  gridItem: { width: CARD_W, marginBottom: spacing.lg },

  footerSkeletonRow: {
    flexDirection: "row",
    gap: layout.gridGap,
  },

  center: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.xxxl + 20, gap: spacing.md },
});

export default React.memo(SearchScreen);
