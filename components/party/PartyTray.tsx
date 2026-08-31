/**
 * PartyTray — the live watch-party, carried with you while you browse.
 *
 * The session outlives PartyScreen (services/party/PartySession.tsx), so once a
 * room exists it needs a presence on every other screen: something that says
 * "you're still in ZK4N8R", lets you keep chatting, shows what's queued, and
 * gets you back. That is this.
 *
 * THREE HEIGHTS
 *   peek  — a slim bar riding above the FloatingTabBar. Poster, title, live
 *           progress, room code, members, unread count. Tapping the artwork
 *           returns to the room; tapping anywhere else opens the sheet.
 *   half  — chat thread + composer. The "keep talking while I browse" height.
 *   full  — the queue ABOVE the chat, mirroring PartyScreen's own layout with
 *           the queue standing where the video would be. Same mental model.
 *
 * It is deliberately NOT dismissible. The header chip and this tray are the only
 * ways back into a room; a swipe-away would strand a live session.
 *
 * NO BLUR, NO ELEVATION — this is a persistent bar over scrolling poster grids,
 * which is the exact per-frame re-sample case behind the documented playback
 * stutter. Warm-charcoal fill + hairline border instead, matching
 * ConnectivityBanner. Animation is useSharedValue/withTiming only: Reanimated's
 * entering/exiting/layout props crash on the New Architecture.
 *
 * Progress ticks from a LOCAL 1s interval over effectivePositionMs(anchor, now)
 * — no player is mounted out here, so nothing else can drive it, and keeping the
 * interval in this subtree stops the tick re-rendering the app.
 */
import { PartyChatThread } from "@/components/party/PartyChatThread";
import { PartyQueueList } from "@/components/party/PartyQueueList";
import BearAvatar from "@/components/avatar/BearAvatar";
import { generateRandomBearConfig } from "@/services/avatar/bearAvatar";
import { usePartySession, usePartySnapshot } from "@/services/party/PartySession";
import { effectivePositionMs } from "@/services/party/protocol";
import { enterParty } from "@/src/navigation/actions";
import { colors, font, ms, radius } from "@/theme/bearoom";
import { duration, easing } from "@/theme/motion";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { skipToken } from "@reduxjs/toolkit/query";
import { useDetailsQuery } from "@/src/store/services/tmdbApi";
import { img } from "@/utils/tmdbDetails";
import { navigationRef } from "@/src/navigation/navigationRef";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Routes that already ARE the party, or that play video. */
const HIDE_ON = new Set(["Party", "Player"]);
const PEEK_H = ms(58);
/** Pre-computed: ms() is not a worklet, so it can't be called inside useAnimatedStyle. */
const PEEK_HIDE_Y = ms(58) + ms(16);
/** Clearance for the floating tab bar so peek rides above it, never over it. */
const TAB_BAR_H = ms(64);

type Detent = "half" | "full";

const bearCache = new Map<string, ReturnType<typeof generateRandomBearConfig>>();
function bearFor(userId: string) {
  let c = bearCache.get(userId);
  if (!c) {
    c = generateRandomBearConfig("neutral", userId);
    bearCache.set(userId, c);
  }
  return c;
}

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function PartyTray() {
  const session = usePartySession();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();

  // Narrow selectors: the host re-broadcasts the whole snapshot every 2s, and
  // this thing is mounted app-wide. Only re-render on what is actually shown.
  const code = usePartySnapshot((s) => s?.code ?? null);
  const media = usePartySnapshot(
    (s) => s?.media ?? null,
    (a, b) =>
      a?.tmdbId === b?.tmdbId &&
      a?.type === b?.type &&
      a?.season === b?.season &&
      a?.episode === b?.episode,
  );
  const queueLen = usePartySnapshot((s) => s?.queue?.length ?? 0);
  const memberIds = usePartySnapshot(
    (s) => (s?.members ?? []).map((m) => m.userId).join(","),
  );

  const routeName = useCurrentRouteName();

  const live = !!session.request && !!code;
  const hidden = !live || (routeName ? HIDE_ON.has(routeName) : false);

  // Open/close lives on the session so the tab bar's party button can raise the
  // tray from outside this component.
  const { trayOpen: open, setTrayOpen: setOpen } = session;
  const [detent, setDetent] = useState<Detent>("half");

  // slide the peek bar in/out
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.value = withTiming(hidden ? 0 : 1, {
      duration: duration.base,
      easing: easing.decelerate,
    });
  }, [hidden, shown]);
  const peekStyle = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * PEEK_HIDE_Y }],
  }));

  // Session ended (or we walked into the room) → make sure the sheet isn't left open.
  useEffect(() => {
    if (hidden) setOpen(false);
  }, [hidden, setOpen]);

  if (!live) return null;

  return (
    <>
      <Animated.View
        pointerEvents={hidden ? "none" : "box-none"}
        style={[
          styles.peekWrap,
          { bottom: Math.max(insets.bottom, ms(12)) + TAB_BAR_H },
          peekStyle,
        ]}
      >
        <PeekBar
          code={code!}
          media={media}
          queueLen={queueLen}
          memberIds={memberIds}
          onOpen={() => setOpen(true)}
        />
      </Animated.View>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <TraySheet
          code={code!}
          detent={detent}
          setDetent={setDetent}
          winH={winH}
          bottomInset={Math.max(insets.bottom, ms(12))}
          memberIds={memberIds}
          onClose={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}

/* ------------------------------- peek ---------------------------------- */

function PeekBar({
  code,
  media,
  queueLen,
  memberIds,
  onOpen,
}: {
  code: string;
  media: { tmdbId: string; type: "movie" | "tv"; title?: string; season?: number; episode?: number } | null;
  queueLen: number;
  memberIds: string;
  onOpen: () => void;
}) {
  const { data: details } = useDetailsQuery(
    media ? { type: media.type, id: media.tmdbId } : skipToken,
  );
  const poster = img(details?.poster_path, "w154") ?? undefined;
  const title = media?.title || details?.title || details?.name || "Nothing queued yet";
  const sub =
    media?.type === "tv" && media.season != null
      ? `S${media.season} · E${media.episode ?? 1}`
      : queueLen > 0
      ? `${queueLen} in queue`
      : "Tap to add something";

  const pos = useLivePosition();
  const ids = useMemo(() => memberIds.split(",").filter(Boolean), [memberIds]);

  return (
    <View style={styles.peek}>
      {/* artwork is the shortcut straight back into the room */}
      <Pressable
        onPress={() => enterParty({ room: code, role: "guest" })}
        hitSlop={4}
        style={styles.peekArt}
        accessibilityRole="button"
        accessibilityLabel="Back to the party"
      >
        {poster ? (
          <Image source={{ uri: poster }} style={styles.peekPoster} contentFit="cover" />
        ) : (
          <View style={[styles.peekPoster, styles.peekPosterEmpty]}>
            <Ionicons name="add" size={ms(16)} color={colors.honey} />
          </View>
        )}
      </Pressable>

      <Pressable
        style={styles.peekMid}
        onPress={onOpen}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel="Open the party tray"
      >
        <Text numberOfLines={1} style={styles.peekTitle}>
          {title}
        </Text>
        <View style={styles.peekSubRow}>
          <View style={styles.liveDot} />
          <Text numberOfLines={1} style={styles.peekSub}>
            {code} · {sub}
            {pos > 0 ? ` · ${fmt(pos)}` : ""}
          </Text>
        </View>
      </Pressable>

      <Pressable
        style={styles.peekRight}
        onPress={onOpen}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel="Expand the party tray"
      >
        <View style={styles.avatars}>
          {ids.slice(0, 3).map((id, i) => (
            <View key={id} style={[styles.avatarSlot, i > 0 && { marginLeft: -ms(9) }]}>
              <BearAvatar config={bearFor(id)} size={ms(20)} />
            </View>
          ))}
        </View>
        <Ionicons name="chevron-up" size={ms(16)} color={colors.textDim} />
      </Pressable>
    </View>
  );
}

/**
 * The deepest active route name.
 *
 * NOT useNavigationState: the tray is a SIBLING of RootNavigator (it has to be,
 * to outlive any screen), so it sits inside NavigationContainer but inside no
 * navigator — and that hook throws there. The container ref is the supported way
 * to read routing from outside the tree.
 */
function useCurrentRouteName(): string | undefined {
  const read = () =>
    navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined;
  const [name, setName] = useState<string | undefined>(read);
  useEffect(() => {
    setName(read());
    const unsub = navigationRef.addListener("state", () => setName(read()));
    return unsub;
  }, []);
  return name;
}

/**
 * Media position (seconds), ticked locally once a second. The player is not
 * mounted out here, so the anchor + the reference clock are all we have — and
 * keeping the interval local means the tick never leaves this component.
 */
function useLivePosition(): number {
  const anchor = usePartySnapshot(
    (s) => s?.playback ?? null,
    (a, b) =>
      a?.status === b?.status &&
      a?.positionMs === b?.positionMs &&
      a?.anchorServerTimeMs === b?.anchorServerTimeMs &&
      a?.rate === b?.rate,
  );
  const { client } = usePartySession();
  const [sec, setSec] = useState(0);

  useEffect(() => {
    if (!anchor || !client) {
      setSec(0);
      return;
    }
    const tick = () => setSec(Math.floor(effectivePositionMs(anchor, client.now()) / 1000));
    tick();
    if (anchor.status !== "playing") return; // paused: one read, no interval
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [anchor, client]);

  return sec;
}

/* ------------------------------- sheet --------------------------------- */

function TraySheet({
  code,
  detent,
  setDetent,
  winH,
  bottomInset,
  memberIds,
  onClose,
}: {
  code: string;
  detent: Detent;
  setDetent: (d: Detent) => void;
  winH: number;
  bottomInset: number;
  memberIds: string;
  onClose: () => void;
}) {
  const halfH = Math.round(winH * 0.46);
  const fullH = Math.round(winH * 0.9);
  const height = useSharedValue(detent === "full" ? fullH : halfH);

  useEffect(() => {
    height.value = withTiming(detent === "full" ? fullH : halfH, {
      duration: duration.base,
      easing: easing.standard,
    });
  }, [detent, halfH, fullH, height]);

  const sheetStyle = useAnimatedStyle(() => ({ height: height.value }));

  const toggle = useCallback(
    () => setDetent(detent === "full" ? "half" : "full"),
    [detent, setDetent],
  );

  // Drag the grabber: up past a threshold → full, down → half, further → close.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onEnd((e) => {
          "worklet";
          if (e.translationY < -40) runOnJS(setDetent)("full");
          else if (e.translationY > 90) runOnJS(onClose)();
          else if (e.translationY > 40) runOnJS(setDetent)("half");
        })
        .runOnJS(false),
    [setDetent, onClose],
  );

  const ids = useMemo(() => memberIds.split(",").filter(Boolean), [memberIds]);

  return (
    <Animated.View style={[styles.sheet, { paddingBottom: bottomInset }, sheetStyle]}>
      <GestureDetector gesture={pan}>
        <Pressable
          onPress={toggle}
          style={styles.grabberHit}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={detent === "full" ? "Collapse the tray" : "Expand the tray to show the queue"}
        >
          <View style={styles.grabber} />
        </Pressable>
      </GestureDetector>

      <View style={styles.sheetHead}>
        <View style={styles.liveDot} />
        <Text style={styles.sheetCode}>{code}</Text>
        <View style={styles.avatars}>
          {ids.slice(0, 4).map((id, i) => (
            <View key={id} style={[styles.avatarSlot, i > 0 && { marginLeft: -ms(9) }]}>
              <BearAvatar config={bearFor(id)} size={ms(20)} />
            </View>
          ))}
        </View>
        <View style={{ flex: 1 }} />
        <Pressable
          style={styles.openRoomBtn}
          onPress={() => {
            onClose();
            enterParty({ room: code, role: "guest" });
          }}
          hitSlop={6}
        >
          <Ionicons name="expand-outline" size={ms(13)} color={colors.honey} />
          <Text style={styles.openRoomText}>Open room</Text>
        </Pressable>
      </View>

      {/* full = queue standing where the video sits on PartyScreen, chat beneath */}
      {detent === "full" ? (
        <View style={styles.queuePane}>
          <PartyQueueList />
        </View>
      ) : null}

      <View style={styles.chatPane}>
        <PartyChatThread compact />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  peekWrap: { position: "absolute", left: ms(12), right: ms(12) },
  peek: {
    height: PEEK_H,
    flexDirection: "row",
    alignItems: "center",
    gap: ms(10),
    paddingHorizontal: ms(10),
    borderRadius: radius.lg,
    // NO blur, NO elevation — see the header note.
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  peekArt: { borderRadius: ms(6), overflow: "hidden" },
  peekPoster: { width: ms(30), height: ms(42), borderRadius: ms(6) },
  peekPosterEmpty: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.honeySoft,
  },
  peekMid: { flex: 1, gap: ms(3) },
  peekTitle: { color: colors.text, fontFamily: font.headlineSemi, fontSize: ms(13) },
  peekSubRow: { flexDirection: "row", alignItems: "center", gap: ms(5) },
  peekSub: { color: colors.textDim, fontFamily: font.body, fontSize: ms(11), flexShrink: 1 },
  liveDot: { width: ms(6), height: ms(6), borderRadius: ms(3), backgroundColor: colors.honey },
  peekRight: { flexDirection: "row", alignItems: "center", gap: ms(6) },
  avatars: { flexDirection: "row", alignItems: "center" },
  avatarSlot: {
    borderRadius: ms(12),
    borderWidth: ms(1.5),
    borderColor: colors.bgElevated,
    overflow: "hidden",
  },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  grabberHit: { alignItems: "center", paddingVertical: ms(10) },
  grabber: {
    width: ms(38),
    height: ms(4),
    borderRadius: ms(2),
    backgroundColor: colors.borderStrong,
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(8),
    paddingHorizontal: ms(14),
    paddingBottom: ms(10),
  },
  sheetCode: {
    color: colors.text,
    fontFamily: font.headlineSemi,
    fontSize: ms(13),
    letterSpacing: 1,
  },
  openRoomBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(4),
    paddingHorizontal: ms(10),
    paddingVertical: ms(6),
    borderRadius: radius.pill,
    backgroundColor: colors.honeySoft,
  },
  openRoomText: { color: colors.honey, fontFamily: font.label, fontSize: ms(11) },
  queuePane: {
    flex: 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chatPane: { flex: 1 },
});

export default PartyTray;
