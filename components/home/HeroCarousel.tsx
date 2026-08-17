/**
 * Auto-rotating featured hero for the top of the home screen — a swipeable,
 * self-advancing spotlight of trending titles with backdrop, rating, overview
 * and quick Play / Details / Watch-together actions. Bearoom cozy-cinema skin:
 * warm charcoal scrims, glass meta chips, honey primary action.
 */
import { defaultHijackProvider } from "@/components/player/providerRegistry";
import {
  fetchList,
  itemTitle,
  itemType,
  itemYear,
  type MediaItem,
} from "@/utils/tmdbLists";
import { colors, ms, font, glow, radius } from "@/theme/bearoom";
import { genRoomCode } from "@/utils/roomCode";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { navigate, navigateDetails } from "@/src/navigation/navigationRef";
import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
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
    fetchList("trending/all/week")
      .then((r) => !aborted && setItems(r.filter((m) => m.backdrop_path).slice(0, 8)))
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
      navigate("PlayerStack", {
        screen: "Player",
        params: {
          id: String(item.id),
          type: "movie",
          title: itemTitle(item),
          poster_path: item.poster_path || "",
          year: itemYear(item),
        },
      });
    } else {
      navigateDetails(item, "tv");
    }
  };

  const openDetails = (item: MediaItem, fallback: "movie" | "tv") => {
    navigateDetails(item, fallback);
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
            <Pressable
              style={styles.slide}
              onPress={() => openDetails(item, "movie")}
            >
              <Image
                source={{ uri: `https://image.tmdb.org/t/p/w780${item.backdrop_path}` }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={400}
              />
              <LinearGradient
                colors={["transparent", "rgba(16,13,10,0.7)", colors.bg]}
                style={StyleSheet.absoluteFill}
              />
              <LinearGradient
                colors={["rgba(16,13,10,0.8)", "transparent"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.content}>
                <View style={styles.chipRow}>
                  {item.vote_average ? (
                    <View style={styles.chip}>
                      <Ionicons name="star" size={11} color={colors.honey} />
                      <Text style={styles.chipText}>{item.vote_average.toFixed(1)}</Text>
                    </View>
                  ) : null}
                  {itemYear(item) ? (
                    <View style={styles.chip}>
                      <Text style={styles.chipText}>{itemYear(item)}</Text>
                    </View>
                  ) : null}
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>{type === "tv" ? "Series" : "Movie"}</Text>
                  </View>
                </View>
                <Text style={styles.title} numberOfLines={2}>
                  {itemTitle(item)}
                </Text>
                {item.overview ? (
                  <Text style={styles.overview} numberOfLines={3}>
                    {item.overview}
                  </Text>
                ) : null}
                <View style={styles.actions}>
                  <Pressable
                    style={({ pressed }) => [styles.playBtn, pressed && styles.pressed]}
                    onPress={() => play(item)}
                  >
                    <Ionicons name="play" size={18} color={colors.onHoney} />
                    <Text style={styles.playText}>Play</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.infoBtn, pressed && styles.pressed]}
                    onPress={() => openDetails(item, "movie")}
                  >
                    <Ionicons name="information-circle-outline" size={18} color={colors.text} />
                    <Text style={styles.infoText}>Details</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.togetherBtn, pressed && styles.pressed]}
                    onPress={() =>
                      navigate("Party", {
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
                    <Ionicons name="paw" size={14} color={colors.honey} />
                    <Text style={styles.togetherText}>Watch together</Text>
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
  content: { paddingHorizontal: 16, paddingBottom: 22 },
  chipRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  chipText: {
    color: colors.text,
    fontFamily: font.label,
    fontSize: ms(10),
    letterSpacing: 0.3,
  },
  title: {
    color: colors.text,
    fontFamily: font.headlineXbold,
    fontSize: ms(30),
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  overview: {
    color: colors.textDim,
    fontFamily: font.body,
    fontSize: ms(13),
    lineHeight: 19,
    marginBottom: 16,
  },
  actions: { flexDirection: "row", alignItems: "center", gap: 10 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.97 }] },
  playBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.honey,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: radius.pill,
    ...glow.honey,
  },
  playText: { color: colors.onHoney, fontFamily: font.headlineSemi, fontSize: ms(14) },
  infoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: radius.pill,
  },
  infoText: { color: colors.text, fontFamily: font.bodySemi, fontSize: ms(14) },
  togetherBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  togetherText: { color: colors.honey, fontFamily: font.bodySemi, fontSize: ms(12) },
  dots: {
    position: "absolute",
    top: 14,
    right: 14,
    flexDirection: "row",
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(246,239,227,0.4)",
  },
  dotActive: { backgroundColor: colors.honey, width: 16 },
});

export default HeroCarousel;
