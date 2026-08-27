import { HeroCarousel } from "@/components/home/HeroCarousel";
import AppHeader from "@/components/ui/AppHeader";
import { useFadeInStyle } from "@/components/ui/useCollapsingHeader";
import { FeedSection } from "@/src/features/home/FeedSection";
import { openJoinParty } from "@/src/navigation/actions";
import { useGetConfigQuery } from "@/src/store/services/workerApi";
import { GlassCard, Text } from "@/src/ui";
import { colors, ms, radius, spacing } from "@/theme/bearoom";
import { gradients } from "@/theme/styles/gradients";
import { pressedStyle } from "@/theme/styles/interaction";
import { normalizeManifest } from "@/utils/normalizeManifest";
import { Ionicons } from "@expo/vector-icons";
import { Frost } from "@/src/ui/Frost";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default React.memo(function HomePage() {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const headerBlurStyle = useFadeInStyle(scrollY, 24, 120);

  const { data: config } = useGetConfigQuery();
  const feed = normalizeManifest(config?.homeFeed);

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

        {feed.sections.map((s) => (
          <FeedSection key={s.id} section={s} />
        ))}
      </Animated.ScrollView>

      <View style={[styles.topBarBg, { paddingTop: insets.top }]} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, headerBlurStyle]}>
          <Frost intensity={40} style={StyleSheet.absoluteFill} />
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
});
