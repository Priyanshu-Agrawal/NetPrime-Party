/**
 * FranchisesRail (D2) — a horizontal rail of curated TMDB collections
 * ("franchises"). Cards show the collection poster + name and open the
 * Collection screen. Fed by the server-driven `franchises` feed section
 * (`collectionIds`), so the set is editable without an app release.
 *
 * Uses ONE `useCollectionsQuery(ids)` (parallel fetch + poster filter) rather
 * than N per-card hooks. Self-hides when nothing resolves.
 */
import { openCollection } from "@/src/navigation/actions";
import { useCollectionsQuery } from "@/src/store/services/tmdbApi";
import { useFranchisesQuery } from "@/src/store/services/workerApi";
import { getSeenCollectionIds } from "@/utils/collectionMemory";
import { PosterCard, PosterSkeleton, SectionHeader } from "@/src/ui";
import { RAIL_LIST_PROPS } from "@/utils/listPerf";
import { ms, spacing } from "@/theme/bearoom";
import { layout } from "@/theme/styles/layout";
import React from "react";
import { FlatList, StyleSheet, View } from "react-native";

const POSTER_W = ms(112);
const DYNAMIC_CAP = 16;

export function FranchisesRail({
  ids,
  title,
  dynamic,
}: {
  ids: number[];
  title?: string;
  dynamic?: boolean;
}) {
  // Dynamic rail = curated seed ∪ TMDB-popular harvest (A, from the worker's
  // /franchises) ∪ the user's opened collections (B), deduped, seed-first (curated
  // quality leads). The harvest is skipped entirely for a plain curated rail.
  const { data: harvested } = useFranchisesQuery(undefined, {
    skip: !dynamic,
    // Refetch on remount when the copy is >15min old — also recovers a cached error
    // (e.g. a 404 cached before the worker's /franchises was deployed), so the harvest
    // self-heals without needing an app restart.
    refetchOnMountOrArgChange: 900,
  });
  const mergedIds = React.useMemo(() => {
    if (!dynamic) return ids ?? [];
    const seen = new Set<number>();
    const out: number[] = [];
    for (const id of [...(ids ?? []), ...(harvested ?? []), ...getSeenCollectionIds()]) {
      if (typeof id === "number" && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
    return out.slice(0, DYNAMIC_CAP);
  }, [ids, harvested, dynamic]);

  const { data: cards, isError } = useCollectionsQuery(mergedIds);

  if (!mergedIds.length) return null;
  if (cards && cards.length === 0) return null;
  if (cards === undefined && isError) return null;

  return (
    <View style={styles.rail}>
      <SectionHeader title={title ?? "Franchises"} icon="albums" />
      {cards === undefined ? (
        <View style={styles.skeletonRow}>
          {[0, 1, 2, 3].map((i) => (
            <PosterSkeleton key={i} width={POSTER_W} />
          ))}
        </View>
      ) : (
        <FlatList
          data={cards}
          horizontal
          keyExtractor={(c) => String(c.id)}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.list}
          {...RAIL_LIST_PROPS}
          renderItem={({ item }) => (
            <PosterCard
              width={POSTER_W}
              poster={item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : undefined}
              title={item.name}
              onPress={() => openCollection(item.id)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { marginTop: spacing.xl },
  list: { paddingHorizontal: spacing.lg, gap: layout.railGap },
  skeletonRow: { flexDirection: "row", gap: layout.railGap, paddingHorizontal: spacing.lg },
});

export default FranchisesRail;
