/**
 * "Recommended for you" home rail — blended recommendations from the last few
 * titles in local watch history. Uses the light recommendations endpoint per seed
 * (recs-only, `similar` fallback — NOT the heavy details payload), then merges +
 * de-dupes + drops already-watched via `blendRecs`, ranked by cross-seed frequency
 * then rating. Self-hiding: renders `null` when the pref is off, there's no
 * history, or nothing blends out.
 */
import { openDetails } from "@/src/navigation/actions";
import { PosterCard, SectionHeader } from "@/src/ui";
import { useRecommendationsQuery } from "@/src/store/services/tmdbApi";
import { blendRecs, type RecCandidate } from "@/utils/blendRecs";
import { img } from "@/utils/tmdbDetails";
import { getWatchHistory, type HistoryItem } from "@/utils/history";
import { getPersonalRecs } from "@/utils/prefs";
import { ms, spacing } from "@/theme/bearoom";
import { skipToken } from "@reduxjs/toolkit/query";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { RAIL_LIST_PROPS } from "@/utils/listPerf";

const POSTER_W = ms(112);
const MAX_SEEDS = 4;

const seedType = (h: HistoryItem): "movie" | "tv" => (h.type === "tv" ? "tv" : "movie");

export function BecauseYouWatchedRail() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [enabled, setEnabled] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setEnabled(getPersonalRecs());
      getWatchHistory()
        .then((list: HistoryItem[]) => {
          if (!active) return;
          const sorted = [...list]
            .filter((i) => i.id)
            .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
          setHistory(sorted);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, []),
  );

  const seeds = history.slice(0, MAX_SEEDS);

  // Fixed-count light recs queries (hooks can't loop) — skipToken for empty slots.
  // RTK-cached per (type,id); each is a small rec list, not the heavy details payload.
  const q0 = useRecommendationsQuery(seeds[0] ? { type: seedType(seeds[0]), id: seeds[0].id } : skipToken);
  const q1 = useRecommendationsQuery(seeds[1] ? { type: seedType(seeds[1]), id: seeds[1].id } : skipToken);
  const q2 = useRecommendationsQuery(seeds[2] ? { type: seedType(seeds[2]), id: seeds[2].id } : skipToken);
  const q3 = useRecommendationsQuery(seeds[3] ? { type: seedType(seeds[3]), id: seeds[3].id } : skipToken);

  const excludeIds = useMemo(
    () => new Set(history.map((h) => Number(h.id)).filter((n) => !Number.isNaN(n))),
    [history],
  );

  const items = useMemo(() => {
    const recsOf = (data: unknown, seed?: HistoryItem): RecCandidate[] => {
      if (!seed || !Array.isArray(data)) return [];
      const t = seedType(seed);
      return (data as any[]).map((r) => ({ ...r, media_type: r.media_type ?? t }));
    };
    const lists = [
      recsOf(q0.data, seeds[0]),
      recsOf(q1.data, seeds[1]),
      recsOf(q2.data, seeds[2]),
      recsOf(q3.data, seeds[3]),
    ];
    return blendRecs(lists, excludeIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q0.data, q1.data, q2.data, q3.data, excludeIds]);

  if (!enabled || seeds.length === 0 || items.length === 0) return null; // self-hide

  return (
    <View style={{ marginTop: spacing.lg }}>
      <SectionHeader title="Recommended for you" icon="sparkles" />
      <FlatList
        data={items}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}
        {...RAIL_LIST_PROPS}
        renderItem={({ item }) => {
          const kind = item.media_type === "tv" ? "tv" : "movie";
          return (
            <PosterCard
              width={POSTER_W}
              poster={img(item.poster_path, "w342") ?? undefined}
              title={item.title || item.name}
              rating={item.vote_average ?? undefined}
              kind={kind}
              onPress={() => openDetails({ id: item.id, media_type: kind }, kind)}
            />
          );
        }}
      />
    </View>
  );
}

export default BecauseYouWatchedRail;
