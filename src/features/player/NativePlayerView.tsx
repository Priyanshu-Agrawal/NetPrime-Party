/**
 * NativePlayerView — the native lane's player screen body (spec §6.2.1): expo-video under the shared controls, the
 * branded loading card crossfading into the first frame, honest settings rows, the §7 error card, and an offline pause
 * that resumes where it stopped (F8). Phase 1B opens it from the dev-only Test streams list; Phase 2's resolver will
 * open it for real titles.
 */
import { controlChips } from "@/components/player/chips";
import { NativePlayer, type NativeSource, type SidecarSubtitle } from "@/components/player/native/NativePlayer";
import { PlayerControls, type ControlChips, type PlayerControlsHandle } from "@/components/player/PlayerControls";
import { PlayerErrorCard } from "@/components/player/PlayerErrorCard";
import { PlayerLoadingCard } from "@/components/player/PlayerLoadingCard";
import PlayerSettingsSheet from "@/components/player/PlayerSettingsSheet";
import { PlayerToast, type PlayerNotice } from "@/components/player/PlayerToast";
import type { SubtitleSize } from "@/components/player/subtitles/SubtitleOverlay";
import type { PlayerEvent, PlayerHandle, QualityLevel, SubtitleTrack } from "@/components/player/types";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useMediaCloseGuard } from "@/hooks/useMediaCloseGuard";
import { useResponsive } from "@/hooks/useResponsive";
import { GlassBackdrop, GlassLayer } from "@/src/ui/glass";
import { colors, font, ms } from "@/theme/bearoom";
import { absoluteFill } from "@/theme/styles/layout";
import { getSubtitleSize, setSubtitleSize } from "@/utils/prefs";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export interface NativePlayerViewProps {
  title: string;
  source: NativeSource;
  sidecarSubtitles?: SidecarSubtitle[];
  posterUrl?: string;
  /** Shown in the settings sheet's Source row. */
  sourceLabel: string;
  /** When Play was pressed (epoch ms) — the TTFF baseline; defaults to mount. */
  startedAt?: number;
  surfaceType?: "surfaceView" | "textureView";
  /** Put the video in a glass backdrop so the control bar blurs it (TextureView only). */
  glassOverVideo?: boolean;
  /** Dev HUD: TTFF, the last seek's landing error and the active tracks (test streams only). */
  devHud?: boolean;
  onClose: () => void;
  onOpenSource: () => void;
  /** Seconds to start at once the stream is ready (a switch keeps the position). */
  startAt?: number;
  /** Every player event, after the view has handled it (position, telemetry). */
  onPlayerEvent?: (e: PlayerEvent) => void;
  /** A fatal stream error: return true when the caller handles it (no error card). */
  onStreamError?: (message: string) => boolean;
  /** Languages from sibling streams, offered while the stream itself has at most one audio track. */
  audioChoices?: { options: QualityLevel[]; onPick: (label: string) => void };
  notice?: PlayerNotice | null;
  onNoticeDone?: () => void;
  /** "S1 · E3" under the title. */
  subtitle?: string;
  onNextEpisode?: () => void;
  /** Positions the viewer has really reached: none until this stream's start seek has landed. */
  onPosition?: (sec: number) => void;
  /** Wanted audio languages (ISO-639-1), most wanted first: picked once inside a multi-audio stream. */
  preferredAudio?: string[];
  /** Controlled fullscreen: the caller owns the screen orientation (a stream switch must not rotate the screen). */
  fullscreen?: boolean;
  onFullscreenChange?: (next: boolean) => void;
  /** The viewer's settings from the previous stream, applied to this one. */
  carry?: ViewerSettings;
  onViewerSettings?: (s: ViewerSettings) => void;
}

/** What a viewer set and expects to keep when the stream underneath changes. */
export interface ViewerSettings {
  rate: number;
  /** The picked subtitle's language; null = off. */
  subtitleLanguage: string | null;
  paused: boolean;
  subOffset: number;
}

export const DEFAULT_VIEWER: ViewerSettings = { rate: 1, subtitleLanguage: null, paused: false, subOffset: 0 };

const noop = () => {};

interface Hud {
  ttffMs?: number;
  seekErrSec?: number;
}

export function hudText(hud: Hud, chips: ControlChips, surface: string): string {
  const ttff = hud.ttffMs != null ? `TTFF ${(hud.ttffMs / 1000).toFixed(2)} s` : "TTFF –";
  const seek = hud.seekErrSec != null ? `seek Δ ${hud.seekErrSec.toFixed(2)} s` : "seek Δ –";
  return [ttff, seek, chips.audio ?? "–", chips.subtitles ?? "no subs", chips.quality ?? "–", surface].join(" · ");
}

export function NativePlayerView({
  title,
  source,
  sidecarSubtitles,
  posterUrl,
  sourceLabel,
  startedAt,
  surfaceType = "surfaceView",
  glassOverVideo = false,
  devHud = false,
  onClose,
  onOpenSource,
  startAt,
  onPlayerEvent,
  onStreamError,
  audioChoices,
  notice,
  onNoticeDone,
  subtitle,
  onNextEpisode,
  onPosition,
  preferredAudio,
  fullscreen: fullscreenProp,
  onFullscreenChange,
  carry,
  onViewerSettings,
}: NativePlayerViewProps) {
  const playerRef = useRef<PlayerHandle>(null);
  const controlsRef = useRef<PlayerControlsHandle>(null);
  // TTFF baseline: the Play press, else when this view mounted (set in an effect — render stays pure).
  const t0 = useRef<number | null>(startedAt ?? null);
  const startAtRef = useRef(startAt);
  const startDone = useRef(false);
  const onPlayerEventRef = useRef(onPlayerEvent);
  const onStreamErrorRef = useRef(onStreamError);
  const onPositionRef = useRef(onPosition);
  const onViewerSettingsRef = useRef(onViewerSettings);
  const preferredAudioRef = useRef(preferredAudio);
  useEffect(() => {
    startAtRef.current = startAt;
    onPlayerEventRef.current = onPlayerEvent;
    onStreamErrorRef.current = onStreamError;
    onPositionRef.current = onPosition;
    onViewerSettingsRef.current = onViewerSettings;
    preferredAudioRef.current = preferredAudio;
  }, [startAt, onPlayerEvent, onStreamError, onPosition, onViewerSettings, preferredAudio]);
  // Mount-time settings: this view lives for one stream, so later carry updates are for the next one.
  const [initial] = useState<ViewerSettings>(() => carry ?? DEFAULT_VIEWER);
  const viewer = useRef<ViewerSettings>(initial);
  const positionLive = useRef(false);
  const audioPicked = useRef(false);
  const subsCarried = useRef(initial.subtitleLanguage == null);
  const [frameShown, setFrameShown] = useState(false);
  const firstFrameSeen = useRef(false);
  const [coverOpacity] = useState(() => new Animated.Value(1));
  const [coverGone, setCoverGone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<string | null>(null);
  const [audios, setAudios] = useState<QualityLevel[]>([]);
  const [qualities, setQualities] = useState<QualityLevel[]>([]);
  const [qualityNow, setQualityNow] = useState<string | undefined>(undefined);
  const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);
  const [rate, setRate] = useState(initial.rate);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [subOffset, setSubOffset] = useState(initial.subOffset);
  const [subSize, setSubSize] = useState<SubtitleSize>(getSubtitleSize);
  const [controlsShown, setControlsShown] = useState(true);
  const [ownFullscreen, setOwnFullscreen] = useState(false);
  const controlled = fullscreenProp != null;
  const fullscreen = controlled ? fullscreenProp : ownFullscreen;
  const [hud, setHud] = useState<Hud>({});
  const pos = useRef(0);
  const paused = useRef(true);
  const resumeWhenOnline = useRef<{ play: boolean } | null>(null);
  const offline = useConnectivity();
  const { isLandscapeMobile } = useResponsive();
  const immersive = fullscreen || isLandscapeMobile;

  useEffect(() => {
    t0.current ??= Date.now();
    if (initial.rate !== 1) playerRef.current?.setRate(initial.rate);
  }, [initial.rate]);

  const tellViewer = useCallback((patch: Partial<ViewerSettings>) => {
    viewer.current = { ...viewer.current, ...patch };
    onViewerSettingsRef.current?.(viewer.current);
  }, []);
  useEffect(() => {
    errorRef.current = error;
  }, [error]);

  const onEvent = useCallback((e: PlayerEvent) => {
    if (e.event === "ready" && !startDone.current) {
      startDone.current = true;
      const at = startAtRef.current;
      const landed = at && at > 1 ? playerRef.current?.seek(at) : undefined;
      // Until the start seek lands, the player reports 0 s: those positions aren't the viewer's.
      if (landed) {
        void landed.then(
          () => (positionLive.current = true),
          () => (positionLive.current = true),
        );
      } else positionLive.current = true;
    }
    if (e.event === "tracks" && !audioPicked.current) {
      const audio = (e.tracks ?? []).filter((t) => t.kind === "audio");
      if (audio.length) {
        audioPicked.current = true;
        const want = (preferredAudioRef.current ?? []).map((l) => audio.find((t) => t.language === l)).find(Boolean);
        if (audio.length > 1 && want && !want.selected) playerRef.current?.setAudio(want.label);
      }
    }
    if (e.event === "subs" && !subsCarried.current) {
      const row = (e.subs ?? []).find((t) => t.language === viewer.current.subtitleLanguage);
      if (row) {
        subsCarried.current = true;
        playerRef.current?.setSubtitle(row.id);
      }
    }
    if (e.event === "audio") {
      setAudios(e.audios ?? []);
    } else if (e.event === "quality") {
      setQualities(e.qualities ?? []);
    } else if (e.event === "subs") {
      setSubtitles(e.subs ?? []);
    } else if (e.event !== "tracks") {
      if (Number.isFinite(e.currentTime)) {
        pos.current = e.currentTime;
        if (positionLive.current) onPositionRef.current?.(e.currentTime);
      }
      paused.current = e.paused;
      controlsRef.current?.setPlayback({
        currentTime: e.currentTime,
        duration: e.duration,
        paused: e.paused,
        readyState: e.readyState,
        bufferedTime: e.bufferedAheadSec != null ? e.currentTime + e.bufferedAheadSec : undefined,
      });
    }
    onPlayerEventRef.current?.(e);
  }, []);

  // F8: losing the network pauses (the app-wide banner explains why); getting it back resumes from the same
  // position — reloading first if the stream failed while offline.
  useEffect(() => {
    if (offline) {
      if (!resumeWhenOnline.current) resumeWhenOnline.current = { play: !paused.current };
      playerRef.current?.pause();
      return;
    }
    const r = resumeWhenOnline.current;
    if (!r) return;
    resumeWhenOnline.current = null;
    if (errorRef.current) {
      setError(null);
      playerRef.current?.reload();
    }
    if (r.play) playerRef.current?.play();
  }, [offline]);

  const onFirstFrame = useCallback(() => {
    if (firstFrameSeen.current) return;
    firstFrameSeen.current = true;
    setFrameShown(true);
    setHud((h) => ({ ...h, ttffMs: Date.now() - (t0.current ?? Date.now()) }));
    Animated.timing(coverOpacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setCoverGone(true);
    });
  }, [coverOpacity]);

  const retry = useCallback(() => {
    setError(null);
    playerRef.current?.reload();
    playerRef.current?.play();
  }, []);

  const onFatal = useCallback((message: string) => {
    if (onStreamErrorRef.current?.(message)) return;
    setError(message);
  }, []);

  const seekTo = useCallback(
    (sec: number) => {
      void playerRef.current?.seek(sec).then((landed) => {
        if (devHud) setHud((h) => ({ ...h, seekErrSec: Math.abs(landed - sec) }));
      });
    },
    [devHud],
  );

  const toggleFullscreen = useCallback(() => {
    const next = !fullscreen;
    if (controlled) {
      onFullscreenChange?.(next);
      return;
    }
    setOwnFullscreen(next);
    (next ? ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE) : ScreenOrientation.unlockAsync()).catch(
      () => {},
    );
  }, [controlled, fullscreen, onFullscreenChange]);
  const controlledRef = useRef(controlled);
  useEffect(() => {
    controlledRef.current = controlled;
  }, [controlled]);
  useEffect(
    () => () => {
      if (!controlledRef.current) ScreenOrientation.unlockAsync().catch(() => {});
    },
    [],
  );

  // Hardware back leaves fullscreen first, then asks before closing.
  const beforeClose = useRef<() => boolean>(() => false);
  useEffect(() => {
    beforeClose.current = () => {
      if (!fullscreen) return false;
      toggleFullscreen();
      return true;
    };
  }, [fullscreen, toggleFullscreen]);
  const { requestClose } = useMediaCloseGuard({
    title: "Stop watching?",
    message: "This will close the player.",
    confirmLabel: "Close",
    onConfirm: onClose,
    beforeClose: () => beforeClose.current(),
  });

  // One sheet at a time: settings closes before the source sheet opens. iOS can't present a Modal while another is up
  // (or still sliding away), so there the source sheet waits for the settings sheet's onDismiss.
  const sourceAfterSettings = useRef(false);
  const openSourceFromSettings = useCallback(() => {
    setSettingsOpen(false);
    if (Platform.OS === "ios") sourceAfterSettings.current = true;
    else onOpenSource();
  }, [onOpenSource]);

  // Sibling streams stand in for audio tracks when the stream itself has at most one (spec §6.2 Language row).
  const siblingAudio = !!audioChoices && audios.length <= 1;
  const audioRows = siblingAudio && audioChoices ? audioChoices.options : audios;
  const chips = controlChips(audioRows, qualities, subtitles, qualityNow);
  const sidecarSelected = subtitles.some((s) => s.selected && s.id.startsWith("side:"));

  const video = (
    <NativePlayer
      ref={playerRef}
      source={source}
      sidecarSubtitles={sidecarSubtitles}
      surfaceType={surfaceType}
      subtitleOffsetSec={subOffset}
      subtitleSize={subSize}
      subtitlesLifted={controlsShown}
      autoPlay={!initial.paused}
      onPlayerEvent={onEvent}
      onFirstFrame={onFirstFrame}
      onFatalError={onFatal}
      onQualitySummary={setQualityNow}
      style={StyleSheet.absoluteFill}
    />
  );

  return (
    <>
      <StatusBar style="light" hidden={immersive} />
      <SafeAreaView style={styles.root} edges={immersive ? [] : ["top", "bottom", "left", "right"]}>
        <View style={immersive ? styles.playerFull : styles.player}>
          <GlassLayer>
            {glassOverVideo ? <GlassBackdrop style={StyleSheet.absoluteFill}>{video}</GlassBackdrop> : video}
            {!error ? (
              <PlayerControls
                ref={controlsRef}
                canControl
                roomPlaying={false}
                onPlay={() => {
                  tellViewer({ paused: false });
                  playerRef.current?.play();
                }}
                onPause={() => {
                  tellViewer({ paused: true });
                  playerRef.current?.pause();
                }}
                onSeekTo={seekTo}
                onSeekBy={(d) => seekTo(Math.max(0, pos.current + d))}
                onToggleFullscreen={isLandscapeMobile && !fullscreen ? undefined : toggleFullscreen}
                fullscreen={immersive}
                embedded={!immersive}
                title={title}
                // iOS can't present the "Stop watching?" alert over a sideways screen (BearAlert's Modal is
                // portrait-only), so a landscape back there closes directly.
                onBack={() => (fullscreen ? toggleFullscreen() : Platform.OS === "ios" && immersive ? onClose() : requestClose())}
                onOpenSettings={() => setSettingsOpen(true)}
                chips={chips}
                onVisibilityChange={setControlsShown}
                subtitle={subtitle}
                onNextEpisode={onNextEpisode}
              />
            ) : null}
            {!coverGone ? (
              <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: coverOpacity }]}>
                <PlayerLoadingCard posterUrl={posterUrl} status="Starting…" />
              </Animated.View>
            ) : null}
            {/* Above the loading cover, and held until the first frame so its 5 s are seen. */}
            <PlayerToast notice={frameShown ? (notice ?? null) : null} onDone={onNoticeDone ?? noop} />
            {error ? (
              <PlayerErrorCard
                title="Couldn’t play this stream"
                message={devHud ? error : "Check your connection and try again."}
                actions={[
                  { label: "Retry", icon: "refresh", kind: "primary", onPress: retry },
                  { label: "Try another source", kind: "ghost", onPress: onOpenSource },
                ]}
              />
            ) : null}
          </GlassLayer>
        </View>
        {!immersive ? (
          <View style={styles.info}>
            <Text style={styles.infoTitle} numberOfLines={2}>
              {title}
            </Text>
            <Text style={styles.infoSub}>{sourceLabel}</Text>
          </View>
        ) : null}
        {devHud ? (
          <Text accessibilityLabel="dev-hud" pointerEvents="none" style={[styles.hud, immersive && styles.hudImmersive]}>
            {hudText(hud, chips, surfaceType)}
          </Text>
        ) : null}
      </SafeAreaView>

      <PlayerSettingsSheet
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        canControl
        rate={rate}
        onSetRate={(r) => {
          setRate(r);
          tellViewer({ rate: r });
          playerRef.current?.setRate(r);
        }}
        qualities={qualities}
        onSetQuality={(label) => playerRef.current?.setQuality(label)}
        qualitySummary={qualityNow}
        audios={audioRows}
        onSetAudio={(label) => (siblingAudio && audioChoices ? audioChoices.onPick(label) : playerRef.current?.setAudio(label))}
        showAudio={audioRows.length > 1}
        showQuality={qualities.length > 1}
        subtitles={subtitles}
        onSetSubtitle={(id) => {
          subsCarried.current = true;
          tellViewer({ subtitleLanguage: id ? (subtitles.find((t) => t.id === id)?.language ?? null) : null });
          playerRef.current?.setSubtitle(id);
        }}
        subtitleAdjust={
          sidecarSelected
            ? {
                offsetSec: subOffset,
                size: subSize,
                onOffset: (o) => {
                  setSubOffset(o);
                  tellViewer({ subOffset: o });
                },
                onSize: (s) => {
                  setSubSize(s);
                  setSubtitleSize(s);
                },
              }
            : undefined
        }
        source={{ label: sourceLabel, onOpen: openSourceFromSettings }}
        onDismissed={() => {
          if (!sourceAfterSettings.current) return;
          sourceAfterSettings.current = false;
          onOpenSource();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  player: { width: "100%", aspectRatio: 16 / 9, backgroundColor: colors.playerBg },
  playerFull: { ...absoluteFill, backgroundColor: colors.playerBg },
  info: { padding: ms(16), gap: ms(4) },
  infoTitle: { color: colors.text, fontFamily: font.headline, fontSize: ms(18) },
  infoSub: { color: colors.textDim, fontFamily: font.body, fontSize: ms(13) },
  hud: {
    position: "absolute",
    left: ms(8),
    right: ms(8),
    bottom: ms(8),
    color: colors.honey,
    fontFamily: font.label,
    fontSize: ms(10),
  },
  // Fullscreen: next to the back button, clear of the control bar.
  hudImmersive: { top: ms(4), bottom: undefined, left: ms(64) },
});
