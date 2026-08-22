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
import { useHeroQuery } from "@/src/store/services/tmdbApi";
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

const { width } = Dimensions.get("window");
const HERO_H = Math.round(width * 1.12);

export function HeroSkeleton() {
  return (
    <View style={[styles.hero, { justifyContent: "flex-end" }]}>
      {/* Background Shimmer Backdrop */}
      <Shimmer shimmerColors={SHIMMER} style={styles.heroFill} />
      
      {/* Smooth bottom fade into page background */}
      <LinearGradient colors={[...gradients.heroBottom]} style={StyleSheet.absoluteFill} />

      <View style={styles.content}>
        {/* Metadata Chips Placeholder */}
        <View style={styles.chipRow}>
          <Shimmer shimmerColors={SHIMMER} style={styles.chipBoneSmall} />
          <Shimmer shimmerColors={SHIMMER} style={styles.chipBoneSmall} />
          <Shimmer shimmerColors={SHIMMER} style={styles.chipBoneMedium} />
        </View>

        {/* Title Bone */}
        <Shimmer shimmerColors={SHIMMER} style={styles.titleBone} />

        {/* Overview Lines */}
        <Shimmer shimmerColors={SHIMMER} style={styles.overviewBone1} />
        <Shimmer shimmerColors={SHIMMER} style={styles.overviewBone2} />

        {/* Actions Bone */}
        <View style={styles.actions}>
          <Shimmer shimmerColors={SHIMMER} style={styles.playBtnBone} />
          <Shimmer shimmerColors={SHIMMER} style={styles.detailsBtnBone} />
          <Shimmer shimmerColors={SHIMMER} style={styles.togetherBtnBone} />
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

export function HeroCarousel() {
  // Cached hero set (trending, backdrop-only, top 8) — warm across tab focus.
  const { data: items = [] } = useHeroQuery();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<MediaItem>>(null);
  const idxRef = useRef(0);

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

          return (
            <Pressable style={styles.slide} onPress={() => openDetails(item, "movie")}>
              <Image
                source={{ uri: `https://image.tmdb.org/t/p/w780${item.backdrop_path}` }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={300}
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
                </View>

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
                  <Button
                    label="Watch together"
                    icon="paw"
                    variant="ghost"
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
                    size="xs"
                  />
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
  slide: { width, height: HERO_H, justifyContent: "flex-end" },
  content: { paddingHorizontal: spacing.lg, paddingBottom: ms(22) },
  chipRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm - 2, marginBottom: spacing.sm + 2 },
  title: { fontSize: ms(30), letterSpacing: -0.5, marginBottom: spacing.sm - 2 },
  overview: { fontSize: ms(13), lineHeight: ms(19), marginBottom: spacing.lg },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dots: { position: "absolute", top: ms(14), right: ms(14), flexDirection: "row", gap: ms(5) },
  dot: { width: ms(6), height: ms(6), borderRadius: ms(3), backgroundColor: colors.heroDotActive },
  dotActive: { backgroundColor: colors.honey, width: ms(16) },

  // Clean Shimmer Bones
  chipBoneSmall: {
    width: ms(48),
    height: ms(22),
    borderRadius: radius.pill,
  },
  chipBoneMedium: {
    width: ms(60),
    height: ms(22),
    borderRadius: radius.pill,
  },
  titleBone: {
    width: width * 0.65,
    height: ms(30),
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
    width: (width - spacing.lg * 2) * 0.75,
    height: ms(12),
    borderRadius: radius.sm,
    marginBottom: spacing.lg,
  },
  playBtnBone: {
    width: ms(78),
    height: ms(34),
    borderRadius: radius.pill,
  },
  detailsBtnBone: {
    width: ms(88),
    height: ms(34),
    borderRadius: radius.pill,
  },
  togetherBtnBone: {
    width: ms(116),
    height: ms(34),
    borderRadius: radius.pill,
  },
});

export default HeroCarousel;
