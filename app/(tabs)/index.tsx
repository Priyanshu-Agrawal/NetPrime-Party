import ContinueWatching from "@/components/home/ContinueWatching";
import HeroCarousel from "@/components/home/HeroCarousel";
import MediaRail from "@/components/home/MediaRail";
import GlassCard from "@/components/ui/GlassCard";
import { colors, font, glow, radius } from "@/theme/bearoom";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default React.memo(function HomePage() {
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" translucent />

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 108 }}
      >
        <HeroCarousel />

        {/* Watch-party CTA */}
        <View style={styles.ctaWrap}>
          <GlassCard rounded={radius.xl} padded={14} style={styles.cta}>
            <View style={styles.ctaRow}>
              <View style={styles.ctaIcon}>
                <Ionicons name="people" size={20} color={colors.honey} />
              </View>
              <View style={styles.ctaText}>
                <Text style={styles.ctaTitle}>Start a watch party</Text>
                <Text style={styles.ctaSub}>Watch in sync with your pack, anywhere.</Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.ctaBtn, pressed && styles.pressed]}
                onPress={() => router.push("/joinParty")}
                hitSlop={6}
              >
                <Text style={styles.ctaBtnText}>Invite</Text>
              </Pressable>
            </View>
          </GlassCard>
        </View>

        <ContinueWatching />
        <MediaRail
          title="Trending Shows"
          path="trending/tv/week"
          kind="tv"
          icon="flame"
          onSeeAll={() => router.push("/trendingShows")}
        />
        <MediaRail title="Now Playing" path="movie/now_playing" kind="movie" />
        <MediaRail title="Popular Movies" path="movie/popular" kind="movie" />
        <MediaRail title="Top Rated Movies" path="movie/top_rated" kind="movie" icon="star" />
        <MediaRail title="Upcoming" path="movie/upcoming" kind="movie" />
        <MediaRail title="Popular Series" path="tv/popular" kind="tv" />
        <MediaRail title="Top Rated Series" path="tv/top_rated" kind="tv" icon="star" />
        <MediaRail title="Airing Today" path="tv/airing_today" kind="tv" />
      </ScrollView>

      {/* Floating top bar over the hero */}
      <LinearGradient
        colors={[colors.bg, "rgba(16,13,10,0.6)", "transparent"]}
        style={[styles.topBarBg, { paddingTop: insets.top }]}
        pointerEvents="box-none"
      >
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <Ionicons name="paw" size={20} color={colors.honey} />
            <Text style={styles.brand}>
              Bea<Text style={styles.brandAccent}>r</Text>oom
            </Text>
          </View>
          <View style={styles.topActions}>
            <Pressable
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
              onPress={() => router.push("/(tabs)/search")}
              hitSlop={6}
            >
              <Ionicons name="search" size={18} color={colors.text} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.hostBtn, pressed && styles.pressed]}
              onPress={() => router.push("/joinParty")}
              hitSlop={6}
            >
              <Ionicons name="people" size={15} color={colors.onHoney} />
              <Text style={styles.hostText}>Host Party</Text>
            </Pressable>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.97 }] },

  topBarBg: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  brand: {
    color: colors.text,
    fontFamily: font.headlineXbold,
    fontSize: 22,
    letterSpacing: 0.2,
  },
  brandAccent: { color: colors.honey },
  topActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  hostBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.honey,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: radius.pill,
    ...glow.honey,
  },
  hostText: { color: colors.onHoney, fontFamily: font.label, fontSize: 12 },

  ctaWrap: { paddingHorizontal: 16, marginTop: -14 },
  cta: {},
  ctaRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  ctaIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.honeySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { flex: 1 },
  ctaTitle: { color: colors.text, fontFamily: font.headlineSemi, fontSize: 15 },
  ctaSub: { color: colors.textDim, fontFamily: font.body, fontSize: 12, marginTop: 2 },
  ctaBtn: {
    backgroundColor: colors.honeySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.honey,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  ctaBtnText: { color: colors.honey, fontFamily: font.label, fontSize: 12 },
});
