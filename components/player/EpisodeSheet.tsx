/**
 * EpisodeSheet — a frosted bottom sheet to switch episodes on a TV show, so shows
 * keep episode navigation now that we hide the provider's own chrome.
 *
 * Uses @gorhom/bottom-sheet (like ProviderSheet) so it's DRAGGABLE between two snap
 * points — a compact peek that extends to near-full when a season has many episodes.
 * It renders a <BottomSheetModal>, so it MUST be mounted under a
 * <BottomSheetModalProvider> (the app root provides one). Imperative, like
 * ProviderSheet:
 *
 *   const ref = useRef<BottomSheetModal>(null);
 *   <EpisodeSheet ref={ref} tmdbId={id} season={s} episode={e} onSelect={…} />
 *   ref.current?.present();
 *
 * Seasons + episodes come from the app's TMDB proxy and are PRELOADED on mount (the
 * parent mounts this only for shows), so the list is ready the instant it opens.
 */
import { colors, font, ms, radius } from "@/theme/bearoom";
import { absoluteFill } from "@/theme/styles/layout";
import { img } from "@/utils/tmdbDetails";
import { useDetailsQuery, useSeasonQuery } from "@/src/store/services/tmdbApi";
import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetModal,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { Image } from "expo-image";
import React, { forwardRef, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from "react-native";

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
  tmdbId: string;
  season?: number;
  episode?: number;
  onSelect: (season: number, episode: number) => void;
}

export const EpisodeSheet = forwardRef<BottomSheetModal, EpisodeSheetProps>(
  ({ tmdbId, season, episode, onSelect }, ref) => {
    const [sel, setSel] = useState<number | null>(season ?? null);

    // Two snap points → the sheet is draggable from a peek to near-full for long seasons.
    const snapPoints = useMemo(() => ["58%", "92%"], []);

    // Seasons from cached show details (RTK Query dedupes with the details screen).
    const { data: d } = useDetailsQuery({ type: "tv", id: tmdbId }, { skip: !tmdbId });
    const seasons = useMemo<Season[]>(
      () => (d?.seasons ?? []).filter((s: Season) => s.season_number > 0 && s.episode_count > 0),
      [d],
    );

    // Default the selected season once seasons load (keep an existing pick).
    useEffect(() => {
      if (!seasons.length) return;
      setSel((cur) => cur ?? season ?? seasons[0]?.season_number ?? 1);
    }, [seasons, season]);

    // Episodes for the selected season — cached per (tmdbId, sel); null while loading.
    const { data: seasonData } = useSeasonQuery(
      { id: tmdbId, season: sel ?? 0 },
      { skip: !tmdbId || sel == null },
    );
    const episodes: Episode[] | null = seasonData ? seasonData.episodes ?? [] : null;

    const dismiss = useCallback(() => {
      if (ref && typeof ref !== "function") ref.current?.dismiss();
    }, [ref]);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          pressBehavior="close"
          opacity={0.6}
        />
      ),
      [],
    );

    const renderItem: ListRenderItem<Episode> = useCallback(
      ({ item }) => {
        const on = sel === season && item.episode_number === episode;
        return (
          <Pressable
            style={[styles.epRow, on && styles.epRowOn]}
            android_ripple={{ color: colors.border }}
            onPress={() => {
              if (sel != null) onSelect(sel, item.episode_number);
              dismiss();
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
      },
      [sel, season, episode, onSelect, dismiss],
    );

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose
        backgroundStyle={styles.sheetBackground}
        backgroundComponent={SheetBackground}
        handleIndicatorStyle={styles.handleIndicator}
        backdropComponent={renderBackdrop}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Episodes</Text>
          <Pressable onPress={dismiss} hitSlop={10} style={styles.closeBtn} accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

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

        <BottomSheetFlatList
          data={episodes ?? []}
          keyExtractor={(e) => String(e.episode_number)}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            episodes == null ? (
              <ActivityIndicator color={colors.honey} style={{ marginVertical: ms(24) }} />
            ) : (
              <Text style={styles.dim}>No episodes found.</Text>
            )
          }
        />
      </BottomSheetModal>
    );
  },
);

EpisodeSheet.displayName = "EpisodeSheet";

/** Solid dark sheet background — NOT a live blur: blurring the playing video behind the
 *  sheet stutters it on the GPU (device-confirmed). */
function SheetBackground({ style }: any) {
  return <View style={[style, styles.sheetBgClip]} />;
}

export default EpisodeSheet;

const styles = StyleSheet.create({
  sheetBackground: { backgroundColor: "transparent" },
  sheetBgClip: {
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    overflow: "hidden",
    backgroundColor: colors.sheetOverlay,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  handleIndicator: { backgroundColor: colors.borderStrong, width: ms(40) },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: ms(18),
    paddingTop: ms(2),
    paddingBottom: ms(8),
  },
  title: { color: colors.text, fontFamily: font.headline, fontSize: ms(17) },
  closeBtn: { padding: ms(4) },

  seasonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: ms(8),
    paddingHorizontal: ms(18),
    paddingBottom: ms(8),
  },
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

  listContent: { paddingHorizontal: ms(18), paddingBottom: ms(32) },
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
    ...absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.episodeActive,
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
