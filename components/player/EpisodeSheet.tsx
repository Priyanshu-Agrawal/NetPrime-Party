/**
 * EpisodeSheet — a frosted bottom sheet to switch episodes on a TV show, so shows
 * keep episode navigation now that we hide the provider's own chrome. Seasons +
 * episodes come from the app's TMDB proxy (same source as the details screen).
 */
import GlassCard from "@/components/ui/GlassCard";
import { API_HEADERS, API_URL } from "@/contexts/movieContext/movieContext";
import { colors, font, ms, radius } from "@/theme/bearoom";
import { fetchDetails, img } from "@/utils/tmdbDetails";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Season {
  season_number: number;
  episode_count: number;
}
interface Episode {
  episode_number: number;
  name?: string;
  still_path?: string;
  overview?: string;
  runtime?: number;
}

export interface EpisodeSheetProps {
  visible: boolean;
  onClose: () => void;
  tmdbId: string;
  season?: number;
  episode?: number;
  onSelect: (season: number, episode: number) => void;
}

export default function EpisodeSheet({
  visible,
  onClose,
  tmdbId,
  season,
  episode,
  onSelect,
}: EpisodeSheetProps) {
  const insets = useSafeAreaInsets();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [sel, setSel] = useState<number | null>(season ?? null);
  const [episodes, setEpisodes] = useState<Episode[] | null>(null);

  // Seasons (once, when opened).
  useEffect(() => {
    if (!visible || !tmdbId) return;
    let aborted = false;
    void fetchDetails("tv", tmdbId)
      .then((d: { seasons?: Season[] }) => {
        if (aborted) return;
        const ss = (d?.seasons ?? []).filter((s) => s.season_number > 0 && s.episode_count > 0);
        setSeasons(ss);
        setSel((cur) => cur ?? season ?? ss[0]?.season_number ?? 1);
      })
      .catch(() => {});
    return () => {
      aborted = true;
    };
  }, [visible, tmdbId, season]);

  // Episodes for the selected season.
  useEffect(() => {
    if (!visible || !tmdbId || sel == null) return;
    let aborted = false;
    setEpisodes(null);
    fetch(`${API_URL}tv/${tmdbId}/season/${sel}?language=en-US`, { headers: API_HEADERS })
      .then((r) => r.json())
      .then((d: { episodes?: Episode[] }) => !aborted && setEpisodes(d?.episodes ?? []))
      .catch(() => !aborted && setEpisodes([]));
    return () => {
      aborted = true;
    };
  }, [visible, tmdbId, sel]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.wrap} onPress={() => {}}>
          <GlassCard blur rounded={radius.xxl} bordered>
            <View style={[styles.inner, { paddingBottom: Math.max(insets.bottom, ms(16)) }]}>
              <View style={styles.handle} />
              <Text style={styles.title}>Episodes</Text>

              <View style={styles.seasonRow}>
                {seasons.map((s) => {
                  const on = s.season_number === sel;
                  return (
                    <Pressable
                      key={s.season_number}
                      style={[styles.chip, on && styles.chipOn]}
                      onPress={() => setSel(s.season_number)}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>S{s.season_number}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {episodes == null ? (
                <ActivityIndicator color={colors.honey} style={{ marginVertical: ms(24) }} />
              ) : (
                <FlatList
                  data={episodes}
                  keyExtractor={(e) => String(e.episode_number)}
                  style={styles.list}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => {
                    const on = sel === season && item.episode_number === episode;
                    return (
                      <Pressable
                        style={[styles.epRow, on && styles.epRowOn]}
                        onPress={() => {
                          if (sel != null) onSelect(sel, item.episode_number);
                          onClose();
                        }}
                      >
                        <View style={styles.thumbWrap}>
                          <Image
                            source={img(item.still_path, "w300")}
                            style={styles.thumb}
                            contentFit="cover"
                            transition={150}
                          />
                          {on ? (
                            <View style={styles.thumbPlaying}>
                              <Ionicons name="play" size={ms(16)} color={colors.onHoney} />
                            </View>
                          ) : null}
                        </View>
                        <View style={styles.epInfo}>
                          <View style={styles.epTitleRow}>
                            <Text style={[styles.epName, on && styles.epNameOn]} numberOfLines={1}>
                              {item.episode_number}. {item.name || `Episode ${item.episode_number}`}
                            </Text>
                            {item.runtime ? <Text style={styles.epRuntime}>{item.runtime}m</Text> : null}
                          </View>
                          {item.overview ? (
                            <Text style={styles.epOverview} numberOfLines={2}>
                              {item.overview}
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  }}
                  ListEmptyComponent={<Text style={styles.dim}>No episodes found.</Text>}
                />
              )}
            </View>
          </GlassCard>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(8,6,4,0.55)", justifyContent: "flex-end" },
  wrap: { paddingHorizontal: ms(10), paddingBottom: ms(10) },
  inner: { paddingHorizontal: ms(18), paddingTop: ms(10) },
  handle: {
    alignSelf: "center",
    width: ms(38),
    height: ms(4),
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: ms(12),
  },
  title: { color: colors.text, fontFamily: font.headline, fontSize: ms(17) },
  seasonRow: { flexDirection: "row", flexWrap: "wrap", gap: ms(8), marginTop: ms(14), marginBottom: ms(6) },
  chip: {
    paddingHorizontal: ms(14),
    paddingVertical: ms(8),
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  chipOn: { backgroundColor: colors.honeySoft, borderColor: colors.honey },
  chipText: { color: colors.text, fontFamily: font.bodySemi, fontSize: ms(13) },
  chipTextOn: { color: colors.honey },
  list: { maxHeight: ms(300), marginTop: ms(6) },
  epRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: ms(11),
    paddingVertical: ms(9),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  epRowOn: {},
  thumbWrap: {
    width: ms(112),
    height: ms(63),
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: colors.surfaceStrong,
  },
  thumb: { width: "100%", height: "100%" },
  thumbPlaying: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(240,169,60,0.34)",
  },
  epInfo: { flex: 1, paddingTop: ms(1) },
  epTitleRow: { flexDirection: "row", alignItems: "center", gap: ms(8) },
  epName: { flex: 1, color: colors.text, fontFamily: font.bodySemi, fontSize: ms(13) },
  epNameOn: { color: colors.honey },
  epRuntime: { color: colors.textDim, fontFamily: font.label, fontSize: ms(10) },
  epOverview: {
    color: colors.textDim,
    fontFamily: font.body,
    fontSize: ms(11),
    lineHeight: ms(15),
    marginTop: ms(3),
  },
  dim: { color: colors.textFaint, fontFamily: font.body, fontSize: ms(13), paddingVertical: ms(16) },
});
