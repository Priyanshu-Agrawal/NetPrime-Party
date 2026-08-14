/**
 * Onboarding — first-launch welcome flow (Stitch "Welcome to Bearoom"). A
 * three-slide horizontal carousel: welcome → watch-in-sync → set your name.
 * Cozy cinema-lounge: honey-ring emblems, page dots, a glowing Get Started pill,
 * and a Skip. Sets the onboarded flag (utils/prefs) and enters the app.
 */
import { setDisplayName, getDisplayName } from "@/services/party/identity";
import { colors, font, glow, ms, radius } from "@/theme/bearoom";
import { setOnboarded } from "@/utils/prefs";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");

type Slide = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
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
    icon: "person",
    title: "Make it yours",
    body: "Pick a display name so your pack recognizes you in a party.",
  },
];

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const [name, setName] = useState(() => {
    const n = getDisplayName();
    return n && n !== "Guest" ? n : "";
  });
  const last = SLIDES.length - 1;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const p = Math.round(e.nativeEvent.contentOffset.x / width);
    if (p !== page) setPage(p);
  };

  const finish = () => {
    const n = name.trim();
    if (n) setDisplayName(n);
    setOnboarded();
    router.replace("/(tabs)");
  };

  const next = () => {
    if (page >= last) finish();
    else scrollRef.current?.scrollTo({ x: (page + 1) * width, animated: true });
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false, animation: "fade" }} />
      <LinearGradient
        colors={["rgba(240,169,60,0.10)", "transparent"]}
        style={styles.topGlow}
        pointerEvents="none"
      />

      <Pressable style={[styles.skip, { top: insets.top + ms(6) }]} onPress={finish} hitSlop={10}>
        <BlurView
          intensity={40}
          tint="dark"
          experimentalBlurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
          style={StyleSheet.absoluteFill}
        />
        <View style={[StyleSheet.absoluteFill, styles.skipTint]} />
        <Text style={styles.skipText}>Skip</Text>
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
            <View style={styles.heroWrap}>
              <View style={styles.heroGlow} />
              <View style={styles.heroRing}>
                <Ionicons name={s.icon} size={ms(44)} color={colors.honey} />
              </View>
            </View>

            {s.titleAccent ? (
              <Text style={styles.title}>
                {s.titleTop}
                {"\n"}
                <Text style={styles.titleAccent}>{s.titleAccent}</Text>
              </Text>
            ) : (
              <Text style={styles.title}>{s.title}</Text>
            )}

            <Text style={styles.body}>{s.body}</Text>

            {s.key === "name" ? (
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
            ) : null}
          </View>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + ms(16) }]}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
          ))}
        </View>
        <Pressable style={styles.cta} onPress={next}>
          <Text style={styles.ctaText}>{page >= last ? "Get Started" : "Next"}</Text>
          <Ionicons name="arrow-forward" size={ms(18)} color={colors.onHoney} />
        </Pressable>
      </View>
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
  skipTint: { backgroundColor: "rgba(16,13,10,0.28)" },
  skipText: { color: colors.text, fontFamily: font.label, fontSize: ms(13) },

  pager: { flex: 1 },
  slide: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: ms(32) },

  heroWrap: { alignItems: "center", justifyContent: "center", marginBottom: ms(28) },
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

  title: {
    color: colors.text,
    fontFamily: font.headlineXbold,
    fontSize: ms(30),
    lineHeight: ms(36),
    textAlign: "center",
  },
  titleAccent: { color: colors.honey },
  body: {
    color: colors.textDim,
    fontFamily: font.body,
    fontSize: ms(15),
    lineHeight: ms(22),
    textAlign: "center",
    marginTop: ms(14),
    maxWidth: ms(320),
  },

  nameField: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(10),
    alignSelf: "stretch",
    marginTop: ms(26),
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: ms(16),
    height: ms(52),
  },
  nameInput: { flex: 1, color: colors.text, fontFamily: font.bodySemi, fontSize: ms(16) },

  footer: { paddingHorizontal: ms(28) },
  dots: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(7), marginBottom: ms(22) },
  dot: { width: ms(7), height: ms(7), borderRadius: ms(4), backgroundColor: colors.borderStrong },
  dotActive: { width: ms(22), backgroundColor: colors.honey },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: ms(8),
    height: ms(54),
    borderRadius: radius.pill,
    backgroundColor: colors.honey,
    ...glow.honey,
  },
  ctaText: { color: colors.onHoney, fontFamily: font.headlineSemi, fontSize: ms(16) },
});
