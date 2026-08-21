/**
 * ProviderSheet — a dark bottom-sheet server/provider picker.
 *
 * NOTE: this component renders a <BottomSheetModal>, so it MUST be mounted
 * somewhere under a <BottomSheetModalProvider> (itself under a
 * <GestureHandlerRootView>). The app root/parent is responsible for those
 * wrappers — they are intentionally NOT added here.
 *
 * Parent usage:
 *   const sheetRef = useRef<BottomSheetModal>(null);
 *   <ProviderSheet
 *     ref={sheetRef}
 *     selectedId={selected.id}
 *     onSelect={(id) => setSelected(getProvider(id))}
 *   />
 *   sheetRef.current?.present();
 */
import React, {
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from "react-native";
import {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetModal,
  BottomSheetTextInput,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";

import {
  isPartyCapable,
  isUnstable,
  type Provider,
} from "@/components/player/providerRegistry";
import { useProviders } from "@/src/store/features/providers/hooks";
import { colors, font } from "@/theme/bearoom";

const COLORS = {
  bg: colors.bgElevated,
  accent: colors.honey,
  warn: colors.honeyBright,
  white: colors.text,
  muted: colors.textDim,
  divider: colors.border,
  input: colors.surfaceStrong,
  chip: colors.surfaceStrong,
  selectedRow: colors.honeySoft,
  handle: colors.borderStrong,
} as const;

type FilterKey = "all" | "party";

export interface ProviderSheetProps {
  selectedId: string;
  /** Parent updates selection; sheet dismisses itself after. */
  onSelect: (id: string) => void;
  /** Providers that failed this session — hidden so the fallback never re-offers them. */
  excludeIds?: string[];
  /** Sheet fully closed. Lets the parent flush a present() that was swallowed by
   *  this dismiss animation (pick → instant-fail race). */
  onDismiss?: () => void;
  /** Snap index changed (-1 = closed). Lets the parent clear pending-present state
   *  once the sheet is actually open. */
  onChange?: (index: number) => void;
}

/** Strip the protocol so the domain reads as a compact subtitle. */
function prettyDomain(allowedDomain: string): string {
  return allowedDomain.replace(/^https?:\/\//, "");
}

export const ProviderSheet = forwardRef<BottomSheetModal, ProviderSheetProps>(
  ({ selectedId, onSelect, excludeIds, onDismiss, onChange }, ref) => {
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<FilterKey>("all");
    const providers = useProviders();

    const snapPoints = useMemo(() => ["70%"], []);

    const excluded = useMemo(() => new Set(excludeIds ?? []), [excludeIds]);
    const data = useMemo(() => {
      const q = search.trim().toLowerCase();
      const matches = providers.filter((p) => {
        if (filter === "party" && !isPartyCapable(p)) return false;
        if (q && !p.name.toLowerCase().includes(q)) return false;
        return true;
      });
      // Recently-failed providers sink to the bottom (rendered dimmed) but stay
      // PICKABLE — failures are often transient, so keep them recoverable rather
      // than hiding them until a remount (picking one clears its exclusion).
      return [
        ...matches.filter((p) => !excluded.has(p.id)),
        ...matches.filter((p) => excluded.has(p.id)),
      ];
    }, [search, filter, providers, excluded]);

    const dismiss = useCallback(() => {
      if (ref && typeof ref !== "function") {
        ref.current?.dismiss();
      }
    }, [ref]);

    const handleSelect = useCallback(
      (id: string) => {
        onSelect(id);
        dismiss();
      },
      [onSelect, dismiss],
    );

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          pressBehavior="close"
          opacity={0.6}
        />
      ),
      [],
    );

    const renderItem: ListRenderItem<Provider> = useCallback(
      ({ item }) => {
        const selected = item.id === selectedId;
        const party = isPartyCapable(item);
        const unstable = isUnstable(item);
        const failed = excluded.has(item.id);
        return (
          <Pressable
            onPress={() => handleSelect(item.id)}
            android_ripple={{ color: COLORS.divider }}
            style={({ pressed }) => [
              styles.row,
              selected && styles.rowSelected,
              failed && styles.rowFailed,
              pressed && styles.rowPressed,
            ]}
          >
            <View style={styles.rowText}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.name}
              </Text>
              <Text
                style={[styles.rowSubtitle, failed && styles.rowSubtitleFailed]}
                numberOfLines={1}
              >
                {failed ? "Recently failed · tap to retry" : prettyDomain(item.allowedDomain)}
              </Text>
            </View>

            <View style={styles.rowRight}>
              {unstable && (
                <View style={styles.unstablePill}>
                  <Ionicons name="warning" size={11} color={COLORS.warn} />
                  <Text style={styles.unstablePillText}>Unstable</Text>
                </View>
              )}
              {party && (
                <View style={styles.partyPill}>
                  <Ionicons name="people" size={12} color={COLORS.accent} />
                  <Text style={styles.partyPillText}>Party</Text>
                </View>
              )}
              {selected && (
                <Ionicons
                  name="checkmark-circle"
                  size={22}
                  color={COLORS.accent}
                />
              )}
            </View>
          </Pressable>
        );
      },
      [selectedId, handleSelect, excluded],
    );

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        // v5 defaults enableDynamicSizing to true, which sizes the sheet to its
        // content — but a BottomSheetFlatList reports ~0 intrinsic height, so the
        // sheet opened stunted (header + search only, list clipped). Pin it off so
        // it always honors the 70% snap point (mirrors EpisodeSheet).
        enableDynamicSizing={false}
        enablePanDownToClose
        backgroundStyle={styles.sheetBackground}
        backgroundComponent={SheetBackground}
        handleIndicatorStyle={styles.handleIndicator}
        backdropComponent={renderBackdrop}
        onDismiss={onDismiss}
        onChange={onChange}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Select Server</Text>
            <Text style={styles.count}>({data.length})</Text>
          </View>
          <Pressable
            onPress={dismiss}
            hitSlop={10}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={22} color={COLORS.white} />
          </Pressable>
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <Ionicons
            name="search"
            size={16}
            color={COLORS.muted}
            style={styles.searchIcon}
          />
          <BottomSheetTextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search servers…"
            placeholderTextColor={COLORS.muted}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {search.length > 0 && (
            <Pressable
              onPress={() => setSearch("")}
              hitSlop={8}
              style={styles.searchClear}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={16} color={COLORS.muted} />
            </Pressable>
          )}
        </View>

        {/* Filter chips */}
        <View style={styles.chipsRow}>
          <FilterChip
            label="All"
            active={filter === "all"}
            onPress={() => setFilter("all")}
          />
          <FilterChip
            label="Watch Party"
            active={filter === "party"}
            onPress={() => setFilter("party")}
          />
        </View>

        {/* List */}
        <BottomSheetFlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ItemSeparatorComponent={Divider}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No servers match</Text>
            </View>
          }
        />
      </BottomSheetModal>
    );
  },
);

ProviderSheet.displayName = "ProviderSheet";

function Divider(): React.ReactElement {
  return <View style={styles.divider} />;
}

/** Solid dark sheet background — NOT a live blur: blurring the playing video behind the
 *  sheet stutters it on the GPU (device-confirmed). */
function SheetBackground({ style }: any) {
  return <View style={[style, styles.sheetBgClip]} />;
}

interface FilterChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

function FilterChip({ label, active, onPress }: FilterChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

export default ProviderSheet;

const styles = StyleSheet.create({
  sheetBackground: {
    backgroundColor: "transparent",
  },
  sheetBgClip: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    backgroundColor: colors.sheetOverlay,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  handleIndicator: {
    backgroundColor: COLORS.handle,
    width: 40,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    color: COLORS.white,
    fontSize: 18,
    fontFamily: font.headline,
  },
  count: {
    color: COLORS.muted,
    fontSize: 14,
    marginLeft: 6,
  },
  closeBtn: {
    padding: 4,
  },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 10,
    backgroundColor: COLORS.input,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: COLORS.white,
    fontSize: 15,
    paddingVertical: 0,
  },
  searchClear: {
    marginLeft: 8,
  },

  chipsRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: COLORS.chip,
  },
  chipActive: {
    backgroundColor: COLORS.accent,
  },
  chipText: {
    color: COLORS.muted,
    fontSize: 13,
    fontFamily: font.bodySemi,
  },
  chipTextActive: {
    color: colors.onHoney,
  },

  listContent: {
    paddingBottom: 32,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowSelected: {
    backgroundColor: COLORS.selectedRow,
  },
  rowPressed: {
    opacity: 0.65,
  },
  rowFailed: {
    opacity: 0.5,
  },
  rowSubtitleFailed: {
    color: COLORS.warn,
  },
  rowText: {
    flex: 1,
    marginRight: 12,
  },
  rowTitle: {
    color: COLORS.white,
    fontSize: 15,
    fontFamily: font.bodySemi,
  },
  rowSubtitle: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 2,
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  partyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.infoTint,
  },
  partyPillText: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: "600",
  },
  unstablePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.warnTint,
  },
  unstablePillText: {
    color: COLORS.warn,
    fontSize: 11,
    fontWeight: "600",
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.divider,
    marginLeft: 16,
  },

  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 14,
  },
});
