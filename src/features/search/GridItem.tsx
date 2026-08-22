import React from "react";
import { View, StyleSheet } from "react-native";
import { PosterCard } from "@/src/ui";
import { spacing } from "@/theme/bearoom";
import { gridColumnWidth } from "@/theme/styles/layout";
import { itemTitle, type MediaItem } from "@/utils/tmdbLists";
import { openDetails, openPerson } from "@/src/navigation/actions";

const COLS = 3;
const CARD_W = gridColumnWidth(COLS);

interface Props {
  item: MediaItem;
  index: number;
}

const GridItem = React.memo(
  ({ item, index }: Props) => {
    const isPerson = (item as any).media_type === "person";
    const imagePath = item.poster_path || (item as any).profile_path;
    const uri = imagePath
      ? `https://image.tmdb.org/t/p/w342${imagePath}`
      : undefined;
    const isTv = item.media_type === "tv";
    
    const colIndex = index % COLS;
    const isLeft = colIndex === 0;
    const isRight = colIndex === COLS - 1;
    const isMiddle = colIndex === 1;

    return (
      <View style={[
        styles.gridItem,
        isLeft && { alignItems: 'flex-start' },
        isMiddle && { alignItems: 'center' },
        isRight && { alignItems: 'flex-end' },
      ]}>
        <PosterCard
          width={CARD_W}
          poster={uri}
          title={itemTitle(item)}
          rating={isPerson ? undefined : item.vote_average ?? undefined}
          kind={isPerson ? "person" : isTv ? "tv" : "movie"}
          onPress={() => (isPerson ? openPerson(item.id) : openDetails(item, isTv ? "tv" : "movie"))}
        />
      </View>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.index === nextProps.index &&
      prevProps.item.id === nextProps.item.id &&
      prevProps.item.media_type === nextProps.item.media_type &&
      prevProps.item.poster_path === nextProps.item.poster_path &&
      (prevProps.item as any).profile_path === (nextProps.item as any).profile_path
    );
  }
);

GridItem.displayName = "GridItem";

const styles = StyleSheet.create({
  gridItem: { flex: 1, marginBottom: spacing.lg },
});

export default GridItem;
