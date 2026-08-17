/**
 * Auto-rotating featured hero for the top of the home screen.
 */
import { defaultHijackProvider } from "@/components/player/providerRegistry";
import { itemTitle, itemType, itemYear, type MediaItem } from "@/utils/tmdbLists";
import { colors, glow, ms, radius, spacing } from "@/theme/bearoom";
import { gradients } from "@/theme/styles/gradients";
import { pressedStyle } from "@/theme/styles/interaction";
import { genRoomCode } from "@/utils/roomCode";
import { Badge, Button, Text } from "@/src/ui";
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

const { width } = Dimensions.get("window");
const HERO_H = Math.round(width * 1.12);

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
    return <View style={[styles.hero, styles.skeleton]} />;
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
                    <Badge label={item.vote_average.toFixed(1)} tone="default" icon="star" />
                  ) : null}
                  {itemYear(item) ? <Badge label={String(itemYear(item))} tone="muted" /> : null}
                  <Badge label={type === "tv" ? "Series" : "Movie"} tone="muted" />
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
  skeleton: { backgroundColor: colors.bgElevated },
  slide: { width, height: HERO_H, justifyContent: "flex-end" },
  content: { paddingHorizontal: spacing.lg, paddingBottom: ms(22) },
  chipRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm - 2, marginBottom: spacing.sm + 2 },
  title: { fontSize: ms(30), letterSpacing: -0.5, marginBottom: spacing.sm - 2 },
  overview: { fontSize: ms(13), lineHeight: ms(19), marginBottom: spacing.lg },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  togetherBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  dots: { position: "absolute", top: ms(14), right: ms(14), flexDirection: "row", gap: ms(5) },
  dot: { width: ms(6), height: ms(6), borderRadius: ms(3), backgroundColor: colors.heroDotActive },
  dotActive: { backgroundColor: colors.honey, width: ms(16) },
});

export default HeroCarousel;
