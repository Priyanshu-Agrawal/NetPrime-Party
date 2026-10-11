/**
 * PlayerControls — the one Bearoom control layer, for every engine (native expo-video and the WebView bridge) and
 * for solo and party (spec §6.2.1).
 *
 * Presentational and stateless about transport: the callbacks route through the room authority in a party, so a
 * press stays in sync. Playback state arrives imperatively (`setPlayback`) so the parent doesn't re-render its chat
 * list on every tick.
 *
 * Gestures: a tap toggles the controls; for anyone who may drive playback a double tap on the left/right third seeks
 * ∓10 s and every further tap there adds 10 s; the lock ignores every touch except the unlock pill.
 */
import GlassCard from "@/components/ui/GlassCard";
import { Glass, GlassVisible } from "@/src/ui/glass";
import { colors, font, ms, radius } from "@/theme/bearoom";
import { absoluteFill } from "@/theme/styles/layout";
import { gradients } from "@/theme/styles/gradients";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NO_TAPS, onTap, SEEK_STEP_SEC, STREAK_MS, type TapState } from "./doubleTap";

export interface PlaybackState {
  currentTime: number;
  duration: number;
  paused: boolean;
  /** HTMLMediaElement.readyState; <3 while playing ⇒ the stream stalled → spinner. */
  readyState?: number;
  /** Media time buffered up to, in seconds, when the engine knows it. */
  bufferedTime?: number;
}

export interface PlayerControlsHandle {
  setPlayback: (s: PlaybackState) => void;
}

/** Current audio / subtitles / quality, shown as one quick chip. */
export interface ControlChips {
  audio?: string;
  subtitles?: string | null;
  quality?: string;
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
  /** Toggle fullscreen / landscape. */
  onToggleFullscreen?: () => void;
  /** Guest tap-to-sync (jump to live) when out of sync. */
  onTapSync?: () => void;
  /** Open the player settings sheet. */
  onOpenSettings?: () => void;
  /** Open the episode picker — provided only for TV shows. */
  onEpisodes?: () => void;
  /** Play the next episode (solo, or the host in a party). */
  onNextEpisode?: () => void;
  /** Back button callback (e.g. exit fullscreen). */
  onBack?: () => void;
  /** Title shown in the top overlay header. */
  title?: string;
  /** Subtitle (e.g. "S1 · E1") shown under the title. */
  subtitle?: string;
  /** Whether the player is fullscreen/immersive. */
  fullscreen?: boolean;
  /** The player sits below the screen's own header, so the overlay header hugs the video's top edge. */
  embedded?: boolean;
  /** Custom top-bar node for the overlay (the party fills this). */
  topBar?: React.ReactNode;
  /** Extra overlay children (badges, reaction pills) that fade with the controls. */
  overlayChildren?: React.ReactNode;
  /** Current audio / subtitles / quality for the quick chip (needs onOpenSettings). */
  chips?: ControlChips;
  /** Notified when the auto-hide visibility flips. */
  onVisibilityChange?: (visible: boolean) => void;
}

export const AUTO_HIDE_MS = 3000;
export const SPINNER_DELAY_MS = 300;
const UNLOCK_PILL_MS = 2500;

export function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(ss).padStart(2, "0")}`;
}

/** "Hindi · CC · 1080p"; empty while nothing is known. */
export function chipText(c?: ControlChips): string {
  if (!c) return "";
  return [c.audio, c.subtitles ? "CC" : null, c.quality].filter(Boolean).join(" · ");
}

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

function BarButton({ label, icon, size = ms(17), onPress }: { label: string; icon: IoniconName; size?: number; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.barBtn, pressed && styles.pressedFlat]}
      onPress={onPress}
      hitSlop={8}
    >
      <Ionicons name={icon} size={size} color={colors.text} />
    </Pressable>
  );
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
      onNextEpisode,
      onBack,
      title,
      subtitle,
      fullscreen,
      embedded,
      topBar,
      overlayChildren,
      chips,
      onVisibilityChange,
    },
    ref,
  ) => {
    const insets = useSafeAreaInsets();
    const headerTop = fullscreen || embedded ? ms(10) : Math.max(insets.top, ms(10));
    const [paused, setPaused] = useState(true);
    // Progress is stepwise (one setState per tick), not a 60 fps animation: a JS-driven glide restarts every tick
    // and congests the UI thread the video draws on.
    const [displayTime, setDisplayTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [bufferedTime, setBufferedTime] = useState(0);
    const [visible, setVisible] = useState(true);
    const visibleRef = useRef(true);
    const [locked, setLocked] = useState(false);
    const lockedRef = useRef(false);
    const [unlockPill, setUnlockPill] = useState(false);
    const unlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [barWidth, setBarWidth] = useState(0);
    const [scrubbing, setScrubbing] = useState(false);
    const [showRemaining, setShowRemaining] = useState(true);
    const [buffering, setBuffering] = useState(false);
    const bufferingRef = useRef(false);
    const bufferTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scrubbingRef = useRef(false);
    // Commit-hold: after release, keep the thumb at the dropped spot until the video reaches it.
    const seekTargetRef = useRef<number | null>(null);
    const [fade] = useState(() => new Animated.Value(1));
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const surfaceWidth = useRef(0);
    const taps = useRef<TapState>(NO_TAPS);
    // Latest reported position and length, and where the current double-tap streak started.
    const liveTime = useRef(0);
    const durationRef = useRef(0);
    const streakBase = useRef(0);
    const visibleBeforeTap = useRef(true);
    const [ripple, setRipple] = useState<{ zone: "left" | "right"; sec: number } | null>(null);
    const [rippleFade] = useState(() => new Animated.Value(0));
    const shown = visible && !locked;

    useEffect(() => {
      visibleRef.current = visible;
    }, [visible]);
    useEffect(() => {
      lockedRef.current = locked;
    }, [locked]);

    useImperativeHandle(
      ref,
      () => ({
        setPlayback: (s) => {
          setPaused(s.paused);
          if (Number.isFinite(s.duration)) {
            setDuration(s.duration);
            durationRef.current = s.duration;
          }
          if (Number.isFinite(s.currentTime)) liveTime.current = s.currentTime;
          if (typeof s.bufferedTime === "number" && Number.isFinite(s.bufferedTime)) setBufferedTime(s.bufferedTime);
          // A stall while meant to be playing shows the spinner after a short delay, so a brief dip (just after a
          // seek) doesn't flash it.
          const stalled = !s.paused && typeof s.readyState === "number" && s.readyState < 3;
          if (stalled && !bufferingRef.current) {
            if (bufferTimer.current == null) {
              bufferTimer.current = setTimeout(() => {
                bufferTimer.current = null;
                bufferingRef.current = true;
                setBuffering(true);
              }, SPINNER_DELAY_MS);
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
          if (seekTargetRef.current != null && Math.abs(s.currentTime - seekTargetRef.current) < 1.5) {
            seekTargetRef.current = null;
          }
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
      Animated.timing(fade, { toValue: shown ? 1 : 0, duration: 190, useNativeDriver: true }).start();
      onVisibilityChange?.(shown);
      if (shown) armHide();
      return clearHide;
    }, [shown, armHide, clearHide, fade, onVisibilityChange]);

    // Surface the controls whenever playback flips (e.g. host paused remotely) — unless locked.
    useEffect(() => {
      if (!lockedRef.current) setVisible(true);
    }, [paused]);

    useEffect(
      () => () => {
        if (bufferTimer.current) clearTimeout(bufferTimer.current);
        if (unlockTimer.current) clearTimeout(unlockTimer.current);
      },
      [],
    );

    const show = useCallback(() => {
      setVisible(true);
      armHide();
    }, [armHide]);

    const revealUnlock = useCallback(() => {
      setUnlockPill(true);
      if (unlockTimer.current) clearTimeout(unlockTimer.current);
      unlockTimer.current = setTimeout(() => setUnlockPill(false), UNLOCK_PILL_MS);
    }, []);

    const lock = useCallback(() => {
      clearHide();
      setLocked(true);
      setVisible(false);
    }, [clearHide]);

    const unlock = useCallback(() => {
      if (unlockTimer.current) clearTimeout(unlockTimer.current);
      setUnlockPill(false);
      setLocked(false);
      setVisible(true);
    }, []);

    const onSurfacePress = useCallback(
      (e?: GestureResponderEvent) => {
        if (lockedRef.current) {
          revealUnlock();
          return;
        }
        const x = e?.nativeEvent?.locationX ?? 0;
        const { state, action } = onTap(taps.current, x, surfaceWidth.current, Date.now(), canControl);
        taps.current = state;
        if (action.kind === "toggle") {
          visibleBeforeTap.current = visibleRef.current;
          setVisible(!visibleRef.current);
          return;
        }
        if (action.undoToggle) setVisible(visibleBeforeTap.current);
        // A streak seeks from where it started (or from a seek still on its way), so "+20 s" moves 20 s even before
        // the player reports the first jump.
        if (action.streak === 1) streakBase.current = seekTargetRef.current ?? liveTime.current;
        const step = (action.zone === "left" ? -1 : 1) * action.streak * SEEK_STEP_SEC;
        const end = durationRef.current > 0 ? durationRef.current : Infinity;
        const target = Math.min(end, Math.max(0, streakBase.current + step));
        seekTargetRef.current = target;
        setDisplayTime(target);
        onSeekTo(target);
        setRipple({ zone: action.zone, sec: action.streak * SEEK_STEP_SEC });
        rippleFade.stopAnimation();
        rippleFade.setValue(1);
        Animated.timing(rippleFade, { toValue: 0, duration: 250, delay: STREAK_MS, useNativeDriver: true }).start();
      },
      [canControl, onSeekTo, revealUnlock, rippleFade],
    );

    const secForX = useCallback(
      (x: number) => {
        if (barWidth <= 0 || duration <= 0) return 0;
        return (Math.max(0, Math.min(barWidth, x)) / barWidth) * duration;
      },
      [barWidth, duration],
    );

    const pan = useMemo(
      () =>
        // PanResponder calls these handlers only during a drag, never while rendering.
        // eslint-disable-next-line react-hooks/refs
        PanResponder.create({
          onStartShouldSetPanResponder: () => canControl && duration > 0,
          onMoveShouldSetPanResponder: () => canControl && duration > 0,
          onPanResponderGrant: (e) => {
            clearHide();
            seekTargetRef.current = null;
            scrubbingRef.current = true;
            setScrubbing(true);
            setDisplayTime(secForX(e.nativeEvent.locationX));
          },
          onPanResponderMove: (e) => setDisplayTime(secForX(e.nativeEvent.locationX)),
          onPanResponderRelease: (e) => {
            const sec = secForX(e.nativeEvent.locationX);
            scrubbingRef.current = false;
            setScrubbing(false);
            seekTargetRef.current = sec;
            setDisplayTime(sec);
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

    const outOfSync = !canControl && paused && roomPlaying;
    const progress = duration > 0 ? Math.min(1, Math.max(0, displayTime / duration)) : 0;
    const bufferedProgress = duration > 0 ? Math.min(1, Math.max(0, bufferedTime / duration)) : 0;
    const chip = chipText(chips);

    return (
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onSurfacePress}
        onLayout={(e: LayoutChangeEvent) => {
          surfaceWidth.current = e.nativeEvent.layout.width;
        }}
        accessibilityLabel="Player surface"
      >
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]} pointerEvents={shown ? "auto" : "none"}>
          <GlassVisible value={shown}>
            <LinearGradient
              colors={[...gradients.playerControls]}
              locations={[0, 0.4, 0.72, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />

            {topBar ? (
              <View style={[styles.topBarCustom, { top: headerTop }]} pointerEvents="box-none">
                {topBar}
              </View>
            ) : onBack || title ? (
              <View style={[styles.topRow, { top: headerTop }]} pointerEvents="box-none">
                {onBack ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Back"
                    style={({ pressed }) => [styles.topBackBtn, pressed && styles.pressed]}
                    onPress={() => {
                      onBack();
                      show();
                    }}
                    hitSlop={10}
                  >
                    <Glass material="control" radius={radius.pill} visible={shown} />
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

            {overlayChildren}

            <View style={styles.center} pointerEvents="box-none">
              {canControl ? (
                <View style={styles.centerRow} pointerEvents="box-none">
                  <Pressable
                    accessibilityLabel="Back 10 seconds"
                    style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
                    onPress={() => {
                      onSeekBy(-SEEK_STEP_SEC);
                      show();
                    }}
                    hitSlop={8}
                  >
                    <Glass material="control" radius={radius.pill} visible={shown} />
                    <MaterialIcons name="replay-10" size={ms(29)} color={colors.text} />
                  </Pressable>
                  <Pressable
                    accessibilityLabel={paused ? "Play" : "Pause"}
                    style={({ pressed }) => [styles.playBtn, pressed && styles.pressed]}
                    onPress={() => {
                      if (paused) onPlay();
                      else onPause();
                      // Flip at once; the next playback event confirms or corrects it.
                      setPaused((p) => !p);
                      show();
                    }}
                    hitSlop={10}
                  >
                    {buffering ? (
                      <ActivityIndicator testID="play-buffering" accessibilityLabel="Buffering" color={colors.onHoney} />
                    ) : (
                      <Ionicons
                        name={paused ? "play" : "pause"}
                        size={ms(32)}
                        color={colors.onHoney}
                        style={paused ? { marginLeft: ms(3) } : undefined}
                      />
                    )}
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Forward 10 seconds"
                    style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
                    onPress={() => {
                      onSeekBy(SEEK_STEP_SEC);
                      show();
                    }}
                    hitSlop={8}
                  >
                    <Glass material="control" radius={radius.pill} visible={shown} />
                    <MaterialIcons name="forward-10" size={ms(29)} color={colors.text} />
                  </Pressable>
                </View>
              ) : outOfSync ? (
                <Pressable
                  style={({ pressed }) => [styles.syncBtn, pressed && styles.pressed]}
                  onPress={() => {
                    onTapSync?.();
                    show();
                  }}
                  hitSlop={10}
                >
                  <Ionicons name="flash" size={ms(16)} color={colors.onHoney} />
                  <Text style={styles.syncText}>Tap to sync</Text>
                </Pressable>
              ) : paused ? (
                <View style={styles.indicator} pointerEvents="none">
                  <Ionicons name="play" size={ms(28)} color={colors.honeyBright} style={{ marginLeft: ms(3) }} />
                </View>
              ) : null}
            </View>

            {/* Glass bottom bar — crafted glass over the video on Android unless the native lane renders into a
                TextureView inside a GlassBackdrop; Liquid Glass on iOS (docs/superpowers/specs/2026-10-11-glass-design.md). */}
            <GlassCard material="bar" visible={shown} rounded={radius.lg} style={styles.bottomBar} pointerEvents="box-none">
              <View style={styles.actionsRow} pointerEvents="box-none">
                {chip && onOpenSettings ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Playback options: ${chip}`}
                    style={({ pressed }) => [styles.quickChip, pressed && styles.pressedFlat]}
                    onPress={() => {
                      onOpenSettings();
                      show();
                    }}
                    hitSlop={6}
                  >
                    <Text style={styles.quickChipText} numberOfLines={1}>
                      {chip}
                    </Text>
                    <Ionicons name="chevron-up" size={ms(12)} color={colors.textDim} />
                  </Pressable>
                ) : null}
                <View style={styles.flex} />
                <View style={styles.actionsRight} pointerEvents="box-none">
                  {canControl && onNextEpisode ? (
                    <BarButton label="Next episode" icon="play-skip-forward" onPress={() => { onNextEpisode(); show(); }} />
                  ) : null}
                  {onEpisodes ? <BarButton label="Episodes" icon="list" size={ms(18)} onPress={() => { onEpisodes(); show(); }} /> : null}
                  <BarButton label="Lock controls" icon="lock-closed-outline" size={ms(16)} onPress={lock} />
                  {onOpenSettings ? (
                    <BarButton label="Player settings" icon="settings-outline" size={ms(16)} onPress={() => { onOpenSettings(); show(); }} />
                  ) : null}
                  {onToggleFullscreen ? (
                    <BarButton label={fullscreen ? "Exit fullscreen" : "Fullscreen"} icon={fullscreen ? "contract" : "expand"} onPress={onToggleFullscreen} />
                  ) : null}
                </View>
              </View>
              <View style={styles.bottomRow} pointerEvents="box-none">
                <Text style={styles.time}>{fmt(displayTime)}</Text>
                <View
                  style={styles.trackHit}
                  onLayout={(e: LayoutChangeEvent) => setBarWidth(e.nativeEvent.layout.width)}
                  {...(canControl ? pan.panHandlers : {})}
                >
                  <View style={styles.track}>
                    <View testID="buffered" style={[styles.buffered, { width: `${bufferedProgress * 100}%` }]} />
                    <View style={[styles.fill, { width: `${progress * 100}%` }]} />
                    {canControl ? (
                      <View style={[styles.thumb, scrubbing && styles.thumbActive, { left: `${progress * 100}%` }]} />
                    ) : null}
                  </View>
                  {scrubbing ? (
                    <View pointerEvents="none" style={[styles.bubble, { left: `${progress * 100}%` }]}>
                      <Text style={styles.bubbleText}>{fmt(displayTime)}</Text>
                    </View>
                  ) : null}
                </View>
                <Pressable
                  accessibilityLabel="Toggle remaining time"
                  onPress={() => {
                    setShowRemaining((r) => !r);
                    show();
                  }}
                  hitSlop={6}
                >
                  <Text style={styles.time}>
                    {duration > 0 ? (showRemaining ? `−${fmt(duration - displayTime)}` : fmt(duration)) : "--:--"}
                  </Text>
                </Pressable>
              </View>
            </GlassCard>
          </GlassVisible>
        </Animated.View>

        {ripple ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.ripple, ripple.zone === "left" ? styles.rippleLeft : styles.rippleRight, { opacity: rippleFade }]}
          >
            <MaterialIcons name={ripple.zone === "left" ? "fast-rewind" : "fast-forward"} size={ms(26)} color={colors.text} />
            <Text style={styles.rippleText}>{`${ripple.sec} s`}</Text>
          </Animated.View>
        ) : null}

        {locked && unlockPill ? (
          <View style={styles.unlockLayer} pointerEvents="box-none">
            <Pressable accessibilityRole="button" accessibilityLabel="Unlock controls" style={styles.unlockPill} onPress={unlock}>
              <Ionicons name="lock-open-outline" size={ms(16)} color={colors.onHoney} />
              <Text style={styles.unlockText}>Tap to unlock</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Buffering spinner — outside the fade, so a stall shows even with the controls hidden. While they show,
            the play button carries the spinner instead (one centre element, not two stacked). */}
        {buffering && (!shown || !canControl) ? (
          <View testID="buffer-layer" style={styles.bufferLayer} pointerEvents="none">
            <View style={styles.bufferBadge} accessibilityLabel="Buffering">
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
  flex: { flex: 1 },
  center: { ...absoluteFill, alignItems: "center", justifyContent: "center" },
  bufferLayer: { ...absoluteFill, alignItems: "center", justifyContent: "center" },
  bufferBadge: {
    width: ms(78),
    height: ms(78),
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.playerChip,
  },
  centerRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: ms(26) },
  pressed: { opacity: 0.5, transform: [{ scale: 0.92 }] },
  pressedFlat: { opacity: 0.45 },
  chip: {
    width: ms(52),
    height: ms(52),
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
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
  },
  syncText: { color: colors.onHoney, fontFamily: font.headlineSemi, fontSize: ms(13) },
  bottomBar: { position: "absolute", left: ms(10), right: ms(10), bottom: ms(10) },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(6),
    paddingHorizontal: ms(10),
    paddingTop: ms(6),
  },
  actionsRight: { flexDirection: "row", alignItems: "center", gap: ms(2) },
  quickChip: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: ms(4),
    alignSelf: "flex-start",
    paddingHorizontal: ms(10),
    paddingVertical: ms(5),
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceStrong,
  },
  quickChipText: { flexShrink: 1, color: colors.text, fontFamily: font.bodySemi, fontSize: ms(11) },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(9),
    paddingHorizontal: ms(13),
    paddingBottom: ms(6),
  },
  time: { color: colors.textDim, fontFamily: font.label, fontSize: ms(11), minWidth: ms(44), textAlign: "center" },
  trackHit: { flex: 1, height: ms(30), justifyContent: "center" },
  track: { height: ms(4), borderRadius: ms(2), backgroundColor: colors.surfaceStrong, overflow: "visible" },
  buffered: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: ms(2), backgroundColor: "rgba(246,239,227,0.28)" },
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
  },
  thumbActive: { transform: [{ scale: 1.35 }] },
  bubble: {
    position: "absolute",
    bottom: ms(26),
    width: ms(56),
    marginLeft: -ms(28),
    alignItems: "center",
    paddingVertical: ms(3),
    borderRadius: radius.pill,
    backgroundColor: colors.bgElevated,
  },
  bubbleText: { color: colors.text, fontFamily: font.label, fontSize: ms(11) },
  barBtn: { width: ms(32), height: ms(32), alignItems: "center", justifyContent: "center" },
  ripple: {
    position: "absolute",
    top: "50%",
    width: ms(78),
    height: ms(78),
    marginTop: -ms(39),
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.playerChip,
  },
  rippleLeft: { left: ms(28) },
  rippleRight: { right: ms(28) },
  rippleText: { color: colors.text, fontFamily: font.label, fontSize: ms(12), marginTop: ms(2) },
  // Top of the player, clear of subtitles at the bottom.
  unlockLayer: { ...absoluteFill, alignItems: "center", justifyContent: "flex-start", paddingTop: ms(14) },
  unlockPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(8),
    paddingHorizontal: ms(18),
    paddingVertical: ms(10),
    borderRadius: radius.pill,
    backgroundColor: colors.honey,
  },
  unlockText: { color: colors.onHoney, fontFamily: font.headlineSemi, fontSize: ms(13) },
  topBarCustom: { position: "absolute", left: 0, right: 0, zIndex: 10 },
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
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  topTitleCard: { flex: 1, alignItems: "center", justifyContent: "center" },
  topTitle: { color: colors.text, fontFamily: font.headlineSemi, fontSize: ms(16), textAlign: "center" },
  topSubtitle: { color: colors.honey, fontFamily: font.bodySemi, fontSize: ms(11), textAlign: "center", marginTop: ms(1) },
  topSpacer: { width: ms(40) },
});

export default PlayerControls;
