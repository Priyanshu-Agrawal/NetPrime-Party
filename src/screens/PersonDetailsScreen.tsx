import { Badge, PosterCard, PosterSkeleton, Screen, Text, useCollapsingHeader, useFadeInStyle } from "@/src/ui";
import { GlassIconButton } from "@/src/ui/IconButton";
import { Frost } from "@/src/ui/Frost";
import { colors, ms, spacing, font } from "@/theme/bearoom";
import { gridColumnWidth } from "@/theme/styles/layout";
import { img } from "@/utils/tmdbDetails";
import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo, useState } from "react";
import { Dimensions, FlatList, Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { PlayerStackParamList } from "@/src/navigation/types";
import { usePersonDetailsQuery, usePersonCreditsQuery } from "@/src/store/services/tmdbApi";
import { openDetails, goBack } from "@/src/navigation/actions";
import Animated, { useAnimatedStyle, interpolate, Extrapolation, LinearTransition } from "react-native-reanimated";

type Props = NativeStackScreenProps<PlayerStackParamList, "PersonDetails">;

const { width } = Dimensions.get("window");
const POSTER_H = width * 1.1;

export default function PersonDetailsScreen({ route }: Props) {
  const { id } = route.params;
  const insets = useSafeAreaInsets();
  const [bioExpanded, setBioExpanded] = useState(false);

  const { data: details, isLoading: loadingDetails } = usePersonDetailsQuery(id);
  const { data: creditsRaw, isLoading: loadingCredits } = usePersonCreditsQuery(id);

  const profileUrl = useMemo(() => img(details?.profile_path, "h632"), [details?.profile_path]);
  
  const knownFor = useMemo(() => {
    if (!creditsRaw?.cast) return [];
    const valid = creditsRaw.cast.filter((c: any) => c.poster_path);
    const seen = new Set<number>();
    const deduped = valid.filter((c: any) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
    return deduped.sort((a: any, b: any) => b.popularity - a.popularity);
  }, [creditsRaw]);

  // --- Scroll & Parallax Animations ---
  const headerH = insets.top + ms(52);
  const { scrollHandler, scrollY } = useCollapsingHeader(headerH);
  
  const headerTitleStyle = useFadeInStyle(scrollY, POSTER_H * 0.4, POSTER_H * 0.6);
  const headerBgStyle = useFadeInStyle(scrollY, POSTER_H * 0.25, POSTER_H * 0.5);

  const heroImgStyle = useAnimatedStyle(() => {
    const y = scrollY.value;
    if (y < 0) {
      // Perfect pinned parallax: 
      // Scale covers the exact gap size. 
      // TranslateY offsets the center-scale origin to keep the top edge pinned.
      return {
        transform: [
          { translateY: y / 2 },
          { scale: 1 - y / POSTER_H }
        ],
      };
    }
    // No parallax on scroll up to prevent the image from translating out of its gradient container
    return { transform: [{ translateY: 0 }, { scale: 1 }] };
  });

  if (loadingDetails) {
    return (
      <Screen edges={["bottom"]}>
         <View style={[styles.headerRow, { marginTop: Math.max(insets.top, ms(16)) }]}>
            <GlassIconButton onPress={goBack}>
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </GlassIconButton>
         </View>
      </Screen>
    );
  }

  if (!details) return null;

  return (
    <Screen edges={["bottom"]}>
      {/* Sticky Glass Header */}
      <View style={styles.header}>
        <Animated.View style={[StyleSheet.absoluteFill, headerBgStyle]}>
          <Frost intensity={40} style={StyleSheet.absoluteFill} />
          <View style={styles.headerBgLine} />
        </Animated.View>
        <View style={[styles.headerRow, { marginTop: insets.top }]}>
          <GlassIconButton onPress={goBack}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </GlassIconButton>
          <Animated.Text numberOfLines={1} style={[styles.headerTitle, headerTitleStyle]}>
            {details.name}
          </Animated.Text>
          {/* Empty view to balance the flex space of the back button */}
          <View style={{ width: ms(36) }} /> 
        </View>
      </View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: ms(120) }}
        bounces={true}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        {/* Header Profile Image with Parallax */}
        <View style={styles.headerHero}>
          {profileUrl ? (
            <Animated.View style={[StyleSheet.absoluteFill, heroImgStyle]}>
              <Image source={{ uri: profileUrl }} style={styles.headerImage} contentFit="cover" />
            </Animated.View>
          ) : (
            <View style={[styles.headerImage, styles.placeholderBg]} />
          )}
          
          <LinearGradient
            colors={["transparent", "rgba(16,13,10,0.8)", colors.bg]}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFillObject}
          />
          
          {/* Name & Basic Info */}
          <View style={styles.heroContent}>
            <Text style={styles.nameText} numberOfLines={2}>
              {details.name}
            </Text>
            <View style={styles.tagsRow}>
              {details.known_for_department ? (
                <Badge label={details.known_for_department} />
              ) : null}
              {details.birthday && (
                <Text style={styles.subText}>{details.birthday}</Text>
              )}
            </View>
          </View>
        </View>

        {/* Biography */}
        {details.biography ? (
          <Animated.View layout={LinearTransition.springify().damping(18).stiffness(150)}>
            <Pressable onPress={() => setBioExpanded(!bioExpanded)} style={styles.bioContainer}>
              <Text style={styles.sectionTitle}>Biography</Text>
              <Text
                style={styles.bioText}
                numberOfLines={bioExpanded ? undefined : 6}
              >
                {details.biography}
              </Text>
              {!bioExpanded && details.biography.length > 250 && (
                <Text style={styles.moreText}>more</Text>
              )}
            </Pressable>
          </Animated.View>
        ) : null}

        {/* Known For */}
        {loadingCredits ? (
          <View style={styles.creditsContainer}>
            <Text style={[styles.sectionTitle, { paddingHorizontal: spacing.lg }]}>
              Known For
            </Text>
            <View style={styles.creditsList}>
              <PosterSkeleton />
              <PosterSkeleton />
              <PosterSkeleton />
            </View>
          </View>
        ) : knownFor.length > 0 ? (
          <View style={styles.creditsContainer}>
            <Text style={[styles.sectionTitle, { paddingHorizontal: spacing.lg }]}>
              Known For
            </Text>
            <FlatList
              horizontal
              data={knownFor}
              keyExtractor={(item) => String(item.id)}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.creditsList}
              renderItem={({ item }: { item: any }) => (
                <View style={styles.creditCard}>
                  <PosterCard 
                    poster={img(item.poster_path, "w342") || undefined}
                    title={item.title || item.name}
                    rating={item.vote_average}
                    kind={item.media_type as "movie" | "tv"}
                    width={gridColumnWidth(3)} 
                    onPress={() => openDetails(item, item.media_type || "movie")}
                  />
                </View>
              )}
            />
          </View>
        ) : null}
      </Animated.ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  headerBgLine: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  headerRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  headerTitle: {
    flex: 1,
    color: colors.text,
    fontFamily: font.headlineSemi,
    fontSize: ms(16),
    textAlign: "center",
  },
  headerHero: {
    width: "100%",
    height: POSTER_H,
    position: "relative",
  },
  headerImage: {
    width: "100%",
    height: "100%",
  },
  placeholderBg: {
    backgroundColor: colors.surface,
  },
  heroContent: {
    position: "absolute",
    bottom: spacing.xl,
    left: spacing.lg,
    right: spacing.lg,
  },
  nameText: {
    fontFamily: font.headlineXbold,
    fontSize: ms(36),
    lineHeight: ms(40),
    color: colors.text,
    marginBottom: spacing.xs,
  },
  tagsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  subText: {
    fontFamily: font.bodyMed,
    fontSize: ms(13),
    color: colors.textDim,
  },
  bioContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  sectionTitle: {
    fontFamily: font.headline,
    fontSize: ms(18),
    color: colors.text,
    marginBottom: spacing.md,
  },
  bioText: {
    fontFamily: font.body,
    fontSize: ms(14),
    color: colors.textDim,
    lineHeight: ms(22),
  },
  moreText: {
    fontFamily: font.bodySemi,
    fontSize: ms(13),
    color: colors.honey,
    marginTop: spacing.xs,
  },
  creditsContainer: {
    marginTop: spacing.xl,
  },
  creditsList: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    flexDirection: "row",
  },
  creditCard: {
    width: gridColumnWidth(3),
  },
});
