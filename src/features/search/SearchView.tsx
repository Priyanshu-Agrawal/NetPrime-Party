import React, { useCallback } from "react";
import { View, FlatList, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import AppHeader from "@/components/ui/AppHeader";
import { PosterSkeleton, Text, BouncyPressable, Chip } from "@/src/ui";
import { colors, ms, spacing, radius } from "@/theme/bearoom";
import { layout } from "@/theme/styles/layout";
import type { MediaItem } from "@/utils/tmdbLists";

import { useSearchData } from "./useSearchData";
import SearchInput from "./SearchInput";
import BrowseHeader from "./BrowseHeader";
import GridItem from "./GridItem";

const COLS = 3;

import { FlashList } from "@shopify/flash-list";

// We need an array of dummy skeleton objects for the initial loading empty state
const SKELETON_DATA = Array.from({ length: 12 }, (_, i) => ({
  id: `sk-${i}`,
}));

const SearchView: React.FC = () => {
  const insets = useSafeAreaInsets();
  
  const {
    items,
    isInitialLoading,
    isLoadingMore,
    error,
    searchQuery,
    selectedProvider,
    searchType,
    mode,
    hasMore,
    loadMore,
    handleSearch,
    selectProvider,
    selectSearchType,
  } = useSearchData();

  const handleClearSearch = useCallback(() => {
    handleSearch("");
  }, [handleSearch]);

  type ListItem = MediaItem | { id: string; isSkeleton: true };

  const listData = React.useMemo<ListItem[]>(() => {
    if (isLoadingMore) {
      // Calculate how many slots are empty in the last row
      const remainder = items.length % COLS;
      const slotsToFillCurrentRow = remainder === 0 ? 0 : COLS - remainder;
      
      // We want to fill the current row, plus add 2 full rows of skeletons
      const totalSkeletons = slotsToFillCurrentRow + COLS * 2;
      
      const FOOTER_SKELETONS = Array.from({ length: totalSkeletons }, (_, i) => ({
        id: `footer-sk-${i}`,
        isSkeleton: true as const,
      }));
      return [...items, ...FOOTER_SKELETONS];
    }
    return items;
  }, [items, isLoadingMore]);

  const renderItem = useCallback(({ item, index }: { item: ListItem; index: number }) => {
    if ("isSkeleton" in item) {
      const colIndex = index % COLS;
      const isLeft = colIndex === 0;
      const isRight = colIndex === COLS - 1;
      const isMiddle = colIndex === 1;

      return (
        <View style={[
          { flex: 1, marginBottom: spacing.lg },
          isLeft && { alignItems: 'flex-start' },
          isMiddle && { alignItems: 'center' },
          isRight && { alignItems: 'flex-end' },
        ]}>
          <PosterSkeleton />
        </View>
      );
    }
    return <GridItem item={item} index={index} />;
  }, []);

  const ListEmptyComponent = isInitialLoading ? (
    <View style={styles.gridContainer}>
      {SKELETON_DATA.map((sk) => (
        <PosterSkeleton key={sk.id} style={styles.skeletonItem} />
      ))}
    </View>
  ) : mode === "search" ? (
    <View style={styles.center}>
      <Ionicons name="search" size={40} color={colors.textFaint} />
      <Text variant="bodyDim">{`No results for “${searchQuery}”`}</Text>
    </View>
  ) : null;

  const ListHeaderComponent = (
    <View style={styles.header}>
      {mode === "browse" ? (
        <BrowseHeader
          searchQuery={searchQuery}
          onSearch={handleSearch}
          selectedProvider={selectedProvider}
          onSelectProvider={selectProvider}
        />
      ) : (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[
            { id: "multi", label: "All" },
            { id: "movie", label: "Movies" },
            { id: "tv", label: "TV Shows" },
            { id: "person", label: "People" },
          ]}
          keyExtractor={(item) => item.id}
          style={styles.filterList}
          contentContainerStyle={styles.filterRow}
          renderItem={({ item }) => (
            <Chip
              label={item.label}
              active={searchType === item.id}
              onPress={() => selectSearchType(item.id as any)}
            />
          )}
        />
      )}
    </View>
  );

  const ListFooterComponent = (
    <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
      {!hasMore && !isInitialLoading && items.length > 0 ? (
        <Text variant="bodyDim">End of results</Text>
      ) : hasMore && !isLoadingMore && !isInitialLoading && items.length > 0 ? (
        <BouncyPressable 
          onPress={loadMore} 
          style={{ 
            paddingVertical: ms(10),
            paddingHorizontal: ms(24),
            borderRadius: radius.pill,
            backgroundColor: colors.honeySoft,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.honeyGlow,
          }}>
          <Text variant="body" style={{ color: colors.honeyBright, fontWeight: '600' }}>Load More</Text>
        </BouncyPressable>
      ) : null}
    </View>
  );

  const contentContainerStyle = React.useMemo(() => ({
    ...styles.grid,
    ...(mode === "search" ? styles.gridResults : styles.gridBrowse),
  }), [mode]);

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      <AppHeader showSearch={false} style={styles.header} />

      <SearchInput
        value={searchQuery}
        onChangeText={handleSearch}
        onClear={handleClearSearch}
      />

      {error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.textFaint} />
          <Text variant="body" danger>
            {error}
          </Text>
        </View>
      ) : (
        <View style={styles.flex1}>
          <FlashList
            data={listData}
            renderItem={renderItem}
            keyExtractor={(item) => 
              "isSkeleton" in item 
                ? item.id 
                : `${item.media_type || "media"}:${item.id}`
            }
            numColumns={COLS}
            estimatedItemSize={183}
            getItemType={(item) => ("isSkeleton" in item ? "skeleton" : "poster")}
            contentContainerStyle={contentContainerStyle}
            ListHeaderComponent={ListHeaderComponent}
            ListEmptyComponent={ListEmptyComponent}
            ListFooterComponent={ListFooterComponent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onEndReached={loadMore}
            onEndReachedThreshold={0.75}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex1: { flex: 1 },
  header: { paddingBottom: spacing.xs },

  grid: { paddingHorizontal: spacing.lg, paddingBottom: ms(120) },
  gridBrowse: { paddingTop: spacing.xs },
  gridResults: { paddingTop: 0 },
  
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: layout.gridGap,
    justifyContent: "space-between",
  },
  filterList: { flexGrow: 0, marginBottom: spacing.md },
  filterRow: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  skeletonItem: {
    marginBottom: spacing.lg,
  },

  center: {
    alignItems: "center", 
    justifyContent: "center", 
    paddingVertical: spacing.xxxl + 20, 
    gap: spacing.md 
  },
});

export default React.memo(SearchView);
