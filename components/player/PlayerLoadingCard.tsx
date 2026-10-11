/**
 * The branded loading card both lanes show until the video can be seen: blurred poster (expo-image's STATIC
 * blurRadius — not a live capture, so it is safe on a video screen), a clean poster card, and a status row.
 * Pointer-through, so a gesture-gated provider page under it still gets the tap that starts playback.
 */
import { colors, font, ms } from "@/theme/bearoom";
import { absoluteFill } from "@/theme/styles/layout";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

// Vertical scrim over the blurred poster — lighter at the top, deepening toward the bottom (warm charcoal).
const LOADING_SCRIM = ["rgba(16,13,10,0.62)", "rgba(16,13,10,0.94)"] as const;

export function PlayerLoadingCard({ posterUrl, status }: { posterUrl?: string; status: string }) {
  return (
    <View style={styles.loading} pointerEvents="none">
      {posterUrl ? (
        <>
          <Image
            source={{ uri: posterUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            blurRadius={25}
            transition={250}
            cachePolicy="memory-disk"
          />
          <LinearGradient colors={LOADING_SCRIM} style={StyleSheet.absoluteFill} />
        </>
      ) : null}
      <View style={styles.loadingContent}>
        {posterUrl ? (
          <View style={styles.loadingThumbWrap}>
            <Image source={{ uri: posterUrl }} style={styles.loadingThumb} contentFit="cover" transition={250} cachePolicy="memory-disk" />
          </View>
        ) : (
          <View style={styles.loadingBadge}>
            <Image source={require("@/assets/images/brandmark.png")} style={styles.loadingBrandMark} contentFit="contain" />
          </View>
        )}
        <View style={styles.loadingStatusRow}>
          <ActivityIndicator size="small" color={colors.honey} />
          <Text style={styles.loadingSub}>{status}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { ...absoluteFill, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  loadingContent: { alignItems: "center", gap: ms(20), paddingHorizontal: 32 },
  loadingThumbWrap: {
    width: ms(112),
    height: ms(168),
    borderRadius: ms(14),
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)",
  },
  loadingThumb: { width: "100%", height: "100%" },
  loadingBadge: {
    width: ms(76),
    height: ms(76),
    borderRadius: ms(22),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.honeySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.honeyGlow,
  },
  loadingBrandMark: { width: ms(38), height: ms(38) },
  loadingStatusRow: { flexDirection: "row", alignItems: "center", gap: ms(8) },
  loadingSub: { color: colors.textFaint, fontFamily: font.body, fontSize: ms(13), letterSpacing: 0.2 },
});
