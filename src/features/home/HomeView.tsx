import { ContinueWatching } from "@/components/home/ContinueWatching";
import { HeroCarousel } from "@/components/home/HeroCarousel";
import { MediaRail } from "@/components/home/MediaRail";
import AppHeader from "@/components/ui/AppHeader";
import { useFadeInStyle } from "@/components/ui/useCollapsingHeader";
import { openJoinParty, openLibrary } from "@/src/navigation/actions";
import { GlassCard, Text } from "@/src/ui";
import { colors, font, glow, ms, radius, spacing } from "@/theme/bearoom";
import { gradients } from "@/theme/styles/gradients";
import { pressedStyle } from "@/theme/styles/interaction";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import Animated, { useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type CategoryFilter = "all" | "movies" | "series" | "trending" | "topRated";

const CATEGORIES: { id: CategoryFilter; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: "all", label: "All", icon: "sparkles" },
  { id: "movies", label: "Movies", icon: "film-outline" },
  { id: "series", label: "Series", icon: "tv-outline" },
  { id: "trending", label: "Trending", icon: "flame-outline" },
  { id: "topRated", label: "Top Rated", icon: "star-outline" },
];

export default React.memo(function HomePage() {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const [filter, setFilter] = useState<CategoryFilter>("all");

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const headerBlurStyle = useFadeInStyle(scrollY, 24, 120);

  const handleFilterChange = (id: CategoryFilter) => {
    void Haptics.selectionAsync();
    setFilter(id);
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" translucent />

      <Animated.ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: ms(108) }}
      >
        <HeroCarousel />

        <View style={styles.ctaWrap}>
          <GlassCard
            blur={false}
            rounded={radius.lg}
            padded={spacing.sm + 2}
            style={styles.cta}
          >
            <View style={styles.ctaRow}>
              <View style={styles.ctaIcon}>
                <Ionicons name="people" size={ms(16)} color={colors.honey} />
              </View>
              <View style={styles.ctaText}>
                <Text variant="label" style={styles.ctaTitle}>
                  Start a watch party
                </Text>
                <Text variant="caption" style={styles.ctaSub}>
                  Watch in sync with your pack, anywhere.
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.ctaBtn, pressed && pressedStyle]}
                onPress={openJoinParty}
                hitSlop={6}
              >
                <Text variant="caption" honey style={styles.ctaBtnText}>
                  Join now
                </Text>
              </Pressable>
            </View>
          </GlassCard>
        </View>

        {/* Quick Category / Mood Filter Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryPills}
        >
          {CATEGORIES.map((cat) => {
            const active = cat.id === filter;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[styles.categoryPill, active && styles.categoryPillActive]}
                onPress={() => handleFilterChange(cat.id)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={cat.icon}
                  size={ms(13)}
                  color={active ? colors.onHoney : colors.textDim}
                  style={{ marginRight: ms(4) }}
                />
                <Text style={[styles.categoryPillText, active && styles.categoryPillTextActive]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <ContinueWatching />

        {(filter === "all" || filter === "trending" || filter === "series") && (
          <MediaRail
            title="Trending Shows"
            path="trending/tv/week"
            kind="tv"
            icon="flame"
            onSeeAll={() => openLibrary("TrendingShows")}
          />
        )}

        {(filter === "all" || filter === "movies") && (
          <MediaRail title="Now Playing" path="movie/now_playing" kind="movie" />
        )}

        {(filter === "all" || filter === "movies" || filter === "trending") && (
          <MediaRail title="Popular Movies" path="movie/popular" kind="movie" />
        )}

        {(filter === "all" || filter === "movies" || filter === "topRated") && (
          <MediaRail title="Top Rated Movies" path="movie/top_rated" kind="movie" icon="star" />
        )}

        {(filter === "all" || filter === "movies") && (
          <MediaRail title="Upcoming" path="movie/upcoming" kind="movie" />
        )}

        {(filter === "all" || filter === "series" || filter === "trending") && (
          <MediaRail title="Popular Series" path="tv/popular" kind="tv" />
        )}

        {(filter === "all" || filter === "series" || filter === "topRated") && (
          <MediaRail title="Top Rated Series" path="tv/top_rated" kind="tv" icon="star" />
        )}

        {(filter === "all" || filter === "series") && (
          <MediaRail title="Airing Today" path="tv/airing_today" kind="tv" />
        )}
      </Animated.ScrollView>

      <View style={[styles.topBarBg, { paddingTop: insets.top }]} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, headerBlurStyle]}>
          <BlurView
            intensity={40}
            tint="dark"
            experimentalBlurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.headerBgLine} />
        </Animated.View>
        <LinearGradient
          colors={[...gradients.headerFade]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <AppHeader />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },

  topBarBg: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    overflow: "hidden",
  },
  headerBgLine: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },

  ctaWrap: { paddingHorizontal: spacing.lg, marginTop: -ms(10) },
  cta: { backgroundColor: colors.surfaceStrong },
  ctaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm + 2 },
  ctaIcon: {
    width: ms(32),
    height: ms(32),
    borderRadius: radius.pill,
    backgroundColor: colors.honeySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { flex: 1, gap: ms(1) },
  ctaTitle: { fontSize: ms(13) },
  ctaSub: { fontSize: ms(11), lineHeight: ms(14) },
  ctaBtn: {
    backgroundColor: colors.honeySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.honey,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
  },
  ctaBtnText: { fontSize: ms(11) },

  categoryPills: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    gap: ms(8),
  },
  categoryPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: ms(14),
    paddingVertical: ms(7),
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  categoryPillActive: {
    backgroundColor: colors.honey,
    borderColor: colors.honey,
    ...glow.honey,
  },
  categoryPillText: {
    color: colors.textDim,
    fontFamily: font.label,
    fontSize: ms(12),
  },
  categoryPillTextActive: {
    color: colors.onHoney,
    fontFamily: font.headline,
  },
});
