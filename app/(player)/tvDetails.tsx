import {
  detailColors as C,
  FactGrid,
  LinksRow,
  MetaBar,
  PeopleRow,
  Pills,
  ProvidersRow,
  Reviews,
  Section,
  TrailerButton,
} from "@/components/details/sections";
import { API_HEADERS, API_URL } from "@/contexts/movieContext/movieContext";
import { addToWatchHistory } from "@/utils/history";
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
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useGlobalSearchParams, useNavigation, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const { height, width } = Dimensions.get("window");

const TvDetails: React.FC = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useGlobalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState<string>();
  const [season, setSeason] = useState<number | null>(null);
  const [seasonData, setSeasonData] = useState<any>(null);

  useEffect(() => {
    navigation.setOptions({ headerShown: false, animation: "fade" });
  }, [navigation]);

  useEffect(() => {
    let aborted = false;
    setLoading(true);
    fetchDetails("tv", id!)
      .then((data) => {
        if (aborted) return;
        setD(data);
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
        <ActivityIndicator size="large" color={C.accent} />
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

  const playEpisode = (ep: number) => {
    void addToWatchHistory({
      id: id?.toString(),
      title: d.name,
      type: "tv",
      season,
      episode: ep,
      poster_path: d.poster_path,
    });
    router.push({
      pathname: "/(player)/player",
      params: {
        id: id!.toString(),
        type: "tv",
        season: String(season),
        ep: String(ep),
        title: d.name,
        poster_path: d.poster_path || "",
        year: d.first_air_date?.slice(0, 4) || "",
      },
    });
  };

  const backdrop = img(d.backdrop_path, "w780") || img(d.poster_path, "w780");
  const seasons = (d.seasons ?? []).filter((s: any) => s.episode_count > 0);
  const next = d.next_episode_to_air;

  return (
    <View style={styles.container}>
      <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          {backdrop ? (
            <Image source={{ uri: backdrop }} style={styles.heroImg} resizeMode="cover" />
          ) : null}
          <LinearGradient
            colors={["rgba(0,0,0,0.1)", "rgba(0,0,0,0.6)", "#0a0a0c"]}
            style={StyleSheet.absoluteFill}
          />
          <TouchableOpacity style={styles.back} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={26} color="#fff" />
          </TouchableOpacity>
          <View style={styles.heroContent}>
            <Image source={{ uri: img(d.poster_path, "w342") || undefined }} style={styles.poster} />
            <View style={styles.heroText}>
              <Text style={styles.title}>{d.name}</Text>
              {d.tagline ? <Text style={styles.tagline}>{d.tagline}</Text> : null}
              <Text style={styles.seasonsLine}>
                {d.number_of_seasons} Seasons · {d.number_of_episodes} Episodes
              </Text>
            </View>
          </View>
        </View>

        <View style={{ marginTop: 12 }}>
          <MetaBar
            rating={d.vote_average}
            votes={d.vote_count}
            year={d.first_air_date?.slice(0, 4)}
            runtime={runtimeStr(d.episode_run_time?.[0])}
            certification={derived!.cert}
            genres={(d.genres ?? []).map((g: any) => g.name)}
          />
        </View>

        {next ? (
          <View style={styles.nextBanner}>
            <Ionicons name="calendar" size={14} color={C.accent} />
            <Text style={styles.nextText}>
              Next: S{next.season_number}E{next.episode_number} “{next.name}” · {next.air_date}
            </Text>
          </View>
        ) : null}

        {derived!.trailer ? (
          <View style={{ paddingHorizontal: 16 }}>
            <TrailerButton trailerKey={derived!.trailer.key} />
          </View>
        ) : null}

        {d.overview ? (
          <Section title="Overview">
            <Text style={styles.overview}>{d.overview}</Text>
          </Section>
        ) : null}

        {/* Seasons + Episodes */}
        {seasons.length ? (
          <Section title="Episodes">
            <FlatList
              data={seasons}
              horizontal
              keyExtractor={(s: any) => String(s.id)}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingBottom: 12 }}
              renderItem={({ item }: any) => {
                const active = item.season_number === season;
                return (
                  <TouchableOpacity
                    style={[styles.seasonChip, active && styles.seasonChipActive]}
                    onPress={() => setSeason(item.season_number)}
                  >
                    <Text style={[styles.seasonChipText, active && styles.seasonChipTextActive]}>
                      {item.season_number === 0 ? "Specials" : `Season ${item.season_number}`}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
            {seasonData ? (
              (seasonData.episodes ?? []).map((ep: any) => (
                <TouchableOpacity
                  key={ep.id}
                  style={styles.episode}
                  onPress={() => playEpisode(ep.episode_number)}
                >
                  <View style={styles.epStillWrap}>
                    {ep.still_path ? (
                      <Image source={{ uri: img(ep.still_path, "w300") || undefined }} style={styles.epStill} />
                    ) : (
                      <View style={[styles.epStill, styles.epNoStill]}>
                        <Ionicons name="tv" size={20} color="#555" />
                      </View>
                    )}
                    <View style={styles.epPlay}>
                      <MaterialIcons name="play-arrow" size={22} color="#fff" />
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
                          <MaterialIcons name="star" size={11} color={C.gold} />
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
                </TouchableOpacity>
              ))
            ) : (
              <ActivityIndicator color={C.accent} style={{ marginTop: 20 }} />
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
              ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
              renderItem={({ item }: any) => (
                <TouchableOpacity
                  style={styles.recCard}
                  onPress={() =>
                    router.replace({
                      pathname: "/(player)/tvDetails",
                      params: { id: String(item.id), type: "tv" },
                    })
                  }
                >
                  <Image source={{ uri: img(item.poster_path, "w342") || undefined }} style={styles.recImg} />
                  <Text style={styles.recTitle} numberOfLines={1}>
                    {item.name || item.title}
                  </Text>
                  <View style={styles.recRating}>
                    <MaterialIcons name="star" size={12} color={C.gold} />
                    <Text style={styles.recRatingText}>
                      {item.vote_average ? item.vote_average.toFixed(1) : "—"}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          </Section>
        ) : null}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0c" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0a0a0c" },
  errText: { color: "#ff6b6b", fontSize: 15 },

  hero: { width: "100%", height: height * 0.46 },
  heroImg: { width: "100%", height: "100%" },
  back: { position: "absolute", top: 44, left: 12, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 20, padding: 4 },
  heroContent: { position: "absolute", bottom: 14, left: 16, right: 16, flexDirection: "row", gap: 14, alignItems: "flex-end" },
  poster: { width: width * 0.28, height: width * 0.28 * 1.5, borderRadius: 10, backgroundColor: "#222" },
  heroText: { flex: 1, paddingBottom: 4 },
  title: { color: "#fff", fontSize: 24, fontWeight: "800" },
  tagline: { color: "#c8ccd0", fontSize: 13, fontStyle: "italic", marginTop: 4 },
  seasonsLine: { color: C.accent, fontSize: 13, fontWeight: "600", marginTop: 6 },

  nextBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(78,161,255,0.12)",
    marginHorizontal: 16,
    marginTop: 14,
    padding: 10,
    borderRadius: 10,
  },
  nextText: { color: C.text, fontSize: 12, flex: 1 },

  overview: { color: "#d3d7db", fontSize: 14, lineHeight: 21 },

  seasonChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: C.chip,
    borderWidth: 1,
    borderColor: C.line,
  },
  seasonChipActive: { backgroundColor: C.accent, borderColor: C.accent },
  seasonChipText: { color: "#cfd2d6", fontSize: 13, fontWeight: "600" },
  seasonChipTextActive: { color: "#fff" },

  episode: { flexDirection: "row", gap: 12, marginBottom: 14, alignItems: "center" },
  epStillWrap: { width: 120, height: 68 },
  epStill: { width: 120, height: 68, borderRadius: 8, backgroundColor: "#222" },
  epNoStill: { alignItems: "center", justifyContent: "center" },
  epPlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: 8,
  },
  epTitle: { color: C.text, fontSize: 14, fontWeight: "700" },
  epMeta: { flexDirection: "row", gap: 10, marginTop: 3, alignItems: "center" },
  epMetaText: { color: C.sub, fontSize: 11 },
  epRating: { flexDirection: "row", alignItems: "center", gap: 2 },
  epOverview: { color: "#a9adb2", fontSize: 12, marginTop: 4, lineHeight: 16 },

  recCard: { width: 110 },
  recImg: { width: 110, height: 165, borderRadius: 10, backgroundColor: "#222" },
  recTitle: { color: C.text, fontSize: 12, fontWeight: "600", marginTop: 6 },
  recRating: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  recRatingText: { color: C.sub, fontSize: 11 },
});

export default React.memo(TvDetails);
