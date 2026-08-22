/**
 * Reusable Bearoom detail sections, shared by the movie + TV detail screens.
 * Cozy cinema-lounge skin: honey accents on warm charcoal, Outfit/Inter type,
 * round cast avatars, glass provider chips. Each renders a slice of the rich
 * TMDB data (see utils/tmdbDetails).
 */
import { colors, ms, font, radius } from "@/theme/bearoom";
import type { ExternalLink, Person, WatchProviders } from "@/utils/tmdbDetails";
import { Ionicons } from "@expo/vector-icons";
import { BouncyPressable } from "@/src/ui";
import { openPerson } from "@/src/navigation/actions";
import { Image } from "expo-image";
import React from "react";
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

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

/** Rating · year · runtime · certification · genres, left-aligned with dot separators. */
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
  const dots: React.ReactNode[] = [];
  if (year) dots.push(<Text key="y" style={styles.metaItem}>{year}</Text>);
  if (runtime) dots.push(<Text key="r" style={styles.metaItem}>{runtime}</Text>);
  if (certification)
    dots.push(
      <View key="c" style={styles.certBox}>
        <Text style={styles.certText}>{certification}</Text>
      </View>,
    );
  if (genres && genres.length)
    dots.push(<Text key="g" style={styles.metaItem}>{genres.slice(0, 2).join(" · ")}</Text>);

  return (
    <View style={styles.metaRow}>
      {rating ? (
        <View style={styles.ratingPill}>
          <Ionicons name="star" size={14} color={colors.honey} />
          <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
        </View>
      ) : null}
      {dots.map((node, i) => (
        <React.Fragment key={i}>
          {(rating || i > 0) ? <View style={styles.sep} /> : null}
          {node}
        </React.Fragment>
      ))}
    </View>
  );
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
        <BouncyPressable 
          key={`${p.id}-${i}`} 
          style={styles.person}
          onPress={() => openPerson(p.id)}
        >
          {p.profile ? (
            <Image source={{ uri: p.profile }} style={styles.personImg} contentFit="cover" />
          ) : (
            <View style={[styles.personImg, styles.personNoImg]}>
              <Ionicons name="person" size={24} color={colors.textFaint} />
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
        </BouncyPressable>
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
            {g.list.map((p) => (
              <View key={p.id} style={styles.provChip}>
                {p.logo ? (
                  <Image source={{ uri: p.logo }} style={styles.provLogo} contentFit="cover" />
                ) : (
                  <View style={[styles.provLogo, styles.provNoLogo]}>
                    <Text style={styles.provNoLogoText} numberOfLines={1}>
                      {p.name.slice(0, 2)}
                    </Text>
                  </View>
                )}
                <Text style={styles.provName} numberOfLines={1}>{p.name}</Text>
              </View>
            ))}
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
                <Ionicons name="star" size={12} color={colors.honey} />
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
          <Ionicons name="open-outline" size={13} color={colors.honey} />
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
      <Ionicons name="logo-youtube" size={18} color={colors.text} />
      <Text style={styles.trailerText}>Watch Trailer</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 16, marginTop: 24 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sectionTitle: { color: colors.text, fontFamily: font.headline, fontSize: ms(18) },

  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  ratingPill: { flexDirection: "row", alignItems: "center", gap: 4 },
  ratingText: { color: colors.honey, fontFamily: font.bodySemi, fontSize: ms(13) },
  metaItem: { color: colors.textDim, fontFamily: font.bodyMed, fontSize: ms(13) },
  sep: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.textFaint },
  certBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  certText: { color: colors.text, fontFamily: font.label, fontSize: ms(10), letterSpacing: 0.5 },

  pillsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  pillText: { color: colors.textDim, fontFamily: font.bodyMed, fontSize: ms(12) },

  peopleRow: { gap: 16, paddingRight: 16 },
  person: { width: 72, alignItems: "center" },
  personImg: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  personNoImg: { alignItems: "center", justifyContent: "center" },
  personName: { color: colors.text, fontFamily: font.bodySemi, fontSize: ms(12), marginTop: 8, textAlign: "center" },
  personRole: { color: colors.textDim, fontFamily: font.body, fontSize: ms(10), marginTop: 1, textAlign: "center" },

  factGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 4,
  },
  fact: { width: "50%", padding: 12 },
  factLabel: { color: colors.textDim, fontFamily: font.label, fontSize: ms(10), textTransform: "uppercase", letterSpacing: 0.5 },
  factValue: { color: colors.text, fontFamily: font.bodySemi, fontSize: ms(14), marginTop: 3 },

  provGroup: { marginBottom: 14 },
  provLabel: { color: colors.textDim, fontFamily: font.bodySemi, fontSize: ms(12), marginBottom: 8 },
  provList: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  provChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  provLogo: { width: 28, height: 28, borderRadius: radius.sm, backgroundColor: colors.bgElevated },
  provNoLogo: { alignItems: "center", justifyContent: "center" },
  provNoLogoText: { color: colors.textDim, fontFamily: font.label, fontSize: ms(11) },
  provName: { color: colors.text, fontFamily: font.bodyMed, fontSize: ms(13) },
  provRegion: { color: colors.textFaint, fontFamily: font.body, fontSize: ms(11), marginTop: 4 },

  review: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 14,
  },
  reviewHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  reviewAuthor: { color: colors.text, fontFamily: font.bodySemi, fontSize: ms(14) },
  reviewRating: { flexDirection: "row", alignItems: "center", gap: 3 },
  reviewRatingText: { color: colors.honey, fontFamily: font.bodySemi, fontSize: ms(12) },
  reviewBody: { color: colors.textDim, fontFamily: font.body, fontSize: ms(13), lineHeight: 19 },

  linksRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  linkText: { color: colors.honey, fontFamily: font.bodySemi, fontSize: ms(13) },

  trailerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    paddingVertical: 12,
    borderRadius: radius.pill,
    marginTop: 10,
  },
  trailerText: { color: colors.text, fontFamily: font.bodySemi, fontSize: ms(15) },
});

export const detailColors = {
  text: colors.text,
  sub: colors.textDim,
  accent: colors.honey,
  gold: colors.honey,
  card: colors.bgElevated,
};
