/**
 * PlayerControls — the Bearoom-skinned control overlay for the hijacked WebView.
 *
 * videasy's own chrome is hidden (HijackPlayer `__vlChromeOff`), so THIS is the
 * only control surface. Presentational + stateless about transport: the callbacks
 * route through the room authority in a party (host), so a press stays in sync.
 *
 * Skin = the cozy cinema-lounge system (theme/bearoom + GlassCard): a warm
 * gradient scrim, frosted-glass bottom bar, translucent honey-accented chips, and
 * a honey CTA with glow. Host gets full transport; a guest gets a read-only bar +
 * a non-interactive indicator, plus a "Tap to sync" when paused while the room
 * plays.
 *
 * Playback state is pushed imperatively via the ref (`setPlayback`) so the parent
 * (party.tsx) doesn't re-render its chat list on every 1 s tick.
 */
import GlassCard from "@/components/ui/GlassCard";
import { colors, font, ms, radius } from "@/theme/bearoom";
import { gradients } from "@/theme/styles/gradients";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface PlaybackState {
  currentTime: number;
  duration: number;
  paused: boolean;
  /** HTMLMediaElement.readyState; <3 while playing ⇒ the stream stalled → spinner. */
  readyState?: number;
}

export interface PlayerControlsHandle {
  setPlayback: (s: PlaybackState) => void;
}

export interface PlayerControlsProps {
  /** May this user drive playback? (party host / permitted guest) */
  canControl: boolean;
  /** Room's authoritative status is "playing" — drives the guest sync affordance. */
  roomPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  /** Absolute seek, seconds. */
  onSeekTo: (sec: number) => void;
  /** Relative seek, seconds (±10). */
  onSeekBy: (deltaSec: number) => void;
  /** Toggle the provider's HTML5 fullscreen. */
  onToggleFullscreen?: () => void;
  /** Guest tap-to-sync (jump to live) when out of sync. */
  onTapSync?: () => void;
  /** Open the player settings sheet (speed / quality). */
  onOpenSettings?: () => void;
  /** Open the episode picker — provided only for TV shows. */
  onEpisodes?: () => void;
  /** Back button callback (e.g. exit fullscreen). */
  onBack?: () => void;
  /** Title shown in the top overlay header (fullscreen). */
  title?: string;
  /** Subtitle (e.g. "S1 · E1") shown under the title. */
  subtitle?: string;
  /** Whether the player is fullscreen/immersive (gates the default overlay header). */
  fullscreen?: boolean;
  /** Custom top-bar node for the overlay (the party fills this). */
  topBar?: React.ReactNode;
  /** Extra overlay children (badges, reaction pills) that fade with the controls. */
  overlayChildren?: React.ReactNode;
  /** Notified when the auto-hide visibility flips. */
  onVisibilityChange?: (visible: boolean) => void;
}

const AUTO_HIDE_MS = 3800;

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(ss).padStart(2, "0")}`;
}

export const PlayerControls = forwardRef<PlayerControlsHandle, PlayerControlsProps>(
  (
    {
      canControl,
      roomPlaying,
      onPlay,
      onPause,
      onSeekTo,
      onSeekBy,
      onToggleFullscreen,
      onTapSync,
      onOpenSettings,
      onEpisodes,
      onBack,
      title,
      subtitle,
      fullscreen,
      topBar,
      overlayChildren,
      onVisibilityChange,
    },
    ref,
  ) => {
    const insets = useSafeAreaInsets();
    const [paused, setPaused] = useState(true);
    // Progress is stepwise (one setState per tick), NOT a 60 fps animation. A JS-driven
    // width/left glide restarts every tick and congests the UI thread the WebView video
    // renders on → the video hitches once a second. A per-tick step plays smoothly and
    // is plenty for a scrubber.
    const [displayTime, setDisplayTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [visible, setVisible] = useState(true);
    const [barWidth, setBarWidth] = useState(0);
    const [scrubbing, setScrubbing] = useState(false);
    // Buffering spinner: the stream stalled (readyState<3) while meant to be playing.
    const [buffering, setBuffering] = useState(false);
    const bufferingRef = useRef(false);
    const bufferTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scrubbingRef = useRef(false);
    const durationRef = useRef(0);
    // Commit-hold: after release, keep the thumb at the dropped spot until the video
    // actually reaches it — no snap-back to the stale live position, no jump.
    const seekTargetRef = useRef<number | null>(null);
    const fade = useRef(new Animated.Value(1)).current;
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Parent pushes playback here every event — no parent re-render.
    useImperativeHandle(
      ref,
      () => ({
        setPlayback: (s) => {
          setPaused(s.paused);
          if (Number.isFinite(s.duration)) {
            setDuration(s.duration);
            durationRef.current = s.duration;
          }
          // Buffering: the stream stalled (readyState<3) while meant to be playing —
          // segment starvation. videasy used to show its own spinner here; we hid its
          // chrome, so surface our own. Debounced so a brief dip (e.g. just after a
          // seek) doesn't flash the spinner.
          const stalled = !s.paused && typeof s.readyState === "number" && s.readyState < 3;
          if (stalled && !bufferingRef.current) {
            if (bufferTimer.current == null) {
              bufferTimer.current = setTimeout(() => {
                bufferTimer.current = null;
                bufferingRef.current = true;
                setBuffering(true);
              }, 450);
            }
          } else if (!stalled) {
            if (bufferTimer.current != null) {
              clearTimeout(bufferTimer.current);
              bufferTimer.current = null;
            }
            if (bufferingRef.current) {
              bufferingRef.current = false;
              setBuffering(false);
            }
          }
          // Committed seek reached its target → resume following live.
          if (seekTargetRef.current != null && Math.abs(s.currentTime - seekTargetRef.current) < 1.5) {
            seekTargetRef.current = null;
          }
          // While dragging, or holding a committed seek, freeze the thumb + label.
          if (scrubbingRef.current || seekTargetRef.current != null || !Number.isFinite(s.currentTime)) return;
          setDisplayTime(s.currentTime);
        },
      }),
      [],
    );

    const clearHide = useCallback(() => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
    }, []);

    const armHide = useCallback(() => {
      clearHide();
      if (paused || scrubbing) return; // stay up while paused / scrubbing
      hideTimer.current = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
    }, [paused, scrubbing, clearHide]);

    useEffect(() => {
      Animated.timing(fade, { toValue: visible ? 1 : 0, duration: 190, useNativeDriver: true }).start();
      onVisibilityChange?.(visible);
      if (visible) armHide();
      return clearHide;
    }, [visible, armHide, clearHide, fade, onVisibilityChange]);

    // Surface the controls whenever playback flips (e.g. host paused remotely).
    useEffect(() => {
      setVisible(true);
    }, [paused]);

    // Clear the buffering-debounce timer on unmount.
    useEffect(
      () => () => {
        if (bufferTimer.current) clearTimeout(bufferTimer.current);
      },
      [],
    );

    const show = useCallback(() => {
      setVisible(true);
      armHide();
    }, [armHide]);
    const toggle = useCallback(() => setVisible((v) => !v), []);

    const secForX = useCallback(
      (x: number) => {
        if (barWidth <= 0 || duration <= 0) return 0;
        return (Math.max(0, Math.min(barWidth, x)) / barWidth) * duration;
      },
      [barWidth, duration],
    );

    // Move the thumb + label to a position immediately (while dragging / on commit).
    const showAt = useCallback((sec: number) => {
      setDisplayTime(sec);
    }, []);

    const pan = useMemo(
      () =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => canControl && duration > 0,
          onMoveShouldSetPanResponder: () => canControl && duration > 0,
          onPanResponderGrant: (e) => {
            clearHide();
            seekTargetRef.current = null;
            scrubbingRef.current = true;
            setScrubbing(true);
            showAt(secForX(e.nativeEvent.locationX));
          },
          onPanResponderMove: (e) => showAt(secForX(e.nativeEvent.locationX)),
          onPanResponderRelease: (e) => {
            const sec = secForX(e.nativeEvent.locationX);
            scrubbingRef.current = false;
            setScrubbing(false);
            // Commit-hold at the dropped position until the video catches up.
            seekTargetRef.current = sec;
            showAt(sec);
            onSeekTo(sec);
            armHide();
          },
          onPanResponderTerminate: () => {
            scrubbingRef.current = false;
            setScrubbing(false);
            armHide();
          },
        }),
      [canControl, duration, secForX, onSeekTo, clearHide, armHide, showAt],
    );

    // Guest is stuck (video paused while the room plays) → offer a rejoin.
    const outOfSync = !canControl && paused && roomPlaying;

    // Stepwise 0..1 progress for fill + thumb. displayTime already holds the drag/commit
    // position while scrubbing and the live time otherwise, so this covers every state.
    const progress = duration > 0 ? Math.min(1, Math.max(0, displayTime / duration)) : 0;

    return (
      <Pressable style={StyleSheet.absoluteFill} onPress={toggle}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: fade }]}
          pointerEvents={visible ? "auto" : "none"}
        >
          {/* Warm cinema scrim — subtle top vignette, stronger under the bar. */}
          <LinearGradient
            colors={[...gradients.playerControls]}
            locations={[0, 0.4, 0.72, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          {/* Top overlay header — custom topBar (party) OR default back + title/episode
              (solo, portrait + fullscreen). Shares the auto-hide fade + scrim. */}
          {topBar ? (
            <View
              style={[styles.topBarCustom, { top: fullscreen ? ms(10) : Math.max(insets.top, ms(10)) }]}
              pointerEvents="box-none"
            >
              {topBar}
            </View>
          ) : onBack || title ? (
            // The player is now full-bleed (its SafeAreaView drops the top edge so the
            // video/loading backdrop reaches behind the status bar), so the header adds the
            // top inset ITSELF — same as topBarCustom above. Landscape hides the status bar
            // → flat ms(10). Matches the detail-screen header offset.
            <View
              style={[styles.topRow, { top: fullscreen ? ms(10) : Math.max(insets.top, ms(10)) }]}
              pointerEvents="box-none"
            >
              {onBack ? (
                <Pressable
                  style={({ pressed }) => [styles.topBackBtn, pressed && styles.pressed]}
                  onPress={() => {
                    onBack();
                    show();
                  }}
                  hitSlop={10}
                >
                  <Ionicons name="chevron-back" size={ms(22)} color={colors.text} />
                </Pressable>
              ) : (
                <View style={styles.topSpacer} />
              )}

              {title ? (
                <View style={styles.topTitleCard} pointerEvents="none">
                  <Text style={styles.topTitle} numberOfLines={1}>
                    {title}
                  </Text>
                  {subtitle ? (
                    <Text style={styles.topSubtitle} numberOfLines={1}>
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <View style={{ flex: 1 }} />
              )}

              <View style={styles.topSpacer} />
            </View>
          ) : null}

          {/* Overlay children (badges, reaction pills) that fade with the controls. */}
          {overlayChildren}

          {/* Center transport / indicator */}
          <View style={styles.center} pointerEvents="box-none">
            {canControl ? (
              <View style={styles.centerRow} pointerEvents="box-none">
                <Pressable style={({ pressed }) => [styles.chip, pressed && styles.pressed]} onPress={() => { onSeekBy(-10); show(); }} hitSlop={8}>
                  <MaterialIcons name="replay-10" size={ms(29)} color={colors.text} />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.playBtn, pressed && styles.pressed]}
                  onPress={() => {
                    if (paused) onPlay();
                    else onPause();
                    // Flip the icon immediately instead of waiting up to ~1s for the
                    // next tick (or a videasy poster-swap that stalls events) — the
                    // control would otherwise desync from what the tap just did. The
                    // next real playback event confirms or corrects this.
                    setPaused((p) => !p);
                    show();
                  }}
                  hitSlop={10}
                >
                  <Ionicons
                    name={paused ? "play" : "pause"}
                    size={ms(32)}
                    color={colors.onHoney}
                    style={paused ? { marginLeft: ms(3) } : undefined}
                  />
                </Pressable>
                <Pressable style={({ pressed }) => [styles.chip, pressed && styles.pressed]} onPress={() => { onSeekBy(10); show(); }} hitSlop={8}>
                  <MaterialIcons name="forward-10" size={ms(29)} color={colors.text} />
                </Pressable>
              </View>
            ) : outOfSync ? (
              <Pressable style={({ pressed }) => [styles.syncBtn, pressed && styles.pressed]} onPress={() => { onTapSync?.(); show(); }} hitSlop={10}>
                <Ionicons name="flash" size={ms(16)} color={colors.onHoney} />
                <Text style={styles.syncText}>Tap to sync</Text>
              </Pressable>
            ) : paused ? (
              <View style={styles.indicator} pointerEvents="none">
                <Ionicons name="play" size={ms(28)} color={colors.honeyBright} style={{ marginLeft: ms(3) }} />
              </View>
            ) : null}
          </View>

          {/* Frosted-glass bottom bar: time · scrub · time · fullscreen */}
          {/* blur={false} is LOAD-BEARING: a BlurView (dimezisBlurView) over the playing
              video re-samples + blurs it every frame on the GPU and badly stutters
              playback (device-confirmed, esp. 4K). Keep this a solid bar, never a blur. */}
          <GlassCard blur={false} rounded={radius.pill} style={styles.bottomBar} pointerEvents="box-none">
            <View style={styles.bottomRow} pointerEvents="box-none">
              <Text style={styles.time}>{fmt(displayTime)}</Text>
              <View
                style={styles.trackHit}
                onLayout={(e: LayoutChangeEvent) => setBarWidth(e.nativeEvent.layout.width)}
                {...(canControl ? pan.panHandlers : {})}
              >
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${progress * 100}%` }]} />
                  {canControl ? <View style={[styles.thumb, { left: `${progress * 100}%` }]} /> : null}
                </View>
              </View>
              <Text style={styles.time}>{duration > 0 ? fmt(duration) : "--:--"}</Text>
              {onEpisodes ? (
                <Pressable
                  style={({ pressed }) => [styles.fsBtn, pressed && styles.pressedFlat]}
                  onPress={() => {
                    onEpisodes();
                    show();
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="list" size={ms(18)} color={colors.text} />
                </Pressable>
              ) : null}
              {onOpenSettings ? (
                <Pressable style={({ pressed }) => [styles.fsBtn, pressed && styles.pressedFlat]} onPress={() => { onOpenSettings(); show(); }} hitSlop={8}>
                  <Ionicons name="settings-outline" size={ms(16)} color={colors.text} />
                </Pressable>
              ) : null}
              {onToggleFullscreen ? (
                <Pressable style={({ pressed }) => [styles.fsBtn, pressed && styles.pressedFlat]} onPress={onToggleFullscreen} hitSlop={8}>
                  <Ionicons name={fullscreen ? "contract" : "expand"} size={ms(17)} color={colors.text} />
                </Pressable>
              ) : null}
            </View>
          </GlassCard>
        </Animated.View>

        {/* Buffering spinner — OUTSIDE the auto-hide fade, so a stalled stream shows
            feedback even when the controls are hidden (the case we regressed by hiding
            videasy's own spinner). */}
        {buffering ? (
          <View style={styles.bufferLayer} pointerEvents="none">
            <View style={styles.bufferBadge}>
              <ActivityIndicator color={colors.honeyBright} size="large" />
            </View>
          </View>
        ) : null}
      </Pressable>
    );
  },
);

PlayerControls.displayName = "PlayerControls";

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  bufferLayer: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  bufferBadge: {
    width: ms(78),
    height: ms(78),
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.playerChip,
  },
  centerRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(26) },
  // Press feedback: round controls dim + shrink slightly; flat icon buttons just dim.
  pressed: { opacity: 0.5, transform: [{ scale: 0.92 }] },
  pressedFlat: { opacity: 0.45 },
  // Translucent honey-accented glass chip (blur-free for perf — matches the party pills).
  chip: {
    width: ms(52),
    height: ms(52),
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  playBtn: {
    width: ms(66),
    height: ms(66),
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.honey,  },
  indicator: {
    width: ms(60),
    height: ms(60),
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.honeySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.honey,
  },
  syncBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(8),
    backgroundColor: colors.honey,
    paddingHorizontal: ms(18),
    paddingVertical: ms(11),
    borderRadius: radius.pill,  },
  syncText: { color: colors.onHoney, fontFamily: font.headlineSemi, fontSize: ms(13) },
  bottomBar: {
    position: "absolute",
    left: ms(10),
    right: ms(10),
    bottom: ms(10),
    // Solid dark backing (NOT a live blur — see below) so the controls stay readable.
    backgroundColor: colors.playerCenter,  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(9),
    paddingHorizontal: ms(13),
    paddingVertical: ms(8),
  },
  time: {
    color: colors.textDim,
    fontFamily: font.label,
    fontSize: ms(11),
    minWidth: ms(40),
    textAlign: "center",
  },
  trackHit: { flex: 1, height: ms(30), justifyContent: "center" },
  track: {
    height: ms(4),
    borderRadius: ms(2),
    backgroundColor: colors.surfaceStrong,
    overflow: "visible",
  },
  fill: { height: "100%", borderRadius: ms(2), backgroundColor: colors.honey },
  thumb: {
    position: "absolute",
    top: "50%",
    width: ms(14),
    height: ms(14),
    borderRadius: ms(7),
    marginLeft: -ms(7),
    marginTop: -ms(7),
    backgroundColor: colors.honeyBright,
    borderWidth: ms(2),
    borderColor: colors.onHoney,  },
  fsBtn: { width: ms(32), height: ms(32), alignItems: "center", justifyContent: "center" },
  topBarCustom: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 10,
  },
  topRow: {
    position: "absolute",
    left: ms(16),
    right: ms(16),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: ms(10),
  },
  topBackBtn: {
    width: ms(40),
    height: ms(40),
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.playerCenter,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,  },
  // Plain centered title text (no pill card) to match the detail-screen header.
  topTitleCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    color: colors.text,
    fontFamily: font.headlineSemi,
    fontSize: ms(16),
    textAlign: "center",
  },
  topSubtitle: {
    color: colors.honey,
    fontFamily: font.bodySemi,
    fontSize: ms(11),
    textAlign: "center",
    marginTop: ms(1),
  },
  topSpacer: {
    width: ms(40),
  },
});

export default PlayerControls;
