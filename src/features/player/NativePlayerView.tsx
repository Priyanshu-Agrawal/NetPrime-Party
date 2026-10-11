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
import { Animated, StyleSheet, Text, View } from "react-native";
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
}

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
}: NativePlayerViewProps) {
  const playerRef = useRef<PlayerHandle>(null);
  const controlsRef = useRef<PlayerControlsHandle>(null);
  // TTFF baseline: the Play press, else when this view mounted (set in an effect — render stays pure).
  const t0 = useRef<number | null>(startedAt ?? null);
  const firstFrameSeen = useRef(false);
  const [coverOpacity] = useState(() => new Animated.Value(1));
  const [coverGone, setCoverGone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<string | null>(null);
  const [audios, setAudios] = useState<QualityLevel[]>([]);
  const [qualities, setQualities] = useState<QualityLevel[]>([]);
  const [qualityNow, setQualityNow] = useState<string | undefined>(undefined);
  const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);
  const [rate, setRate] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [subOffset, setSubOffset] = useState(0);
  const [subSize, setSubSize] = useState<SubtitleSize>(getSubtitleSize);
  const [controlsShown, setControlsShown] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [hud, setHud] = useState<Hud>({});
  const pos = useRef(0);
  const paused = useRef(true);
  const resumeWhenOnline = useRef<{ play: boolean } | null>(null);
  const offline = useConnectivity();
  const { isLandscapeMobile } = useResponsive();
  const immersive = fullscreen || isLandscapeMobile;

  useEffect(() => {
    t0.current ??= Date.now();
  }, []);
  useEffect(() => {
    errorRef.current = error;
  }, [error]);

  const onEvent = useCallback((e: PlayerEvent) => {
    if (e.event === "audio") {
      setAudios(e.audios ?? []);
    } else if (e.event === "quality") {
      setQualities(e.qualities ?? []);
    } else if (e.event === "subs") {
      setSubtitles(e.subs ?? []);
    } else if (e.event !== "tracks") {
      if (Number.isFinite(e.currentTime)) pos.current = e.currentTime;
      paused.current = e.paused;
      controlsRef.current?.setPlayback({
        currentTime: e.currentTime,
        duration: e.duration,
        paused: e.paused,
        readyState: e.readyState,
        bufferedTime: e.bufferedAheadSec != null ? e.currentTime + e.bufferedAheadSec : undefined,
      });
    }
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
    setFullscreen(next);
    (next ? ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE) : ScreenOrientation.unlockAsync()).catch(
      () => {},
    );
  }, [fullscreen]);
  useEffect(
    () => () => {
      ScreenOrientation.unlockAsync().catch(() => {});
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

  const chips = controlChips(audios, qualities, subtitles, qualityNow);
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
      onPlayerEvent={onEvent}
      onFirstFrame={onFirstFrame}
      onFatalError={setError}
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
                onPlay={() => playerRef.current?.play()}
                onPause={() => playerRef.current?.pause()}
                onSeekTo={seekTo}
                onSeekBy={(d) => seekTo(Math.max(0, pos.current + d))}
                onToggleFullscreen={isLandscapeMobile && !fullscreen ? undefined : toggleFullscreen}
                fullscreen={immersive}
                embedded={!immersive}
                title={title}
                onBack={() => (fullscreen ? toggleFullscreen() : requestClose())}
                onOpenSettings={() => setSettingsOpen(true)}
                chips={chips}
                onVisibilityChange={setControlsShown}
              />
            ) : null}
            {!coverGone ? (
              <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: coverOpacity }]}>
                <PlayerLoadingCard posterUrl={posterUrl} status="Starting…" />
              </Animated.View>
            ) : null}
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
          <Text accessibilityLabel="dev-hud" pointerEvents="none" style={styles.hud}>
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
          playerRef.current?.setRate(r);
        }}
        qualities={qualities}
        onSetQuality={(label) => playerRef.current?.setQuality(label)}
        qualitySummary={qualityNow}
        audios={audios}
        onSetAudio={(label) => playerRef.current?.setAudio(label)}
        showAudio={audios.length > 1}
        showQuality={qualities.length > 1}
        subtitles={subtitles}
        onSetSubtitle={(id) => playerRef.current?.setSubtitle(id)}
        subtitleAdjust={
          sidecarSelected
            ? {
                offsetSec: subOffset,
                size: subSize,
                onOffset: setSubOffset,
                onSize: (s) => {
                  setSubSize(s);
                  setSubtitleSize(s);
                },
              }
            : undefined
        }
        source={{ label: sourceLabel, onOpen: onOpenSource }}
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
});
