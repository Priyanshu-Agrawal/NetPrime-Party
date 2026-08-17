import BearAvatar from "@/components/avatar/BearAvatar";
import BearAvatarCustomizer from "@/components/avatar/BearAvatarCustomizer";
import NotificationPermissionModal from "@/components/ui/NotificationPermissionModal";
import {
  BearAvatarConfig,
  GenderPreference,
  generateRandomBearConfig,
} from "@/services/avatar/bearAvatar";
import {
  getAvatarConfig,
  getDisplayName,
  getGender,
  setAvatarConfig,
  setDisplayName,
  setGender,
} from "@/services/party/identity";
import {
  hasPromptedNotification,
  requestNotificationPermission,
} from "@/services/permissions/notifications";
import { finishOnboarding } from "@/src/navigation/actions";
import { Button, Text } from "@/src/ui";
import { colors, font, glow, ms, radius, spacing } from "@/theme/bearoom";
import { gradients } from "@/theme/styles/gradients";
import { setOnboarded } from "@/utils/prefs";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useRef, useState } from "react";
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");

type Slide = {
  key: string;
  icon?: keyof typeof Ionicons.glyphMap;
  titleTop?: string;
  titleAccent?: string;
  title?: string;
  body: string;
};

const SLIDES: Slide[] = [
  {
    key: "welcome",
    icon: "paw",
    titleTop: "Welcome to",
    titleAccent: "Bearoom",
    body: "Your cozy corner for movies & shows — watch solo or with your pack, in perfect sync.",
  },
  {
    key: "sync",
    icon: "sync",
    title: "Watch together, in sync",
    body: "Host a room, share a code, and everyone's playback stays perfectly in sync — with live chat, reactions & GIFs.",
  },
  {
    key: "name",
    title: "Create your Bear",
    body: "Choose your gender and pick a look for your watch-party pack.",
  },
];

const GENDERS: { id: GenderPreference; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: "masculine", label: "Masculine", icon: "male-outline" },
  { id: "feminine", label: "Feminine", icon: "female-outline" },
  { id: "neutral", label: "Neutral", icon: "sparkles-outline" },
];

export default function OnboardingView() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const [name, setName] = useState(() => {
    const n = getDisplayName();
    return n && n !== "Guest" ? n : "";
  });
  const [gender, setGenderPref] = useState<GenderPreference>(() => getGender());
  const [avatarConfig, setAvatarConfigState] = useState<BearAvatarConfig>(() => {
    const existing = getAvatarConfig();
    return existing || generateRandomBearConfig(getGender());
  });
  const [customizerVisible, setCustomizerVisible] = useState(false);
  const [notifModalVisible, setNotifModalVisible] = useState(false);

  const last = SLIDES.length - 1;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const p = Math.round(e.nativeEvent.contentOffset.x / width);
    if (p !== page) setPage(p);
  };

  const handleGenderSelect = (g: GenderPreference) => {
    void Haptics.selectionAsync();
    setGenderPref(g);
    const newConfig = generateRandomBearConfig(g);
    setAvatarConfigState(newConfig);
  };

  const handleShuffleAvatar = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newConfig = generateRandomBearConfig(gender);
    setAvatarConfigState(newConfig);
  };

  const completeOnboarding = () => {
    const n = name.trim();
    if (n) setDisplayName(n);
    setGender(gender);
    setAvatarConfig(avatarConfig);
    setOnboarded();
    finishOnboarding();
  };

  const finish = () => {
    if (!hasPromptedNotification()) {
      setNotifModalVisible(true);
    } else {
      completeOnboarding();
    }
  };

  const handleNotifModalClose = () => {
    setNotifModalVisible(false);
    completeOnboarding();
  };

  const next = () => {
    if (page >= last) finish();
    else scrollRef.current?.scrollTo({ x: (page + 1) * width, animated: true });
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={gradients.onboardingGlow} style={styles.topGlow} pointerEvents="none" />

      <Pressable style={[styles.skip, { top: insets.top + ms(6) }]} onPress={finish} hitSlop={10}>
        <BlurView
          intensity={40}
          tint="dark"
          experimentalBlurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
          style={StyleSheet.absoluteFill}
        />
        <View style={[StyleSheet.absoluteFill, styles.skipTint]} />
        <Text variant="label">Skip</Text>
      </Pressable>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={styles.pager}
      >
        {SLIDES.map((s) => (
          <View key={s.key} style={[styles.slide, { width }]}>
            {s.key === "name" ? (
              <View style={styles.avatarSlideWrap}>
                {/* Bear Avatar Ring with Shuffle */}
                <View style={styles.avatarHeroWrap}>
                  <BearAvatar config={avatarConfig} size={ms(108)} showGlow />

                  <TouchableOpacity style={styles.shuffleFloatingBtn} onPress={handleShuffleAvatar} activeOpacity={0.8}>
                    <Ionicons name="dice-outline" size={ms(16)} color={colors.onHoney} />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.customizeHintBtn}
                  onPress={() => setCustomizerVisible(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="color-palette-outline" size={ms(14)} color={colors.honey} />
                  <Text style={styles.customizeHintText}>Customize details</Text>
                </TouchableOpacity>

                <Text variant="display" style={[styles.title, { marginTop: ms(12) }]}>
                  {s.title}
                </Text>

                <Text variant="bodyDim" style={[styles.body, { marginTop: ms(6), marginBottom: ms(16) }]}>
                  {s.body}
                </Text>

                {/* Gender Selector */}
                <View style={styles.genderRow}>
                  {GENDERS.map((g) => {
                    const active = g.id === gender;
                    return (
                      <Pressable
                        key={g.id}
                        style={[styles.genderPill, active && styles.genderPillActive]}
                        onPress={() => handleGenderSelect(g.id)}
                      >
                        <Ionicons
                          name={g.icon}
                          size={ms(14)}
                          color={active ? colors.onHoney : colors.textDim}
                          style={{ marginRight: ms(4) }}
                        />
                        <Text style={[styles.genderText, active && styles.genderTextActive]}>{g.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Display Name Input */}
                <View style={styles.nameField}>
                  <Ionicons name="happy-outline" size={ms(18)} color={colors.textDim} />
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="Your display name"
                    placeholderTextColor={colors.textFaint}
                    style={styles.nameInput}
                    selectionColor={colors.honey}
                    maxLength={32}
                    returnKeyType="done"
                    onSubmitEditing={finish}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.slideContent}>
                <View style={styles.heroWrap}>
                  <View style={styles.heroGlow} />
                  <View style={styles.heroRing}>
                    {s.icon && <Ionicons name={s.icon} size={ms(44)} color={colors.honey} />}
                  </View>
                </View>

                {s.titleAccent ? (
                  <Text variant="display" style={styles.title}>
                    {s.titleTop}
                    {"\n"}
                    <Text honey>{s.titleAccent}</Text>
                  </Text>
                ) : (
                  <Text variant="display" style={styles.title}>
                    {s.title}
                  </Text>
                )}

                <Text variant="bodyDim" style={styles.body}>
                  {s.body}
                </Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + ms(16) }]}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
          ))}
        </View>
        <Button
          label={page >= last ? "Get Started" : "Next"}
          icon="arrow-forward"
          onPress={next}
          full
        />
      </View>

      {/* Avatar Customizer Sheet */}
      <BearAvatarCustomizer
        visible={customizerVisible}
        initialName={name}
        initialConfig={avatarConfig}
        onClose={() => setCustomizerVisible(false)}
        onSaved={(newConfig, newName) => {
          setAvatarConfigState(newConfig);
          setName(newName);
        }}
      />

      {/* Contextual Notification Permission Sheet */}
      <NotificationPermissionModal
        visible={notifModalVisible}
        onClose={handleNotifModalClose}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topGlow: { position: "absolute", top: 0, left: 0, right: 0, height: ms(300) },
  skip: {
    position: "absolute",
    right: ms(16),
    zIndex: 10,
    height: ms(34),
    paddingHorizontal: ms(16),
    borderRadius: radius.pill,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  skipTint: { backgroundColor: colors.overlay },

  pager: { flex: 1 },
  slide: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xxxl - 8 },
  slideContent: { alignItems: "center", justifyContent: "center" },

  avatarSlideWrap: { alignItems: "center", justifyContent: "center", width: "100%" },
  avatarHeroWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: ms(8),
  },
  shuffleFloatingBtn: {
    position: "absolute",
    right: -ms(8),
    bottom: ms(4),
    width: ms(34),
    height: ms(34),
    borderRadius: radius.pill,
    backgroundColor: colors.honey,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.bg,
    ...glow.honey,
  },
  customizeHintBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(6),
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    paddingHorizontal: ms(12),
    paddingVertical: ms(5),
    borderRadius: radius.pill,
    marginTop: ms(4),
  },
  customizeHintText: {
    color: colors.honey,
    fontFamily: font.label,
    fontSize: ms(12),
  },

  heroWrap: { alignItems: "center", justifyContent: "center", marginBottom: spacing.xxl },
  heroGlow: {
    position: "absolute",
    width: ms(160),
    height: ms(160),
    borderRadius: radius.pill,
    backgroundColor: colors.honeyGlow,
    opacity: 0.26,
  },
  heroRing: {
    width: ms(112),
    height: ms(112),
    borderRadius: radius.pill,
    backgroundColor: colors.honeySoft,
    borderWidth: 1.5,
    borderColor: colors.honey,
    alignItems: "center",
    justifyContent: "center",
    ...glow.honey,
  },

  title: { fontSize: ms(28), lineHeight: ms(34), textAlign: "center" },
  body: { textAlign: "center", marginTop: ms(12), maxWidth: ms(320), fontSize: ms(14), lineHeight: ms(20) },

  genderRow: {
    flexDirection: "row",
    gap: ms(8),
    width: "100%",
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

  nameField: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(10),
    alignSelf: "stretch",
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: ms(16),
    height: ms(50),
  },
  nameInput: { flex: 1, color: colors.text, fontFamily: font.bodySemi, fontSize: ms(16) },

  footer: { paddingHorizontal: spacing.xxl + 8 },
  dots: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(7), marginBottom: ms(22) },
  dot: { width: ms(7), height: ms(7), borderRadius: ms(4), backgroundColor: colors.borderStrong },
  dotActive: { width: ms(22), backgroundColor: colors.honey },
});
