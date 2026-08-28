/**
 * RegionPopularRail — the `regionPopular` Home-feed section: "Popular in {country}"
 * of locally-produced content, with a Movies/Series toggle (shared animated
 * KindToggle) so films and serials are browsed SEPARATELY rather than mixed.
 * Region (ISO 3166-1) is server (CF)-detected via /config and defaulted to "IN"
 * on-device; the endpoint fetches both kinds (discover-by-origin-country, quality-
 * floored + per-region flagship language), and the toggle just filters which kind
 * shows. Self-hides only when the region has no content at all / on failure.
 */
import { Ionicons } from "@expo/vector-icons";
import { itemTitle } from "@/utils/tmdbLists";
import { KindToggle, type MediaKind } from "@/components/home/KindToggle";
import { colors, ms, spacing } from "@/theme/bearoom";
import { layout } from "@/theme/styles/layout";
import { useRegionPopularQuery } from "@/src/store/services/tmdbApi";
import { useRegion } from "@/src/store/features/providers/hooks";
import { openDetails } from "@/src/navigation/actions";
import { PosterCard, PosterSkeleton, Text } from "@/src/ui";
import { RAIL_LIST_PROPS } from "@/utils/listPerf";
import React, { useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";

const POSTER_W = ms(112);

// ISO 3166-1 → a readable rail-title name. Fallback = the raw code.
const REGION_NAMES: Record<string, string> = {
  IN: "India", US: "the US", GB: "the UK", CA: "Canada", AU: "Australia",
  JP: "Japan", KR: "South Korea", CN: "China", FR: "France", DE: "Germany",
  ES: "Spain", IT: "Italy", BR: "Brazil", MX: "Mexico", RU: "Russia",
  TR: "Türkiye", ID: "Indonesia", PH: "the Philippines", TH: "Thailand", NG: "Nigeria",
};
function regionName(cc: string): string {
  return REGION_NAMES[cc.toUpperCase()] ?? cc.toUpperCase();
}

export function RegionPopularRail() {
  const region = useRegion();
  const { data: items, isError } = useRegionPopularQuery(region);
  const [activeKind, setActiveKind] = useState<MediaKind>("movie");

  // No local catalogue at all OR failed → hide the whole rail (like MediaRail).
  if (items && items.length === 0) return null;
  if (items === undefined && isError) return null;

  const shown = items?.filter((m) => (m.media_type === "tv" ? "tv" : "movie") === activeKind);

  return (
    <View style={styles.rail}>
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <Ionicons name="location" size={ms(16)} color={colors.honey} />
          <Text variant="h2" style={styles.title} numberOfLines={1}>
            {`Popular in ${regionName(region)}`}
          </Text>
        </View>
        <KindToggle value={activeKind} onChange={setActiveKind} tvLabel="Series" />
      </View>

      {items === undefined ? (
        <View style={styles.skeletonRow}>
          {[0, 1, 2, 3].map((i) => (
            <PosterSkeleton key={i} width={POSTER_W} />
          ))}
        </View>
      ) : shown && shown.length > 0 ? (
        <FlatList
          data={shown}
          horizontal
          keyExtractor={(m) => `${m.media_type}-${m.id}`}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.list}
          {...RAIL_LIST_PROPS}
          renderItem={({ item }) => {
            const kind: MediaKind = item.media_type === "tv" ? "tv" : "movie";
            return (
              <PosterCard
                width={POSTER_W}
                poster={item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : undefined}
                title={itemTitle(item)}
                rating={item.vote_average ?? undefined}
                kind={kind}
                onPress={() => openDetails(item, kind)}
              />
            );
          }}
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
  list: { paddingHorizontal: spacing.lg, gap: layout.railGap },
  skeletonRow: { flexDirection: "row", gap: layout.railGap, paddingHorizontal: spacing.lg },
  placeholder: { height: ms(170) },
});

export default RegionPopularRail;
