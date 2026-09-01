/**
 * Watch-party screen (one player per device), backed by the Supabase-only
 * authority (services/party/*). Postgres owns the timeline + host lease; this
 * screen renders the room's media, forwards player events to the sync engine,
 * exposes host controls + handoff, and layers an ephemeral chat + reactions
 * (usePartyChat — its own broadcast channel, not persisted; the "later phase"
 * chat kept lightweight and free).
 *
 * Cozy cinema-lounge skin (Stitch "Bearoom Watch Party").
 */
import BearAvatar from "@/components/avatar/BearAvatar";
import { GifPicker } from "@/components/party/GifPicker";
import { RoomSettingsSheet } from "@/components/party/RoomSettingsSheet";
import {
  isBackgroundPlaybackAvailable,
  startBackgroundPlaybackSession,
  stopBackgroundPlaybackSession,
  updateBackgroundPlaybackState,
} from "@/components/player/backgroundPlayback";
import {
  HijackPlayer,
  type PlayerEvent,
  type QualityLevel,
} from "@/components/player/HijackPlayer";
import { PlayerControls, type PlayerControlsHandle } from "@/components/player/PlayerControls";
import PlayerSettingsSheet from "@/components/player/PlayerSettingsSheet";
import { bearAlert } from "@/components/ui/BearAlert";
import GlassButton from "@/components/ui/GlassButton";
import { useMediaCloseGuard } from "@/hooks/useMediaCloseGuard";
import { generateRandomBearConfig } from "@/services/avatar/bearAvatar";
import { getDisplayName } from "@/services/party/identity";
import type { Member, PartyMedia } from "@/services/party/protocol";
import {
  useIsPartyHost,
  usePartyChatSession,
  usePartySession,
  usePartySnapshot,
  type PartySessionRequest,
} from "@/services/party/PartySession";
import type { ChatMessage, FloatingReaction } from "@/services/party/usePartyChat";
import { colors, chat, font, ms, radius } from "@/theme/bearoom";
import ReanimatedAnimated, { FadeIn, FadeOut, SlideInRight, SlideOutRight } from "react-native-reanimated";
import { useResponsive } from "@/hooks/useResponsive";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { skipToken } from "@reduxjs/toolkit/query";
import { useDetailsQuery } from "@/src/store/services/tmdbApi";
import { img } from "@/utils/tmdbDetails";
import { exitMedia, exitMediaBack, openSearchTab } from "@/src/navigation/actions";
import { useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { RootStackParamList } from "@/src/navigation/types";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  AppState,
  Easing,
  FlatList,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const QUICK_REACTIONS = ["❤️", "😂", "🔥", "👏", "😮"];
// Stable empty reference so `members` doesn't churn memo deps before the snapshot lands.
const EMPTY_MEMBERS: Member[] = [];

// `generateRandomBearConfig` is deterministic per userId seed, but returns a NEW
// object each call — which invalidated BearAvatar's useMemo and rebuilt the full
// SVG for every visible avatar on every PartyScreen re-render (over live video).
// Cache the config per userId so the object identity is stable.
const bearConfigCache = new Map<string, ReturnType<typeof generateRandomBearConfig>>();
function bearConfigFor(userId: string) {
  let cfg = bearConfigCache.get(userId);
  if (!cfg) {
    cfg = generateRandomBearConfig("neutral", userId);
    bearConfigCache.set(userId, cfg);
  }
  return cfg;
}

// Group a sender's consecutive messages sent within this window (WhatsApp/IG-style):
// avatar + name shown once per group, bubbles tight-stacked, one timestamp at the end.
const CHAT_GROUP_MS = 4 * 60 * 1000;
// A stable, readable accent per sender (name + avatar) so a group chat is easy to scan.
function senderColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0;
  return chat.senderColors[Math.abs(h) % chat.senderColors.length];
}

// Instagram-style corners: the tail side (right for mine, left for incoming) keeps
// its OUTER corners round (top of first bubble, bottom of last) and FLATTENS where
// consecutive bubbles meet, so a sender's run reads as one connected stack.
const BUBBLE_ROUND = 19;
const BUBBLE_FLAT = 6;
function bubbleCorners(mine: boolean, firstOfGroup: boolean, lastOfGroup: boolean) {
  const R = ms(BUBBLE_ROUND);
  const top = firstOfGroup ? R : ms(BUBBLE_FLAT);
  const bot = lastOfGroup ? R : ms(BUBBLE_FLAT);
  return mine
    ? { borderTopLeftRadius: R, borderBottomLeftRadius: R, borderTopRightRadius: top, borderBottomRightRadius: bot }
    : { borderTopRightRadius: R, borderBottomRightRadius: R, borderTopLeftRadius: top, borderBottomLeftRadius: bot };
}

/** Media position (seconds) → "m:ss" (or "h:mm:ss" past an hour). */
function fmtMedia(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(ss).padStart(2, "0")}`;
}

/** Wall-clock send time → short local "h:mm AM/PM". */
function fmtClock(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/** "m:ss" / "h:mm:ss" → seconds, or null if it isn't a valid clock. */
function parseClock(s: string): number | null {
  const parts = s.split(":").map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n))) return null;
  if (parts.length === 3) {
    const [h, m, sec] = parts;
    return m > 59 || sec > 59 ? null : h * 3600 + m * 60 + sec;
  }
  if (parts.length === 2) {
    const [m, sec] = parts;
    return sec > 59 ? null : m * 60 + sec;
  }
  return null;
}

// Matches YouTube-style timestamps embedded in a message ("1:27", "12:04", "1:02:03").
const TS_RE = /\b\d{1,2}:\d{2}(?::\d{2})?\b/g;

/** Render message text, turning any timestamp token into a tappable seek link. */
function MessageText({ text, onSeek }: { text: string; onSeek: (sec: number) => void }) {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TS_RE.lastIndex = 0;
  while ((m = TS_RE.exec(text)) !== null) {
    const sec = parseClock(m[0]);
    if (sec == null) continue; // leave invalid tokens as plain text
    if (m.index > last) nodes.push(text.slice(last, m.index));
    nodes.push(
      <Text key={m.index} style={styles.tsLink} onPress={() => onSeek(sec)}>
        {m[0]}
      </Text>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <Text style={styles.bubbleText}>{nodes.length ? nodes : text}</Text>;
}

export default function Party() {
  const route = useRoute<RouteProp<RootStackParamList, "Party">>();
  const insets = useSafeAreaInsets();
  const { isWide, isLandscapeMobile, width } = useResponsive();
  const params = route.params ?? {};
  const isHostParam = params.role === "host";
  const room = (params.room ?? "").toUpperCase();

  const hostMedia: PartyMedia | undefined = useMemo(
    () =>
      isHostParam && params.id
        ? {
            tmdbId: params.id,
            type: params.type === "tv" ? "tv" : "movie",
            season: params.season ? Number(params.season) : undefined,
            episode: params.ep ? Number(params.ep) : undefined,
            title: params.title,
            providerId: params.provider,
          }
        : undefined,
    [isHostParam, params.id, params.type, params.season, params.ep, params.title, params.provider],
  );

  const displayName = useMemo(
    () => getDisplayName() ?? (isHostParam ? "Host" : "Guest"),
    [isHostParam],
  );

  const controlsRef = useRef<PlayerControlsHandle>(null);
  // Our native overlay mounts only once the bridge binds a <video> (i.e. past
  // videasy's pre-play "tap to start" gate). Reset if the media/provider changes.
  const [playerBound, setPlayerBound] = useState(false);
  const [pwPrompt, setPwPrompt] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [showPlayerSettings, setShowPlayerSettings] = useState(false);
  const [qualities, setQualities] = useState<QualityLevel[]>([]);
  const [audios, setAudios] = useState<QualityLevel[]>([]);
  const [fullscreen, setFullscreen] = useState(false);
  const [landscapeChatOpen, setLandscapeChatOpen] = useState(false);
  const isImmersive = fullscreen || isLandscapeMobile;
  // Latest known playback position (seconds) from the player — read when inserting.
  const posRef = useRef(0);
  // Live mm:ss shown on the in-field timestamp button; ticks only while composing.
  const [livePos, setLivePos] = useState(0);
  const [inputFocused, setInputFocused] = useState(false);

  // The session lives above the navigator (services/party/PartySession.tsx), so
  // this screen no longer OWNS the room — it asks for one and then renders it.
  // Re-entering the same room (deep link, or coming back from the tray) must NOT
  // rebuild the client, which is why open() is gated on the code actually changing.
  const party = usePartySession();
  const playerRef = party.playerRef;
  const liveCode = party.request?.code;
  // Guard against re-opening a room the user just left: leave() clears the
  // session while this screen is still mounted, which would otherwise look
  // identical to "arrived at a room we aren't in yet" and immediately rejoin.
  const openedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!room || liveCode === room || openedRef.current === room) return;
    openedRef.current = room;
    const req: PartySessionRequest = {
      code: room,
      role: isHostParam ? "host" : "guest",
      displayName,
      media: hostMedia,
    };
    party.open(req);
  }, [room, liveCode, isHostParam, displayName, hostMedia, party]);

  // Leaving is now explicit: the session outlives this screen, so unmounting no
  // longer ends the room. Every terminal exit must say so.
  const leaveAndExit = useCallback(
    (exit: () => void) => () => {
      openedRef.current = null;
      party.leave();
      exit();
    },
    [party],
  );

  // Full snapshot: this screen renders essentially all of it, so a selector would
  // buy nothing. Narrow selectors are for the app-wide surfaces (tray, queue chips).
  const snap = usePartySnapshot((s) => s);
  // No snapshot yet = we are not in a room. There is nothing to chat in and
  // nothing to queue, so the screen should be ONE centred state rather than a
  // stub at the top plus an empty chat below it.
  const connecting = !snap && !party.error;
  const isHost = useIsPartyHost();
  const media = snap?.media;
  const config = snap?.config;
  const providerId = media?.providerId;
  // The room snapshot carries no artwork, so the loading cover would fall back to a
  // bare badge in a black void. Fetch the title's poster (cached, shared with the
  // details screens) so host AND guest get the rich blurred-poster loader.
  const { data: mediaDetails } = useDetailsQuery(
    media ? { type: media.type, id: media.tmdbId } : skipToken,
  );
  const posterUrl = img(mediaDetails?.poster_path, "w342") ?? undefined;
  const roomCode = snap?.code || room;
  const hostPresent = !!snap?.lease.hostId;
  const hostId = snap?.lease.hostId;
  const members = snap?.members ?? EMPTY_MEMBERS;
  const guests = useMemo(
    () => members.filter((m) => m.userId !== party.userId),
    [members, party.userId],
  );
  const selfMember = members.find((m) => m.userId === party.userId);
  const selfApproved = selfMember?.approved !== false;
  const reactionsOn = config?.gifsEnabled !== false;
  const canParticipate = isHost || selfApproved; // approved (or host) → not in the waiting room
  const canSendChat =
    isHost ||
    (selfApproved && config?.chatEnabled !== false && selfMember?.permissions?.canChat !== false);
  const canGrabControl = !isHost && selfApproved && !!config?.guestControlDefault;
  // Only those who can drive playback get a tappable "jump to this moment" chip.
  const canSeek = isHost || selfMember?.permissions?.canControlPlayback === true;
  const hasMedia = !!(providerId && media);
  const pendingCount = guests.filter((g) => g.approved === false).length;
  const sessionStarted = useRef(false);
  const sessionTitleRef = useRef("Bearoom party");
  sessionTitleRef.current = media?.title || params.title || "Bearoom party";

  // Resist accidental exit: hardware back + the top-bar chevron confirm first.
  // Now three-way, because the session outlives this screen: browsing away keeps
  // the room alive (that's how you add to the queue), leaving ends it.
  const { requestClose } = useMediaCloseGuard({
    title: "Leave the party?",
    message:
      "Keep browsing to add something to the queue — the room stays live. Leaving ends it for you.",
    secondary: { label: "Keep browsing", onPress: exitMediaBack },
    confirmLabel: "Leave room",
    // Pop back to where the party was launched from (the title's details) instead
    // of resetting to Home — same real-back fix as the solo player. Falls back to
    // the reset only when there's no history (e.g. a deep-linked join). Kicked-out
    // (below) stays a hard reset — that's a forced, terminal exit.
    onConfirm: leaveAndExit(exitMediaBack),
    // Armed whenever we're in a room, media or not — a medialess room is a real
    // room now, and backing out of it must not silently strand the session.
    enabled: !!party.request,
  });

  // Removed by the host → bounce out with a note.
  useEffect(() => {
    if (!party.kicked) return;
    bearAlert("Removed", "The host removed you from this room.", [
      { text: "OK", onPress: leaveAndExit(exitMedia) },
    ]);
  }, [party.kicked, leaveAndExit]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") party.resync();
    });
    return () => sub.remove();
  }, [party]);

  // Media/provider changed → the WebView re-keys back to videasy's pre-play gate,
  // so drop back to web controls until the new <video> binds.
  useEffect(() => {
    setPlayerBound(false);
  }, [providerId, media?.tmdbId, media?.season, media?.episode]);

  // Native fullscreen: rotate + expand our player. (HTML5 requestFullscreen needs a
  // gesture INSIDE the WebView that an RN tap can't supply, so we do it RN-side; our
  // overlay stays on top.) A black cover hides the WebView reflow + OS rotation, then
  // fades once it settles — otherwise videasy's chrome / a white flash / an overscaled
  // poster leak through for a frame or two mid-transition.
  //
  // Driven by STATE (not a lone Animated.setValue): the cover mounts opaque in the SAME
  // commit as the layout change, so there's no one-frame leak on expand. It renders as a
  // sibling of the whole app content (below), not nested in the player, so it also
  // covers the party UI that re-appears on collapse — no "half-screen white".
  const [masking, setMasking] = useState(false);
  const maskFade = useRef(new Animated.Value(1)).current;
  const maskTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toggleFullscreen = () => {
    const next = !fullscreen;
    if (maskTimer.current) clearTimeout(maskTimer.current);
    maskFade.stopAnimation();
    maskFade.setValue(1);
    setMasking(true);
    setFullscreen(next);
    (async () => {
      try {
        if (next) await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        else await ScreenOrientation.unlockAsync();
      } catch {
        /* orientation lock is best-effort */
      }
    })();
    // Hold opaque through the rotation + reflow, then fade the cover away.
    maskTimer.current = setTimeout(() => {
      Animated.timing(maskFade, { toValue: 0, duration: 300, useNativeDriver: true }).start(
        ({ finished }) => finished && setMasking(false),
      );
    }, 560);
  };
  // This screen may rotate freely; snap everything back to portrait on leave.
  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      if (maskTimer.current) clearTimeout(maskTimer.current);
      maskTimer.current = null;
      maskFade.stopAnimation();
      maskFade.setValue(0);
      setMasking(false);
    };
  }, [maskFade]);

  useEffect(() => {
    if (!hasMedia || !isBackgroundPlaybackAvailable()) {
      sessionStarted.current = false;
      stopBackgroundPlaybackSession();
      return;
    }
    sessionStarted.current = true;
    void startBackgroundPlaybackSession(sessionTitleRef.current, null);
    return () => {
      sessionStarted.current = false;
      stopBackgroundPlaybackSession();
    };
  }, [hasMedia, providerId, media?.tmdbId]);

  // Password-gated room → surface a password prompt (retry with the entered pw).
  useEffect(() => {
    if (!isHostParam && party.error && /password/i.test(party.error)) setPwPrompt(true);
  }, [party.error, isHostParam]);

  const submitPassword = () => {
    const p = pwInput.trim();
    if (!p) return;
    party.retry(p); // rebuilds the client even if the password is unchanged
    setPwPrompt(false);
    setPwInput("");
  };

  // Surface a rejected host-admin RPC (e.g. lease lapsed → 'not host') instead of
  // swallowing it. bearAlert renders in a Modal, so it shows over the settings sheet.
  const runAdmin = (label: string, p: Promise<void> | void) => {
    Promise.resolve(p).catch((e: unknown) => {
      const msg = String((e as Error)?.message ?? e).replace(/^party_\w+:\s*/, "");
      bearAlert(label, msg || "Please try again.");
    });
  };

  const chat = usePartyChatSession();
  const [draft, setDraft] = useState("");
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    if (chat.messages.length) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [chat.messages.length]);

  const onEvent = (e: PlayerEvent) => {
    if (e.event === "quality") {
      setQualities(e.qualities ?? []);
      return;
    }
    if (e.event === "audio") {
      setAudios(e.audios ?? []);
      return;
    }
    if (Number.isFinite(e.currentTime)) {
      posRef.current = e.currentTime;
      // Only re-render the live label while the user is actually composing (1/sec).
      if (inputFocused) {
        const s = Math.floor(e.currentTime);
        setLivePos((prev) => (prev === s ? prev : s));
      }
    }
    party.onPlayerEvent(e);
    controlsRef.current?.setPlayback({
      currentTime: e.currentTime || 0,
      duration: e.duration || 0,
      paused: !!e.paused,
      readyState: e.readyState,
    });
    if (!isBackgroundPlaybackAvailable()) return;
    if (e.event === "ended") {
      const dur = Number(e.duration) || 0;
      const t = Number(e.currentTime) || 0;
      if (dur > 5 && t >= dur - 1.5) {
        sessionStarted.current = false;
        stopBackgroundPlaybackSession();
      }
      return;
    }
    if (
      e.event !== "play" &&
      e.event !== "pause" &&
      e.event !== "seeked" &&
      e.event !== "tick" &&
      e.event !== "playing" &&
      e.event !== "ready"
    ) {
      return;
    }
    if (!sessionStarted.current) {
      sessionStarted.current = true;
      void startBackgroundPlaybackSession(sessionTitleRef.current, null);
    }
    updateBackgroundPlaybackState(
      e.paused,
      Number(e.currentTime) || 0,
      Number(e.duration) || 0,
    );
  };

  // YouTube-style: drop the current media time into the draft as clickable text.
  const insertTimestamp = () => {
    const stamp = fmtMedia(posRef.current);
    setDraft((d) => (d && !/\s$/.test(d) ? `${d} ` : d) + `${stamp} `);
  };

  // Tap a timestamp in a message → jump there. Controllers move the room; others peek locally.
  // Stable identity so memoized <Bubble> rows don't re-render on every parent update.
  const seekToMoment = useCallback(
    (sec: number) => {
      if (canSeek) party.seekTo(sec);
      else playerRef.current?.seek(sec);
    },
    [canSeek, party, playerRef],
  );

  const share = () => {
    void Share.share({
      message:
        `Join my Bearoom watch party! 🐻\n\nRoom code: ${roomCode}\n\n` +
        `Open Bearoom → “Join a Party” → enter ${roomCode}.`,
    });
  };

  const transferHost = () => {
    if (!guests.length) return;
    bearAlert("Transfer host", "Hand playback control to…", [
      ...guests.slice(0, 5).map((m) => ({
        text: m.displayName || "Guest",
        onPress: () => runAdmin("Couldn't transfer host", party.transferHost(m.userId)),
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const send = () => {
    chat.sendChat(draft);
    setDraft("");
  };

  // Home-indicator / nav padding when the keyboard is closed. When open, the same
  // value is fed to KeyboardStickyView `offset.opened` so the padding cancels out
  // and the composer sits flush on the IME (no manual Keyboard height math).
  const bottomPad = Math.max(insets.bottom, 10);

  return (
    <View style={styles.container}>
      <StatusBar hidden={isImmersive} style="light" />

      <View style={styles.flex}>
        {/* Top bar — static in portrait/tablet; a pre-bind fallback in immersive
            (once bound, the immersive header lives in the PlayerControls overlay). */}
        {!isImmersive || !playerBound ? (
          <View
            style={[
              styles.topBar,
              {
                paddingTop: isImmersive ? ms(6) : insets.top + 6,
                paddingLeft: Math.max(insets.left, ms(12)),
                paddingRight: Math.max(insets.right, ms(12)),
              },
            ]}
          >
            <GlassButton style={styles.glassRound} onPress={requestClose} hitSlop={8} blur={false}>
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </GlassButton>
            <GlassButton style={styles.codePill} onPress={share} blur={false}>
              <Text style={styles.codeLabel}>ROOM · </Text>
              <Text style={styles.code}>{roomCode || "—"}</Text>
              <View style={styles.shareBtn}>
                <Ionicons name="share-social" size={13} color={colors.text} />
              </View>
            </GlassButton>
            <View style={styles.topRightActions}>
              {isLandscapeMobile ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.chatToggleBtn,
                    landscapeChatOpen && styles.chatToggleBtnActive,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => setLandscapeChatOpen((v) => !v)}
                  hitSlop={8}
                >
                  <Ionicons
                    name={landscapeChatOpen ? "chatbubbles" : "chatbubbles-outline"}
                    size={ms(15)}
                    color={landscapeChatOpen ? colors.onHoney : colors.text}
                  />
                  <Text style={[styles.chatToggleText, landscapeChatOpen && styles.chatToggleTextActive]}>Chat</Text>
                  {chat.messages.length > 0 ? (
                    <View style={[styles.chatBadge, landscapeChatOpen && styles.chatBadgeActive]}>
                      <Text style={[styles.chatBadgeText, landscapeChatOpen && styles.chatBadgeTextActive]}>
                        {chat.messages.length > 99 ? "99+" : chat.messages.length}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              ) : null}
              <AvatarStack members={members} hostId={hostId} selfId={party.userId} />
            </View>
          </View>
        ) : null}

        {/* Player + chat as a side-by-side row in landscape / on wide screens. */}
        <View
          style={[
            styles.flex,
            isWide && styles.desktopLayout,
            isLandscapeMobile && styles.landscapeMobileLayout,
            isLandscapeMobile && {
              paddingLeft: Math.max(insets.left, ms(8)),
              paddingRight: Math.max(insets.right, ms(8)),
            },
          ]}
        >
          {/* Left / theater column */}
          <View style={[isWide && styles.desktopLeftCol, isLandscapeMobile && styles.landscapeMobilePlayerCol]}>
            {/* Player */}
            {/* With nothing playing there is no video to reserve room for, so the
                16:9 black box just pushes an empty chat down the screen and leaves
                a void. Collapse to content height and let chat take the space. */}
            <View
              style={
                fullscreen
                  ? styles.playerFs
                  : isWide
                  ? styles.desktopPlayer
                  : isLandscapeMobile
                  ? styles.landscapeMobilePlayer
                  : hasMedia
                  ? styles.player
                  : connecting
                  ? styles.playerFill
                  : styles.playerCompact
              }
            >
          {party.error && /password/i.test(party.error) ? (
            <View style={styles.waiting}>
              <Ionicons name="lock-closed-outline" size={30} color={colors.honey} />
              <Text style={styles.waitingText}>This room is password-protected.</Text>
              <Pressable style={styles.retryBtn} onPress={() => setPwPrompt(true)}>
                <Text style={styles.retryText}>Enter password</Text>
              </Pressable>
            </View>
          ) : party.error ? (
            <View style={styles.waiting}>
              <Ionicons name="alert-circle-outline" size={30} color={colors.danger} />
              <Text style={styles.waitingText}>{party.error.replace(/^party_\w+:\s*/, "")}</Text>
            </View>
          ) : !isHostParam && snap && !selfApproved ? (
            <View style={styles.waiting}>
              <Ionicons name="hourglass-outline" size={30} color={colors.honey} />
              <Text style={styles.waitingText}>Waiting for the host to let you in…</Text>
            </View>
          ) : providerId && media ? (
            <>
              <HijackPlayer
                ref={playerRef}
                providerId={providerId}
                tmdbId={media.tmdbId}
                type={media.type}
                season={media.season}
                episode={media.episode}
                posterUrl={posterUrl}
                onPlayerEvent={onEvent}
                onBound={() => setPlayerBound(true)}
                nativeControls={playerBound}
              />
              {/* Mount our overlay ONLY after the <video> binds. videasy gates
                  playback behind a pre-play button (no <video> until it's tapped);
                  covering it would stop the video ever starting. Before bind, let
                  videasy's own button through; after, we take over the surface. */}
              {playerBound ? (
                <PlayerControls
                  ref={controlsRef}
                  canControl={canSeek}
                  roomPlaying={snap?.playback?.status === "playing"}
                  onPlay={party.play}
                  onPause={party.pause}
                  onSeekTo={party.seekTo}
                  onSeekBy={party.seekBy}
                  onToggleFullscreen={isLandscapeMobile && !fullscreen ? undefined : toggleFullscreen}
                  onTapSync={party.jumpToLive}
                  onOpenSettings={() => {
                    // Both reads drive videasy's ONE settings tab, so stagger them —
                    // firing at once makes audio steal the active tab before quality
                    // finishes reading (→ empty quality panel, stuck on "Loading…").
                    playerRef.current?.readQuality();
                    setTimeout(() => playerRef.current?.readAudio(), 750);
                    setShowPlayerSettings(true);
                  }}
                  fullscreen={fullscreen}
                  topBar={
                    isImmersive ? (
                      <View
                        style={[
                          styles.topBar,
                          {
                            paddingLeft: Math.max(insets.left, ms(12)),
                            paddingRight: Math.max(insets.right, ms(12)),
                            paddingTop: ms(2),
                          },
                        ]}
                      >
                        <GlassButton style={styles.glassRound} onPress={requestClose} hitSlop={8} blur={false}>
                          <Ionicons name="chevron-back" size={22} color={colors.text} />
                        </GlassButton>
                        <GlassButton style={styles.codePill} onPress={share} blur={false}>
                          <Text style={styles.codeLabel}>ROOM · </Text>
                          <Text style={styles.code}>{roomCode || "—"}</Text>
                          <View style={styles.shareBtn}>
                            <Ionicons name="share-social" size={13} color={colors.text} />
                          </View>
                        </GlassButton>
                        <View style={styles.topRightActions}>
                          {isLandscapeMobile ? (
                            <Pressable
                              style={({ pressed }) => [
                                styles.chatToggleBtn,
                                landscapeChatOpen && styles.chatToggleBtnActive,
                                pressed && styles.pressed,
                              ]}
                              onPress={() => setLandscapeChatOpen((v) => !v)}
                              hitSlop={8}
                            >
                              <Ionicons
                                name={landscapeChatOpen ? "chatbubbles" : "chatbubbles-outline"}
                                size={ms(15)}
                                color={landscapeChatOpen ? colors.onHoney : colors.text}
                              />
                              <Text style={[styles.chatToggleText, landscapeChatOpen && styles.chatToggleTextActive]}>Chat</Text>
                              {chat.messages.length > 0 ? (
                                <View style={[styles.chatBadge, landscapeChatOpen && styles.chatBadgeActive]}>
                                  <Text style={[styles.chatBadgeText, landscapeChatOpen && styles.chatBadgeTextActive]}>
                                    {chat.messages.length > 99 ? "99+" : chat.messages.length}
                                  </Text>
                                </View>
                              ) : null}
                            </Pressable>
                          ) : null}
                          <AvatarStack members={members} hostId={hostId} selfId={party.userId} />
                        </View>
                      </View>
                    ) : undefined
                  }
                  overlayChildren={
                    isImmersive ? (
                      <>
                        {!landscapeChatOpen && reactionsOn && canParticipate ? (
                          <ReanimatedAnimated.View
                            entering={FadeIn.duration(200)}
                            exiting={FadeOut.duration(150)}
                            style={[styles.landscapeQuickReactions, { right: Math.max(insets.right, ms(16)), bottom: ms(66) }]}
                            pointerEvents="box-none"
                          >
                            {QUICK_REACTIONS.map((e) => (
                              <Pressable
                                key={e}
                                style={({ pressed }) => [styles.landscapeEmojiChip, pressed && styles.pressed]}
                                onPress={() => chat.sendReaction(e)}
                                hitSlop={6}
                              >
                                <Text style={styles.landscapeEmojiText}>{e}</Text>
                              </Pressable>
                            ))}
                          </ReanimatedAnimated.View>
                        ) : null}
                      </>
                    ) : undefined
                  }
                />
              ) : null}
            </>
          ) : !snap ? (
            <View style={styles.waiting}>
              <Ionicons name="hourglass-outline" size={30} color={colors.textFaint} />
              <Text style={styles.waitingText}>
                {isHostParam ? "Starting party…" : "Joining…"}
              </Text>
            </View>
          ) : isHost ? (
            <View style={styles.waiting}>
              {/* Same empty state as the tray's queue pane, deliberately: the room
                  and the tray are two views of one thing and shouldn't word or
                  draw it differently. */}
              <View style={styles.emptyGlyph}>
                <Ionicons name="layers-outline" size={ms(22)} color={colors.honey} />
              </View>
              <Text style={styles.waitingTitle}>Nothing queued yet</Text>
              <Text style={styles.waitingText}>
                Anything you add lands here for everyone in the room.
              </Text>
              <Pressable style={styles.retryBtn} onPress={openSearchTab}>
                <Ionicons name="search" size={ms(14)} color={colors.onHoney} />
                <Text style={styles.retryText}>Find something to watch</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.waiting}>
              <Ionicons name="hourglass-outline" size={30} color={colors.textFaint} />
              <Text style={styles.waitingText}>Waiting for the host to pick something…</Text>
            </View>
          )}

          {/* No standalone sync badge: for the host it just repeats the "You're
              hosting" bar, for a synced guest it says nothing actionable, and the
              only state that matters — detached — is surfaced by PlayerControls'
              actionable "Tap to sync". */}

          {/* no host → take over */}
          {!isHost && !hostPresent && !!snap ? (
            <Pressable style={[styles.floatBtn, styles.takeoverBtn]} onPress={party.claimHost}>
              <Ionicons name="megaphone" size={16} color={colors.text} />
              <Text style={[styles.floatText, { color: colors.text }]}>Take over as host</Text>
            </Pressable>
          ) : null}

          {/* host allows guests to drive → take control (becomes host) */}
          {canGrabControl && hostPresent && !party.detached ? (
            <Pressable style={[styles.floatBtn, styles.grabBtn]} onPress={() => void party.grabControl()}>
              <Ionicons name="game-controller" size={16} color={colors.onHoney} />
              <Text style={styles.floatText}>Take control</Text>
            </Pressable>
          ) : null}

          {/* floating reactions */}
          <View style={styles.reactionLayer} pointerEvents="none">
            {chat.reactions.map((r, i) => (
              <FloatingEmoji key={r.id} reaction={r} offset={i} />
            ))}
          </View>

        </View>

          {/* Host status bar (portrait / tablet only). */}
          {isHost && !isLandscapeMobile ? (
          <View style={styles.hostBar}>
            <View style={styles.hostHintRow}>
              <Ionicons name="ellipse" size={8} color={colors.honey} />
              <Text style={styles.hostHint}>
                {pendingCount > 0
                  ? `${pendingCount} waiting to join · tap settings`
                  : "You're hosting · your playback syncs to everyone"}
              </Text>
            </View>
            <View style={styles.hostActions}>
              <GlassButton style={styles.settingsBtn} onPress={() => setShowSettings(true)} blur={false}>
                <Ionicons name="settings-outline" size={16} color={colors.text} />
                {pendingCount > 0 ? <View style={styles.settingsDot} /> : null}
              </GlassButton>
              {guests.length > 0 ? (
                <Pressable style={styles.transferBtn} onPress={transferHost}>
                  <Ionicons name="swap-horizontal" size={14} color={colors.honey} />
                  <Text style={styles.transferText}>Transfer</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          ) : null}
          </View>
          {/* Right / chat column — a slide-in drawer in landscape (a SOLID panel, not
              blurred: a blur on the video screen re-captures the video every frame).
              Hidden while connecting: an empty thread under a spinner is a second
              void, and you can't talk to a room you haven't joined. */}
          {!connecting && (!isLandscapeMobile || landscapeChatOpen) ? (
            <ReanimatedAnimated.View
              entering={isLandscapeMobile ? SlideInRight.duration(240) : undefined}
              exiting={isLandscapeMobile ? SlideOutRight.duration(180) : undefined}
              style={
                isWide
                  ? styles.desktopRightCol
                  : isLandscapeMobile
                  ? [styles.landscapeChatDrawer, { width: Math.min(width * 0.42, ms(310)) }]
                  : styles.flex
              }
            >
              {isLandscapeMobile ? (
                <View style={styles.landscapeDrawerHeader}>
                  <View style={styles.landscapeDrawerTitleRow}>
                    <Ionicons name="chatbubbles" size={ms(14)} color={colors.honey} />
                    <Text style={styles.landscapeDrawerTitle}>Party Chat</Text>
                    <Text style={styles.landscapeDrawerCount}>({members.length})</Text>
                  </View>
                  <Pressable
                    style={({ pressed }) => [styles.landscapeDrawerClose, pressed && styles.pressed]}
                    onPress={() => setLandscapeChatOpen(false)}
                    hitSlop={8}
                  >
                    <Ionicons name="close" size={ms(18)} color={colors.textDim} />
                  </Pressable>
                </View>
              ) : null}

          {/* Chat — keeps its flex height when the keyboard opens (not resized).
              The sticky composer translates over the bottom of the list. */}
          <FlatList
            ref={listRef}
            style={styles.flex}
            data={chat.messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={[styles.chatContent, isLandscapeMobile && styles.landscapeChatContent]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          renderItem={({ item, index }) => {
            const prev = chat.messages[index - 1];
            const next = chat.messages[index + 1];
            const groupedPrev = !!prev && prev.userId === item.userId && item.ts - prev.ts < CHAT_GROUP_MS;
            const groupedNext = !!next && next.userId === item.userId && next.ts - item.ts < CHAT_GROUP_MS;
            return (
              <Bubble
                msg={item}
                onSeek={seekToMoment}
                firstOfGroup={!groupedPrev}
                lastOfGroup={!groupedNext}
              />
            );
          }}
          ListEmptyComponent={
            <View style={styles.chatEmpty}>
              <Ionicons name="chatbubbles-outline" size={26} color={colors.textFaint} />
              <Text style={styles.chatEmptyText}>Say something to the pack</Text>
            </View>
          }
        />

          {/* Reaction bar + composer: one sticky toolbar. Translate only — never
              resize the FlatList / player / header above. */}
          <KeyboardStickyView offset={{ closed: 0, opened: isLandscapeMobile ? ms(6) : bottomPad }}>
            <View style={[styles.inputArea, { paddingBottom: isLandscapeMobile ? ms(6) : bottomPad }]}>
              {reactionsOn && canParticipate && !isLandscapeMobile ? (
                <View style={styles.quickRow}>
                  {QUICK_REACTIONS.map((e) => (
                    <Pressable key={e} onPress={() => chat.sendReaction(e)} hitSlop={6}>
                      <Text style={styles.quickEmoji}>{e}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {reactionsOn && canParticipate && isLandscapeMobile ? (
                <View style={styles.landscapeDrawerQuickRow}>
                  {QUICK_REACTIONS.map((e) => (
                    <Pressable key={e} onPress={() => chat.sendReaction(e)} hitSlop={4}>
                      <Text style={styles.landscapeDrawerEmoji}>{e}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {canSendChat ? (
                <View style={[styles.inputRow, isLandscapeMobile && styles.landscapeInputRow]}>
                  {reactionsOn ? (
                    <GlassButton style={[styles.gifBtn, isLandscapeMobile && styles.landscapeGifBtn]} onPress={() => setShowGif(true)} hitSlop={6} blur={false}>
                      <Text style={[styles.gifBtnText, isLandscapeMobile && styles.landscapeGifBtnText]}>GIF</Text>
                    </GlassButton>
                  ) : null}
                  <View style={[styles.inputBox, isLandscapeMobile && styles.landscapeInputBox]}>
                    <TextInput
                      style={[styles.input, isLandscapeMobile && styles.landscapeInput]}
                      placeholder={isLandscapeMobile ? "Chat…" : "Say something to the pack…"}
                      placeholderTextColor={colors.textDim}
                      value={draft}
                      onChangeText={setDraft}
                      onFocus={() => {
                        setLivePos(Math.floor(posRef.current));
                        setInputFocused(true);
                      }}
                      onBlur={() => setInputFocused(false)}
                      selectionColor={colors.honey}
                      returnKeyType="send"
                      onSubmitEditing={send}
                      blurOnSubmit={false}
                    />
                    {hasMedia ? (
                      <Pressable style={[styles.stampBtn, isLandscapeMobile && styles.landscapeStampBtn]} onPress={insertTimestamp} hitSlop={6}>
                        <Ionicons name="time-outline" size={ms(13)} color={colors.honey} />
                        <Text style={[styles.stampBtnText, isLandscapeMobile && styles.landscapeStampBtnText]}>{fmtMedia(livePos)}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <Pressable style={[styles.sendBtn, isLandscapeMobile && styles.landscapeSendBtn]} onPress={send}>
                    <Ionicons name="send" size={isLandscapeMobile ? ms(13) : 16} color={colors.onHoney} />
                  </Pressable>
                </View>
              ) : (
                <View style={styles.chatOffRow}>
                  <Ionicons name="lock-closed" size={14} color={colors.textFaint} />
                  <Text style={styles.chatOffText}>
                    {config?.chatEnabled === false ? "Chat is off for guests" : "You're muted by the host"}
                  </Text>
                </View>
              )}
            </View>
          </KeyboardStickyView>
            </ReanimatedAnimated.View>
          ) : null}
        </View>
      </View>

      {/* Fullscreen-rotation cover — a sibling of the whole app content so it hides the
          WebView reflow, the OS rotation, AND the party UI that re-appears on collapse.
          Mounted only during a toggle; opaque on mount (same commit as the layout
          change → no leak), then fades out once the rotation settles. */}
      {masking ? (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            // zIndex only — no elevation: this mask sits over the live video during the
            // rotation fade and elevation would re-capture frames (no-elevation-on-video).
            { backgroundColor: colors.black, opacity: maskFade, zIndex: 1000 },
          ]}
        />
      ) : null}

      {/* Host: room administration sheet */}
      {isHost && config ? (
        <RoomSettingsSheet
          visible={showSettings}
          onClose={() => setShowSettings(false)}
          config={config}
          members={members}
          hostId={hostId}
          selfId={party.userId}
          onSetConfig={(patch, pw) => runAdmin("Couldn't update settings", party.setConfig(patch, pw))}
          onSetPermissions={(uid, patch) => runAdmin("Couldn't update member", party.setPermissions(uid, patch))}
          onApprove={(uid) => runAdmin("Couldn't approve", party.approveMember(uid))}
          onKick={(uid) => runAdmin("Couldn't remove member", party.kick(uid))}
          onTransferHost={(uid) => runAdmin("Couldn't transfer host", party.transferHost(uid))}
        />
      ) : null}

      {/* Player settings — speed (host, synced via the anchor) + quality (per-device) */}
      <PlayerSettingsSheet
        visible={showPlayerSettings}
        onClose={() => setShowPlayerSettings(false)}
        canControl={canSeek}
        rate={snap?.playback?.rate ?? 1}
        onSetRate={(r) => party.setRate(r)}
        qualities={qualities}
        onSetQuality={(label) => playerRef.current?.setQuality(label)}
        audios={audios}
        onSetAudio={(label) => playerRef.current?.setAudio(label)}
      />

      {/* Guest: password prompt for a protected room */}
      <Modal visible={pwPrompt} transparent animationType="fade" onRequestClose={() => setPwPrompt(false)}>
        <Pressable style={styles.pwBackdrop} onPress={() => setPwPrompt(false)}>
          <Pressable style={styles.pwSheet} onPress={() => {}}>
            <Ionicons name="lock-closed" size={ms(26)} color={colors.honey} />
            <Text style={styles.pwTitle}>Room password</Text>
            <Text style={styles.pwSub}>Enter the password the host set for this room.</Text>
            <TextInput
              value={pwInput}
              onChangeText={setPwInput}
              placeholder="Password"
              placeholderTextColor={colors.textFaint}
              style={styles.pwPromptInput}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              selectionColor={colors.honey}
              returnKeyType="go"
              onSubmitEditing={submitPassword}
            />
            <Pressable style={styles.pwGo} onPress={submitPassword}>
              <Text style={styles.pwGoText}>Join</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* GIF + sticker picker (KLIPY, called directly per their integration rules) */}
      <GifPicker
        visible={showGif}
        onClose={() => setShowGif(false)}
        customerId={party.userId}
        onPick={(g, k) => chat.sendGif(g, k === "stickers")}
      />
    </View>
  );
}

function AvatarStack({
  members,
  hostId,
  selfId,
}: {
  members: { userId: string; displayName?: string }[];
  hostId?: string | null;
  selfId: string;
}) {
  // host first, then others; cap at 4 with an overflow bubble
  const ordered = [...members].sort((a, b) =>
    a.userId === hostId ? -1 : b.userId === hostId ? 1 : 0,
  );
  const shown = ordered.slice(0, 4);
  const extra = ordered.length - shown.length;
  return (
    <View style={styles.avatarStack}>
      {shown.map((m, i) => {
        const isHost = m.userId === hostId;
        return (
          <View
            key={m.userId}
            style={[
              { marginLeft: i === 0 ? 0 : -8, zIndex: i + 1 },
            ]}
          >
            <BearAvatar
              size={ms(26)}
              hostRing={isHost}
              config={bearConfigFor(m.userId)}
            />
          </View>
        );
      })}
      {extra > 0 ? (
        <View style={[styles.avatar, styles.avatarMore, { marginLeft: -8, zIndex: 10 }]}>
          <Text style={styles.avatarText}>+{extra}</Text>
        </View>
      ) : null}
    </View>
  );
}

function GifBubble({ msg }: { msg: ChatMessage }) {
  // Stickers are transparent + smaller; render with no card background.
  const maxW = msg.sticker ? ms(120) : ms(180);
  const w = msg.gifW && msg.gifH ? Math.min(maxW, msg.gifW) : maxW;
  const h = msg.gifW && msg.gifH ? Math.round(w * (msg.gifH / msg.gifW)) : Math.round(w * 0.75);
  return (
    <View style={[msg.sticker ? styles.stickerBubble : styles.gifBubble, { width: w, height: h }]}>
      <Image
        source={{ uri: msg.gifUrl }}
        style={{ width: w, height: h }}
        contentFit="contain"
        cachePolicy="memory-disk"
      />
    </View>
  );
}

/** The little time row under a bubble — the message's send time. */
function Meta({ msg, mine }: { msg: ChatMessage; mine?: boolean }) {
  return (
    <View style={[styles.metaRow, mine && styles.metaRowMine]}>
      <Text style={styles.metaTime}>{fmtClock(msg.ts)}</Text>
    </View>
  );
}

const Bubble = React.memo(function Bubble({
  msg,
  onSeek,
  firstOfGroup,
  lastOfGroup,
}: {
  msg: ChatMessage;
  onSeek: (sec: number) => void;
  firstOfGroup: boolean;
  lastOfGroup: boolean;
}) {
  const isGif = msg.kind === "gif" && !!msg.gifUrl;
  const gap = firstOfGroup ? styles.groupGap : styles.groupTight;

  if (msg.mine) {
    return (
      <View style={[styles.bubbleRow, styles.bubbleRowMine, gap]}>
        <View style={styles.bubbleColMine}>
          {isGif ? (
            <GifBubble msg={msg} />
          ) : (
            <View style={[styles.bubble, styles.bubbleMine, bubbleCorners(true, firstOfGroup, lastOfGroup)]}>
              <MessageText text={msg.text} onSeek={onSeek} />
            </View>
          )}
          {lastOfGroup ? <Meta msg={msg} mine /> : null}
        </View>
      </View>
    );
  }

  // Incoming: per-sender colored name (top of group) + avatar (bottom of group).
  const color = senderColor(msg.userId);
  return (
    <View style={[styles.bubbleRow, gap]}>
      <View style={styles.avatarCol}>
        {lastOfGroup ? (
          <BearAvatar
            size={ms(26)}
            config={bearConfigFor(msg.userId)}
          />
        ) : null}
      </View>
      <View style={styles.bubbleCol}>
        {firstOfGroup ? (
          <Text style={[styles.bubbleName, { color }]} numberOfLines={1}>
            {msg.name || "Guest"}
          </Text>
        ) : null}
        {isGif ? (
          <GifBubble msg={msg} />
        ) : (
          <View style={[styles.bubble, styles.bubbleOther, bubbleCorners(false, firstOfGroup, lastOfGroup)]}>
            <MessageText text={msg.text} onSeek={onSeek} />
          </View>
        )}
        {lastOfGroup ? <Meta msg={msg} /> : null}
      </View>
    </View>
  );
});

function FloatingEmoji({ reaction, offset }: { reaction: FloatingReaction; offset: number }) {
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(p, {
      toValue: 1,
      duration: 2800,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [p]);
  const translateY = p.interpolate({ inputRange: [0, 1], outputRange: [0, -130] });
  const opacity = p.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 0.9, 0] });
  const scale = p.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.7, 1.15, 0.95] });
  return (
    <Animated.Text
      style={[
        styles.floatEmoji,
        { right: 10 + (offset % 3) * 26, transform: [{ translateY }, { scale }], opacity },
      ]}
    >
      {reaction.emoji}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: ms(12),
    paddingBottom: ms(8),
    gap: ms(10),
  },

  // --- Immersive / responsive party layout (glow/elevation stripped from anything
  //     that sits over the video — blur/elevation there re-captures every frame). ---
  topRightActions: { flexDirection: "row", alignItems: "center", gap: ms(8) },
  chatToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(5),
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    paddingHorizontal: ms(10),
    paddingVertical: ms(6),
    borderRadius: radius.pill,
  },
  chatToggleBtnActive: { backgroundColor: colors.honey, borderColor: colors.honey },
  chatToggleText: { color: colors.text, fontFamily: font.bodySemi, fontSize: ms(12) },
  chatToggleTextActive: { color: colors.onHoney },
  chatBadge: {
    backgroundColor: colors.honey,
    paddingHorizontal: ms(5),
    paddingVertical: ms(1),
    borderRadius: radius.pill,
  },
  chatBadgeActive: { backgroundColor: colors.onHoney },
  chatBadgeText: { color: colors.onHoney, fontFamily: font.label, fontSize: ms(9) },
  chatBadgeTextActive: { color: colors.honey },
  desktopLayout: {
    flex: 1,
    flexDirection: "row",
    paddingHorizontal: ms(20),
    paddingBottom: ms(20),
    gap: ms(16),
  },
  desktopLeftCol: {
    flex: 7,
    borderRadius: radius.xl,
    overflow: "hidden",
    backgroundColor: colors.black,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  desktopPlayer: {
    width: "100%",
    flex: 1,
    minHeight: 400,
    backgroundColor: colors.black,
    overflow: "hidden",
  },
  desktopRightCol: {
    flex: 3,
    borderRadius: radius.xl,
    overflow: "hidden",
    backgroundColor: colors.surfaceStrong,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  landscapeMobileLayout: { flex: 1, flexDirection: "row", paddingBottom: ms(6), gap: ms(8) },
  landscapeMobilePlayerCol: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.black,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  landscapeMobilePlayer: {
    width: "100%",
    height: "100%",
    backgroundColor: colors.black,
    overflow: "hidden",
  },
  landscapeQuickReactions: {
    position: "absolute",
    right: ms(16),
    bottom: ms(68),
    flexDirection: "row",
    alignItems: "center",
    gap: ms(6),
    backgroundColor: colors.playerCenter,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    paddingHorizontal: ms(8),
    paddingVertical: ms(4),
    borderRadius: radius.pill,
  },
  landscapeEmojiChip: { padding: ms(2) },
  landscapeEmojiText: { fontSize: ms(18) },
  landscapeChatDrawer: {
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surfaceStrong,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  landscapeDrawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: ms(10),
    paddingVertical: ms(7),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  landscapeDrawerTitleRow: { flexDirection: "row", alignItems: "center", gap: ms(6) },
  landscapeDrawerTitle: { color: colors.text, fontFamily: font.headlineSemi, fontSize: ms(13) },
  landscapeDrawerCount: { color: colors.textDim, fontFamily: font.label, fontSize: ms(11) },
  landscapeDrawerClose: {
    width: ms(22),
    height: ms(22),
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgElevated,
  },
  landscapeChatContent: { padding: ms(8) },
  landscapeDrawerQuickRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: ms(6),
    paddingVertical: ms(4),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  landscapeDrawerEmoji: { fontSize: ms(16) },
  landscapeInputRow: { gap: ms(5), paddingHorizontal: ms(6), paddingTop: ms(6) },
  landscapeGifBtn: { height: ms(36), paddingHorizontal: ms(8) },
  landscapeGifBtnText: { fontSize: ms(11) },
  landscapeInputBox: { height: ms(36), paddingLeft: ms(10), paddingRight: ms(4), gap: ms(4) },
  landscapeInput: { fontSize: ms(12) },
  landscapeStampBtn: { height: ms(24), paddingHorizontal: ms(6) },
  landscapeStampBtnText: { fontSize: ms(9) },
  // In landscape the chat drawer overlays the live video — strip the send button's
  // shadow/elevation so it doesn't re-capture the WebView each frame.
  landscapeSendBtn: { width: ms(36), height: ms(36), shadowOpacity: 0, elevation: 0 },
  pressed: { opacity: 0.7 },
  glassRound: {
    width: ms(40),
    height: ms(40),
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  codePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    paddingLeft: ms(14),
    paddingRight: ms(5),
    paddingVertical: ms(5),
    borderRadius: radius.pill,
  },
  codeLabel: { color: colors.textDim, fontFamily: font.label, fontSize: ms(10), letterSpacing: 1.5 },
  code: { color: colors.text, fontFamily: font.headline, fontSize: ms(14), letterSpacing: 2, marginRight: ms(8) },
  shareBtn: {
    width: ms(26),
    height: ms(26),
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceStrong,
    alignItems: "center",
    justifyContent: "center",
  },

  avatarStack: { flexDirection: "row", alignItems: "center" },
  avatar: {
    width: ms(32),
    height: ms(32),
    borderRadius: radius.pill,
    backgroundColor: colors.bgElevated,
    borderWidth: 2,
    borderColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarHost: { borderColor: colors.honey },
  avatarMore: { backgroundColor: colors.surfaceStrong },
  avatarText: { color: colors.text, fontFamily: font.bodySemi, fontSize: ms(12) },

  player: { width: "100%", aspectRatio: 16 / 9, backgroundColor: colors.black, overflow: "hidden" },
  /* No media: content height on the app background, not a black 16:9 slab. */
  playerCompact: { width: "100%", paddingVertical: ms(22), overflow: "hidden" },
  /* Connecting: own the whole screen so there is one thing to look at. */
  playerFill: { width: "100%", flex: 1, overflow: "hidden" },
  playerFs: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.black,
    zIndex: 50,
    elevation: 50,
  },
  waiting: {
    // grows inside the 16:9 box (error/waiting states) and hugs content in the
    // compact box, because flexGrow with no flexBasis does both.
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: ms(9),
    paddingHorizontal: ms(28),
  },
  emptyGlyph: {
    width: ms(52),
    height: ms(52),
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.honeySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.honeyGlow,
    marginBottom: ms(2),
  },
  waitingTitle: { color: colors.text, fontFamily: font.headlineSemi, fontSize: ms(15) },
  waitingText: {
    color: colors.textFaint,
    fontFamily: font.body,
    fontSize: ms(12.5),
    textAlign: "center",
    lineHeight: ms(18),
  },

  floatBtn: {
    position: "absolute",
    alignSelf: "center",
    bottom: ms(16),
    flexDirection: "row",
    alignItems: "center",
    gap: ms(6),
    backgroundColor: colors.honey,
    paddingHorizontal: ms(18),
    paddingVertical: ms(10),
    borderRadius: radius.pill,
  },
  takeoverBtn: { backgroundColor: colors.surfaceStrong, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, bottom: ms(68) },
  floatText: { color: colors.onHoney, fontFamily: font.headlineSemi, fontSize: ms(14) },

  reactionLayer: { position: "absolute", right: 0, bottom: 0, width: ms(120), height: ms(200) },
  floatEmoji: { position: "absolute", bottom: 10, fontSize: ms(24) },

  hostBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: ms(12),
    paddingVertical: ms(8),
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  hostHintRow: { flexDirection: "row", alignItems: "center", gap: ms(6), flex: 1 },
  hostHint: { color: colors.textDim, fontFamily: font.bodyMed, fontSize: ms(11) },
  transferBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(6),
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    paddingHorizontal: ms(12),
    paddingVertical: ms(7),
    borderRadius: radius.pill,
  },
  transferText: { color: colors.text, fontFamily: font.bodyMed, fontSize: ms(12) },

  // No flat gap here — per-message spacing comes from groupTight/groupGap so a
  // sender's consecutive bubbles sit tight and only a new sender gets a real break.
  chatContent: { padding: ms(14), flexGrow: 1 },
  chatEmpty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 40 },
  chatEmptyText: { color: colors.textFaint, fontFamily: font.body, fontSize: ms(13) },

  bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: ms(8), maxWidth: "86%" },
  bubbleRowMine: { alignSelf: "flex-end" },
  // Group spacing: a clear break before a new sender, tight stacking within a run.
  groupGap: { marginTop: ms(10) },
  groupTight: { marginTop: ms(2) },
  // Fixed-width left column so grouped bubbles indent under the (bottom) avatar.
  avatarCol: { width: ms(28) },
  bubbleAvatar: {
    width: ms(28),
    height: ms(28),
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  bubbleAvatarText: { fontFamily: font.bodySemi, fontSize: ms(12) },
  bubbleCol: { gap: ms(3), flexShrink: 1 },
  bubbleName: { fontFamily: font.bodySemi, fontSize: ms(11.5), marginLeft: ms(6), marginBottom: ms(1) },
  bubble: { paddingHorizontal: ms(14), paddingVertical: ms(9) },
  bubbleOther: {
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  bubbleMine: {
    backgroundColor: colors.honeySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.chatBorder,
  },
  bubbleText: { color: colors.text, fontFamily: font.body, fontSize: ms(13), lineHeight: ms(18) },
  bubbleColMine: { alignItems: "flex-end", gap: ms(3), flexShrink: 1 },

  metaRow: { flexDirection: "row", alignItems: "center", gap: ms(6), marginLeft: 4 },
  metaRowMine: { justifyContent: "flex-end", marginLeft: 0, marginRight: 2 },
  metaTime: { color: colors.textFaint, fontFamily: font.label, fontSize: ms(9), letterSpacing: 0.3 },
  // A timestamp embedded in a message → tappable seek link (YouTube-style).
  tsLink: { color: colors.honey, fontFamily: font.bodySemi },

  inputArea: {
    backgroundColor: colors.bgElevated,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  quickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(18),
    paddingHorizontal: ms(16),
    paddingVertical: ms(8),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  quickEmoji: { fontSize: ms(20) },
  inputRow: { flexDirection: "row", alignItems: "center", gap: ms(8), paddingHorizontal: ms(12), paddingTop: ms(8) },
  gifBtn: {
    height: ms(44),
    paddingHorizontal: ms(12),
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  gifBtnText: { color: colors.honey, fontFamily: font.label, fontSize: ms(13), letterSpacing: 0.5 },
  gifBubble: { borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.surfaceStrong },
  stickerBubble: { backgroundColor: "transparent" },
  gifBubbleImg: { width: "100%", height: "100%" },
  inputBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: ms(8),
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingLeft: ms(16),
    paddingRight: ms(6),
    height: ms(44),
  },
  input: { flex: 1, color: colors.text, fontFamily: font.body, fontSize: ms(13), padding: 0 },
  // "Add current time" button living inside the field, like YouTube's comment box.
  stampBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(3),
    backgroundColor: colors.honeySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.chatBorderStrong,
    paddingHorizontal: ms(9),
    height: ms(30),
    borderRadius: radius.pill,
  },
  stampBtnText: { color: colors.honey, fontFamily: font.label, fontSize: ms(10), letterSpacing: 0.3 },
  sendBtn: {
    width: ms(44),
    height: ms(44),
    borderRadius: radius.pill,
    backgroundColor: colors.honey,
    alignItems: "center",
    justifyContent: "center",
    // No glow: glow.honey carries elevation 8, and elevation over the WebView
    // re-captures every frame (the documented playback-stutter cause).
  },

  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(6),
    marginTop: ms(6),
    backgroundColor: colors.honey,
    paddingHorizontal: ms(16),
    height: ms(38),
    borderRadius: radius.pill,
  },
  retryText: { color: colors.onHoney, fontFamily: font.headlineSemi, fontSize: ms(13) },
  grabBtn: { bottom: ms(68) },

  hostActions: { flexDirection: "row", alignItems: "center", gap: ms(8) },
  settingsBtn: {
    width: ms(34),
    height: ms(34),
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsDot: {
    position: "absolute",
    top: ms(4),
    right: ms(4),
    width: ms(8),
    height: ms(8),
    borderRadius: ms(4),
    backgroundColor: colors.honey,
    borderWidth: 1,
    borderColor: colors.bgElevated,
  },

  chatOffRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: ms(8),
    paddingHorizontal: ms(12),
    paddingTop: ms(10),
    paddingBottom: ms(4),
  },
  chatOffText: { color: colors.textFaint, fontFamily: font.body, fontSize: ms(13) },

  pwBackdrop: {
    flex: 1,
    backgroundColor: colors.modalBackdrop,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: ms(28),
  },
  pwSheet: {
    width: "100%",
    alignItems: "center",
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    borderRadius: radius.xxl,
    padding: ms(24),
  },
  pwTitle: { color: colors.text, fontFamily: font.headline, fontSize: ms(19), marginTop: ms(10) },
  pwSub: {
    color: colors.textDim,
    fontFamily: font.body,
    fontSize: ms(13),
    textAlign: "center",
    marginTop: ms(6),
  },
  pwPromptInput: {
    alignSelf: "stretch",
    marginTop: ms(18),
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: ms(16),
    height: ms(50),
    color: colors.text,
    fontFamily: font.bodySemi,
    fontSize: ms(16),
    letterSpacing: 2,
  },
  pwGo: {
    alignSelf: "stretch",
    marginTop: ms(16),
    height: ms(50),
    borderRadius: radius.pill,
    backgroundColor: colors.honey,
    alignItems: "center",
    justifyContent: "center",
  },
  pwGoText: { color: colors.onHoney, fontFamily: font.headlineSemi, fontSize: ms(16) },
});
