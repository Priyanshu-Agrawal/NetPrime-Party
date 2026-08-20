/**
 * HijackPlayer — an embed WebView for ONE hijackable provider, with an injected
 * control + event bridge so the app can BOTH observe the player (play/pause/
 * seek/time) AND drive it directly on the <video> element. This is what powers
 * watch-party sync; solo playback uses a plain embed instead (no control needed).
 *
 * The bridge WALKS SAME-ORIGIN IFRAMES to find the <video>, so it works whether
 * the provider renders it in the top document or a same-origin embed iframe.
 * Which providers are controllable is recorded in hijackCapabilities; the party
 * only ever mounts this for a provider whose `hijack.supported` is true.
 */
import { colors } from "@/theme/bearoom";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import WebView from "react-native-webview";
import { subscribeRemoteCommands } from "./backgroundPlayback";
import { getCachedScript } from "@/src/scripts/bridgeCache";
import { getAutoplayNext } from "@/utils/prefs";
import {
  buildEmbedUrl,
  getProvider,
  isAllowedTopNav,
  providerHosts,
  type MediaRef,
} from "./providerRegistry";

export type PlayerEventType =
  | "ready"
  | "play"
  | "pause"
  | "seeking"
  | "seeked"
  | "ended"
  | "waiting"
  | "playing"
  | "canplay"
  | "tick"
  | "enterfullscreen"
  | "exitfullscreen"
  | "quality"
  | "audio"
  | "gesture"; // first user interaction inside the WebView (play-intent signal)

/** A fatal, main-frame playback failure surfaced to the host for fallback. */
export interface FatalError {
  kind: "http_error" | "render_crash";
  statusCode?: number;
  description?: string;
}

export interface QualityLevel {
  /** Clean label — "1080p"/"Auto" for quality, "Hindi"/"Original" for audio/dub. */
  label: string;
  active: boolean;
}

export interface PlayerEvent {
  event: PlayerEventType;
  currentTime: number;
  duration: number;
  paused: boolean;
  /** HTMLMediaElement.readyState. <3 while playing ⇒ the stream stalled/buffering
   *  (segment starvation) — drives the buffering spinner. */
  readyState?: number;
  /** Only on a "quality" event — the provider's available quality levels. */
  qualities?: QualityLevel[];
  /** Only on an "audio" event — the provider's available audio/dub tracks. */
  audios?: QualityLevel[];
}

export interface PlayerHandle {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setRate(rate: number): void;
  /** Ask the provider's <video> to enter native HTML5 fullscreen. */
  fullscreen(): void;
  /** Read the provider's quality levels → emits a "quality" PlayerEvent. */
  readQuality(): void;
  /** Switch quality by label (drives videasy's DOM via pointer-dispatch). */
  setQuality(label: string): void;
  /** Read audio/dub tracks → emits an "audio" PlayerEvent. */
  readAudio(): void;
  /** Switch audio/dub by language label (per-device, not synced across the room). */
  setAudio(label: string): void;
}

interface Props extends MediaRef {
  /** The (hijackable) provider id from providers.json to play + control. */
  providerId: string;
  /** Fires for every player event/heartbeat coming from the injected bridge. */
  onPlayerEvent?: (e: PlayerEvent) => void;
  /** Fires once the bridge binds a <video> (provider is controllable). */
  onBound?: () => void;
  /** Fires if the bridge never bound a <video> (provider not controllable here). */
  onBindFailed?: () => void;
  /** Fires on a fatal MAIN-FRAME failure (HTTP 4xx/5xx, DNS, render crash) — the
   *  host surfaces the fallback. Sub-resource (ad/tracker) errors are filtered out. */
  onFatalError?: (info: FatalError) => void;
  /** Non-controlling guest → hide the provider's seek bar / ±10s / play-pause
   *  (the host drives the timeline). Reactively toggled. */
  hideTransportControls?: boolean;
  /** Take over the control surface: hide ALL videasy chrome (we render our own
   *  overlay). Restored automatically in HTML5 fullscreen. */
  nativeControls?: boolean;
  /** Party embed (autoplay-off so members sync) vs. plain solo embed. Default true. */
  party?: boolean;
}

/** If no <video> binds within this window, show a soft "still trying" banner
 *  (we DON'T unmount — the finder keeps polling, so a slow provider still binds). */
const BIND_TIMEOUT_MS = 30000;

// The injection bridge is no longer bundled in the binary — it is served OTA
// (worker /scripts) and cached in MMKV. Source of truth: src/scripts/legacy-videasy.ts
// (uploaded via scripts/upload-bridge.ts). Injected per-provider in the WebView below.

export const HijackPlayer = forwardRef<PlayerHandle, Props>(
  (
    {
      providerId,
      tmdbId,
      type,
      season,
      episode,
      startAt,
      onPlayerEvent,
      onBound,
      onBindFailed,
      onFatalError,
      hideTransportControls,
      nativeControls,
      party = true,
    },
    ref,
  ) => {
    const webRef = useRef<WebView>(null);
    const boundRef = useRef(false);
    const [bound, setBound] = useState(false);
    const [slow, setSlow] = useState(false);
    const provider = getProvider(providerId);

    const cmd = useCallback((c: Record<string, unknown>) => {
      webRef.current?.injectJavaScript(
        `window.__vlCmd && window.__vlCmd(${JSON.stringify(c)}); true;`,
      );
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        play: () => cmd({ action: "play" }),
        pause: () => cmd({ action: "pause" }),
        seek: (seconds: number) => cmd({ action: "seek", time: seconds }),
        setRate: (rate: number) => cmd({ action: "rate", rate }),
        fullscreen: () => cmd({ action: "fullscreen" }),
        readQuality: () => cmd({ action: "readQuality" }),
        setQuality: (label: string) => cmd({ action: "setQuality", label }),
        readAudio: () => cmd({ action: "readAudio" }),
        setAudio: (label: string) => cmd({ action: "setAudio", label }),
      }),
      [cmd],
    );

    // Native Hub also injects __soloCmd; this JS path matches solo player.tsx.
    useEffect(() => {
      if (Platform.OS !== "android") return;
      return subscribeRemoteCommands((remote) => {
        const payload =
          remote.action === "seek"
            ? { action: "seek", time: (remote.positionMs ?? 0) / 1000 }
            : { action: remote.action };
        webRef.current?.injectJavaScript(
          `try{window.__soloCmd(${JSON.stringify(payload)});}catch(e){} true;`,
        );
      });
    }, []);

    // Non-controlling guest → hide the provider's transport controls. Re-applied
    // when `bound` flips so it lands even if the prop was set before the bridge
    // loaded (an injectJavaScript before __vlSetGuest exists is a harmless no-op).
    useEffect(() => {
      webRef.current?.injectJavaScript(
        `window.__vlSetGuest && window.__vlSetGuest(${hideTransportControls ? "true" : "false"}); true;`,
      );
    }, [hideTransportControls, bound]);

    // Native-controls takeover: hide ALL videasy chrome (we render our own overlay).
    useEffect(() => {
      webRef.current?.injectJavaScript(
        `window.__vlChromeOff && window.__vlChromeOff(${nativeControls ? "true" : "false"}); true;`,
      );
    }, [nativeControls, bound]);

    useEffect(() => {
      boundRef.current = false;
      setBound(false);
      setSlow(false);
      const t = setTimeout(() => {
        if (!boundRef.current) {
          setSlow(true);
          onBindFailed?.();
        }
      }, BIND_TIMEOUT_MS);
      return () => clearTimeout(t);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [providerId, tmdbId, type, season, episode]);

    const handleMessage = useCallback(
      (raw: string) => {
        let e: PlayerEvent;
        try {
          e = JSON.parse(raw) as PlayerEvent;
        } catch {
          return;
        }
        if (e.event === "ready" && !boundRef.current) {
          boundRef.current = true;
          setBound(true);
          setSlow(false);
          onBound?.();
        }
        onPlayerEvent?.(e);
      },
      [onPlayerEvent, onBound],
    );

    if (!provider) {
      return (
        <View style={[styles.web, styles.center]}>
          <Text style={styles.msg}>Unknown provider “{providerId}”.</Text>
        </View>
      );
    }

    const hosts = providerHosts(provider);
    const uri = buildEmbedUrl(
      provider,
      { tmdbId, type, season, episode, startAt },
      { party, autoplayNext: getAutoplayNext() },
    );

    return (
      <View style={styles.web}>
        <WebView
          key={`${providerId}:${uri}`}
          ref={webRef}
          style={styles.web}
          source={{ uri }}
          javaScriptEnabled
          allowsFullscreenVideo
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          startInLoadingState
          renderLoading={() => (
            <View style={[styles.web, styles.center]}>
              <ActivityIndicator color={colors.white} />
              <Text style={styles.msg}>Loading {provider.name}…</Text>
            </View>
          )}
          setSupportMultipleWindows={false}
          onOpenWindow={() => {
            /* swallow popups */
          }}
          onShouldStartLoadWithRequest={(req) => isAllowedTopNav(hosts, req)}
          injectedJavaScriptBeforeContentLoaded={getCachedScript(providerId) ?? ""}
          onMessage={(ev) => handleMessage(ev.nativeEvent.data)}
          // MAIN-FRAME failures only. Provider pages throw constant sub-resource
          // 404s (ads/trackers); we compare the errored URL to the embed URL so
          // those never trigger a fallback.
          onError={(ev) => {
            const n = ev.nativeEvent;
            if (!n.url || n.url === uri) {
              onFatalError?.({ kind: "http_error", description: n.description });
            }
          }}
          onHttpError={(ev) => {
            const n = ev.nativeEvent;
            if (n.url === uri && n.statusCode >= 400) {
              onFatalError?.({ kind: "http_error", statusCode: n.statusCode });
            }
          }}
          onRenderProcessGone={() => onFatalError?.({ kind: "render_crash" })}
          onContentProcessDidTerminate={() => onFatalError?.({ kind: "render_crash" })}
        />
        {/* Slow to bind — keep the WebView mounted (finder keeps polling), just warn. */}
        {!bound && slow && (
          <View style={styles.banner} pointerEvents="none">
            <Text style={styles.bannerText}>
              Still syncing {provider.name}… if it doesn’t start, try another server.
            </Text>
          </View>
        )}
      </View>
    );
  },
);

HijackPlayer.displayName = "HijackPlayer";

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: colors.playerBg },
  center: { alignItems: "center", justifyContent: "center", gap: 10 },
  msg: { color: colors.textDim, fontSize: 14, paddingHorizontal: 24, textAlign: "center" },
  banner: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.bannerBg,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  bannerText: { color: colors.onHoney, fontSize: 12, textAlign: "center", fontWeight: "600" },
});

export default HijackPlayer;
