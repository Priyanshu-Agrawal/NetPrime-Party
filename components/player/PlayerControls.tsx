/**
 * PlayerControls — a native control overlay for the hijacked WebView player.
 *
 * The provider's own in-page controls are unreliable when the video is inline
 * (they frequently swallow taps on Android and only respond in fullscreen), so
 * we render our OWN native controls on top and drive the <video> through the
 * hijack bridge. In the watch party these callbacks route through the room
 * authority (host only) so a control press stays in sync for everyone; the
 * component itself is presentational and stateless about transport.
 *
 * Behaviour: tap anywhere toggles the controls; while playing they auto-hide
 * after a few seconds; rewind/forward jump ±10s; the scrub bar supports
 * tap-to-seek and drag. When `canControl` is false the bar is shown read-only
 * (progress + time) with the action buttons hidden.
 */
import { colors, font, ms } from "@/theme/bearoom";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

export interface PlayerControlsProps {
  paused: boolean;
  /** Live position, seconds. */
  currentTime: number;
  /** Media length, seconds (0 until known). */
  duration: number;
  /** Whether this user may drive playback (host / permitted guest). */
  canControl: boolean;
  onPlay: () => void;
  onPause: () => void;
  /** Absolute seek, seconds. */
  onSeekTo: (sec: number) => void;
  /** Relative seek, seconds (±10). */
  onSeekBy: (deltaSec: number) => void;
  /** Toggle the provider's HTML5 fullscreen (optional). */
  onToggleFullscreen?: () => void;
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

export default function PlayerControls({
  paused,
  currentTime,
  duration,
  canControl,
  onPlay,
  onPause,
  onSeekTo,
  onSeekBy,
  onToggleFullscreen,
}: PlayerControlsProps) {
  const [visible, setVisible] = useState(true);
  const [barWidth, setBarWidth] = useState(0);
  // While dragging the scrubber we show the dragged position, not the live one.
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubSec, setScrubSec] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHide = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  // Arm auto-hide only while playing and not mid-scrub.
  const armHide = useCallback(() => {
    clearHide();
    if (paused || scrubbing) return;
    hideTimer.current = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
  }, [paused, scrubbing, clearHide]);

  useEffect(() => {
    Animated.timing(fade, {
      toValue: visible ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
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

  const toggle = useCallback(() => {
    setVisible((v) => !v);
  }, []);

  const progress = duration > 0 ? Math.min(1, (scrubbing ? scrubSec : currentTime) / duration) : 0;

  const secForX = useCallback(
    (x: number) => {
      if (barWidth <= 0 || duration <= 0) return 0;
      const clamped = Math.max(0, Math.min(barWidth, x));
      return (clamped / barWidth) * duration;
    },
    [barWidth, duration],
  );

  // Drag/tap handling on the scrub track. Enabled only for controllers.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => canControl && duration > 0,
        onMoveShouldSetPanResponder: () => canControl && duration > 0,
        onPanResponderGrant: (e) => {
          clearHide();
          setScrubbing(true);
          setScrubSec(secForX(e.nativeEvent.locationX));
        },
        onPanResponderMove: (e) => {
          setScrubSec(secForX(e.nativeEvent.locationX));
        },
        onPanResponderRelease: (e) => {
          const sec = secForX(e.nativeEvent.locationX);
          setScrubbing(false);
          onSeekTo(sec);
          armHide();
        },
        onPanResponderTerminate: () => {
          setScrubbing(false);
          armHide();
        },
      }),
    [canControl, duration, secForX, onSeekTo, clearHide, armHide],
  );

  return (
    <Pressable style={StyleSheet.absoluteFill} onPress={toggle}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: fade }]} pointerEvents={visible ? "auto" : "none"}>
        {/* Center transport (controllers only) */}
        {canControl ? (
          <View style={styles.centerRow} pointerEvents="box-none">
            <Pressable
              style={styles.roundBtn}
              onPress={() => {
                onSeekBy(-10);
                show();
              }}
              hitSlop={8}
            >
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

            <Pressable
              style={styles.roundBtn}
              onPress={() => {
                onSeekBy(10);
                show();
              }}
              hitSlop={8}
            >
              <MaterialIcons name="forward-10" size={ms(30)} color={colors.text} />
            </Pressable>
          </View>
        ) : null}

        {/* Bottom scrubber + time */}
        <View style={styles.bottomBar} pointerEvents="box-none">
          <Text style={styles.time}>{fmt(scrubbing ? scrubSec : currentTime)}</Text>
          <View
            style={styles.trackHit}
            onLayout={(e: LayoutChangeEvent) => setBarWidth(e.nativeEvent.layout.width)}
            {...(canControl ? pan.panHandlers : {})}
          >
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${progress * 100}%` }]} />
              {canControl ? (
                <View style={[styles.thumb, { left: `${progress * 100}%` }]} />
              ) : null}
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
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: "rgba(6,4,3,0.32)", justifyContent: "center" },
  centerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: ms(28),
  },
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
    minWidth: ms(36),
    textAlign: "center",
  },
  trackHit: { flex: 1, height: ms(28), justifyContent: "center" },
  track: {
    height: ms(4),
    borderRadius: ms(2),
    backgroundColor: "rgba(255,255,255,0.25)",
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
    backgroundColor: colors.honey,
  },
  fsBtn: {
    width: ms(30),
    height: ms(30),
    alignItems: "center",
    justifyContent: "center",
  },
});
