/**
 * PlayerControls — the Bearoom-skinned control overlay for the hijacked WebView.
 *
 * videasy's own chrome is hidden (HijackPlayer `__vlChromeOff`), so THIS is the
 * only control surface. Presentational + stateless about transport: the callbacks
 * route through the room authority in a party (host), so a press stays in sync for
 * everyone.
 *
 * Host / controller: full transport — play/pause, ±10s, draggable scrub, time,
 * fullscreen. Guest: a read-only progress bar + time, a non-interactive play/pause
 * indicator, and — when their video is paused while the room is PLAYING (detached
 * or autoplay-stalled) — a "Tap to sync" that jumps them back to live (the tap is
 * also the browser gesture). A guest can never drive the room's timeline.
 *
 * Playback state is pushed imperatively via the ref (`setPlayback`) so the parent
 * (party.tsx) doesn't re-render its chat list on every 1 s tick.
 */
import { colors, font, ms, radius } from "@/theme/bearoom";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
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
    { canControl, roomPlaying, onPlay, onPause, onSeekTo, onSeekBy, onToggleFullscreen, onTapSync },
    ref,
  ) => {
    const [paused, setPaused] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [visible, setVisible] = useState(true);
    const [barWidth, setBarWidth] = useState(0);
    // While dragging the scrubber we show the dragged position, not the live one.
    const [scrubbing, setScrubbing] = useState(false);
    const [scrubSec, setScrubSec] = useState(0);
    const scrubbingRef = useRef(false);
    const fade = useRef(new Animated.Value(1)).current;
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Parent pushes playback here every event — no parent re-render.
    useImperativeHandle(
      ref,
      () => ({
        setPlayback: (s) => {
          setPaused(s.paused);
          if (Number.isFinite(s.duration)) setDuration(s.duration);
          if (!scrubbingRef.current && Number.isFinite(s.currentTime)) setCurrentTime(s.currentTime);
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
      Animated.timing(fade, { toValue: visible ? 1 : 0, duration: 180, useNativeDriver: true }).start();
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

    const progress = duration > 0 ? Math.min(1, (scrubbing ? scrubSec : currentTime) / duration) : 0;

    const secForX = useCallback(
      (x: number) => {
        if (barWidth <= 0 || duration <= 0) return 0;
        return (Math.max(0, Math.min(barWidth, x)) / barWidth) * duration;
      },
      [barWidth, duration],
    );

    const pan = useMemo(
      () =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => canControl && duration > 0,
          onMoveShouldSetPanResponder: () => canControl && duration > 0,
          onPanResponderGrant: (e) => {
            clearHide();
            scrubbingRef.current = true;
            setScrubbing(true);
            setScrubSec(secForX(e.nativeEvent.locationX));
          },
          onPanResponderMove: (e) => setScrubSec(secForX(e.nativeEvent.locationX)),
          onPanResponderRelease: (e) => {
            const sec = secForX(e.nativeEvent.locationX);
            scrubbingRef.current = false;
            setScrubbing(false);
            onSeekTo(sec);
            armHide();
          },
          onPanResponderTerminate: () => {
            scrubbingRef.current = false;
            setScrubbing(false);
            armHide();
          },
        }),
      [canControl, duration, secForX, onSeekTo, clearHide, armHide],
    );

    // Guest is stuck (video paused while the room plays) → offer a rejoin.
    const outOfSync = !canControl && paused && roomPlaying;

    return (
      <Pressable style={StyleSheet.absoluteFill} onPress={toggle}>
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.scrim, { opacity: fade }]}
          pointerEvents={visible ? "auto" : "none"}
        >
          {/* Center */}
          {canControl ? (
            <View style={styles.centerRow} pointerEvents="box-none">
              <Pressable style={styles.roundBtn} onPress={() => { onSeekBy(-10); show(); }} hitSlop={8}>
                <MaterialIcons name="replay-10" size={ms(30)} color={colors.text} />
              </Pressable>
              <Pressable
                style={styles.playBtn}
                onPress={() => {
                  if (paused) onPlay();
                  else onPause();
                  show();
                }}
                hitSlop={10}
              >
                <Ionicons name={paused ? "play" : "pause"} size={ms(34)} color={colors.onHoney} />
              </Pressable>
              <Pressable style={styles.roundBtn} onPress={() => { onSeekBy(10); show(); }} hitSlop={8}>
                <MaterialIcons name="forward-10" size={ms(30)} color={colors.text} />
              </Pressable>
            </View>
          ) : outOfSync ? (
            <View style={styles.centerRow} pointerEvents="box-none">
              <Pressable style={styles.syncBtn} onPress={() => { onTapSync?.(); show(); }} hitSlop={10}>
                <Ionicons name="flash" size={ms(17)} color={colors.onHoney} />
                <Text style={styles.syncText}>Tap to sync</Text>
              </Pressable>
            </View>
          ) : paused ? (
            <View style={styles.centerRow} pointerEvents="none">
              <View style={styles.indicator}>
                <Ionicons name="play" size={ms(30)} color={colors.text} />
              </View>
            </View>
          ) : null}

          {/* Bottom scrubber + time (read-only for guests) */}
          <View style={styles.bottomBar} pointerEvents="box-none">
            <Text style={styles.time}>{fmt(scrubbing ? scrubSec : currentTime)}</Text>
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
            {onToggleFullscreen ? (
              <Pressable style={styles.fsBtn} onPress={onToggleFullscreen} hitSlop={8}>
                <Ionicons name="expand" size={ms(18)} color={colors.text} />
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      </Pressable>
    );
  },
);

PlayerControls.displayName = "PlayerControls";

const styles = StyleSheet.create({
  scrim: { backgroundColor: "rgba(6,4,3,0.32)", justifyContent: "center" },
  centerRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(28) },
  roundBtn: {
    width: ms(52),
    height: ms(52),
    borderRadius: ms(26),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(20,15,11,0.45)",
  },
  playBtn: {
    width: ms(64),
    height: ms(64),
    borderRadius: ms(32),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.honey,
  },
  indicator: {
    width: ms(60),
    height: ms(60),
    borderRadius: ms(30),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(20,15,11,0.42)",
  },
  syncBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(8),
    backgroundColor: colors.honey,
    paddingHorizontal: ms(18),
    paddingVertical: ms(10),
    borderRadius: radius.pill,
  },
  syncText: { color: colors.onHoney, fontFamily: font.headlineSemi, fontSize: ms(13) },
  bottomBar: {
    position: "absolute",
    left: ms(10),
    right: ms(10),
    bottom: ms(8),
    flexDirection: "row",
    alignItems: "center",
    gap: ms(8),
  },
  time: {
    color: colors.text,
    fontFamily: font.label,
    fontSize: ms(11),
    minWidth: ms(38),
    textAlign: "center",
  },
  trackHit: { flex: 1, height: ms(28), justifyContent: "center" },
  track: { height: ms(4), borderRadius: ms(2), backgroundColor: "rgba(255,255,255,0.25)", overflow: "visible" },
  fill: { height: "100%", borderRadius: ms(2), backgroundColor: colors.honey },
  thumb: {
    position: "absolute",
    top: "50%",
    width: ms(14),
    height: ms(14),
    borderRadius: ms(7),
    marginLeft: -ms(7),
    marginTop: -ms(7),
    backgroundColor: colors.honey,
  },
  fsBtn: { width: ms(30), height: ms(30), alignItems: "center", justifyContent: "center" },
});

export default PlayerControls;
