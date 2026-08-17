import { GlassIconButton } from "./IconButton";
import { PosterSkeleton } from "./PosterSkeleton";
import { goBack } from "@/src/navigation/actions";
import { colors, ms, radius, spacing } from "@/theme/bearoom";
import { gradients } from "@/theme/styles/gradients";
import { layout } from "@/theme/styles/layout";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Dimensions, ScrollView, StyleSheet, View } from "react-native";
import { createShimmerPlaceholder } from "react-native-shimmer-placeholder";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const Shimmer = createShimmerPlaceholder(LinearGradient);
const SHIMMER = [...gradients.shimmerDark];

const { width } = Dimensions.get("window");
const HERO_H = Math.round(width * 1.3);
const CTA_W = (width - spacing.lg * 2 - spacing.md) / 2;
const REC_W = 118;

function Bone({
  w,
  h,
  r = radius.sm,
  style,
}: {
  w: number;
  h: number;
  r?: number;
  style?: object;
}) {
  return (
    <Shimmer
      shimmerColors={SHIMMER}
      style={[{ width: w, height: h, borderRadius: r }, style]}
    />
  );
}

export function DetailsSkeleton() {
  const insets = useSafeAreaInsets();
  const headerH = insets.top + ms(52);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { height: headerH }]} pointerEvents="box-none">
        <View style={[styles.headerRow, { marginTop: insets.top }]}>
          <GlassIconButton onPress={goBack}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </GlassIconButton>
          <View style={{ flex: 1 }} />
          <View style={{ width: layout.iconButton, height: layout.iconButton }} />
        </View>
      </View>

      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 48 + insets.bottom }}
      >
        <View style={styles.hero}>
          <Shimmer shimmerColors={SHIMMER} style={styles.heroFill} />
          <LinearGradient
            colors={[...gradients.detailsOverlay]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroContent}>
            <Bone w={width * 0.72} h={ms(32)} r={radius.sm} />
            <View style={styles.chipRow}>
              <Bone w={ms(44)} h={ms(22)} r={radius.pill} />
              <Bone w={ms(52)} h={ms(22)} r={radius.pill} />
              <Bone w={ms(40)} h={ms(22)} r={radius.pill} />
              <Bone w={ms(72)} h={ms(22)} r={radius.pill} />
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <Bone w={CTA_W} h={ms(48)} r={radius.pill} />
          <Bone w={CTA_W} h={ms(48)} r={radius.pill} />
        </View>

        <View style={styles.quickRow}>
          <View style={styles.quick}>
            <Bone w={48} h={48} r={radius.pill} />
            <Bone w={ms(48)} h={ms(10)} />
          </View>
          <View style={styles.quick}>
            <Bone w={48} h={48} r={radius.pill} />
            <Bone w={ms(44)} h={ms(10)} />
          </View>
          <View style={styles.quick}>
            <Bone w={48} h={48} r={radius.pill} />
            <Bone w={ms(40)} h={ms(10)} />
          </View>
        </View>

        <View style={styles.overview}>
          <Bone w={width - spacing.lg * 2} h={ms(12)} />
          <Bone w={width - spacing.lg * 2} h={ms(12)} style={styles.overviewGap} />
          <Bone w={(width - spacing.lg * 2) * 0.62} h={ms(12)} style={styles.overviewGap} />
        </View>

        <View style={styles.rail}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={i > 0 ? styles.railGap : undefined}>
              <PosterSkeleton width={REC_W} />
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

export function EpisodeRowSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.epList}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.episode}>
          <Bone w={120} h={68} r={radius.md} />
          <View style={styles.epLines}>
            <Bone w={ms(160)} h={ms(12)} />
            <Bone w={ms(96)} h={ms(10)} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  headerRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  hero: { width: "100%", height: HERO_H, justifyContent: "flex-end" },
  heroFill: { position: "absolute", top: 0, left: 0, width, height: HERO_H },
  heroContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: 10 },
  chipRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  actions: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  quickRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: spacing.xl,
    marginTop: spacing.md,
    marginHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  quick: { alignItems: "center", gap: 6 },
  overview: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  overviewGap: { marginTop: spacing.sm },
  rail: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  railGap: { marginLeft: 10 },
  epList: { marginTop: spacing.xl },
  episode: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg, alignItems: "center" },
  epLines: { flex: 1, gap: spacing.sm },
});
