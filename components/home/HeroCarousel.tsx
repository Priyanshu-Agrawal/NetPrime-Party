/**
 * Auto-rotating featured hero for the top of the home screen.
 */
import { defaultHijackProvider } from "@/components/player/providerRegistry";
import { itemTitle, itemType, itemYear, type MediaItem } from "@/utils/tmdbLists";
import { colors, font, glow, ms, radius, spacing } from "@/theme/bearoom";
import { gradients } from "@/theme/styles/gradients";
import { pressedStyle } from "@/theme/styles/interaction";
import { genRoomCode } from "@/utils/roomCode";
import { Button, GlassChip, Text } from "@/src/ui";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { loadHero } from "@/src/features/home/tmdbCache";
import { openDetails, openPartyHost, openPlayer } from "@/src/navigation/actions";
import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { createShimmerPlaceholder } from "react-native-shimmer-placeholder";

const Shimmer = createShimmerPlaceholder(LinearGradient);
const SHIMMER = [...gradients.shimmerDark];
const SHIMMER_HONEY = [...gradients.shimmerHoney];

const { width } = Dimensions.get("window");
const HERO_H = Math.round(width * 1.12);

export function HeroSkeleton() {
  return (
    <View style={styles.hero}>
      {/* Background Shimmer Backdrop */}
      <Shimmer shimmerColors={SHIMMER} style={styles.heroFill} />

      {/* Ambient Warm Cinema Glow */}
      <View style={styles.ambientGlow} pointerEvents="none" />

      {/* Cinematic Vignette Gradients */}
      <LinearGradient colors={[...gradients.heroBottom]} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={[...gradients.heroTop]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.content}>
        {/* Metadata Chips Bone Row */}
        <View style={styles.chipRow}>
          <View style={styles.glassChipSkeleton}>
            <Ionicons name="star" size={ms(11)} color={colors.honey} style={{ marginRight: ms(4) }} />
            <Shimmer shimmerColors={SHIMMER_HONEY} style={styles.chipTextBoneSmall} />
          </View>
          <View style={styles.glassChipSkeleton}>
            <Shimmer shimmerColors={SHIMMER} style={styles.chipTextBoneSmall} />
          </View>
          <View style={styles.glassChipSkeleton}>
            <Shimmer shimmerColors={SHIMMER} style={styles.chipTextBoneMedium} />
          </View>
          <View style={styles.glassChipSkeleton}>
            <Shimmer shimmerColors={SHIMMER} style={styles.chipTextBoneSmall} />
          </View>
        </View>

        {/* Genre Line Skeleton */}
        <View style={styles.genreSkeletonRow}>
          <Shimmer shimmerColors={SHIMMER_HONEY} style={styles.genreBone1} />
          <View style={styles.genreDot} />
          <Shimmer shimmerColors={SHIMMER_HONEY} style={styles.genreBone2} />
        </View>

        {/* Title Bone */}
        <Shimmer shimmerColors={SHIMMER} style={styles.titleBone} />

        {/* Overview Lines */}
        <Shimmer shimmerColors={SHIMMER} style={styles.overviewBone1} />
        <Shimmer shimmerColors={SHIMMER} style={styles.overviewBone2} />

        {/* Action Buttons Skeleton */}
        <View style={styles.actions}>
          <View style={styles.playBtnSkeleton}>
            <Ionicons name="play" size={ms(14)} color={colors.onHoney} style={{ marginRight: ms(4) }} />
            <Shimmer shimmerColors={SHIMMER_HONEY} style={styles.btnTextBone} />
          </View>
          <View style={styles.glassBtnSkeleton}>
            <Ionicons name="information-circle-outline" size={ms(14)} color={colors.textDim} style={{ marginRight: ms(4) }} />
            <Shimmer shimmerColors={SHIMMER} style={styles.btnTextBone} />
          </View>
          <View style={styles.togetherBtnSkeleton}>
            <Ionicons name="paw" size={ms(14)} color={colors.honey} style={{ marginRight: ms(4) }} />
            <Shimmer shimmerColors={SHIMMER_HONEY} style={styles.togetherTextBone} />
          </View>
        </View>
      </View>

      {/* Top Right Dots Placeholder */}
      <View style={styles.dots}>
        <View style={[styles.dot, styles.dotActive]} />
        <View style={styles.dot} />
        <View style={styles.dot} />
      </View>
    </View>
  );
}

const GENRE_MAP: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Doc",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Sci-Fi",
  10770: "Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
  10759: "Action",
  10762: "Kids",
  10765: "Sci-Fi",
};

export function HeroCarousel() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<MediaItem>>(null);
  const idxRef = useRef(0);

  useEffect(() => {
    let aborted = false;
    loadHero()
      .then((r) => !aborted && setItems(r))
      .catch(() => {});
    return () => {
      aborted = true;
    };
  }, []);

  useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(() => {
      const next = (idxRef.current + 1) % items.length;
      listRef.current?.scrollToOffset({ offset: next * width, animated: true });
      idxRef.current = next;
      setIndex(next);
    }, 6000);
    return () => clearInterval(t);
  }, [items.length]);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    idxRef.current = i;
    setIndex(i);
  };

  const play = (item: MediaItem) => {
    const type = itemType(item, "movie");
    if (type === "movie") {
      openPlayer({
        id: String(item.id),
        type: "movie",
        title: itemTitle(item),
        poster_path: item.poster_path || "",
        year: itemYear(item),
      });
    } else {
      openDetails(item, "tv");
    }
  };

  if (items.length === 0) {
    return <HeroSkeleton />;
  }

  return (
    <View style={styles.hero}>
      <FlatList
        ref={listRef}
        data={items}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(m) => String(m.id)}
        onMomentumScrollEnd={onScrollEnd}
        renderItem={({ item }) => {
          const type = itemType(item, "movie");
          const genres = (item.genre_ids || [])
            .map((id) => GENRE_MAP[id])
            .filter(Boolean)
            .slice(0, 2);

          return (
            <Pressable style={styles.slide} onPress={() => openDetails(item, "movie")}>
              <Image
                source={{ uri: `https://image.tmdb.org/t/p/w780${item.backdrop_path}` }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={400}
              />
              <LinearGradient colors={[...gradients.heroBottom]} style={StyleSheet.absoluteFill} />
              <LinearGradient
                colors={[...gradients.heroTop]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.content}>
                <View style={styles.chipRow}>
                  {item.vote_average ? (
                    <GlassChip label={item.vote_average.toFixed(1)} icon="star" blur />
                  ) : null}
                  {itemYear(item) ? (
                    <GlassChip label={String(itemYear(item))} blur />
                  ) : null}
                  <GlassChip label={type === "tv" ? "Series" : "Movie"} blur />
                  <GlassChip label="4K UHD" blur />
                </View>

                {genres.length > 0 ? (
                  <Text variant="caption" style={styles.genresText}>
                    {genres.join("  •  ")}
                  </Text>
                ) : null}

                <Text variant="display" style={styles.title} numberOfLines={2}>
                  {itemTitle(item)}
                </Text>
                {item.overview ? (
                  <Text variant="bodyDim" style={styles.overview} numberOfLines={3}>
                    {item.overview}
                  </Text>
                ) : null}
                <View style={styles.actions}>
                  <Button label="Play" icon="play" onPress={() => play(item)} size="xs" />
                  <Button
                    label="Details"
                    icon="information-circle-outline"
                    variant="glass"
                    onPress={() => openDetails(item, "movie")}
                    size="xs"
                    glowing={false}
                  />
                  <Pressable
                    style={({ pressed }) => [styles.togetherBtn, pressed && pressedStyle]}
                    onPress={() =>
                      openPartyHost({
                        role: "host",
                        room: genRoomCode(),
                        provider: defaultHijackProvider()?.id,
                        id: String(item.id),
                        type: itemType(item, "movie"),
                        title: itemTitle(item),
                      })
                    }
                    hitSlop={8}
                  >
                    <Ionicons name="paw" size={ms(14)} color={colors.honey} />
                    <Text variant="caption" honey>
                      Watch together
                    </Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          );
        }}
      />
      <View style={styles.dots}>
        {items.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { width, height: HERO_H },
  heroFill: { position: "absolute", top: 0, left: 0, width, height: HERO_H },
  ambientGlow: {
    position: "absolute",
    top: HERO_H * 0.35,
    left: width * 0.15,
    width: width * 0.7,
    height: HERO_H * 0.45,
    borderRadius: HERO_H * 0.25,
    backgroundColor: "rgba(240,169,60,0.06)",
  },
  slide: { width, height: HERO_H, justifyContent: "flex-end" },
  content: { paddingHorizontal: spacing.lg, paddingBottom: ms(22) },
  chipRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm - 2, marginBottom: spacing.sm },
  genresText: {
    color: colors.honey,
    fontFamily: font.label,
    fontSize: ms(11),
    letterSpacing: 0.8,
    marginBottom: ms(6),
    textTransform: "uppercase",
  },
  title: { fontSize: ms(30), letterSpacing: -0.5, marginBottom: spacing.sm - 2 },
  overview: { fontSize: ms(13), lineHeight: ms(19), marginBottom: spacing.lg },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  togetherBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  dots: { position: "absolute", top: ms(14), right: ms(14), flexDirection: "row", gap: ms(5) },
  dot: { width: ms(6), height: ms(6), borderRadius: ms(3), backgroundColor: colors.heroDotActive },
  dotActive: { backgroundColor: colors.honey, width: ms(16) },

  // High-Fidelity Skeleton Elements
  glassChipSkeleton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: ms(8),
    paddingVertical: ms(4),
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  chipTextBoneSmall: {
    width: ms(28),
    height: ms(12),
    borderRadius: radius.sm,
  },
  chipTextBoneMedium: {
    width: ms(38),
    height: ms(12),
    borderRadius: radius.sm,
  },
  genreSkeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(6),
    marginBottom: ms(8),
  },
  genreBone1: {
    width: ms(46),
    height: ms(10),
    borderRadius: radius.sm,
  },
  genreDot: {
    width: ms(3),
    height: ms(3),
    borderRadius: ms(2),
    backgroundColor: colors.honey,
    opacity: 0.6,
  },
  genreBone2: {
    width: ms(54),
    height: ms(10),
    borderRadius: radius.sm,
  },
  titleBone: {
    width: width * 0.68,
    height: ms(32),
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
  },
  overviewBone1: {
    width: width - spacing.lg * 2,
    height: ms(12),
    borderRadius: radius.sm,
    marginBottom: ms(6),
  },
  overviewBone2: {
    width: (width - spacing.lg * 2) * 0.72,
    height: ms(12),
    borderRadius: radius.sm,
    marginBottom: spacing.lg,
  },
  playBtnSkeleton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: ms(16),
    paddingVertical: ms(8),
    borderRadius: radius.pill,
    backgroundColor: colors.honeySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.honey,
    ...glow.honey,
  },
  btnTextBone: {
    width: ms(32),
    height: ms(12),
    borderRadius: radius.sm,
  },
  glassBtnSkeleton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: ms(14),
    paddingVertical: ms(8),
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  togetherBtnSkeleton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: ms(12),
    paddingVertical: ms(8),
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.honeySoft,
  },
  togetherTextBone: {
    width: ms(64),
    height: ms(12),
    borderRadius: radius.sm,
  },
});

export default HeroCarousel;
