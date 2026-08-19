/**
 * GifPicker — a frosted bottom-sheet GIF + sticker browser for the watch-party
 * chat. Tabs for GIFs / Stickers, trending on open, debounced search, blur-up
 * loading (KLIPY blur_preview) + a shimmer skeleton on first load. Tap to send.
 * Media/API calls go DIRECTLY to KLIPY via services/gifs (KLIPY ToS forbids
 * proxying/caching/reordering results); this component holds no key.
 */
import {
  type MediaItem,
  type MediaKind,
  type ReportReason,
} from "@/services/gifs";
import {
  useKlipyReportMutation,
  useKlipySearchQuery,
  useKlipyShareMutation,
} from "@/src/store/services/klipyApi";
import { bearAlert } from "@/components/ui/BearAlert";
import { colors, font, ms, radius } from "@/theme/bearoom";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");
const COLS = 3;
const GAP = ms(8);
const PAD = ms(14);
const TILE_W = Math.floor((width - PAD * 2 - GAP * (COLS - 1)) / COLS);
const GIF_H = Math.round(TILE_W * 0.95);

const TABS: { key: MediaKind; label: string }[] = [
  { key: "gifs", label: "GIFs" },
  { key: "stickers", label: "Stickers" },
];

// Curated for a watch party — the reactions you actually send mid-movie, not
// KLIPY's generic "happy birthday / good night" trending set. label = chip, q = search.
const REACTIONS: { label: string; q: string }[] = [
  { label: "😂 LOL", q: "laughing" },
  { label: "😱 OMG", q: "shocked omg" },
  { label: "🤯 Mind blown", q: "mind blown" },
  { label: "🌀 Plot twist", q: "plot twist" },
  { label: "😭 Crying", q: "crying" },
  { label: "🍿 Popcorn", q: "popcorn movie" },
  { label: "👏 Applause", q: "applause clapping" },
  { label: "😨 Scared", q: "scared" },
  { label: "🙈 Cringe", q: "cringe" },
  { label: "😴 Bored", q: "bored" },
  { label: "🔥 Hype", q: "excited hype" },
  { label: "🤦 Facepalm", q: "facepalm" },
  { label: "😍 Wow", q: "wow amazing" },
  { label: "🎬 Movies", q: "movie" },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onPick: (item: MediaItem, kind: MediaKind) => void;
  /** Per-user id KLIPY requires (frequency capping / analytics). */
  customerId: string;
}

export function GifPicker({ visible, onClose, onPick, customerId }: Props) {
  const insets = useSafeAreaInsets();
  const [kind, setKind] = useState<MediaKind>("gifs");
  const [query, setQuery] = useState("");
  // Debounced search term fed to the cached KLIPY query. Default (no input) →
  // watch-party reactions, not KLIPY's generic trending set.
  const [searchTerm, setSearchTerm] = useState("reaction");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [shareKlipy] = useKlipyShareMutation();
  const [reportKlipy] = useKlipyReportMutation();

  // RTK Query: cached per (kind, searchTerm) — reopening the picker or repeating
  // a search is instant (no skeleton flash), while `skip` pauses when hidden.
  const { data: items = [], isFetching: loading } = useKlipySearchQuery(
    { kind, query: searchTerm, customerId },
    { skip: !visible },
  );

  // Reset on close.
  useEffect(() => {
    if (!visible) {
      setQuery("");
      setKind("gifs");
    }
  }, [visible]);

  // Debounce the text input into `searchTerm` (350ms while typing, instant on clear).
  useEffect(() => {
    if (!visible) return;
    if (debounce.current) clearTimeout(debounce.current);
    const q = query.trim();
    debounce.current = setTimeout(() => setSearchTerm(q || "reaction"), q ? 350 : 0);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, visible]);

  // Send an item: fire KLIPY's Share Trigger (personalization + reporting), then hand it up.
  const pick = (item: MediaItem) => {
    shareKlipy({ kind, slug: item.slug, customerId, q: query.trim() });
    onPick(item, kind);
    onClose();
  };

  // Long-press → report. KLIPY accepts a short reason; keep the common few.
  const report = (item: MediaItem) => {
    const send = (reason: ReportReason) => {
      reportKlipy({ kind, slug: item.slug, customerId, reason });
      bearAlert("Reported", "Thanks — KLIPY will review it.");
    };
    bearAlert("Report this GIF?", "Help keep the pack's chat clean.", [
      { text: "Inappropriate", style: "destructive", onPress: () => send("offensive") },
      { text: "Spam", onPress: () => send("spam") },
      { text: "Broken", onPress: () => send("broken") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const sticker = kind === "stickers";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, ms(10)) }]}
      >
        <View style={styles.grabber} />

        <View style={styles.header}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={ms(16)} color={colors.textDim} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={`Search ${sticker ? "stickers" : "KLIPY"}`}
              placeholderTextColor={colors.textFaint}
              style={styles.searchInput}
              selectionColor={colors.honey}
              autoCorrect={false}
              returnKeyType="search"
            />
            {query ? (
              <Pressable onPress={() => setQuery("")} hitSlop={8}>
                <Ionicons name="close-circle" size={ms(16)} color={colors.textDim} />
              </Pressable>
            ) : null}
          </View>
          <Pressable onPress={onClose} hitSlop={8} style={styles.close}>
            <Text style={styles.closeText}>Done</Text>
          </Pressable>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          {TABS.map((t) => {
            const active = kind === t.key;
            return (
              <Pressable key={t.key} style={[styles.tab, active && styles.tabActive]} onPress={() => setKind(t.key)}>
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Watch-party reaction chips (discovery when not searching) */}
        {!query.trim() ? (
          <View style={styles.catWrap}>
            <FlatList
              horizontal
              data={REACTIONS}
              keyExtractor={(c) => c.q}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.catRow}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: c }) => (
                <Pressable style={styles.catChip} onPress={() => setQuery(c.q)}>
                  <Text style={styles.catText}>{c.label}</Text>
                </Pressable>
              )}
            />
          </View>
        ) : null}

        {loading && items.length === 0 ? (
          <SkeletonGrid />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(g) => g.id}
            numColumns={COLS}
            columnWrapperStyle={{ gap: GAP }}
            contentContainerStyle={styles.grid}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.tile, { height: sticker ? TILE_W : GIF_H }, sticker && styles.tileSticker]}
                onPress={() => pick(item)}
                onLongPress={() => report(item)}
                delayLongPress={400}
              >
                <Image
                  source={{ uri: item.previewUrl }}
                  placeholder={sticker || !item.blur ? undefined : { uri: item.blur }}
                  placeholderContentFit="cover"
                  style={styles.tileImg}
                  contentFit={sticker ? "contain" : "cover"}
                  transition={200}
                />
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="images-outline" size={ms(28)} color={colors.textFaint} />
                <Text style={styles.emptyText}>Nothing found</Text>
              </View>
            }
          />
        )}
        <View style={styles.attribution}>
          <Text style={styles.attrText}>Powered by KLIPY</Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Shimmering skeleton tiles for the first load. */
function SkeletonGrid() {
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={[styles.grid, styles.skeletonWrap]}>
      {Array.from({ length: 9 }).map((_, i) => (
        <Animated.View key={i} style={[styles.skeleton, { opacity: pulse }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.modalBackdrop },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "72%",
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    paddingTop: ms(10),
  },
  grabber: { alignSelf: "center", width: ms(38), height: ms(4), borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: ms(10) },
  header: { flexDirection: "row", alignItems: "center", gap: ms(10), paddingHorizontal: PAD, marginBottom: ms(10) },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: ms(8),
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingHorizontal: ms(14),
    height: ms(42),
  },
  searchInput: { flex: 1, color: colors.text, fontFamily: font.body, fontSize: ms(14), padding: 0 },
  close: { paddingHorizontal: ms(4) },
  closeText: { color: colors.honey, fontFamily: font.label, fontSize: ms(14) },

  tabs: { flexDirection: "row", gap: ms(8), paddingHorizontal: PAD, marginBottom: ms(10) },
  tab: {
    paddingHorizontal: ms(16),
    paddingVertical: ms(7),
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.honeySoft, borderColor: colors.honey },
  tabText: { color: colors.textDim, fontFamily: font.label, fontSize: ms(13) },
  tabTextActive: { color: colors.honey },

  catWrap: { marginBottom: ms(8) },
  catRow: { paddingHorizontal: PAD, gap: ms(8) },
  catChip: {
    paddingHorizontal: ms(14),
    paddingVertical: ms(7),
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  catText: { color: colors.text, fontFamily: font.bodyMed, fontSize: ms(12) },

  grid: { paddingHorizontal: PAD, paddingBottom: ms(20), gap: GAP },
  skeletonWrap: { flexDirection: "row", flexWrap: "wrap" },
  tile: { width: TILE_W, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surface },
  tileSticker: { backgroundColor: "transparent" },
  tileImg: { width: "100%", height: "100%" },
  skeleton: { width: TILE_W, height: GIF_H, borderRadius: radius.md, backgroundColor: colors.surfaceStrong, marginBottom: GAP },
  empty: { paddingVertical: ms(40), alignItems: "center", gap: ms(8) },
  emptyText: { color: colors.textFaint, fontFamily: font.body, fontSize: ms(13) },
  attribution: { alignItems: "center", paddingVertical: ms(6) },
  attrText: { color: colors.textFaint, fontFamily: font.label, fontSize: ms(10), letterSpacing: 1 },
});

export default GifPicker;
