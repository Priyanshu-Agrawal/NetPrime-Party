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
import { GlassIconButton } from "@/components/ui/GlassIconButton";
import { API_HEADERS, API_URL } from "@/contexts/movieContext/movieContext";
import { colors, ms, font, glow, radius } from "@/theme/bearoom";
import { addToWatchHistory } from "@/utils/history";
import { isInWatchlist, toggleWatchlist } from "@/utils/watchlist";
import { genRoomCode } from "@/utils/roomCode";
import {
  externalLinks,
  fetchDetails,
  img,
  keyCrew,
  keywords,
  pickCertification,
  pickProviders,
  pickTrailer,
  runtimeStr,
  topCast,
} from "@/utils/tmdbDetails";
import { useFadeInStyle, useCollapsingHeader } from "@/components/ui/useCollapsingHeader";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootNavigation } from "@/src/navigation/helpers";
import type { PlayerStackParamList } from "@/src/navigation/types";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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

const TvDetailsScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<PlayerStackParamList>>();
  const rootNavigation = useNavigation<RootNavigation>();
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<PlayerStackParamList, "TvDetails">>();
  const { id } = route.params;

  const [loading, setLoading] = useState(true);
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState<string>();
  const [season, setSeason] = useState<number | null>(null);
  const [seasonData, setSeasonData] = useState<any>(null);
  const [expanded, setExpanded] = useState(false);
  const [saved, setSaved] = useState(false);

  const headerH = insets.top + ms(52);
  const { scrollHandler, scrollY } = useCollapsingHeader(headerH);
  const headerTitleStyle = useFadeInStyle(scrollY, HERO_H * 0.5, HERO_H * 0.72);
  const headerBgStyle = useFadeInStyle(scrollY, HERO_H * 0.25, HERO_H * 0.6);

  useEffect(() => {
    let aborted = false;
    setLoading(true);
    fetchDetails("tv", id!)
      .then((data) => {
        if (aborted) return;
        setD(data);
        setSaved(isInWatchlist(id!, "tv"));
        setError(undefined);
        const first =
          (data.seasons ?? []).find(
            (s: any) => s.season_number > 0 && s.episode_count > 0,
          ) ?? (data.seasons ?? [])[0];
        if (first) setSeason(first.season_number);
      })
      .catch((e) => !aborted && setError(e.message))
      .finally(() => !aborted && setLoading(false));
    return () => {
      aborted = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id || season === null) return;
    let aborted = false;
    setSeasonData(null);
    fetch(`${API_URL}tv/${id}/season/${season}?language=en-US`, {
      headers: API_HEADERS,
    })
      .then((r) => r.json())
      .then((data) => !aborted && setSeasonData(data))
      .catch(() => !aborted && setSeasonData(null));
    return () => {
      aborted = true;
    };
  }, [id, season]);

  const derived = useMemo(() => {
    if (!d) return null;
    return {
      trailer: pickTrailer(d),
      cert: pickCertification(d, "tv"),
      cast: topCast(d),
      crew: keyCrew(d, "tv"),
      providers: pickProviders(d),
      keywords: keywords(d),
      links: externalLinks(d),
      recs: (d.recommendations?.results ?? d.similar?.results ?? []).slice(0, 20),
      facts: [
        { label: "Status", value: d.status || "" },
        { label: "First Air", value: d.first_air_date || "" },
        { label: "Last Air", value: d.last_air_date || "" },
        { label: "Networks", value: (d.networks ?? []).map((n: any) => n.name).join(", ") },
        { label: "Type", value: d.type || "" },
        { label: "Episode Runtime", value: runtimeStr(d.episode_run_time?.[0]) },
        { label: "Original Language", value: (d.original_language || "").toUpperCase() },
        { label: "In Production", value: d.in_production ? "Yes" : "No" },
      ],
    };
  }, [d]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.honey} />
      </View>
    );
  }
  if (error || !d) {
    return (
      <View style={styles.center}>
        <Text style={styles.errText}>{error || "Not found"}</Text>
      </View>
    );
  }

  const playEpisode = (ep: number, sea = season) => {
    void addToWatchHistory({
      id: id?.toString(),
      title: d.name,
      type: "tv",
      season: sea ?? undefined,
      episode: ep,
      poster_path: d.poster_path,
    });
    navigation.navigate("Player", {
      id: id!.toString(),
      type: "tv",
      season: String(sea),
      ep: String(ep),
      title: d.name,
      poster_path: d.poster_path || "",
      year: d.first_air_date?.slice(0, 4) || "",
    });
  };

  const handlePlay = () => {
    const firstEp = seasonData?.episodes?.[0]?.episode_number ?? 1;
    playEpisode(firstEp);
  };

  const handleWatchTogether = () => {
    const firstEp = seasonData?.episodes?.[0]?.episode_number ?? 1;
    rootNavigation.navigate("Party", {
      role: "host",
      room: genRoomCode(),
      provider: defaultHijackProvider()?.id,
      id: id!.toString(),
      type: "tv",
      season: String(season ?? 1),
      ep: String(firstEp),
      title: d.name,
    });
  };

  const openTrailer = (key?: string | null) => {
    if (!key) return;
    Linking.openURL(`https://www.youtube.com/watch?v=${key}`).catch(() => {});
  };

  const handleShare = () => {
    void Share.share({ message: `Watch "${d.name}" with me on Bearoom 🐻` }).catch(() => {});
  };

  const backdrop = img(d.backdrop_path, "w780") || img(d.poster_path, "w780");
  const seasons = (d.seasons ?? []).filter((s: any) => s.episode_count > 0);
  const next = d.next_episode_to_air;

  return (
    <View style={styles.container}>
      {/* Sticky header — always visible; bg + title fade in on scroll (like Home) */}
      <View style={[styles.header, { height: headerH }]} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, headerBgStyle]}>
          <BlurView
            intensity={40}
            tint="dark"
            experimentalBlurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.headerBgLine} />
        </Animated.View>
        <View style={[styles.headerRow, { marginTop: insets.top }]}>
          <GlassIconButton onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </GlassIconButton>
          <Animated.Text numberOfLines={1} style={[styles.headerTitle, headerTitleStyle]}>
            {d.name}
          </Animated.Text>
          <GlassIconButton
            onPress={() =>
              setSaved(toggleWatchlist({ id: id!, type: "tv", title: d.name, poster_path: d.poster_path }))
            }
          >
            <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={20} color={saved ? colors.honey : colors.text} />
          </GlassIconButton>
        </View>
      </View>

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
            <Text style={styles.title}>{d.name}</Text>
            <Text style={styles.seasonsLine}>
              {d.number_of_seasons} Seasons · {d.number_of_episodes} Episodes
            </Text>
            <MetaBar
              rating={d.vote_average}
              votes={d.vote_count}
              year={d.first_air_date?.slice(0, 4)}
              runtime={runtimeStr(d.episode_run_time?.[0])}
              certification={derived!.cert}
              genres={(d.genres ?? []).map((g: any) => g.name)}
            />
          </View>
        </View>

        {/* Primary actions */}
        <View style={styles.actions}>
          <Pressable style={({ pressed }) => [styles.playBtn, pressed && styles.pressed]} onPress={handlePlay}>
            <Ionicons name="play" size={20} color={colors.onHoney} />
            <Text style={styles.playText}>Play</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.togetherBtn, pressed && styles.pressed]} onPress={handleWatchTogether}>
            <Ionicons name="paw" size={18} color={colors.honey} />
            <Text style={styles.togetherText}>Watch together</Text>
          </Pressable>
        </View>

        {/* Quick actions */}
        <View style={styles.quickRow}>
          <Pressable
            style={styles.quick}
            onPress={() =>
              setSaved(toggleWatchlist({ id: id!, type: "tv", title: d.name, poster_path: d.poster_path }))
            }
          >
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

        {next ? (
          <View style={styles.nextBanner}>
            <Ionicons name="calendar-outline" size={14} color={colors.honey} />
            <Text style={styles.nextText}>
              Next: S{next.season_number}E{next.episode_number} “{next.name}” · {next.air_date}
            </Text>
          </View>
        ) : null}

        {d.overview ? (
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
        ) : null}

        {/* Seasons + Episodes */}
        {seasons.length ? (
          <Section title="Episodes">
            <FlatList
              data={seasons}
              horizontal
              keyExtractor={(s: any) => String(s.id)}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingBottom: 14 }}
              renderItem={({ item }: any) => {
                const active = item.season_number === season;
                return (
                  <Pressable
                    style={[styles.seasonChip, active && styles.seasonChipActive]}
                    onPress={() => setSeason(item.season_number)}
                  >
                    <Text style={[styles.seasonChipText, active && styles.seasonChipTextActive]}>
                      {item.season_number === 0 ? "Specials" : `Season ${item.season_number}`}
                    </Text>
                  </Pressable>
                );
              }}
            />
            {seasonData ? (
              (seasonData.episodes ?? []).map((ep: any) => (
                <Pressable
                  key={ep.id}
                  style={styles.episode}
                  onPress={() => playEpisode(ep.episode_number)}
                >
                  <View style={styles.epStillWrap}>
                    {ep.still_path ? (
                      <Image source={{ uri: img(ep.still_path, "w300") || undefined }} style={styles.epStill} contentFit="cover" />
                    ) : (
                      <View style={[styles.epStill, styles.epNoStill]}>
                        <Ionicons name="tv-outline" size={20} color={colors.textFaint} />
                      </View>
                    )}
                    <View style={styles.epPlay}>
                      <Ionicons name="play" size={18} color={colors.text} />
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.epTitle} numberOfLines={1}>
                      {ep.episode_number}. {ep.name}
                    </Text>
                    <View style={styles.epMeta}>
                      {ep.runtime ? <Text style={styles.epMetaText}>{runtimeStr(ep.runtime)}</Text> : null}
                      {ep.air_date ? <Text style={styles.epMetaText}>{ep.air_date}</Text> : null}
                      {ep.vote_average ? (
                        <View style={styles.epRating}>
                          <Ionicons name="star" size={10} color={colors.honey} />
                          <Text style={styles.epMetaText}>{ep.vote_average.toFixed(1)}</Text>
                        </View>
                      ) : null}
                    </View>
                    {ep.overview ? (
                      <Text style={styles.epOverview} numberOfLines={2}>
                        {ep.overview}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              ))
            ) : (
              <ActivityIndicator color={colors.honey} style={{ marginTop: 20 }} />
            )}
          </Section>
        ) : null}

        {derived!.cast.length ? (
          <Section title="Cast">
            <PeopleRow people={derived!.cast} />
          </Section>
        ) : null}

        {derived!.crew.length ? (
          <Section title="Creators & Crew">
            <PeopleRow people={derived!.crew} />
          </Section>
        ) : null}

        {derived!.providers ? (
          <Section title="Where to Watch">
            <ProvidersRow providers={derived!.providers} />
          </Section>
        ) : null}

        <Section title="Details">
          <FactGrid facts={derived!.facts} />
        </Section>

        {derived!.keywords.length ? (
          <Section title="Keywords">
            <Pills items={derived!.keywords} />
          </Section>
        ) : null}

        {d.reviews?.results?.length ? (
          <Section title="Reviews">
            <Reviews reviews={d.reviews.results} />
          </Section>
        ) : null}

        {derived!.links.length ? (
          <Section title="Links">
            <LinksRow links={derived!.links} />
          </Section>
        ) : null}

        {derived!.recs.length ? (
          <Section title="More Like This">
            <FlatList
              data={derived!.recs}
              horizontal
              keyExtractor={(m: any) => String(m.id)}
              showsHorizontalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
              renderItem={({ item }: any) => (
                <Pressable
                  style={styles.recCard}
                  onPress={() =>
                    navigation.replace("TvDetails", {
                      id: String(item.id),
                      type: "tv",
                    })
                  }
                >
                  <View style={styles.recImgWrap}>
                    <Image source={{ uri: img(item.poster_path, "w342") || undefined }} style={styles.recImg} contentFit="cover" transition={200} />
                    {item.vote_average ? (
                      <View style={styles.recBadge}>
                        <Ionicons name="star" size={9} color={colors.honey} />
                        <Text style={styles.recBadgeText}>{item.vote_average.toFixed(1)}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.recTitle} numberOfLines={1}>
                    {item.name || item.title}
                  </Text>
                </Pressable>
              )}
            />
          </Section>
        ) : null}
      </Animated.ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  errText: { color: colors.danger, fontFamily: font.body, fontSize: ms(15) },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },

  hero: { width: "100%", height: HERO_H, justifyContent: "flex-end" },
  header: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 20 },
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
  heroContent: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  title: { color: colors.text, fontFamily: font.headlineXbold, fontSize: ms(30), letterSpacing: -0.6, lineHeight: ms(34) },
  seasonsLine: { color: colors.honey, fontFamily: font.bodySemi, fontSize: ms(13) },

  actions: { flexDirection: "row", gap: 12, paddingHorizontal: 16, marginTop: 16 },
  playBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.honey,
    paddingVertical: 14,
    borderRadius: radius.pill,
    ...glow.honey,
  },
  playText: { color: colors.onHoney, fontFamily: font.headline, fontSize: ms(15) },
  togetherBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    paddingVertical: 14,
    borderRadius: radius.pill,
  },
  togetherText: { color: colors.text, fontFamily: font.headline, fontSize: ms(15) },

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

  nextBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.honeySoft,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 10,
    borderRadius: radius.md,
  },
  nextText: { color: colors.text, fontFamily: font.bodyMed, fontSize: ms(12), flex: 1 },

  overviewWrap: { paddingHorizontal: 16, marginTop: 18 },
  overview: { color: colors.textDim, fontFamily: font.body, fontSize: ms(14), lineHeight: 21 },
  moreLink: { color: colors.honey, fontFamily: font.bodySemi, fontSize: ms(13), marginTop: 4 },

  seasonChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  seasonChipActive: { backgroundColor: colors.honeySoft, borderColor: colors.honey },
  seasonChipText: { color: colors.textDim, fontFamily: font.bodySemi, fontSize: ms(13) },
  seasonChipTextActive: { color: colors.honey },

  episode: { flexDirection: "row", gap: 12, marginBottom: 16, alignItems: "center" },
  epStillWrap: { width: 120, height: 68 },
  epStill: { width: 120, height: 68, borderRadius: radius.md, backgroundColor: colors.bgElevated },
  epNoStill: { alignItems: "center", justifyContent: "center" },
  epPlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(16,13,10,0.28)",
    borderRadius: radius.md,
  },
  epTitle: { color: colors.text, fontFamily: font.bodySemi, fontSize: ms(14) },
  epMeta: { flexDirection: "row", gap: 10, marginTop: 3, alignItems: "center" },
  epMetaText: { color: colors.textDim, fontFamily: font.body, fontSize: ms(11) },
  epRating: { flexDirection: "row", alignItems: "center", gap: 2 },
  epOverview: { color: colors.textDim, fontFamily: font.body, fontSize: ms(12), marginTop: 4, lineHeight: 16 },

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

export default React.memo(TvDetailsScreen);
