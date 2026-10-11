import {
  FactGrid,
  LinksRow,
  MetaBar,
  PeopleRow,
  Pills,
  ProvidersRow,
  Reviews,
  Section,
} from "@/components/details/sections";
import { defaultHijackProvider } from "@/components/player/providerRegistry";
import { useProviders } from "@/src/store/features/providers/hooks";
import { GlassIconButton } from "@/components/ui/GlassIconButton";
import { Appear, Button } from "@/src/ui";
import { DetailsSkeleton } from "@/src/ui";
import { useFadeInStyle, useCollapsingHeader } from "@/components/ui/useCollapsingHeader";
import { colors, ms, font, glow, radius } from "@/theme/bearoom";
import { absoluteFill } from "@/theme/styles/layout";
import { addToWatchHistory } from "@/utils/history";
import { RAIL_LIST_PROPS } from "@/utils/listPerf";
import { isReleased, releaseLabel } from "@/utils/release";
import { recordCollection } from "@/utils/collectionMemory";
import { genRoomCode } from "@/utils/roomCode";
import { isInWatchlist, toggleWatchlist } from "@/utils/watchlist";
import {
  externalLinks,
  img,
  keyCrew,
  keywords,
  money,
  pickCertification,
  pickProviders,
  pickTrailer,
  runtimeStr,
  topCast,
} from "@/utils/tmdbDetails";
import { Ionicons } from "@expo/vector-icons";
import { Glass, GlassBackdrop } from "@/src/ui/glass";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useDetailsQuery } from "@/src/store/services/tmdbApi";
import { goBack, openCollection, openDetails, openPartyHost, openPlayer } from "@/src/navigation/actions";
import { useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { PlayerStackParamList } from "@/src/navigation/types";
import React, { useEffect, useMemo, useState } from "react";
import {
  Dimensions,
  FlatList,
  Linking,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");
const HERO_H = Math.round(width * 1.3);

const MovieDetailsScreen: React.FC = () => {
  const route = useRoute<RouteProp<PlayerStackParamList, "MovieDetails">>();
  const { id } = route.params;
  const insets = useSafeAreaInsets();
  // RTK Query: cached per movie id (append_to_response bundle).
  const { data: d, isLoading: loading, error: qErr } = useDetailsQuery({ type: "movie", id: id! });
  const error = qErr
    ? typeof qErr === "string"
      ? qErr
      : (qErr as any)?.message ?? "Failed to load"
    : undefined;
  const providers = useProviders();
  const [expanded, setExpanded] = useState(false);
  const [saved, setSaved] = useState(false);

  const headerH = insets.top + ms(52);
  const { scrollHandler, scrollY } = useCollapsingHeader(headerH);
  const headerTitleStyle = useFadeInStyle(scrollY, HERO_H * 0.5, HERO_H * 0.72);
  const headerBgStyle = useFadeInStyle(scrollY, HERO_H * 0.25, HERO_H * 0.6);

  useEffect(() => {
    setSaved(isInWatchlist(id!, "movie"));
  }, [id]);

  // Personalized franchise harvest (source "B"): remember this movie's collection
  // so the Home Franchises rail grows toward the sagas the user actually opens
  // (merged with the curated seed + the TMDB-popular harvest). See collectionMemory.
  // Keyed on the collection id (not the object) so it records once, not per render.
  useEffect(() => {
    recordCollection(d?.belongs_to_collection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.belongs_to_collection?.id]);

  const toggleSave = () => {
    if (!d) return;
    setSaved(toggleWatchlist({ id: id!, type: "movie", title: d.title, poster_path: d.poster_path }));
  };

  const derived = useMemo(() => {
    if (!d) return null;
    const vids = (d.videos?.results ?? []).filter(
      (v: any) => v.site === "YouTube" && ["Trailer", "Teaser", "Clip"].includes(v.type),
    );
    return {
      trailer: pickTrailer(d),
      clips: vids.slice(0, 8),
      cert: pickCertification(d, "movie"),
      cast: topCast(d),
      crew: keyCrew(d, "movie"),
      providers: pickProviders(d),
      keywords: keywords(d),
      links: externalLinks(d),
      recs: (d.recommendations?.results ?? d.similar?.results ?? []).slice(0, 20),
      facts: [
        { label: "Status", value: d.status || "" },
        { label: "Release", value: d.release_date || "" },
        { label: "Budget", value: money(d.budget) },
        { label: "Revenue", value: money(d.revenue) },
        { label: "Original Language", value: (d.original_language || "").toUpperCase() },
        { label: "Spoken", value: (d.spoken_languages ?? []).map((l: any) => l.english_name).join(", ") },
        { label: "Studios", value: (d.production_companies ?? []).map((c: any) => c.name).slice(0, 3).join(", ") },
        { label: "Country", value: (d.production_countries ?? []).map((c: any) => c.iso_3166_1).join(", ") },
      ],
    };
  }, [d]);

  if (loading) {
    return <DetailsSkeleton />;
  }
  if (error || !d) {
    return (
      <View style={styles.center}>
        <Text style={styles.errText}>{error || "Not found"}</Text>
      </View>
    );
  }

  // A title can sit in lists/collections (e.g. "Upcoming", an announced sequel)
  // long before it exists to stream — playing it just hits the provider's dead-end
  // wall. Gate the Play affordance on real release status (date + TMDB status).
  const released = isReleased(d, "movie");

  const handlePlay = () => {
    if (!released) return;
    void addToWatchHistory({
      id: id?.toString(),
      title: d.title,
      type: "movie",
      poster_path: d.poster_path,
    });
    // Zero-wait: hand the player the top (priority-1) provider explicitly so it
    // mounts that WebView immediately — no scrape roundtrip.
    openPlayer({
      id: id!.toString(),
      type: "movie",
      title: d.title,
      poster_path: d.poster_path || "",
      year: d.release_date?.slice(0, 4) || "",
      providerId: providers[0]?.id,
    });
  };

  const handleWatchTogether = () => {
    openPartyHost({
      role: "host",
      room: genRoomCode(),
      provider: defaultHijackProvider()?.id,
      id: id!.toString(),
      type: "movie",
      title: d.title,
    });
  };

  const openTrailer = (key?: string | null) => {
    if (!key) return;
    Linking.openURL(`https://www.youtube.com/watch?v=${key}`).catch(() => {});
  };

  const handleShare = () => {
    void Share.share({
      message: `Watch "${d.title}" with me on Bearoom 🐻`,
    }).catch(() => {});
  };

  const backdrop = img(d.backdrop_path, "w780") || img(d.poster_path, "w780");

  return (
    <View style={styles.container}>
      {/* Sticky header — always visible; bg + title fade in on scroll (like Home) */}
      <View style={[styles.header, { height: headerH }]} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, headerBgStyle]}>
          <Glass material="chrome" />
          <View style={styles.headerBgLine} />
        </Animated.View>
        <View style={[styles.headerRow, { marginTop: insets.top }]}>
          <GlassIconButton onPress={goBack}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </GlassIconButton>
          <Animated.Text numberOfLines={1} style={[styles.headerTitle, headerTitleStyle]}>
            {d.title}
          </Animated.Text>
          <GlassIconButton onPress={toggleSave}>
            <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={20} color={saved ? colors.honey : colors.text} />
          </GlassIconButton>
        </View>
      </View>

      <GlassBackdrop style={styles.backdrop}>
        <Animated.ScrollView
          bounces={false}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingBottom: 48 + insets.bottom }}
        >
          {/* Hero */}
          <View style={styles.hero}>
            {backdrop ? (
              <Image source={{ uri: backdrop }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
            ) : null}
            <LinearGradient
              colors={["transparent", "transparent", colors.bg]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.heroContent}>
              <Text style={styles.title}>{d.title}</Text>
              <MetaBar
                rating={d.vote_average}
                votes={d.vote_count}
                year={d.release_date?.slice(0, 4)}
                runtime={runtimeStr(d.runtime)}
                certification={derived!.cert}
                genres={(d.genres ?? []).map((g: any) => g.name)}
              />
            </View>
          </View>

          {/* Primary actions */}
          <Appear index={0}>
          <View style={styles.actions}>
            {released ? (
              <>
                <Button
                  label="Play"
                  icon="play"
                  variant="honey"
                  size="sm"
                  onPress={handlePlay}
                  style={styles.flexBtn}
                />
                <Button
                  label="Watch together"
                  icon="paw"
                  variant="glass"
                  size="sm"
                  onPress={handleWatchTogether}
                  style={styles.flexBtn}
                />
              </>
            ) : (
              <Button
                label={releaseLabel(d, "movie")}
                icon="time-outline"
                variant="glass"
                size="sm"
                disabled
                onPress={() => {}}
                style={styles.flexBtn}
              />
            )}
          </View>
          </Appear>

          {/* Quick actions */}
          <Appear index={1}>
          <View style={styles.quickRow}>
            <Pressable style={styles.quick} onPress={toggleSave}>
              <View style={styles.quickIcon}>
                <Ionicons name={saved ? "checkmark" : "add"} size={22} color={saved ? colors.honey : colors.textDim} />
              </View>
              <Text style={styles.quickLabel}>My List</Text>
            </Pressable>
            <Pressable style={styles.quick} onPress={() => openTrailer(derived!.trailer?.key)} disabled={!derived!.trailer}>
              <View style={styles.quickIcon}>
                <Ionicons name="film-outline" size={22} color={derived!.trailer ? colors.textDim : colors.textFaint} />
              </View>
              <Text style={styles.quickLabel}>Trailer</Text>
            </Pressable>
            <Pressable style={styles.quick} onPress={handleShare}>
              <View style={styles.quickIcon}>
                <Ionicons name="share-social-outline" size={22} color={colors.textDim} />
              </View>
              <Text style={styles.quickLabel}>Share</Text>
            </Pressable>
          </View>
          </Appear>

          {d.overview ? (
            <Appear index={2}>
            <View style={styles.overviewWrap}>
              <Text style={styles.overview} numberOfLines={expanded ? undefined : 3}>
                {d.overview}
              </Text>
              {d.overview.length > 140 ? (
                <Pressable onPress={() => setExpanded((e) => !e)} hitSlop={6}>
                  <Text style={styles.moreLink}>{expanded ? "less" : "more"}</Text>
                </Pressable>
              ) : null}
            </View>
            </Appear>
          ) : null}

          {d.belongs_to_collection ? (
            <Pressable
              style={({ pressed }) => [styles.collectionChip, pressed && styles.collectionChipPressed]}
              onPress={() => openCollection(d.belongs_to_collection.id)}
              hitSlop={6}
            >
              <Ionicons name="albums-outline" size={ms(15)} color={colors.honey} />
              <Text style={styles.collectionChipText} numberOfLines={1}>
                Part of {d.belongs_to_collection.name}
              </Text>
              <Ionicons name="chevron-forward" size={ms(14)} color={colors.textDim} />
            </Pressable>
          ) : null}

          {derived!.cast.length ? (
            <Appear index={3}>
            <Section title="Cast">
              <PeopleRow people={derived!.cast} />
            </Section>
            </Appear>
          ) : null}

          {derived!.clips.length ? (
            <Appear index={4}>
            <Section title="Trailers & Clips">
              <FlatList
                data={derived!.clips}
                horizontal
                keyExtractor={(v: any) => v.id}
                showsHorizontalScrollIndicator={false}
                {...RAIL_LIST_PROPS}
                ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
                renderItem={({ item }: any) => (
                  <Pressable style={styles.clip} onPress={() => openTrailer(item.key)}>
                    <Image
                      source={{ uri: `https://img.youtube.com/vi/${item.key}/hqdefault.jpg` }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      transition={200}
                    />
                    <View style={styles.clipScrim} />
                    <View style={styles.clipPlay}>
                      <Ionicons name="play" size={18} color={colors.text} />
                    </View>
                    <View style={styles.clipTag}>
                      <Text style={styles.clipTagText} numberOfLines={1}>{item.type}</Text>
                    </View>
                  </Pressable>
                )}
              />
            </Section>
            </Appear>
          ) : null}

          {derived!.crew.length ? (
            <Appear index={5}>
            <Section title="Crew">
              <PeopleRow people={derived!.crew} />
            </Section>
            </Appear>
          ) : null}

          {derived!.providers ? (
            <Appear index={6}>
            <Section title="Where to Watch">
              <ProvidersRow providers={derived!.providers} />
            </Section>
            </Appear>
          ) : null}

          <Appear index={7}>
          <Section title="Details">
            <FactGrid facts={derived!.facts} />
          </Section>
          </Appear>

          {derived!.keywords.length ? (
            <Appear index={8}>
            <Section title="Keywords">
              <Pills items={derived!.keywords} />
            </Section>
            </Appear>
          ) : null}

          {d.reviews?.results?.length ? (
            <Appear index={9}>
            <Section title="Reviews">
              <Reviews reviews={d.reviews.results} />
            </Section>
            </Appear>
          ) : null}

          {derived!.links.length ? (
            <Appear index={10}>
            <Section title="Links">
              <LinksRow links={derived!.links} />
            </Section>
            </Appear>
          ) : null}

          {derived!.recs.length ? (
            <Appear index={11}>
            <Section title="More Like This">
              <FlatList
                data={derived!.recs}
                horizontal
                keyExtractor={(m: any) => String(m.id)}
                showsHorizontalScrollIndicator={false}
                {...RAIL_LIST_PROPS}
                ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
                renderItem={({ item }: any) => (
                  <Pressable
                    style={styles.recCard}
                    onPress={() =>
                      openDetails({ id: item.id, media_type: "movie" }, "movie")
                    }
                  >
                    <View style={styles.recImgWrap}>
                      <Image
                        source={{ uri: img(item.poster_path, "w342") || undefined }}
                        style={styles.recImg}
                        contentFit="cover"
                        transition={200}
                      />
                      {item.vote_average ? (
                        <View style={styles.recBadge}>
                          <Ionicons name="star" size={9} color={colors.honey} />
                          <Text style={styles.recBadgeText}>{item.vote_average.toFixed(1)}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.recTitle} numberOfLines={1}>
                      {item.title || item.name}
                    </Text>
                  </Pressable>
                )}
              />
            </Section>
            </Appear>
          ) : null}
        </Animated.ScrollView>
      </GlassBackdrop>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  errText: { color: colors.danger, fontFamily: font.body, fontSize: ms(15) },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },

  hero: { width: "100%", height: HERO_H, justifyContent: "flex-end" },
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
    gap: 12,
  },
  headerTitle: {
    flex: 1,
    color: colors.text,
    fontFamily: font.headlineSemi,
    fontSize: ms(16),
    textAlign: "center",
  },
  heroContent: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  title: { color: colors.text, fontFamily: font.headlineXbold, fontSize: ms(32), letterSpacing: -0.6, lineHeight: ms(36) },

  actions: { flexDirection: "row", gap: 12, paddingHorizontal: 16, marginTop: 16 }, flexBtn: { flex: 1 },
  quickRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 20,
    marginTop: 12,
    marginHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  quick: { alignItems: "center", gap: 6 },
  quickIcon: { width: 48, height: 48, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  quickLabel: { color: colors.textDim, fontFamily: font.label, fontSize: ms(12) },

  overviewWrap: { paddingHorizontal: 16, marginTop: 20 },
  overview: { color: colors.textDim, fontFamily: font.body, fontSize: ms(14), lineHeight: 21 },
  moreLink: { color: colors.honey, fontFamily: font.bodySemi, fontSize: ms(13), marginTop: 4 },
  collectionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(8),
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: ms(10),
    paddingHorizontal: ms(14),
    borderRadius: radius.md,
    backgroundColor: colors.honeySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.honey,
  },
  collectionChipPressed: { opacity: 0.72 },
  collectionChipText: { flex: 1, color: colors.text, fontFamily: font.bodySemi, fontSize: ms(13) },

  clip: {
    width: 240,
    height: 135,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  clipScrim: { ...absoluteFill, backgroundColor: colors.overlay },
  clipPlay: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.scrim,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  clipTag: {
    position: "absolute",
    bottom: 8,
    left: 8,
    backgroundColor: colors.scrim,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  clipTagText: { color: colors.text, fontFamily: font.bodyMed, fontSize: ms(10) },

  recCard: { width: 118 },
  recImgWrap: { borderRadius: radius.lg, overflow: "hidden" },
  recImg: { width: 118, height: 177, backgroundColor: colors.bgElevated },
  recBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: colors.scrim,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  recBadgeText: { color: colors.text, fontFamily: font.bodySemi, fontSize: ms(9) },
  recTitle: { color: colors.text, fontFamily: font.bodyMed, fontSize: ms(12), marginTop: 6 },
});

export default MovieDetailsScreen;
