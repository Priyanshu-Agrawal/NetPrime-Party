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
  type PlayerHandle,
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
import { useParty } from "@/services/party/useParty";
import { usePartyChat, type ChatMessage, type FloatingReaction } from "@/services/party/usePartyChat";
import { colors, chat, font, glow, ms, radius } from "@/theme/bearoom";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { exitMedia } from "@/src/navigation/actions";
import { useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { RootStackParamList } from "@/src/navigation/types";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo, useRef, useState } from "react";
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

  const playerRef = useRef<PlayerHandle>(null);
  const controlsRef = useRef<PlayerControlsHandle>(null);
  // Our native overlay mounts only once the bridge binds a <video> (i.e. past
  // videasy's pre-play "tap to start" gate). Reset if the media/provider changes.
  const [playerBound, setPlayerBound] = useState(false);
  const [password, setPassword] = useState<string | undefined>(undefined);
  const [pwAttempt, setPwAttempt] = useState(0);
  const [pwPrompt, setPwPrompt] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [showPlayerSettings, setShowPlayerSettings] = useState(false);
  const [qualities, setQualities] = useState<QualityLevel[]>([]);
  const [audios, setAudios] = useState<QualityLevel[]>([]);
  const [fullscreen, setFullscreen] = useState(false);
  // Latest known playback position (seconds) from the player — read when inserting.
  const posRef = useRef(0);
  // Live mm:ss shown on the in-field timestamp button; ticks only while composing.
  const [livePos, setLivePos] = useState(0);
  const [inputFocused, setInputFocused] = useState(false);

  const party = useParty({
    code: room,
    role: isHostParam ? "host" : "guest",
    displayName,
    media: hostMedia,
    password,
    retryNonce: pwAttempt,
    playerRef,
  });

  const snap = party.snapshot;
  const media = snap?.media;
  const config = snap?.config;
  const providerId = media?.providerId;
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
  const canParticipate = party.isHost || selfApproved; // approved (or host) → not in the waiting room
  const canSendChat =
    party.isHost ||
    (selfApproved && config?.chatEnabled !== false && selfMember?.permissions?.canChat !== false);
  const canGrabControl = !party.isHost && selfApproved && !!config?.guestControlDefault;
  // Only those who can drive playback get a tappable "jump to this moment" chip.
  const canSeek = party.isHost || selfMember?.permissions?.canControlPlayback === true;
  const hasMedia = !!(providerId && media);
  const pendingCount = guests.filter((g) => g.approved === false).length;
  const sessionStarted = useRef(false);
  const sessionTitleRef = useRef("Bearoom party");
  sessionTitleRef.current = media?.title || params.title || "Bearoom party";

  // Resist accidental exit: hardware back + the top-bar chevron confirm first.
  const { requestClose } = useMediaCloseGuard({
    title: "Leave the party?",
    message: "You'll leave this watch room and stop syncing with everyone.",
    confirmLabel: "Leave",
    onConfirm: exitMedia,
    enabled: hasMedia,
  });

  // Removed by the host → bounce out with a note.
  useEffect(() => {
    if (!party.kicked) return;
    bearAlert("Removed", "The host removed you from this room.", [
      { text: "OK", onPress: exitMedia },
    ]);
  }, [party.kicked]);

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
  useEffect(() => {
    return () => {
      ScreenOrientation.unlockAsync().catch(() => {});
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
    setPassword(p);
    setPwAttempt((n) => n + 1); // force a client rebuild + retry even if pw unchanged
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

  const chat = usePartyChat({ code: roomCode, userId: party.userId, name: displayName });
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
  const seekToMoment = (sec: number) => {
    if (canSeek) party.seekTo(sec);
    else playerRef.current?.seek(sec);
  };

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
      <StatusBar hidden={fullscreen} style="light" />

      <View style={styles.flex}>
        {/* Top bar */}
        <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
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
          <AvatarStack members={members} hostId={hostId} selfId={party.userId} />
        </View>

        {/* Player */}
        <View style={fullscreen ? styles.playerFs : styles.player}>
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
                  onToggleFullscreen={toggleFullscreen}
                  onTapSync={party.jumpToLive}
                  onOpenSettings={() => {
                    // Both reads drive videasy's ONE settings tab, so stagger them —
                    // firing at once makes audio steal the active tab before quality
                    // finishes reading (→ empty quality panel, stuck on "Loading…").
                    playerRef.current?.readQuality();
                    setTimeout(() => playerRef.current?.readAudio(), 750);
                    setShowPlayerSettings(true);
                  }}
                />
              ) : null}
            </>
          ) : (
            <View style={styles.waiting}>
              <Ionicons name="hourglass-outline" size={30} color={colors.textFaint} />
              <Text style={styles.waitingText}>
                {isHostParam ? "Starting party…" : "Waiting for the host to start…"}
              </Text>
            </View>
          )}

          {/* LIVE · In Sync pill */}
          {providerId && media ? (
            <View style={styles.livePill}>
              <View style={[styles.liveDot, party.detached && styles.liveDotOff]} />
              <Text style={styles.liveText}>
                {party.detached ? "Paused · Detached" : "Live · In Sync"}
              </Text>
            </View>
          ) : null}

          {/* guest paused → the PlayerControls overlay shows "Tap to sync" */}

          {/* no host → take over */}
          {!party.isHost && !hostPresent && !!snap ? (
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

        {/* Host status bar — playback is driven by the web player's own controls
            (they emit events that sync to everyone); no redundant buttons here. */}
        {party.isHost ? (
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

        {/* Chat — keeps its flex height when the keyboard opens (not resized).
            The sticky composer translates over the bottom of the list. */}
        <FlatList
          ref={listRef}
          style={styles.flex}
          data={chat.messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.chatContent}
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
        <KeyboardStickyView offset={{ closed: 0, opened: bottomPad }}>
          <View style={[styles.inputArea, { paddingBottom: bottomPad }]}>
            {reactionsOn && canParticipate ? (
              <View style={styles.quickRow}>
                {QUICK_REACTIONS.map((e) => (
                  <Pressable key={e} onPress={() => chat.sendReaction(e)} hitSlop={6}>
                    <Text style={styles.quickEmoji}>{e}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {canSendChat ? (
              <View style={styles.inputRow}>
                {reactionsOn ? (
                  <GlassButton style={styles.gifBtn} onPress={() => setShowGif(true)} hitSlop={6} blur={false}>
                    <Text style={styles.gifBtnText}>GIF</Text>
                  </GlassButton>
                ) : null}
                <View style={styles.inputBox}>
                  <TextInput
                    style={styles.input}
                    placeholder="Say something to the pack…"
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
                    <Pressable style={styles.stampBtn} onPress={insertTimestamp} hitSlop={6}>
                      <Ionicons name="time-outline" size={ms(13)} color={colors.honey} />
                      <Text style={styles.stampBtnText}>{fmtMedia(livePos)}</Text>
                    </Pressable>
                  ) : null}
                </View>
                <Pressable style={styles.sendBtn} onPress={send}>
                  <Ionicons name="send" size={16} color={colors.onHoney} />
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
            { backgroundColor: colors.black, opacity: maskFade, zIndex: 1000, elevation: 1000 },
          ]}
        />
      ) : null}

      {/* Host: room administration sheet */}
      {party.isHost && config ? (
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
              config={generateRandomBearConfig("neutral", m.userId)}
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

function Bubble({
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
            config={generateRandomBearConfig("neutral", msg.userId)}
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
}

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
  avatarHost: { borderColor: colors.honey, ...glow.honey },
  avatarMore: { backgroundColor: colors.surfaceStrong },
  avatarText: { color: colors.text, fontFamily: font.bodySemi, fontSize: ms(12) },

  player: { width: "100%", aspectRatio: 16 / 9, backgroundColor: colors.black, overflow: "hidden" },
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
  waiting: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 24 },
  waitingText: { color: colors.textDim, fontFamily: font.body, fontSize: ms(14), textAlign: "center" },

  livePill: {
    position: "absolute",
    top: ms(10),
    left: ms(12),
    flexDirection: "row",
    alignItems: "center",
    gap: ms(6),
    backgroundColor: colors.honeySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.honey,
    paddingHorizontal: ms(10),
    paddingVertical: ms(4),
    borderRadius: radius.pill,
  },
  liveDot: { width: ms(6), height: ms(6), borderRadius: ms(3), backgroundColor: colors.honey },
  liveDotOff: { backgroundColor: colors.textDim },
  liveText: { color: colors.honey, fontFamily: font.label, fontSize: ms(10), letterSpacing: 1 },

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
    ...glow.honey,
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
    ...glow.honey,
  },

  retryBtn: {
    marginTop: ms(4),
    backgroundColor: colors.honey,
    paddingHorizontal: ms(18),
    paddingVertical: ms(9),
    borderRadius: radius.pill,
    ...glow.honey,
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
    ...glow.honey,
  },
  pwGoText: { color: colors.onHoney, fontFamily: font.headlineSemi, fontSize: ms(16) },
});
