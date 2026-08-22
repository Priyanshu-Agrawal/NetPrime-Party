import React from "react";
import { View, FlatList, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Chip, Text } from "@/src/ui";
import { colors, ms, radius, spacing } from "@/theme/bearoom";
import { layout } from "@/theme/styles/layout";
import { pressedStyle } from "@/theme/styles/interaction";
import { openJoinParty } from "@/src/navigation/actions";

const PROVIDERS = [
  { name: "Trending", id: null as number | null },
  { name: "Netflix", id: 8 },
  { name: "Prime Video", id: 9 },
  { name: "Apple TV+", id: 350 },
  { name: "Disney+", id: 337 },
  { name: "Max", id: 1899 },
];

const TRENDING = ["Sci-Fi", "Cozy nights", "A24", "Comedy", "New & hot", "Feel-good"];

const MOODS: { label: string; icon: keyof typeof Ionicons.glyphMap; query: string; party?: boolean }[] = [
  { label: "Movie night", icon: "film", query: "adventure" },
  { label: "Something cozy", icon: "cafe", query: "romance" },
  { label: "Watch with friends", icon: "people", query: "", party: true },
  { label: "Critically acclaimed", icon: "ribbon", query: "award" },
];

interface Props {
  searchQuery: string;
  onSearch: (query: string) => void;
  selectedProvider: number | null;
  onSelectProvider: (providerId: number | null) => void;
}

const BrowseHeader = React.memo(({ searchQuery, onSearch, selectedProvider, onSelectProvider }: Props) => {
  return (
    <View>
      {/* Trending searches */}
      <Text variant="h3" style={[styles.sectionTitle, styles.firstSectionTitle]}>
        Trending searches
      </Text>
      <View style={styles.trendWrap}>
        {TRENDING.map((t) => (
          <Chip key={t} label={t} active={searchQuery === t} onPress={() => onSearch(t)} />
        ))}
      </View>

      <Text variant="h3" style={styles.sectionTitle}>
        Browse by mood
      </Text>
      <View style={styles.moodGrid}>
        {MOODS.map((m) => (
          <Pressable
            key={m.label}
            style={({ pressed }) => [styles.moodTile, pressed && pressedStyle]}
            onPress={() => (m.party ? openJoinParty() : onSearch(m.query))}
          >
            <View style={styles.moodIcon}>
              <Ionicons name={m.icon} size={ms(20)} color={colors.honey} />
            </View>
            <Text variant="h3" style={styles.moodLabel}>
              {m.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text variant="h3" style={styles.sectionTitle}>
        {selectedProvider ? "Popular on this service" : "Trending today"}
      </Text>
      <FlatList
        horizontal
        data={PROVIDERS}
        keyExtractor={(p) => p.name}
        showsHorizontalScrollIndicator={false}
        style={styles.provList}
        contentContainerStyle={styles.provRow}
        renderItem={({ item: p }) => (
          <Chip
            label={p.name}
            active={selectedProvider === p.id}
            onPress={() => onSelectProvider(p.id)}
          />
        )}
      />
    </View>
  );
});

BrowseHeader.displayName = "BrowseHeader";

const styles = StyleSheet.create({
  sectionTitle: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    fontSize: ms(17),
  },
  firstSectionTitle: { marginTop: 0 },
  trendWrap: { flexDirection: "row", flexWrap: "wrap", gap: layout.railGap, paddingHorizontal: spacing.lg },

  moodGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, paddingHorizontal: spacing.lg },
  moodTile: {
    flexGrow: 1,
    flexBasis: "47%",
    height: ms(100),
    borderRadius: radius.lg,
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md + 2,
    justifyContent: "space-between",
  },
  moodIcon: {
    width: ms(40),
    height: ms(40),
    borderRadius: radius.pill,
    backgroundColor: colors.honeySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  moodLabel: { fontSize: ms(15) },

  provList: { flexGrow: 0, marginBottom: ms(18) },
  provRow: { paddingHorizontal: spacing.lg, gap: spacing.sm },
});

export default BrowseHeader;
