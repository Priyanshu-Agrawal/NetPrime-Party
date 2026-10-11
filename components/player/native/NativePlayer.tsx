/**
 * NativePlayer — expo-video behind the PlayerHandle contract (spec §5.2, §6.2). Emits the same PlayerEvents as the
 * WebView bridge; `seeked` and `buffering` are synthesised by NativeEventMachine. Manual quality caps the adaptive
 * selection (modules/bearoom-player), so demuxed audio and subtitles keep playing. Sidecar subtitles are drawn by
 * our own overlay, because expo-video sources have no sidecar field.
 */
import { qualityCapAvailable, setQualityCap } from "@/modules/bearoom-player";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { SubtitleOverlay, useSidecarCues, type PlaybackClock, type SubtitleSize } from "../subtitles/SubtitleOverlay";
import type { PlayerEvent, PlayerHandle, SubtitleTrack } from "../types";
import { trackLabels } from "./languages";
import { NativeEventMachine, SEEK_TIMEOUT_MS, type NativeStatus } from "./nativeEvents";
import {
  AUTO,
  audioLevels,
  capFor,
  inStreamSubtitles,
  mediaTracks,
  nativeCapabilities,
  qualityLevels,
  qualitySummary,
  type NAudio,
  type NText,
  type NVideo,
} from "./tracks";

export interface NativeSource {
  uri: string;
  headers?: Record<string, string>;
  contentType?: "auto" | "hls" | "dash" | "progressive";
}

export interface SidecarSubtitle {
  id: string;
  url: string;
  label: string;
  language?: string;
  headers?: Record<string, string>;
}

export interface NativePlayerProps {
  source: NativeSource;
  sidecarSubtitles?: SidecarSubtitle[];
  autoPlay?: boolean;
  /** Seconds between ticks: 0.5 solo; the party will use 0.25 (spec §6.2). */
  tickInterval?: number;
  surfaceType?: "surfaceView" | "textureView";
  subtitleOffsetSec?: number;
  subtitleSize?: SubtitleSize;
  /** Raise sidecar subtitles above the control bar while it shows. */
  subtitlesLifted?: boolean;
  onPlayerEvent: (e: PlayerEvent) => void;
  onFirstFrame?: () => void;
  onFatalError?: (message: string) => void;
  /** "Auto (576p)" / "720p" — the value shown on the quality chip and row. */
  onQualitySummary?: (summary: string) => void;
  style?: StyleProp<ViewStyle>;
}

const SIDECAR = "side:";
const IN_STREAM = "in:";

interface Tracks {
  audio: NAudio[];
  audioSel: NAudio | null;
  text: NText[];
  textSel: NText | null;
  video: NVideo[];
  videoSel: NVideo | null;
}

export const NativePlayer = forwardRef<PlayerHandle, NativePlayerProps>(function NativePlayer(props, ref) {
  const {
    source,
    sidecarSubtitles = [],
    autoPlay = true,
    tickInterval = 0.5,
    surfaceType = "surfaceView",
    subtitleOffsetSec = 0,
    subtitleSize = "m",
    subtitlesLifted = false,
    onFirstFrame,
    style,
  } = props;
  const latest = useRef(props);
  latest.current = props;
  const emit = useCallback((e: PlayerEvent) => latest.current.onPlayerEvent(e), []);
  const machine = useMemo(() => new NativeEventMachine(emit), [emit]);

  const videoSource = useMemo(
    () => ({ uri: source.uri, headers: source.headers, contentType: source.contentType ?? "auto" }),
    [source.uri, source.headers, source.contentType],
  );
  const player = useVideoPlayer(videoSource, (p) => {
    p.timeUpdateEventInterval = tickInterval;
    p.preservesPitch = true;
    p.keepScreenOnWhilePlaying = true;
  });

  const tracks = useRef<Tracks>({ audio: [], audioSel: null, text: [], textSel: null, video: [], videoSel: null });
  const cap = useRef<ReturnType<typeof capFor>>(null);
  const rate = useRef(1);
  const resume = useRef<{ at: number; play: boolean } | null>(null);
  const [sidecarId, setSidecarId] = useState<string | null>(null);
  const sidecarRef = useRef<string | null>(null);
  sidecarRef.current = sidecarId;
  const [clock, setClock] = useState<PlaybackClock>({ time: 0, at: Date.now(), playing: false, rate: 1 });

  const subtitleRows = useCallback(
    (): SubtitleTrack[] => [
      ...inStreamSubtitles(tracks.current.text, sidecarRef.current ? null : tracks.current.textSel),
      ...sidecarSubtitles.map((s) => ({
        id: SIDECAR + s.id,
        label: s.label,
        language: s.language ?? "",
        selected: sidecarRef.current === s.id,
      })),
    ],
    [sidecarSubtitles],
  );

  const publishTracks = useCallback(() => {
    const t = tracks.current;
    const base = { currentTime: machine.position, duration: player.duration || 0, paused: machine.paused };
    emit({ ...base, event: "tracks", tracks: mediaTracks(t.audio, t.audioSel, t.text, t.textSel) });
    emit({ ...base, event: "audio", audios: audioLevels(t.audio, t.audioSel) });
    emit({ ...base, event: "quality", qualities: qualityCapAvailable ? qualityLevels(t.video, cap.current?.tier ?? null) : [] });
    emit({ ...base, event: "subs", subs: subtitleRows() });
    latest.current.onQualitySummary?.(qualitySummary(cap.current?.tier ?? null, t.videoSel));
  }, [emit, machine, player, subtitleRows]);

  const tickClock = useCallback(
    (time: number) => {
      if (sidecarRef.current) setClock({ time, at: Date.now(), playing: player.playing, rate: rate.current });
    },
    [player],
  );

  useEffect(() => {
    const subs = [
      player.addListener("statusChange", ({ status, error }) => {
        machine.onStatus(status as NativeStatus, player.duration);
        if (status === "error") latest.current.onFatalError?.(error?.message ?? "Playback failed");
        const r = resume.current;
        if (status === "readyToPlay" && r) {
          resume.current = null;
          if (r.at > 1) player.currentTime = r.at;
          if (r.play) player.play();
        }
      }),
      player.addListener("playingChange", ({ isPlaying }) => {
        machine.onPlaying(isPlaying);
        tickClock(machine.position);
      }),
      player.addListener("timeUpdate", ({ currentTime, bufferedPosition }) => {
        machine.onTime(currentTime, bufferedPosition);
        tickClock(currentTime);
      }),
      player.addListener("playToEnd", () => machine.onEnded()),
      player.addListener("sourceLoad", (e) => {
        machine.onDuration(e.duration);
        tracks.current = {
          audio: e.availableAudioTracks,
          text: e.availableSubtitleTracks,
          video: e.availableVideoTracks,
          audioSel: player.audioTrack,
          textSel: player.subtitleTrack,
          videoSel: player.videoTrack,
        };
        // A reload makes a new item, which drops the iOS cap.
        if (cap.current) setQualityCap(player, cap.current);
        publishTracks();
      }),
      player.addListener("availableAudioTracksChange", ({ availableAudioTracks }) => {
        tracks.current.audio = availableAudioTracks;
        publishTracks();
      }),
      player.addListener("audioTrackChange", ({ audioTrack }) => {
        tracks.current.audioSel = audioTrack;
        publishTracks();
      }),
      player.addListener("availableSubtitleTracksChange", ({ availableSubtitleTracks }) => {
        tracks.current.text = availableSubtitleTracks;
        publishTracks();
      }),
      player.addListener("subtitleTrackChange", ({ subtitleTrack }) => {
        tracks.current.textSel = subtitleTrack;
        publishTracks();
      }),
      player.addListener("videoTrackChange", ({ videoTrack }) => {
        tracks.current.videoSel = videoTrack;
        publishTracks();
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [player, machine, publishTracks, tickClock]);

  useEffect(() => {
    if (!autoPlay) return;
    machine.setIntent(true);
    player.play();
  }, [autoPlay, machine, player]);

  // A sidecar pick changes the subtitle rows and starts the overlay's clock.
  useEffect(() => {
    publishTracks();
    if (sidecarId) setClock({ time: machine.position, at: Date.now(), playing: player.playing, rate: rate.current });
  }, [sidecarId, publishTracks, machine, player]);

  useImperativeHandle(
    ref,
    (): PlayerHandle => ({
      play: () => {
        machine.setIntent(true);
        player.play();
      },
      pause: () => {
        machine.setIntent(false);
        player.pause();
      },
      seek: (seconds) => {
        const landed = machine.beginSeek(seconds);
        player.currentTime = Math.max(0, seconds);
        const timer = setTimeout(() => machine.expireSeek(), SEEK_TIMEOUT_MS + 50);
        return landed.finally(() => clearTimeout(timer));
      },
      setRate: (r) => {
        rate.current = r;
        player.playbackRate = r;
        tickClock(machine.position);
      },
      fullscreen: () => {},
      readQuality: publishTracks,
      readAudio: publishTracks,
      setQuality: (label) => {
        cap.current = label === AUTO ? null : capFor(label);
        setQualityCap(player, cap.current ? { maxWidth: cap.current.maxWidth, maxHeight: cap.current.maxHeight } : null);
        publishTracks();
      },
      setAudio: (label) => {
        const i = trackLabels(tracks.current.audio).indexOf(label);
        if (i >= 0) player.audioTrack = tracks.current.audio[i];
      },
      setSubtitle: (id) => {
        if (id?.startsWith(SIDECAR)) {
          player.subtitleTrack = null;
          setSidecarId(id.slice(SIDECAR.length));
          return;
        }
        setSidecarId(null);
        const i = id?.startsWith(IN_STREAM) ? Number(id.slice(IN_STREAM.length)) : -1;
        player.subtitleTrack = i >= 0 ? tracks.current.text[i] ?? null : null;
      },
      reload: () => {
        resume.current = { at: machine.position, play: !machine.paused };
        void player.replaceAsync(videoSource);
      },
      getCapabilities: () => nativeCapabilities(tracks.current, sidecarSubtitles.length, qualityCapAvailable),
      getTracks: () => {
        const t = tracks.current;
        return mediaTracks(t.audio, t.audioSel, t.text, t.textSel);
      },
    }),
    [machine, player, publishTracks, sidecarSubtitles.length, tickClock, videoSource],
  );

  const cues = useSidecarCues(sidecarSubtitles.find((s) => s.id === sidecarId));

  return (
    <View style={[styles.root, style]}>
      <VideoView
        player={player}
        nativeControls={false}
        contentFit="contain"
        surfaceType={surfaceType}
        allowsPictureInPicture={false}
        onFirstFrameRender={onFirstFrame}
        style={StyleSheet.absoluteFill}
      />
      {sidecarId ? (
        <View testID="subtitle-overlay-host" pointerEvents="none" style={StyleSheet.absoluteFill}>
          <SubtitleOverlay cues={cues} clock={clock} offsetSec={subtitleOffsetSec} size={subtitleSize} lifted={subtitlesLifted} />
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
});
