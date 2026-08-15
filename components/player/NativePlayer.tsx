/**
 * NativePlayer — the UNIVERSAL, provider-agnostic native player (`expo-video`).
 *
 * Drop-in for HijackPlayer: exposes the SAME `PlayerHandle` ref and emits the
 * SAME `PlayerEvent` stream, so `useParty`/`PartySyncEngine` drive it unchanged
 * (see docs/architecture/watch-party-sync.md "player contract").
 *
 * It is fed a already-resolved stream (`source`) by a per-provider resolver
 * (StreamResolverWebView for videasy). Quality / speed / audio(dub-in-manifest) /
 * subtitle(in-manifest) are handled NATIVELY off the `player` object (surfaced via
 * `onReady`); separate-stream DUB switches bubble up via `onRequestDub` → the
 * parent re-resolves → passes a new `source` → we `replaceAsync` + resume position.
 *
 * ⚠ Contract details baked in here:
 *  - Echo-suppression (~500ms) on programmatic play/pause/seek — NOT setRate — so
 *    the sync engine's own commands don't echo back as user actions.
 *  - expo-video has NO native `seeked` event → we emit it from our own seek().
 *  - timeUpdateEventInterval = 1 → map `timeUpdate` → `tick` (~1/s) for drift.
 */
import type { PlayerEvent, PlayerHandle } from "@/components/player/HijackPlayer";
import { useVideoPlayer, VideoView, type VideoPlayer, type VideoSource } from "expo-video";
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { StyleSheet, View } from "react-native";

export interface NativeSource {
  uri: string;
  headers?: Record<string, string>;
  contentType?: "hls" | "progressive";
}

export interface NativePlayerProps {
  /** Resolved stream from a provider resolver. null = nothing to play yet. */
  source: NativeSource | null;
  /** Resume position (seconds) for the FIRST load (watch-history / party anchor). */
  startAt?: number;
  /** Show ExoPlayer's own controls (solo/testing). Party uses custom controls. */
  nativeControls?: boolean;
  onPlayerEvent?: (e: PlayerEvent) => void;
  /** Surfaces the live `player` so custom controls can drive tracks/speed. */
  onReady?: (player: VideoPlayer) => void;
  onUnavailable?: (reason: string) => void;
}

export const NativePlayer = forwardRef<PlayerHandle, NativePlayerProps>(
  function NativePlayer(
    { source, startAt, nativeControls = false, onPlayerEvent, onReady, onUnavailable },
    ref,
  ) {
    const viewRef = useRef<VideoView>(null);
    const applyingUntil = useRef(0);
    const loadedOnce = useRef(false);

    const player = useVideoPlayer(null, (p) => {
      p.timeUpdateEventInterval = 1;
      p.preservesPitch = true; // keep pitch natural when speed != 1
    });

    const markApplying = () => {
      applyingUntil.current = Date.now() + 500;
    };
    const isApplying = () => Date.now() < applyingUntil.current;
    const emit = (
      event: PlayerEvent["event"],
      over?: Partial<PlayerEvent>,
    ) =>
      onPlayerEvent?.({
        event,
        currentTime: over?.currentTime ?? player.currentTime ?? 0,
        duration: over?.duration ?? player.duration ?? 0,
        paused: over?.paused ?? !player.playing,
      });

    // Load / swap source. A dub switch = parent passes a new source.uri → we
    // replaceAsync and resume at the position we were at (position preserved).
    useEffect(() => {
      if (!source?.uri) return;
      const resume = loadedOnce.current
        ? player.currentTime || 0
        : startAt && startAt > 5
          ? startAt
          : 0;
      const src: VideoSource = {
        uri: source.uri,
        headers: source.headers,
        contentType: source.contentType ?? "hls",
      };
      let cancelled = false;
      player
        .replaceAsync(src)
        .then(() => {
          if (cancelled) return;
          if (resume > 0) player.currentTime = resume;
          player.play();
          loadedOnce.current = true;
        })
        .catch((e) => {
          if (!cancelled) onUnavailable?.("replace-failed:" + String(e).slice(0, 50));
        });
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [source?.uri]);

    // expo-video events → PlayerEvent stream (with echo-suppression)
    useEffect(() => {
      const subs = [
        player.addListener("statusChange", ({ status }) => {
          if (status === "readyToPlay") {
            emit("ready");
            onReady?.(player);
          } else if (status === "error") {
            onUnavailable?.("status-error");
          }
        }),
        player.addListener("playingChange", ({ isPlaying }) => {
          if (isApplying()) return; // our own command — don't echo as a user action
          emit(isPlaying ? "play" : "pause");
        }),
        player.addListener("timeUpdate", ({ currentTime }) =>
          emit("tick", { currentTime }),
        ),
        player.addListener("playToEnd", () => emit("ended")),
      ];
      return () => subs.forEach((s) => s?.remove?.());
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [player]);

    useImperativeHandle(
      ref,
      (): PlayerHandle => ({
        play() {
          markApplying();
          player.play();
        },
        pause() {
          markApplying();
          player.pause();
        },
        seek(seconds: number) {
          markApplying();
          const t = Math.max(0, seconds);
          player.currentTime = t;
          emit("seeked", { currentTime: t }); // no native seeked event → synthesize
        },
        setRate(rate: number) {
          player.playbackRate = rate; // NOT echo-suppressed (engine nudges constantly)
        },
        fullscreen() {
          viewRef.current?.enterFullscreen().catch(() => {});
        },
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [player],
    );

    return (
      <View style={styles.container}>
        <VideoView
          ref={viewRef}
          player={player}
          style={styles.video}
          contentFit="contain"
          nativeControls={nativeControls}
          allowsFullscreen
          allowsPictureInPicture
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  video: { flex: 1, backgroundColor: "#000" },
});

export default NativePlayer;
