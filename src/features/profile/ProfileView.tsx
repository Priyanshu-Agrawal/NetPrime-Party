/**
 * Profile / Options tab — cozy cinema-lounge skin (Stitch "Bearoom Profile").
 *
 * Avatar in a honey ring + editable display name, a stat strip derived from the
 * local watch history (no fabricated numbers), a "your pack" invite card, and
 * grouped setting rows. Rows with a real destination are wired; the rest are the
 * entry points for screens still to be built (Notifications, Playback, etc.).
 */
import appJson from "@/app.json";
import BearAvatar from "@/components/avatar/BearAvatar";
import BearAvatarCustomizer from "@/components/avatar/BearAvatarCustomizer";
import AppHeader from "@/components/ui/AppHeader";
import { bearAlert } from "@/components/ui/BearAlert";
import { useFadeInStyle } from "@/components/ui/useCollapsingHeader";
import { BearAvatarConfig } from "@/services/avatar/bearAvatar";
import { getAvatarConfig, getDisplayName, setDisplayName } from "@/services/party/identity";
import {
  checkNotificationPermission,
  openAppSettings,
  requestNotificationPermission,
} from "@/services/permissions/notifications";
import { openJoinParty, openLibrary, openHomePrefs, openPartyHost } from "@/src/navigation/actions";
import { genRoomCode } from "@/utils/roomCode";
import { Appear, Text } from "@/src/ui";
import { colors, font, glow, ms, radius, spacing } from "@/theme/bearoom";
import { pressedStyle } from "@/theme/styles/interaction";
import { checkGithubRelease } from "@/utils/checkGithubRelease";
import { clearAppCache, clearWatchHistory, getWatchHistory } from "@/utils/history";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Glass, GlassBackdrop } from "@/src/ui/glass";
import React, { useCallback, useState } from "react";
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type IconName = keyof typeof Ionicons.glyphMap;

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(() => getDisplayName() ?? "Guest");
  const [avatarConfig, setAvatarConfigState] = useState<BearAvatarConfig>(() => getAvatarConfig());
  const [customizerVisible, setCustomizerVisible] = useState(false);
  const [aboutVisible, setAboutVisible] = useState(false);
  const [stats, setStats] = useState({ watched: 0, hours: 0, inProgress: 0 });
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const headerBlurStyle = useFadeInStyle(scrollY, 24, 120);

  const handle = "@" + (name || "guest").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  // Recompute the stat strip from real local history each time the tab focuses.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const list = await getWatchHistory();
        if (!alive) return;
        const totalSec = list.reduce((s, i) => s + (Number(i?.positionSec) || 0), 0);
        const inProgress = list.filter((i) => {
          const pos = Number(i?.positionSec) || 0;
          const dur = Number(i?.durationSec) || 0;
          return pos > 0 && (dur === 0 || pos < dur * 0.95);
        }).length;
        setStats({ watched: list.length, hours: Math.round(totalSec / 3600), inProgress });
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  const openEdit = () => {
    setCustomizerVisible(true);
  };

  const invite = () => {
    void Share.share({
      message:
        "Watch movies & shows in perfect sync with me on Bearoom 🐻\n\n" +
        "Grab the app, then join my party with the room code I send you.",
    });
  };

  const comingSoon = (label: string) => bearAlert(label, "Coming soon.");

  const manageNotifications = async () => {
    const granted = await checkNotificationPermission();
    if (granted) {
      bearAlert(
        "Notifications active",
        "You will receive watch party invites, pack updates, and lock screen media controls.",
        [
          { text: "Settings", onPress: openAppSettings, style: "cancel" },
          { text: "OK" },
        ]
      );
    } else {
      bearAlert(
        "Enable notifications",
        "Allow notifications to receive watch party invites and control playback from your lock screen.",
        [
          { text: "Not Now", style: "cancel" },
          {
            text: "Allow",
            onPress: async () => {
              const res = await requestNotificationPermission();
              if (!res) {
                await openAppSettings();
              }
            },
          },
        ]
      );
    }
  };

  const confirmClearHistory = () =>
    bearAlert("Clear watch history", "Remove all watch history?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          await clearWatchHistory();
          setStats({ watched: 0, hours: 0, inProgress: 0 });
        },
      },
    ]);

  const confirmClearCache = () =>
    bearAlert("Clear cache", "Clear cached data?", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: () => clearAppCache() },
    ]);

  const checkUpdate = async () => {
    const current = appJson.expo?.version || "0.0.0";
    const res = await checkGithubRelease("roshan669", "Uott", current);
    if (res.isNewer) {
      bearAlert("Update available", `Latest: ${res.latestVersion}`, [
        { text: "Open", onPress: () => res.htmlUrl && Linking.openURL(res.htmlUrl) },
        { text: "OK", style: "cancel" },
      ]);
    } else {
      bearAlert("Up to date", `Current: ${current}`);
    }
  };

  const signOut = () =>
    bearAlert(
      "Anonymous mode",
      "You're browsing anonymously — there's no account to sign out of yet. Accounts are coming soon.",
      [{ text: "OK" }],
    );

  return (
    <View style={styles.root}>
      <GlassBackdrop style={styles.glassBackdrop}>
        <Animated.ScrollView
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={[styles.content, { paddingTop: insets.top + ms(56) }]}
        >
          {/* Identity */}
          <Appear index={0} variant="drop">
            <View style={styles.identity}>
              <Pressable style={styles.avatarWrap} onPress={openEdit}>
                <BearAvatar config={avatarConfig} size={ms(96)} showGlow />
                <View style={styles.editBadge}>
                  <Ionicons name="pencil" size={ms(13)} color={colors.onHoney} />
                </View>
              </Pressable>
              <Text style={styles.name}>{name}</Text>
              <Text style={styles.handle}>{handle}</Text>
            </View>
          </Appear>

          {/* Stats (real, from local history) */}
          <Appear index={1}>
            <View style={styles.statStrip}>
              <Stat value={stats.watched} label="Watched" />
              <View style={styles.statDivider} />
              <Stat value={stats.hours} label="Hours" />
              <View style={styles.statDivider} />
              <Stat value={stats.inProgress} label="In progress" />
            </View>
          </Appear>

          {/* Your pack */}
          <Appear index={2}>
            <View style={styles.packCard}>
              <Text style={styles.overline}>YOUR PACK</Text>
              <View style={styles.packRow}>
                <View style={styles.packHint}>
                  <View style={styles.packIcon}>
                    <Ionicons name="people" size={ms(18)} color={colors.honey} />
                  </View>
                  <Text style={styles.packText}>Invite friends to watch together</Text>
                </View>
                <Pressable style={styles.inviteBtn} onPress={invite} hitSlop={6}>
                  <Ionicons name="person-add" size={ms(14)} color={colors.honey} />
                  <Text style={styles.inviteText}>Invite</Text>
                </Pressable>
              </View>
            </View>
          </Appear>

          {/* Watch party — a room no longer needs a title to exist: host an empty
              one, then browse and queue things up while everyone waits inside. */}
          <Appear index={3}>
            <Card>
              <Row
                icon="videocam-outline"
                label="Host a watch party"
                onPress={() => openPartyHost({ role: "host", room: genRoomCode() })}
              />
              <Row icon="enter-outline" label="Join with a code" onPress={openJoinParty} last />
            </Card>
          </Appear>

          {/* Library */}
          <Appear index={4}>
            <Card>
              <Row icon="time-outline" label="Watch history" onPress={() => openLibrary("WatchHistory")} />
              <Row icon="bookmark-outline" label="My list" onPress={() => openLibrary("MyList")} />
              <Row icon="download-outline" label="Downloads" onPress={() => comingSoon("Downloads")} last />
            </Card>
          </Appear>

          {/* Preferences */}
          <Appear index={5}>
            <Card>
              <Row icon="person-circle-outline" label="Display name & avatar" onPress={openEdit} />
              <Row icon="notifications-outline" label="Notifications & lock-screen audio" onPress={manageNotifications} />
              <Row icon="sparkles-outline" label="Home" onPress={openHomePrefs} />
              <Row icon="options-outline" label="Playback & data" onPress={() => comingSoon("Playback & data")} last />
            </Card>
          </Appear>

          <Appear index={6}>
            <Card>
              <Row icon="chatbubble-ellipses-outline" label="Chat & reactions" onPress={() => comingSoon("Chat & reactions")} last />
            </Card>
          </Appear>

          {/* Maintenance / about */}
          <Appear index={7}>
            <Card>
              <Row icon="color-palette-outline" label="Appearance" onPress={() => comingSoon("Appearance")} />
              <Row icon="trash-outline" label="Clear watch history" onPress={confirmClearHistory} />
              <Row icon="refresh-outline" label="Clear cache" onPress={confirmClearCache} />
              <Row icon="help-circle-outline" label="Help & about" onPress={() => setAboutVisible(true)} last />
            </Card>
          </Appear>

          <Appear index={8}>
            <TouchableOpacity style={styles.signOut} onPress={signOut} activeOpacity={0.8}>
              <Text style={styles.signOutText}>Sign out</Text>
            </TouchableOpacity>
          </Appear>
        </Animated.ScrollView>
      </GlassBackdrop>

      {/* Persistent brand header — gains a frosted-glass background once content
          scrolls under it, matching Home. */}
      <View style={[styles.topBarBg, { paddingTop: insets.top }]} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, headerBlurStyle]}>
          <Glass material="chrome" />
          <View style={styles.headerBgLine} />
        </Animated.View>
        <AppHeader showSearch={false} />
      </View>

      {/* Avatar & Name Customizer */}
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

      {/* Help & about */}
      <Modal visible={aboutVisible} transparent animationType="fade" onRequestClose={() => setAboutVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAboutVisible(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>About Bearoom</Text>
            <Text style={styles.sheetSub}>Version {appJson.expo?.version}</Text>
            <View style={{ height: ms(14) }} />
            <Pressable style={styles.aboutRow} onPress={checkUpdate}>
              <Ionicons name="cloud-download-outline" size={ms(18)} color={colors.text} />
              <Text style={styles.aboutRowText}>Check for updates</Text>
            </Pressable>
            <Pressable
              style={styles.aboutRow}
              onPress={() => Linking.openURL("https://github.com/roshan669/Uott")}
            >
              <Ionicons name="logo-github" size={ms(18)} color={colors.text} />
              <Text style={styles.aboutRowText}>Star on GitHub</Text>
            </Pressable>
            <Pressable style={[styles.sheetSave, { marginTop: ms(14) }]} onPress={() => setAboutVisible(false)}>
              <Text style={styles.sheetSaveText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function Row({
  icon,
  label,
  onPress,
  last,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, !last && styles.rowBorder, pressed && styles.rowPressed]}
      onPress={onPress}
    >
      <View style={styles.rowLeft}>
        <Ionicons name={icon} size={ms(20)} color={colors.textDim} />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={ms(18)} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  glassBackdrop: { flex: 1 },
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: ms(16), paddingBottom: ms(180) },
  topBarBg: { position: "absolute", top: 0, left: 0, right: 0, overflow: "hidden" },
  headerBgLine: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },

  identity: { alignItems: "center", marginTop: ms(6) },
  avatarWrap: { alignItems: "center", justifyContent: "center", marginBottom: ms(12) },
  avatarGlow: {
    position: "absolute",
    width: ms(108),
    height: ms(108),
    borderRadius: radius.pill,
    backgroundColor: colors.honeyGlow,
    opacity: 0.22,
  },
  avatar: {
    width: ms(92),
    height: ms(92),
    borderRadius: radius.pill,
    backgroundColor: colors.bgElevated,
    borderWidth: 2,
    borderColor: colors.honey,
    alignItems: "center",
    justifyContent: "center",
    ...glow.honey,
  },
  avatarInitial: { color: colors.honey, fontFamily: font.headlineXbold, fontSize: ms(38) },
  editBadge: {
    position: "absolute",
    right: ms(2),
    bottom: ms(2),
    width: ms(28),
    height: ms(28),
    borderRadius: radius.pill,
    backgroundColor: colors.honey,
    borderWidth: 2,
    borderColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { color: colors.text, fontFamily: font.headlineXbold, fontSize: ms(26) },
  handle: { color: colors.textDim, fontFamily: font.body, fontSize: ms(14), marginTop: ms(2) },

  statStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: ms(18),
    marginBottom: ms(20),
  },
  stat: { flex: 1, alignItems: "center" },
  statValue: { color: colors.honey, fontFamily: font.headlineXbold, fontSize: ms(20) },
  statLabel: { color: colors.textDim, fontFamily: font.bodyMed, fontSize: ms(12), marginTop: ms(2) },
  statDivider: { width: StyleSheet.hairlineWidth, height: ms(30), backgroundColor: colors.border },

  packCard: {
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: ms(16),
    marginBottom: ms(16),
  },
  overline: {
    color: colors.textDim,
    fontFamily: font.label,
    fontSize: ms(11),
    letterSpacing: 1.4,
    marginBottom: ms(12),
  },
  packRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: ms(10) },
  packHint: { flexDirection: "row", alignItems: "center", gap: ms(10), flex: 1 },
  packIcon: {
    width: ms(38),
    height: ms(38),
    borderRadius: radius.pill,
    backgroundColor: colors.honeySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  packText: { color: colors.text, fontFamily: font.bodyMed, fontSize: ms(13), flex: 1 },
  inviteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(6),
    backgroundColor: colors.honeySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.honey,
    paddingHorizontal: ms(14),
    paddingVertical: ms(8),
    borderRadius: radius.pill,
  },
  inviteText: { color: colors.honey, fontFamily: font.label, fontSize: ms(12) },

  card: {
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.xl,
    marginBottom: ms(16),
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: ms(16),
    paddingVertical: ms(15),
  },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowPressed: { backgroundColor: colors.surface },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: ms(14) },
  rowLabel: { color: colors.text, fontFamily: font.bodyMed, fontSize: ms(15) },

  signOut: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingVertical: ms(16),
    alignItems: "center",
    marginTop: ms(2),
  },
  signOutText: { color: colors.danger, fontFamily: font.label, fontSize: ms(15) },

  // Modals
  backdrop: {
    flex: 1,
    backgroundColor: colors.modalBackdrop,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: ms(28),
  },
  sheet: {
    width: "100%",
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    borderRadius: radius.xxl,
    padding: ms(22),
  },
  sheetTitle: { color: colors.text, fontFamily: font.headline, fontSize: ms(19) },
  sheetSub: { color: colors.textDim, fontFamily: font.body, fontSize: ms(13), marginTop: ms(4) },
  sheetInput: {
    marginTop: ms(16),
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: ms(16),
    height: ms(50),
    color: colors.text,
    fontFamily: font.bodySemi,
    fontSize: ms(16),
  },
  sheetActions: { flexDirection: "row", gap: ms(10), marginTop: ms(18) },
  sheetGhost: {
    flex: 1,
    height: ms(48),
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  sheetGhostText: { color: colors.text, fontFamily: font.label, fontSize: ms(14) },
  sheetSave: {
    flex: 1,
    height: ms(48),
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.honey,
    ...glow.honey,
  },
  sheetSaveText: { color: colors.onHoney, fontFamily: font.headlineSemi, fontSize: ms(15) },
  aboutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(12),
    paddingVertical: ms(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  aboutRowText: { color: colors.text, fontFamily: font.bodyMed, fontSize: ms(15) },
});
