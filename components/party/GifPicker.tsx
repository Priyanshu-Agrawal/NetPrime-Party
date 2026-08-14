/**
 * GifPicker — a frosted bottom-sheet GIF browser for the watch-party chat.
 * Trending on open, live search as you type (debounced), tap to send. All Giphy
 * calls go through our Cloudflare proxy (services/giphy) so no key ships here.
 */
import { searchGifs, trendingGifs, type GifItem } from "@/services/giphy";
import { colors, font, ms, radius } from "@/theme/bearoom";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
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
const COLS = 2;
const GAP = ms(8);
const PAD = ms(14);
const TILE_W = Math.floor((width - PAD * 2 - GAP) / COLS);
const TILE_H = Math.round(TILE_W * 0.75);

interface Props {
  visible: boolean;
  onClose: () => void;
  onPick: (gif: GifItem) => void;
}

export function GifPicker({ visible, onClose, onPick }: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<GifItem[]>([]);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load trending when opened; reset on close.
  useEffect(() => {
    if (!visible) {
      setQuery("");
      setGifs([]);
      return;
    }
    let alive = true;
    setLoading(true);
    trendingGifs().then((g) => alive && (setGifs(g), setLoading(false)));
    return () => {
      alive = false;
    };
  }, [visible]);

  // Debounced search.
  useEffect(() => {
    if (!visible) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      let alive = true;
      setLoading(true);
      (query.trim() ? searchGifs(query) : trendingGifs()).then(
        (g) => alive && (setGifs(g), setLoading(false)),
      );
      return () => {
        alive = false;
      };
    }, 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, visible]);

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
              placeholder="Search GIFs"
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

        <FlatList
          data={gifs}
          keyExtractor={(g) => g.id}
          numColumns={COLS}
          columnWrapperStyle={{ gap: GAP }}
          contentContainerStyle={styles.grid}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Pressable
              style={styles.tile}
              onPress={() => {
                onPick(item);
                onClose();
              }}
            >
              <Image source={{ uri: item.previewUrl }} style={styles.tileImg} contentFit="cover" transition={120} />
            </Pressable>
          )}
          ListFooterComponent={
            loading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.honey} />
              </View>
            ) : gifs.length === 0 ? (
              <View style={styles.loading}>
                <Ionicons name="images-outline" size={ms(28)} color={colors.textFaint} />
                <Text style={styles.emptyText}>No GIFs found</Text>
              </View>
            ) : null
          }
        />
        <View style={styles.attribution}>
          <Text style={styles.attrText}>Powered by GIPHY</Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(8,6,4,0.6)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "70%",
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

  grid: { paddingHorizontal: PAD, paddingBottom: ms(20), gap: GAP },
  tile: {
    width: TILE_W,
    height: TILE_H,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  tileImg: { width: "100%", height: "100%" },
  loading: { paddingVertical: ms(40), alignItems: "center", gap: ms(8) },
  emptyText: { color: colors.textFaint, fontFamily: font.body, fontSize: ms(13) },
  attribution: { alignItems: "center", paddingVertical: ms(6) },
  attrText: { color: colors.textFaint, fontFamily: font.label, fontSize: ms(10), letterSpacing: 1 },
});

export default GifPicker;
