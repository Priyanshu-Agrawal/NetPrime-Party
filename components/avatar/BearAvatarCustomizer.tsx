/**
 * BearAvatarCustomizer — Interactive Bear Avatar Customizer Modal & Sheet.
 *
 * Implements the cozy cinema-lounge avatar builder matching Google Stitch UI:
 * - Live preview with warm honey glow and shuffle button
 * - Gender selector pills (Masculine / Feminine / Neutral)
 * - Category tabs (Fur, Expression, Hair, Outfit, Accessory, Badge)
 * - Display name editor
 * - Seamless persistence with haptic feedback
 */
import BearAvatar from "@/components/avatar/BearAvatar";
import {
  ACCESSORY_OPTIONS,
  BADGE_OPTIONS,
  BEAR_VIBES,
  BearAvatarConfig,
  BearVibePreset,
  BROW_OPTIONS,
  EYE_OPTIONS,
  FUR_COLORS,
  GenderPreference,
  generateRandomBearConfig,
  HAIR_OPTIONS,
  MOUTH_OPTIONS,
  OptionItem,
  OUTFIT_OPTIONS,
} from "@/services/avatar/bearAvatar";
import {
  getAvatarConfig,
  getDisplayName,
  getGender,
  setAvatarConfig,
  setDisplayName,
  setGender,
} from "@/services/party/identity";
import { colors, font, glow, ms, radius, spacing } from "@/theme/bearoom";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface BearAvatarCustomizerProps {
  visible: boolean;
  onClose: () => void;
  onSaved?: (config: BearAvatarConfig, name: string) => void;
  initialName?: string;
  initialConfig?: BearAvatarConfig;
}

type TabType = "vibes" | "fur" | "expression" | "hair" | "outfit" | "accessory" | "badge";

const TABS: { id: TabType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: "vibes", label: "Vibes", icon: "sparkles" },
  { id: "fur", label: "Fur", icon: "color-palette-outline" },
  { id: "expression", label: "Face", icon: "happy-outline" },
  { id: "hair", label: "Hair", icon: "cut-outline" },
  { id: "outfit", label: "Outfit", icon: "shirt-outline" },
  { id: "accessory", label: "Accessory", icon: "glasses-outline" },
  { id: "badge", label: "Badge", icon: "star-outline" },
];

const GENDERS: { id: GenderPreference; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: "masculine", label: "Masculine", icon: "male-outline" },
  { id: "feminine", label: "Feminine", icon: "female-outline" },
  { id: "neutral", label: "Neutral", icon: "sparkles-outline" },
];

export default function BearAvatarCustomizer({
  visible,
  onClose,
  onSaved,
  initialName,
  initialConfig,
}: BearAvatarCustomizerProps) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabType>("vibes");
  const [name, setName] = useState(() => initialName ?? getDisplayName() ?? "Guest");
  const [gender, setGenderState] = useState<GenderPreference>(() => initialConfig?.gender ?? getGender());
  const [config, setConfig] = useState<BearAvatarConfig>(() => initialConfig ?? getAvatarConfig());

  const handleGenderChange = (newGender: GenderPreference) => {
    void Haptics.selectionAsync();
    setGenderState(newGender);
    const nextConfig = generateRandomBearConfig(newGender);
    setConfig(nextConfig);
  };

  const handleShuffle = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const nextConfig = generateRandomBearConfig(gender);
    setConfig(nextConfig);
  };

  const handleFlip = () => {
    void Haptics.selectionAsync();
    setConfig((prev) => ({
      ...prev,
      options: {
        ...prev.options,
        flip: prev.options?.flip === "horizontal" ? "none" : "horizontal",
      },
    }));
  };

  const applyVibe = (vibe: BearVibePreset) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setConfig((prev) => ({
      ...prev,
      options: {
        ...prev.options,
        ...vibe.options,
      },
    }));
  };

  const updateOption = (category: string, value: string) => {
    void Haptics.selectionAsync();
    setConfig((prev) => ({
      ...prev,
      options: {
        ...prev.options,
        [category]: value,
      },
    }));
  };

  const handleSave = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const trimmedName = name.trim().slice(0, 32) || "Guest";
    setDisplayName(trimmedName);
    setGender(gender);
    setAvatarConfig(config);
    onSaved?.(config, trimmedName);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.container, { paddingTop: insets.top + ms(8), paddingBottom: insets.bottom + ms(16) }]}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Customize Your Bear</Text>
              <Text style={styles.subtitle}>Your signature watch-party avatar</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={10}>
              <Ionicons name="close" size={ms(20)} color={colors.textDim} />
            </TouchableOpacity>
          </View>

          {/* Top Live Preview Card */}
          <View style={styles.previewCard}>
            <View style={styles.previewAvatarWrap}>
              <BearAvatar config={config} size={ms(110)} showGlow />
            </View>

            <View style={styles.previewActions}>
              <TouchableOpacity style={styles.previewIconBtn} onPress={handleFlip} activeOpacity={0.8}>
                <Ionicons
                  name={config.options?.flip === "horizontal" ? "arrow-forward" : "swap-horizontal"}
                  size={ms(16)}
                  color={config.options?.flip === "horizontal" ? colors.honey : colors.textDim}
                />
              </TouchableOpacity>

              <TouchableOpacity style={styles.shuffleBtn} onPress={handleShuffle} activeOpacity={0.8}>
                <Ionicons name="dice-outline" size={ms(16)} color={colors.onHoney} />
                <Text style={styles.shuffleText}>Randomize</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Display Name Input */}
          <View style={styles.nameRow}>
            <Ionicons name="person-outline" size={ms(18)} color={colors.honey} style={styles.nameIcon} />
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your display name"
              placeholderTextColor={colors.textFaint}
              style={styles.nameInput}
              maxLength={32}
              selectionColor={colors.honey}
            />
          </View>

          {/* Gender Pills */}
          <View style={styles.genderRow}>
            {GENDERS.map((g) => {
              const active = g.id === gender;
              return (
                <Pressable
                  key={g.id}
                  style={[styles.genderPill, active && styles.genderPillActive]}
                  onPress={() => handleGenderChange(g.id)}
                >
                  <Ionicons
                    name={g.icon}
                    size={ms(14)}
                    color={active ? colors.onHoney : colors.textDim}
                    style={{ marginRight: ms(6) }}
                  />
                  <Text style={[styles.genderText, active && styles.genderTextActive]}>{g.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Customization Category Tabs */}
          <View style={styles.tabBarWrap}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
              {TABS.map((t) => {
                const active = t.id === activeTab;
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.tab, active && styles.tabActive]}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setActiveTab(t.id);
                    }}
                  >
                    <Ionicons
                      name={t.icon}
                      size={ms(15)}
                      color={active ? colors.honey : colors.textDim}
                      style={{ marginRight: ms(5) }}
                    />
                    <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Options Grid for Active Tab */}
          <ScrollView style={styles.optionsScroll} showsVerticalScrollIndicator={false}>
            {activeTab === "vibes" && (
              <View style={styles.vibesGrid}>
                {BEAR_VIBES.map((vibe) => {
                  return (
                    <TouchableOpacity
                      key={vibe.id}
                      style={styles.vibeCard}
                      onPress={() => applyVibe(vibe)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.vibeIconWrap}>
                        <Ionicons name={(vibe.icon as any) || "sparkles"} size={ms(20)} color={colors.honey} />
                      </View>
                      <View style={styles.vibeInfo}>
                        <Text style={styles.vibeName}>{vibe.name}</Text>
                        <Text style={styles.vibeTagline}>{vibe.tagline}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={ms(16)} color={colors.textFaint} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {activeTab === "fur" && (
              <View style={styles.optionsGrid}>
                {FUR_COLORS.map((item) => {
                  const isSelected = (config.options?.furColor || "#6B4327") === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.colorChip, isSelected && styles.chipActive]}
                      onPress={() => updateOption("furColor", item.id)}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.colorSwatch, { backgroundColor: item.color }]} />
                      <Text style={[styles.chipText, isSelected && styles.chipTextActive]} numberOfLines={1}>
                        {item.label}
                      </Text>
                      {isSelected && <View style={styles.activeDot} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {activeTab === "expression" && (
              <View>
                <Text style={styles.sectionHeader}>Eyes</Text>
                <View style={styles.optionsGrid}>
                  {EYE_OPTIONS.map((item) => {
                    const isSelected = (config.options?.eyes || "happy") === item.id;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.chip, isSelected && styles.chipActive]}
                        onPress={() => updateOption("eyes", item.id)}
                      >
                        <Ionicons
                          name={(item.icon as any) || "eye-outline"}
                          size={ms(16)}
                          color={isSelected ? colors.honey : colors.textDim}
                        />
                        <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{item.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.sectionHeader, { marginTop: ms(16) }]}>Mouth</Text>
                <View style={styles.optionsGrid}>
                  {MOUTH_OPTIONS.map((item) => {
                    const isSelected = (config.options?.mouth || "smallSmile") === item.id;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.chip, isSelected && styles.chipActive]}
                        onPress={() => updateOption("mouth", item.id)}
                      >
                        <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{item.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.sectionHeader, { marginTop: ms(16) }]}>Eyebrows</Text>
                <View style={styles.optionsGrid}>
                  {BROW_OPTIONS.map((item) => {
                    const isSelected = (config.options?.brows || "soft") === item.id;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.chip, isSelected && styles.chipActive]}
                        onPress={() => updateOption("brows", item.id)}
                      >
                        <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{item.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {activeTab === "hair" && (
              <View style={styles.optionsGrid}>
                {HAIR_OPTIONS.map((item) => {
                  const isSelected = (config.options?.hair || "none") === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.chip, isSelected && styles.chipActive]}
                      onPress={() => updateOption("hair", item.id)}
                    >
                      <Ionicons
                        name="cut-outline"
                        size={ms(16)}
                        color={isSelected ? colors.honey : colors.textDim}
                      />
                      <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{item.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {activeTab === "outfit" && (
              <View style={styles.optionsGrid}>
                {OUTFIT_OPTIONS.map((item) => {
                  const isSelected = (config.options?.outfit || "cozyHoodie") === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.chip, isSelected && styles.chipActive]}
                      onPress={() => updateOption("outfit", item.id)}
                    >
                      <Ionicons
                        name={(item.icon as any) || "shirt-outline"}
                        size={ms(16)}
                        color={isSelected ? colors.honey : colors.textDim}
                      />
                      <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{item.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {activeTab === "accessory" && (
              <View style={styles.optionsGrid}>
                {ACCESSORY_OPTIONS.map((item) => {
                  const isSelected = (config.options?.accessory || "none") === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.chip, isSelected && styles.chipActive]}
                      onPress={() => updateOption("accessory", item.id)}
                    >
                      <Ionicons
                        name={(item.icon as any) || "glasses-outline"}
                        size={ms(16)}
                        color={isSelected ? colors.honey : colors.textDim}
                      />
                      <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{item.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {activeTab === "badge" && (
              <View style={styles.optionsGrid}>
                {BADGE_OPTIONS.map((item) => {
                  const isSelected = (config.options?.partyBadge || "none") === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.chip, isSelected && styles.chipActive]}
                      onPress={() => updateOption("partyBadge", item.id)}
                    >
                      <Ionicons
                        name={(item.icon as any) || "star-outline"}
                        size={ms(16)}
                        color={isSelected ? colors.honey : colors.textDim}
                      />
                      <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{item.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </ScrollView>

          {/* Sticky Save Footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
              <Ionicons name="checkmark-circle" size={ms(18)} color={colors.onHoney} />
              <Text style={styles.saveBtnText}>Save Bear</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.modalBackdrop,
    justifyContent: "flex-end",
  },
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: ms(16),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: ms(12),
    paddingHorizontal: ms(4),
  },
  title: {
    color: colors.text,
    fontFamily: font.headlineXbold,
    fontSize: ms(20),
  },
  subtitle: {
    color: colors.textDim,
    fontFamily: font.body,
    fontSize: ms(12),
    marginTop: ms(2),
  },
  closeBtn: {
    width: ms(32),
    height: ms(32),
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceStrong,
    alignItems: "center",
    justifyContent: "center",
  },

  previewCard: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    borderRadius: radius.xl,
    paddingVertical: ms(16),
    marginBottom: ms(12),
  },
  previewAvatarWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: ms(10),
  },
  previewActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(8),
  },
  previewIconBtn: {
    width: ms(36),
    height: ms(36),
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  shuffleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(6),
    backgroundColor: colors.honey,
    paddingHorizontal: ms(14),
    paddingVertical: ms(7),
    borderRadius: radius.pill,
    ...glow.honey,
  },
  shuffleText: {
    color: colors.onHoney,
    fontFamily: font.label,
    fontSize: ms(12),
  },

  vibesGrid: {
    gap: ms(8),
  },
  vibeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    padding: ms(12),
    borderRadius: radius.lg,
  },
  vibeIconWrap: {
    width: ms(38),
    height: ms(38),
    borderRadius: radius.pill,
    backgroundColor: colors.honeySoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: ms(12),
  },
  vibeInfo: {
    flex: 1,
  },
  vibeName: {
    color: colors.text,
    fontFamily: font.headline,
    fontSize: ms(15),
  },
  vibeTagline: {
    color: colors.textDim,
    fontFamily: font.body,
    fontSize: ms(12),
    marginTop: ms(2),
  },

  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: ms(14),
    height: ms(46),
    marginBottom: ms(10),
  },
  nameIcon: {
    marginRight: ms(10),
  },
  nameInput: {
    flex: 1,
    color: colors.text,
    fontFamily: font.bodySemi,
    fontSize: ms(15),
  },

  genderRow: {
    flexDirection: "row",
    gap: ms(8),
    marginBottom: ms(12),
  },
  genderPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: ms(38),
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  genderPillActive: {
    backgroundColor: colors.honey,
    borderColor: colors.honey,
    ...glow.honey,
  },
  genderText: {
    color: colors.textDim,
    fontFamily: font.label,
    fontSize: ms(12),
  },
  genderTextActive: {
    color: colors.onHoney,
    fontFamily: font.headline,
  },

  tabBarWrap: {
    marginBottom: ms(10),
  },
  tabBar: {
    gap: ms(8),
    paddingVertical: ms(4),
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: ms(12),
    paddingVertical: ms(7),
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  tabActive: {
    backgroundColor: colors.honeySoft,
    borderColor: colors.honey,
  },
  tabText: {
    color: colors.textDim,
    fontFamily: font.label,
    fontSize: ms(12),
  },
  tabTextActive: {
    color: colors.honey,
    fontFamily: font.headline,
  },

  optionsScroll: {
    flex: 1,
    marginBottom: ms(8),
  },
  sectionHeader: {
    color: colors.textDim,
    fontFamily: font.label,
    fontSize: ms(11),
    letterSpacing: 1.2,
    marginBottom: ms(8),
  },
  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: ms(8),
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(6),
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    paddingHorizontal: ms(12),
    paddingVertical: ms(10),
    borderRadius: radius.md,
  },
  colorChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(8),
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    paddingHorizontal: ms(10),
    paddingVertical: ms(8),
    borderRadius: radius.md,
    minWidth: "30%",
    flexGrow: 1,
  },
  colorSwatch: {
    width: ms(20),
    height: ms(20),
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  chipActive: {
    backgroundColor: colors.honeySoft,
    borderColor: colors.honey,
  },
  chipText: {
    color: colors.textDim,
    fontFamily: font.bodyMed,
    fontSize: ms(13),
  },
  chipTextActive: {
    color: colors.text,
    fontFamily: font.bodySemi,
  },
  activeDot: {
    width: ms(6),
    height: ms(6),
    borderRadius: ms(3),
    backgroundColor: colors.honey,
    marginLeft: "auto",
  },

  footer: {
    flexDirection: "row",
    gap: ms(10),
    paddingTop: ms(8),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  cancelBtn: {
    flex: 1,
    height: ms(48),
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  cancelBtnText: {
    color: colors.textDim,
    fontFamily: font.label,
    fontSize: ms(14),
  },
  saveBtn: {
    flex: 2,
    flexDirection: "row",
    gap: ms(6),
    height: ms(48),
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.honey,
    ...glow.honey,
  },
  saveBtnText: {
    color: colors.onHoney,
    fontFamily: font.headline,
    fontSize: ms(15),
  },
});
