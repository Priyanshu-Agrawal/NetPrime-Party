import { openDetails } from "@/src/navigation/actions";
import type { PlayerStackParamList } from "@/src/navigation/types";
import {
  Button,
  LibraryScreenHeader,
  PosterCard,
  PosterSkeleton,
  Screen,
  Text,
} from "@/src/ui";
import { ms, spacing } from "@/theme/bearoom";
import { gridColumnWidth, layout } from "@/theme/styles/layout";
import { itemTitle, type MediaItem } from "@/utils/tmdbLists";
import { useLazyListPageQuery } from "@/src/store/services/tmdbApi";
import { useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";

const COLS = 3;
const CARD_W = gridColumnWidth(COLS);

const SKELETON_DATA = Array.from({ length: 12 }, (_, i) => ({
  __skeleton: true as const,
  id: `sk-${i}`,
}));

export default function RailSeeAllScreen() {
  const { title, path, kind } = useRoute<RouteProp<PlayerStackParamList, "RailSeeAll">>().params;

  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const pageRef = useRef(1);
  const totalPagesRef = useRef(1);

  // Lazy RTK Query trigger — caches each page so re-entering the screen is instant.
  const [fetchPage] = useLazyListPageQuery();

  const applyPageMeta = useCallback((nextPage: number, nextTotalPages: number) => {
    pageRef.current = nextPage;
    totalPagesRef.current = nextTotalPages;
    setPage(nextPage);
    setTotalPages(nextTotalPages);
  }, []);

  const fetchInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPage({ path, page: 1 }).unwrap();
      setItems(data.results.map((item) => ({ ...item, media_type: kind })));
      applyPageMeta(data.page, data.total_pages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred.");
      setItems([]);
      applyPageMeta(1, 1);
    } finally {
      setLoading(false);
    }
  }, [applyPageMeta, fetchPage, path, kind]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || pageRef.current >= totalPagesRef.current) return;
    setLoadingMore(true);
    try {
      const nextPage = pageRef.current + 1;
      const data = await fetchPage({ path, page: nextPage }).unwrap();
      setItems((prev) => {
        const merged = [...prev];
        for (const item of data.results) {
          if (!merged.some((existing) => existing.id === item.id)) {
            merged.push({ ...item, media_type: kind });
          }
        }
        return merged;
      });
      applyPageMeta(data.page, data.total_pages);
    } catch {
      // Keep already-loaded rows visible if a later page fails.
    } finally {
      setLoadingMore(false);
    }
  }, [applyPageMeta, loading, loadingMore, fetchPage, path, kind]);

  useEffect(() => {
    void fetchInitial();
  }, [fetchInitial]);

  const listData = useMemo(
    () => (loading ? SKELETON_DATA : items),
    [loading, items],
  );

  const hasMore = page < totalPages;

  const renderCard = ({ item }: { item: MediaItem }) => {
    const uri = item.poster_path
      ? `https://image.tmdb.org/t/p/w342${item.poster_path}`
      : undefined;
    return (
      <View style={styles.gridItem}>
        <PosterCard
          width={CARD_W}
          poster={uri}
          title={itemTitle(item)}
          rating={item.vote_average ?? undefined}
          kind={kind}
          onPress={() => openDetails(item, kind)}
          imageTransition={250}
        />
      </View>
    );
  };

  if (error && items.length === 0 && !loading) {
    return (
      <Screen edges={["top"]}>
        <LibraryScreenHeader title={title} />
        <View style={styles.centered}>
          <Text variant="body" danger>
            {error}
          </Text>
          <Button label="Retry" onPress={() => void fetchInitial()} style={{ marginTop: spacing.lg }} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={["top"]}>
      <LibraryScreenHeader title={title} />

      <FlatList
        data={listData as any[]}
        renderItem={({ item }) =>
          (item as any).__skeleton ? <PosterSkeleton /> : renderCard({ item })
        }
        keyExtractor={(item: any, i) => (item.__skeleton ? item.id : `${item.id}-${i}`)}
        numColumns={COLS}
        columnWrapperStyle={{ gap: layout.gridGap }}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
        onEndReached={() => {
          if (hasMore && !loading && !loadingMore) void loadMore();
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm - 2,
    paddingBottom: ms(120),
  },
  gridItem: { width: CARD_W, marginBottom: spacing.lg },
  footerSkeletonRow: {
    flexDirection: "row",
    gap: layout.gridGap,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: layout.screenPadding,
  },
});
