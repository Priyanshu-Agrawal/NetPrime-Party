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
import { colors, font, glow, ms, radius } from "@/theme/bearoom";
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
  Animated,
  Easing,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

export interface PlaybackState {
  currentTime: number;
  duration: number;
  paused: boolean;
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
    },
    ref,
  ) => {
    const [paused, setPaused] = useState(true);
    // Time shown on the LABEL (a 1/sec step is fine); the THUMB glides via progressAnim.
    const [displayTime, setDisplayTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [visible, setVisible] = useState(true);
    const [barWidth, setBarWidth] = useState(0);
    const [scrubbing, setScrubbing] = useState(false);
    const scrubbingRef = useRef(false);
    const durationRef = useRef(0);
    // Commit-hold: after release, keep the thumb at the dropped spot until the video
    // actually reaches it — no snap-back to the stale live position, no jump.
    const seekTargetRef = useRef<number | null>(null);
    // 0..1 track progress, animated so the thumb glides between 1 s ticks (JS-driven:
    // width/left aren't native-drivable, but it's one cheap value).
    const progressAnim = useRef(new Animated.Value(0)).current;
    const fade = useRef(new Animated.Value(1)).current;
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fillPct = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

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
          const dur = Number.isFinite(s.duration) ? s.duration : durationRef.current;
          // Committed seek reached its target → resume following live.
          if (seekTargetRef.current != null && Math.abs(s.currentTime - seekTargetRef.current) < 1.5) {
            seekTargetRef.current = null;
          }
          // While dragging, or holding a committed seek, freeze the thumb + label.
          if (scrubbingRef.current || seekTargetRef.current != null || !Number.isFinite(s.currentTime)) return;
          setDisplayTime(s.currentTime);
          if (dur > 0) {
            const cur = Math.min(1, Math.max(0, s.currentTime / dur));
            progressAnim.stopAnimation();
            progressAnim.setValue(cur);
            if (!s.paused) {
              // Glide toward where the next tick will land so the thumb moves smoothly.
              Animated.timing(progressAnim, {
                toValue: Math.min(1, (s.currentTime + 1) / dur),
                duration: 1000,
                easing: Easing.linear,
                useNativeDriver: false,
              }).start();
            }
          }
        },
      }),
      [progressAnim],
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
      if (visible) armHide();
      return clearHide;
    }, [visible, armHide, clearHide, fade]);

    // Surface the controls whenever playback flips (e.g. host paused remotely).
    useEffect(() => {
      setVisible(true);
    }, [paused]);

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
    const showAt = useCallback(
      (sec: number) => {
        setDisplayTime(sec);
        if (duration > 0) {
          progressAnim.stopAnimation();
          progressAnim.setValue(Math.min(1, Math.max(0, sec / duration)));
        }
      },
      [duration, progressAnim],
    );

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

    return (
      <Pressable style={StyleSheet.absoluteFill} onPress={toggle}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: fade }]}
          pointerEvents={visible ? "auto" : "none"}
        >
          {/* Warm cinema scrim — subtle top vignette, stronger under the bar. */}
          <LinearGradient
            colors={["rgba(16,13,10,0.28)", "rgba(16,13,10,0.05)", "rgba(16,13,10,0.30)", "rgba(16,13,10,0.72)"]}
            locations={[0, 0.4, 0.72, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

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
          <GlassCard blur rounded={radius.pill} style={styles.bottomBar} pointerEvents="box-none">
            <View style={styles.bottomRow} pointerEvents="box-none">
              <Text style={styles.time}>{fmt(displayTime)}</Text>
              <View
                style={styles.trackHit}
                onLayout={(e: LayoutChangeEvent) => setBarWidth(e.nativeEvent.layout.width)}
                {...(canControl ? pan.panHandlers : {})}
              >
                <View style={styles.track}>
                  <Animated.View style={[styles.fill, { width: fillPct }]} />
                  {canControl ? <Animated.View style={[styles.thumb, { left: fillPct }]} /> : null}
                </View>
              </View>
              <Text style={styles.time}>{duration > 0 ? fmt(duration) : "--:--"}</Text>
              {onOpenSettings ? (
                <Pressable style={({ pressed }) => [styles.fsBtn, pressed && styles.pressedFlat]} onPress={() => { onOpenSettings(); show(); }} hitSlop={8}>
                  <Ionicons name="settings-outline" size={ms(16)} color={colors.text} />
                </Pressable>
              ) : null}
              {onToggleFullscreen ? (
                <Pressable style={({ pressed }) => [styles.fsBtn, pressed && styles.pressedFlat]} onPress={onToggleFullscreen} hitSlop={8}>
                  <Ionicons name="expand" size={ms(17)} color={colors.text} />
                </Pressable>
              ) : null}
            </View>
          </GlassCard>
        </Animated.View>
      </Pressable>
    );
  },
);

PlayerControls.displayName = "PlayerControls";

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
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
    backgroundColor: colors.honey,
    ...glow.honey,
  },
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
    borderRadius: radius.pill,
    ...glow.honey,
  },
  syncText: { color: colors.onHoney, fontFamily: font.headlineSemi, fontSize: ms(13) },
  bottomBar: {
    position: "absolute",
    left: ms(10),
    right: ms(10),
    bottom: ms(10),
    ...glow.soft,
  },
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
    borderColor: colors.onHoney,
    ...glow.honey,
  },
  fsBtn: { width: ms(32), height: ms(32), alignItems: "center", justifyContent: "center" },
});

export default PlayerControls;
