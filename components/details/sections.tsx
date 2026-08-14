/**
 * Reusable dark-themed detail sections, shared by the movie + TV detail screens.
 * Each renders a slice of the rich TMDB data (see utils/tmdbDetails).
 */
import type { ExternalLink, Person, WatchProviders } from "@/utils/tmdbDetails";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import React from "react";
import {
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const C = {
  text: "#f2f2f4",
  sub: "#9aa0a6",
  card: "#17171b",
  chip: "#20202a",
  accent: "#4ea1ff",
  gold: "#f5c518",
  line: "#242430",
};

export function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

/** Rating + year + runtime + certification + genres, in one compact meta bar. */
export function MetaBar({
  rating,
  votes,
  year,
  runtime,
  certification,
  genres,
}: {
  rating?: number;
  votes?: number;
  year?: string;
  runtime?: string;
  certification?: string;
  genres?: string[];
}) {
  return (
    <View style={styles.metaWrap}>
      <View style={styles.metaRow}>
        {rating ? (
          <View style={styles.ratingPill}>
            <MaterialIcons name="star" size={15} color={C.gold} />
            <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
            {votes ? <Text style={styles.ratingVotes}>({fmtCount(votes)})</Text> : null}
          </View>
        ) : null}
        {certification ? (
          <View style={styles.certBox}>
            <Text style={styles.certText}>{certification}</Text>
          </View>
        ) : null}
        {year ? <MetaDot label={year} /> : null}
        {runtime ? <MetaDot label={runtime} /> : null}
      </View>
      {genres && genres.length > 0 ? (
        <Text style={styles.genres}>{genres.join(" · ")}</Text>
      ) : null}
    </View>
  );
}

function MetaDot({ label }: { label: string }) {
  return <Text style={styles.metaDot}>{label}</Text>;
}

export function Pills({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <View style={styles.pillsWrap}>
      {items.map((k) => (
        <View key={k} style={styles.pill}>
          <Text style={styles.pillText}>{k}</Text>
        </View>
      ))}
    </View>
  );
}

export function PeopleRow({ people }: { people: Person[] }) {
  if (!people.length) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.peopleRow}
    >
      {people.map((p, i) => (
        <View key={`${p.id}-${i}`} style={styles.person}>
          {p.profile ? (
            <Image source={{ uri: p.profile }} style={styles.personImg} />
          ) : (
            <View style={[styles.personImg, styles.personNoImg]}>
              <Ionicons name="person" size={26} color="#555" />
            </View>
          )}
          <Text style={styles.personName} numberOfLines={1}>
            {p.name}
          </Text>
          {p.role ? (
            <Text style={styles.personRole} numberOfLines={1}>
              {p.role}
            </Text>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

export function FactGrid({ facts }: { facts: { label: string; value: string }[] }) {
  const shown = facts.filter((f) => f.value && f.value !== "—");
  if (!shown.length) return null;
  return (
    <View style={styles.factGrid}>
      {shown.map((f) => (
        <View key={f.label} style={styles.fact}>
          <Text style={styles.factLabel}>{f.label}</Text>
          <Text style={styles.factValue}>{f.value}</Text>
        </View>
      ))}
    </View>
  );
}

export function ProvidersRow({ providers }: { providers: WatchProviders | null }) {
  if (!providers) return null;
  const groups: { label: string; list: WatchProviders["flatrate"] }[] = [
    { label: "Stream", list: providers.flatrate },
    { label: "Rent", list: providers.rent },
    { label: "Buy", list: providers.buy },
  ].filter((g) => g.list.length > 0);
  if (!groups.length) return null;
  return (
    <View>
      {groups.map((g) => (
        <View key={g.label} style={styles.provGroup}>
          <Text style={styles.provLabel}>{g.label}</Text>
          <View style={styles.provList}>
            {g.list.map((p) =>
              p.logo ? (
                <Image key={p.id} source={{ uri: p.logo }} style={styles.provLogo} />
              ) : (
                <View key={p.id} style={[styles.provLogo, styles.provNoLogo]}>
                  <Text style={styles.provNoLogoText} numberOfLines={1}>
                    {p.name.slice(0, 3)}
                  </Text>
                </View>
              ),
            )}
          </View>
        </View>
      ))}
      <Text style={styles.provRegion}>Availability in {providers.region} · data by JustWatch</Text>
    </View>
  );
}

export function Reviews({ reviews }: { reviews: any[] }) {
  const list = (reviews ?? []).slice(0, 3);
  if (!list.length) return null;
  return (
    <View style={{ gap: 12 }}>
      {list.map((r) => (
        <View key={r.id} style={styles.review}>
          <View style={styles.reviewHead}>
            <Text style={styles.reviewAuthor}>{r.author}</Text>
            {r.author_details?.rating ? (
              <View style={styles.reviewRating}>
                <MaterialIcons name="star" size={12} color={C.gold} />
                <Text style={styles.reviewRatingText}>
                  {r.author_details.rating}/10
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.reviewBody} numberOfLines={6}>
            {r.content}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function LinksRow({ links }: { links: ExternalLink[] }) {
  if (!links.length) return null;
  return (
    <View style={styles.linksRow}>
      {links.map((l) => (
        <TouchableOpacity
          key={l.label}
          style={styles.linkBtn}
          onPress={() => Linking.openURL(l.url).catch(() => {})}
        >
          <Ionicons name="open-outline" size={13} color={C.accent} />
          <Text style={styles.linkText}>{l.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function TrailerButton({ trailerKey }: { trailerKey?: string | null }) {
  if (!trailerKey) return null;
  return (
    <TouchableOpacity
      style={styles.trailerBtn}
      onPress={() =>
        Linking.openURL(`https://www.youtube.com/watch?v=${trailerKey}`).catch(() => {})
      }
    >
      <Ionicons name="logo-youtube" size={18} color="#fff" />
      <Text style={styles.trailerText}>Watch Trailer</Text>
    </TouchableOpacity>
  );
}

function fmtCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 16, marginTop: 22 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: { color: C.text, fontSize: 18, fontWeight: "700" },

  metaWrap: { alignItems: "center", gap: 8 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "center" },
  ratingPill: { flexDirection: "row", alignItems: "center", gap: 3 },
  ratingText: { color: C.text, fontWeight: "800", fontSize: 15 },
  ratingVotes: { color: C.sub, fontSize: 12, marginLeft: 2 },
  certBox: {
    borderWidth: 1,
    borderColor: C.sub,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  certText: { color: C.text, fontSize: 12, fontWeight: "700" },
  metaDot: { color: C.sub, fontSize: 14, fontWeight: "600" },
  genres: { color: C.sub, fontSize: 13, textAlign: "center" },

  pillsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    backgroundColor: C.chip,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  pillText: { color: "#cfd2d6", fontSize: 12, fontWeight: "500" },

  peopleRow: { gap: 14, paddingRight: 16 },
  person: { width: 92 },
  personImg: { width: 92, height: 112, borderRadius: 10, backgroundColor: "#222" },
  personNoImg: { alignItems: "center", justifyContent: "center" },
  personName: { color: C.text, fontSize: 12, fontWeight: "600", marginTop: 6 },
  personRole: { color: C.sub, fontSize: 11, marginTop: 1 },

  factGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 4,
  },
  fact: { width: "50%", padding: 12 },
  factLabel: { color: C.sub, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  factValue: { color: C.text, fontSize: 14, fontWeight: "600", marginTop: 3 },

  provGroup: { marginBottom: 14 },
  provLabel: { color: C.sub, fontSize: 12, marginBottom: 8, fontWeight: "600" },
  provList: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  provLogo: { width: 44, height: 44, borderRadius: 10, backgroundColor: "#222" },
  provNoLogo: { alignItems: "center", justifyContent: "center" },
  provNoLogoText: { color: "#aaa", fontSize: 11, fontWeight: "700" },
  provRegion: { color: "#666", fontSize: 11, marginTop: 4 },

  review: { backgroundColor: C.card, borderRadius: 14, padding: 14 },
  reviewHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  reviewAuthor: { color: C.text, fontWeight: "700", fontSize: 14 },
  reviewRating: { flexDirection: "row", alignItems: "center", gap: 3 },
  reviewRatingText: { color: C.gold, fontSize: 12, fontWeight: "700" },
  reviewBody: { color: "#c8ccd0", fontSize: 13, lineHeight: 19 },

  linksRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: C.chip,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  linkText: { color: C.accent, fontSize: 13, fontWeight: "600" },

  trailerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#c4302b",
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 10,
  },
  trailerText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});

export const detailColors = C;
