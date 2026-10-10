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
import { useIsPartyHost, usePartySession, usePartySnapshot } from "@/services/party/PartySession";
import { effectivePositionMs } from "@/services/party/protocol";
import { enterParty } from "@/src/navigation/actions";
import { colors, font, ms, radius, type } from "@/theme/bearoom";
import { duration, easing } from "@/theme/motion";
import { Ionicons } from "@expo/vector-icons";
import { Frost } from "@/src/ui/Frost";
import { Image } from "expo-image";
import { skipToken } from "@reduxjs/toolkit/query";
import { useDetailsQuery } from "@/src/store/services/tmdbApi";
import { img } from "@/utils/tmdbDetails";
import { navigationRef } from "@/src/navigation/navigationRef";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

/** Routes that already ARE the party, or that play video. */
const HIDE_ON = new Set(["Party", "Player"]);
const PEEK_H = ms(62);
/** Pre-computed: ms() is not a worklet, so it can't be called inside useAnimatedStyle. */
const PEEK_HIDE_Y = ms(62) + ms(16);
/** Clearance for the floating tab bar so peek rides above it, never over it. */
const TAB_BAR_H = ms(64);

/** The room's current media, as both the peek bar and the sheet need it. */
export type TrayMedia = {
  tmdbId: string;
  type: "movie" | "tv";
  title?: string;
  season?: number;
  episode?: number;
} | null;

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
    // Compare every field the tray actually renders. The identity fields alone
    // meant a title (or provider) correction for the SAME tmdbId never reached
    // the UI — caught by renaming a queued title and watching the card ignore it.
    (a, b) =>
      a?.tmdbId === b?.tmdbId &&
      a?.type === b?.type &&
      a?.season === b?.season &&
      a?.episode === b?.episode &&
      a?.title === b?.title &&
      a?.providerId === b?.providerId,
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
          memberIds={memberIds}
          onOpen={() => setOpen(true)}
        />
      </Animated.View>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        // edge-to-edge is on (app.json), so without these the modal's content box
        // stops above the Android navigation bar and the page leaks underneath.
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <TraySheet
          code={code!}
          media={media}
          winH={winH}
          bottomInset={Math.max(insets.bottom, ms(12))}
          memberIds={memberIds}
          queueLen={queueLen}
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
  memberIds,
  onOpen,
}: {
  code: string;
  media: TrayMedia;
  memberIds: string;
  onOpen: () => void;
}) {
  const { data: details } = useDetailsQuery(
    media ? { type: media.type, id: media.tmdbId } : skipToken,
  );
  const poster = img(details?.poster_path, "w154") ?? undefined;
  const playing = !!media;
  const title = media?.title || details?.title || details?.name || "Nothing playing";

  const pos = useLivePosition();
  const runtimeSec = useRuntimeSeconds(details);
  const pct = runtimeSec > 0 ? Math.min(1, pos / runtimeSec) : 0;
  const ids = useMemo(() => memberIds.split(",").filter(Boolean), [memberIds]);

  // Who may drive playback. UI gating is cosmetic (the server is the chokepoint),
  // but offering a transport control that silently fails is worse than hiding it.
  const isHost = useIsPartyHost();
  const { play, pause, userId } = usePartySession();
  const canControl = usePartySnapshot(
    (s) =>
      !!userId &&
      !!s?.members?.some((m) => m.userId === userId && m.permissions?.canControlPlayback),
  );
  const roomPlaying = usePartySnapshot((s) => s?.playback?.status === "playing");

  return (
    <View style={styles.peek}>
      {/* Same frosted surface as FloatingTabBar, so the bar and the tab bar it
          rides on read as one navigation object rather than a card floating over
          the content. Quiet controls, rich content. */}
      <Frost intensity={70} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.peekTint]} />
      <View style={[StyleSheet.absoluteFill, styles.peekLift]} />

      <Pressable
        style={styles.peekBody}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel="Open the party tray"
      >
        {poster ? (
          <Image source={{ uri: poster }} style={styles.peekPoster} contentFit="cover" />
        ) : (
          /* Square, not poster-shaped: there is no artwork to stand in for, so a
             2:3 slot just reads as a missing image. A square tile reads as a glyph. */
          <View style={styles.peekGlyph}>
            <Ionicons name="film-outline" size={ms(18)} color={colors.textDim} />
          </View>
        )}

        <View style={styles.peekMid}>
          <Text numberOfLines={1} style={styles.peekTitle}>
            {title}
          </Text>
          {/* One metadata line that answers WHAT and WHERE at once, so the room
              isn't a second floating widget competing for the same attention. */}
          <View style={styles.peekMetaRow}>
            {playing ? (
              <Text numberOfLines={1} style={styles.peekMeta}>
                {runtimeSec > 0 ? `${fmt(pos)} / ${fmt(runtimeSec)}` : fmt(pos)}
                {media?.type === "tv" && media.season != null
                  ? `  ·  S${media.season} E${media.episode ?? 1}`
                  : ""}
                {"  ·  "}
              </Text>
            ) : (
              <Text numberOfLines={1} style={styles.peekMeta}>
                Add something to watch{"  ·  "}
              </Text>
            )}
            {ids[0] ? <BearAvatar config={bearFor(ids[0])} size={ms(13)} /> : null}
            <Text numberOfLines={1} style={styles.peekCode}>
              {code}
            </Text>
          </View>
        </View>

        {playing && (isHost || canControl) ? (
          <Pressable
            onPress={() => (roomPlaying ? pause() : play())}
            hitSlop={10}
            style={styles.peekTransport}
            accessibilityRole="button"
            accessibilityLabel={roomPlaying ? "Pause for everyone" : "Play for everyone"}
          >
            <Ionicons
              name={roomPlaying ? "pause" : "play"}
              size={ms(19)}
              color={colors.text}
            />
          </Pressable>
        ) : null}

        <View style={styles.chevBtn}>
          <Ionicons name="chevron-up" size={ms(15)} color={colors.text} />
        </View>
      </Pressable>

      {/* A 2dp rule welded to the bottom edge — progress without a widget. */}
      {playing ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(pct * 100)}%` }]} />
        </View>
      ) : null}
    </View>
  );
}

/** Total runtime in seconds from a TMDB details payload (movie or episode). */
function useRuntimeSeconds(details: any): number {
  return useMemo(() => {
    const mins =
      typeof details?.runtime === "number"
        ? details.runtime
        : Array.isArray(details?.episode_run_time)
        ? details.episode_run_time[0]
        : 0;
    return (mins ?? 0) * 60;
  }, [details]);
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
  media,
  bottomInset,
  winH,
  memberIds,
  queueLen,
  onClose,
}: {
  code: string;
  media: TrayMedia;
  bottomInset: number;
  winH: number;
  memberIds: string;
  queueLen: number;
  onClose: () => void;
}) {
  // ONE height and a switcher, not detents plus a collapsible section. Those
  // three overlapping ways to resize meant the pane you actually came for got a
  // sliver of the sheet, and both halves showed empty states at once.
  //
  // The two panes are a PAGER: swiping between chat and the queue is how a phone
  // expects to move sideways, and the segment's pill is driven off the same scroll
  // offset, so the control tracks your finger instead of snapping after the fact.
  const { width: winW } = useWindowDimensions();
  const scrollRef = useRef<Animated.ScrollView>(null);
  const scrollX = useSharedValue(0);
  const [tab, setTab] = useState(0);
  const [trackW, setTrackW] = useState(0);
  const ids = useMemo(() => memberIds.split(",").filter(Boolean), [memberIds]);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  const segPad = ms(4);
  const pillW = trackW > 0 ? (trackW - segPad * 2) / 2 : 0;
  const pillStyle = useAnimatedStyle(() => ({
    width: pillW,
    transform: [{ translateX: winW > 0 ? (scrollX.value / winW) * pillW : 0 }],
  }));

  const goTo = useCallback(
    (i: number) => {
      setTab(i);
      scrollRef.current?.scrollTo({ x: i * winW, animated: true });
    },
    [winW],
  );

  // The grabber now does one thing: dismiss. No detent to guess at.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onEnd((e) => {
          "worklet";
          if (e.translationY > 60) scheduleOnRN(onClose);
        })
        .runOnJS(false),
    [onClose],
  );

  return (
    <View style={[styles.sheet, { height: Math.round(winH * 0.8), paddingBottom: bottomInset }]}>
      <Frost intensity={90} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.sheetTint]} />
      <View style={[StyleSheet.absoluteFill, styles.sheetLift]} />

      <GestureDetector gesture={pan}>
        <Pressable
          onPress={onClose}
          style={styles.grabberHit}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close the party tray"
        >
          <View style={styles.grabber} />
        </Pressable>
      </GestureDetector>

      {/* Expanding used to DROP the artwork the peek bar had, so you lost your
          bearings on the way in. It now carries over and grows. */}
      <NowPlayingCard
        media={media}
        code={code}
        onOpenRoom={() => {
          onClose();
          enterParty({ room: code, role: "guest" });
        }}
      />

      <View style={styles.whoRow}>
        <View style={styles.avatars}>
          {ids.slice(0, 5).map((id, i) => (
            <View key={id} style={[styles.avatarSlot, i > 0 && styles.avatarOverlap]}>
              <BearAvatar config={bearFor(id)} size={ms(24)} />
            </View>
          ))}
        </View>
        <Text style={styles.watching}>
          {ids.length} {ids.length === 1 ? "person" : "people"} in the room
        </Text>
      </View>

      <View style={styles.segment} onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
        <Animated.View style={[styles.segPill, pillStyle]} />
        {["Chat", "Up next"].map((label, i) => {
          const active = tab === i;
          return (
            <Pressable
              key={label}
              onPress={() => goTo(i)}
              style={styles.segItem}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={label}
            >
              <Text style={[styles.segText, active && styles.segTextActive]}>{label}</Text>
              {i === 1 && queueLen > 0 ? (
                <View style={[styles.countPill, active && styles.countPillActive]}>
                  <Text style={[styles.countText, active && styles.countTextActive]}>
                    {queueLen}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) =>
          setTab(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, winW)))
        }
        style={styles.pager}
        // The chat thread and the queue are both vertical lists; without this the
        // horizontal pager swallows the first few pixels of every vertical drag.
        directionalLockEnabled
      >
        <View style={{ width: winW }}>
          <PartyChatThread compact />
        </View>
        <View style={{ width: winW }}>
          <PartyQueueList />
        </View>
      </Animated.ScrollView>
    </View>
  );
}

/** The sheet's anchor: what the room is on, and the way back into it. */
function NowPlayingCard({
  media,
  code,
  onOpenRoom,
}: {
  media: TrayMedia;
  code: string;
  onOpenRoom: () => void;
}) {
  const { data: details } = useDetailsQuery(
    media ? { type: media.type, id: media.tmdbId } : skipToken,
  );
  const poster = img(details?.poster_path, "w154") ?? undefined;
  const pos = useLivePosition();
  const runtimeSec = useRuntimeSeconds(details);
  const pct = runtimeSec > 0 ? Math.min(1, pos / runtimeSec) : 0;
  const title = media?.title || details?.title || details?.name || "Nothing playing";
  const line =
    media
      ? [
          media.type === "tv" && media.season != null
            ? `S${media.season} · E${media.episode ?? 1}`
            : null,
          runtimeSec > 0 ? `${fmt(pos)} / ${fmt(runtimeSec)}` : pos > 0 ? fmt(pos) : null,
        ]
          .filter(Boolean)
          .join("  ·  ")
      : "Pick something and it plays for everyone";

  return (
    <View style={styles.npCard}>
      {poster ? (
        <Image source={{ uri: poster }} style={styles.npPoster} contentFit="cover" />
      ) : (
        <View style={styles.npGlyph}>
          <Ionicons name="film-outline" size={ms(20)} color={colors.textDim} />
        </View>
      )}
      <View style={styles.npMid}>
        {/* The code sits here, small and quiet — it is reference information, not
            a headline, and it was shouting at the top of the sheet before. */}
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveCode}>{code}</Text>
        </View>
        <Text numberOfLines={1} style={styles.npTitle}>
          {title}
        </Text>
        <Text numberOfLines={1} style={styles.npLine}>
          {line}
        </Text>
        {media ? (
          <View style={styles.npTrack}>
            <View style={[styles.npFill, { width: `${Math.round(pct * 100)}%` }]} />
          </View>
        ) : null}
      </View>
      <Pressable
        style={styles.npOpen}
        onPress={onOpenRoom}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Open the room"
      >
        <Ionicons name="tv-outline" size={ms(17)} color={colors.honey} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  /* Pulled in toward the tab bar's footprint so the two stack as one column. Not
     matched exactly: FloatingTabBar is content-width (four icons), and squeezing a
     film title into that would strangle it. Slightly wider than the nav pill is
     the right hierarchy — content bar over nav bar. */
  peekWrap: { position: "absolute", left: ms(40), right: ms(40) },

  /* Quiet, not loud: a hairline like every other surface, NOT a honey outline.
     The accent is reserved for the progress rule and the live dot. */
  peek: {
    height: PEEK_H,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  /* Warm tint over the blur — enough body that title/meta stay legible on top of
     a bright poster grid, still transparent enough to read as glass. */
  /* Two layers over the blur: a lighter charcoal scrim than before (0.62 -> 0.38)
     so the artwork behind stays legible as texture, plus a warm-white lift that
     keeps title contrast up. Stronger blur does the rest of the legibility work. */
  peekTint: { backgroundColor: "rgba(22,18,13,0.38)" },
  peekLift: { backgroundColor: "rgba(246,239,227,0.07)" },
  peekBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: ms(9),
    paddingLeft: ms(8),
    paddingRight: ms(6),
  },
  peekArt: { borderRadius: radius.sm, overflow: "hidden" },
  peekPoster: { width: ms(34), height: ms(46), borderRadius: radius.sm },
  peekGlyph: {
    width: ms(38),
    height: ms(38),
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceStrong,
  },
  peekMid: { flex: 1, gap: ms(3) },
  peekTitle: { ...type.label, fontFamily: font.headlineSemi, fontSize: ms(14) },
  peekMetaRow: { flexDirection: "row", alignItems: "center", gap: ms(4) },
  peekMeta: { ...type.caption, fontSize: ms(11), color: colors.textDim, flexShrink: 1 },
  peekCode: {
    fontFamily: font.label,
    fontSize: ms(10.5),
    letterSpacing: 0.8,
    color: colors.textDim,
  },
  peekTransport: {
    width: ms(30),
    height: ms(30),
    alignItems: "center",
    justifyContent: "center",
  },

  /* The room's identity: a honey capsule you can find at a glance. */
  livePill: { flexDirection: "row", alignItems: "center", gap: ms(5) },
  liveDot: {
    width: ms(6),
    height: ms(6),
    borderRadius: ms(3),
    backgroundColor: colors.honey,
  },
  liveCode: {
    fontFamily: font.label,
    fontSize: ms(10),
    letterSpacing: 1.4,
    color: colors.honey,
  },

  peekRight: { flexDirection: "row", alignItems: "center", gap: ms(8) },
  avatars: { flexDirection: "row", alignItems: "center" },
  avatarSlot: {
    borderRadius: radius.pill,
    borderWidth: ms(1.5),
    borderColor: "rgba(22,18,13,0.9)",
    overflow: "hidden",
  },
  avatarOverlap: { marginLeft: -ms(9) },
  chevBtn: {
    width: ms(28),
    height: ms(28),
    borderRadius: ms(14),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceStrong,
  },

  progressTrack: { height: ms(2), backgroundColor: colors.surfaceStrong },
  progressFill: { height: ms(2), backgroundColor: colors.honey },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  /* The SHEET stays dark and near-opaque — it is a panel you read against, and a
     busy poster grid showing through a full-height surface is noise, not depth.
     The glass here is the heavy blur plus the warm lift at the edges, not
     transparency. (The mini-player is the opposite case: it is a thin strip, so
     it stays light and lets the artwork through.) */
  sheetTint: { backgroundColor: "rgba(16,13,10,0.84)" },
  sheetLift: { backgroundColor: "rgba(246,239,227,0.03)" },
  grabberHit: { alignItems: "center", paddingTop: ms(9), paddingBottom: ms(7) },
  grabber: {
    width: ms(42),
    height: ms(4),
    borderRadius: ms(2),
    backgroundColor: colors.borderStrong,
  },

  /* ---- expanded sheet ------------------------------------------------- */
  whoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(9),
    paddingHorizontal: ms(16),
    paddingTop: ms(12),
  },
  watching: { ...type.caption, fontSize: ms(11.5), color: colors.textDim },

  /* Now-playing card — the sheet's anchor. */
  npCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(12),
    marginHorizontal: ms(14),
    padding: ms(10),
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  npPoster: { width: ms(44), height: ms(62), borderRadius: radius.sm },
  npGlyph: {
    width: ms(48),
    height: ms(48),
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceStrong,
  },
  npMid: { flex: 1, gap: ms(3) },
  npTitle: { ...type.h3, fontSize: ms(15) },
  npLine: { ...type.caption, fontSize: ms(11), color: colors.textFaint },
  npTrack: {
    height: ms(3),
    borderRadius: ms(2),
    backgroundColor: colors.surfaceStrong,
    marginTop: ms(4),
    overflow: "hidden",
  },
  npFill: { height: ms(3), borderRadius: ms(2), backgroundColor: colors.honey },
  /* Quiet: this is a way OUT of the sheet, not the thing you came to do. */
  npOpen: {
    width: ms(38),
    height: ms(38),
    borderRadius: ms(19),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceStrong,
  },

  /* Segmented switcher — one pane at full height beats two half-empty ones. */
  segment: {
    position: "relative",
    flexDirection: "row",
    margin: ms(14),
    marginBottom: ms(8),
    padding: ms(4),
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  /* Driven off the pager's scroll offset, so it tracks the swipe rather than
     snapping once the gesture is already over. */
  segPill: {
    position: "absolute",
    left: ms(4),
    top: ms(4),
    bottom: ms(4),
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  segItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: ms(6),
    height: ms(34),
    borderRadius: radius.pill,
  },
  /* Selection reads as a raised neutral pill (the platform idiom) instead of a
     honey slab — a filled accent here competed with the content it sits above. */
  segText: { fontFamily: font.label, fontSize: ms(12.5), color: colors.textDim },
  segTextActive: { color: colors.text },
  countPill: {
    minWidth: ms(18),
    height: ms(18),
    paddingHorizontal: ms(5),
    borderRadius: ms(9),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.honeySoft,
  },
  countPillActive: { backgroundColor: colors.honeySoft },
  countText: { fontFamily: font.label, fontSize: ms(10), color: colors.honey },
  countTextActive: { color: colors.honey },

  pager: { flex: 1 },
});

export default PartyTray;
