/**
 * Web-compatible player embed for solo & watch-party playback.
 *
 * Implements the exact same PlayerHandle & PlayerEvent interface as native,
 * rendering a responsive, sandboxed iframe with fullscreen and postMessage bridge support.
 */
import { colors } from "@/theme/bearoom";
import { absoluteFill } from "@/theme/styles/layout";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import {
  buildEmbedUrl,
  getProvider,
  type MediaRef,
} from "./providerRegistry";
import { getAutoplayNext } from "@/utils/prefs";
import { hijackCapabilities } from "./capabilities";
import type { MediaTrack, PlayerCapabilities, PlayerEvent, PlayerHandle } from "./types";

export type { PlayerEvent, PlayerEventType, PlayerHandle, QualityLevel } from "./types";

interface Props extends MediaRef {
  providerId: string;
  onPlayerEvent?: (e: PlayerEvent) => void;
  onBound?: () => void;
  onBindFailed?: () => void;
  hideTransportControls?: boolean;
  nativeControls?: boolean;
  party?: boolean;
}

export const HijackPlayer = forwardRef<PlayerHandle, Props>(function HijackPlayer(
  {
    providerId,
    tmdbId,
    type,
    season,
    episode,
    startAt,
    party,
    onPlayerEvent,
    onBound,
    onBindFailed,
  },
  ref,
) {
  const [loading, setLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const provider = getProvider(providerId);
  const embedUrl = provider
    ? buildEmbedUrl(provider, { tmdbId, type, season, episode, startAt }, { party, autoplayNext: getAutoplayNext() })
    : "";

  // Handle iframe message events
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      try {
        // Only trust events from OUR embed iframe's window — an arbitrary page/tab
        // can otherwise postMessage a forged __BEAROOM_PLAYER_EVENT__ and drive playback.
        const frameWin = iframeRef.current?.contentWindow;
        if (frameWin && event.source !== frameWin) return;
        if (!event.data) return;
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data && data.__BEAROOM_PLAYER_EVENT__) {
          onPlayerEvent?.(data as PlayerEvent);
        }
      } catch {}
    };

    if (typeof window !== "undefined") {
      window.addEventListener("message", handleMessage);
      return () => window.removeEventListener("message", handleMessage);
    }
  }, [onPlayerEvent]);

  // Imperative handle
  useImperativeHandle(
    ref,
    () => ({
      play: () => {
        try {
          iframeRef.current?.contentWindow?.postMessage({ action: "play" }, "*");
        } catch {}
      },
      pause: () => {
        try {
          iframeRef.current?.contentWindow?.postMessage({ action: "pause" }, "*");
        } catch {}
      },
      seek: (seconds: number) => {
        try {
          iframeRef.current?.contentWindow?.postMessage({ action: "seek", time: seconds }, "*");
        } catch {}
        // The iframe can't report where it landed; resolve with the target.
        return Promise.resolve(seconds);
      },
      setRate: (rate: number) => {
        try {
          iframeRef.current?.contentWindow?.postMessage({ action: "rate", rate }, "*");
        } catch {}
      },
      fullscreen: () => {
        try {
          const el = iframeRef.current as any;
          if (el?.requestFullscreen) {
            el.requestFullscreen();
          } else if (el?.webkitRequestFullscreen) {
            el.webkitRequestFullscreen();
          } else if (el?.msRequestFullscreen) {
            el.msRequestFullscreen();
          }
        } catch {}
      },
      readQuality: () => {},
      setQuality: () => {},
      readAudio: () => {},
      setAudio: () => {},
      reload: () => {
        const f = iframeRef.current;
        if (f) f.src = f.src; // re-navigating the iframe is a full reload of the embed
      },
      // A browser reaches only same-origin frames — the Android rule.
      getCapabilities: (): PlayerCapabilities => hijackCapabilities(getProvider(providerId), "android"),
      getTracks: (): MediaTrack[] => [],
      // No bridge on the web twin, so no subtitle tracks to switch.
      setSubtitle: () => {},
    }),
    [providerId],
  );

  const handleLoad = useCallback(() => {
    setLoading(false);
    onBound?.();
    onPlayerEvent?.({
      event: "ready",
      currentTime: 0,
      duration: 0,
      paused: false,
    });
  }, [onBound, onPlayerEvent]);

  if (!provider || !embedUrl) {
    return (
      <View style={styles.errorBox}>
        <Text style={styles.errorText}>No embed available for provider &quot;{providerId}&quot;</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <iframe
        ref={iframeRef}
        src={embedUrl}
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          backgroundColor: colors.bg,
        }}
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope"
        allowFullScreen
        onLoad={handleLoad}
      />
      {loading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.honey} />
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    position: "relative",
    overflow: "hidden",
  },
  loadingOverlay: {
    ...absoluteFill,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  errorBox: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  errorText: {
    color: colors.textDim,
    fontSize: 14,
    textAlign: "center",
  },
});

export default HijackPlayer;
