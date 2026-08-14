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
import { addToWatchHistory } from "@/utils/history";
import {
  externalLinks,
  fetchDetails,
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

const Details: React.FC = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useGlobalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    navigation.setOptions({ headerShown: false, animation: "fade" });
  }, [navigation]);

  useEffect(() => {
    let aborted = false;
    setLoading(true);
    fetchDetails("movie", id!)
      .then((data) => !aborted && (setD(data), setError(undefined)))
      .catch((e) => !aborted && setError(e.message))
      .finally(() => !aborted && setLoading(false));
    return () => {
      aborted = true;
    };
  }, [id]);

  const derived = useMemo(() => {
    if (!d) return null;
    return {
      trailer: pickTrailer(d),
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

  const handlePlay = () => {
    void addToWatchHistory({
      id: id?.toString(),
      title: d.title,
      type: "movie",
      poster_path: d.poster_path,
    });
    router.push({
      pathname: "/(player)/player",
      params: {
        id: id!.toString(),
        type: "movie",
        title: d.title,
        poster_path: d.poster_path || "",
        year: d.release_date?.slice(0, 4) || "",
      },
    });
  };

  const backdrop = img(d.backdrop_path, "w780") || img(d.poster_path, "w780");

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
              <Text style={styles.title}>{d.title}</Text>
              {d.tagline ? <Text style={styles.tagline}>{d.tagline}</Text> : null}
            </View>
          </View>
        </View>

        <View style={{ marginTop: 12 }}>
          <MetaBar
            rating={d.vote_average}
            votes={d.vote_count}
            year={d.release_date?.slice(0, 4)}
            runtime={runtimeStr(d.runtime)}
            certification={derived!.cert}
            genres={(d.genres ?? []).map((g: any) => g.name)}
          />
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.playBtn} onPress={handlePlay}>
            <MaterialIcons name="play-arrow" size={24} color="#fff" />
            <Text style={styles.playText}>Play Now</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <TrailerButton trailerKey={derived!.trailer?.key} />
          </View>
        </View>

        {d.overview ? (
          <Section title="Overview">
            <Text style={styles.overview}>{d.overview}</Text>
          </Section>
        ) : null}

        {derived!.cast.length ? (
          <Section title="Cast">
            <PeopleRow people={derived!.cast} />
          </Section>
        ) : null}

        {derived!.crew.length ? (
          <Section title="Crew">
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
                      pathname: "/(player)/details",
                      params: { id: String(item.id), type: "movie" },
                    })
                  }
                >
                  <Image
                    source={{ uri: img(item.poster_path, "w342") || undefined }}
                    style={styles.recImg}
                  />
                  <Text style={styles.recTitle} numberOfLines={1}>
                    {item.title || item.name}
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
  back: {
    position: "absolute",
    top: 44,
    left: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 20,
    padding: 4,
  },
  heroContent: {
    position: "absolute",
    bottom: 14,
    left: 16,
    right: 16,
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-end",
  },
  poster: {
    width: width * 0.28,
    height: width * 0.28 * 1.5,
    borderRadius: 10,
    backgroundColor: "#222",
  },
  heroText: { flex: 1, paddingBottom: 4 },
  title: { color: "#fff", fontSize: 24, fontWeight: "800" },
  tagline: { color: "#c8ccd0", fontSize: 13, fontStyle: "italic", marginTop: 4 },

  actions: { flexDirection: "row", gap: 10, paddingHorizontal: 16, marginTop: 16, alignItems: "center" },
  playBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: C.accent,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 10,
  },
  playText: { color: "#fff", fontWeight: "800", fontSize: 15 },

  overview: { color: "#d3d7db", fontSize: 14, lineHeight: 21 },

  recCard: { width: 110 },
  recImg: { width: 110, height: 165, borderRadius: 10, backgroundColor: "#222" },
  recTitle: { color: C.text, fontSize: 12, fontWeight: "600", marginTop: 6 },
  recRating: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  recRatingText: { color: C.sub, fontSize: 11 },
});

export default Details;
