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
import { Ionicons } from "@expo/vector-icons";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  AppState,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
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
  /** Force a fresh load — used to retry the same provider (e.g. re-picked from
   *  the source sheet after it failed), which otherwise wouldn't remount. */
  reload(): void;
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
  /** Fires on a fatal MAIN-FRAME failure (HTTP 4xx/5xx, DNS, render crash) — for
   *  telemetry. The branded error overlay + auto-retry are handled internally.
   *  Sub-resource (ad/tracker) errors are filtered out. */
  onFatalError?: (info: FatalError) => void;
  /** The error overlay's "Try another source" — host opens the provider picker
   *  (and excludes the failed one). */
  onSwitchSource?: () => void;
  /** Fires when the provider loads OK after a prior fatal error (manual/auto
   *  retry or reconnect succeeded) — host un-excludes it (failures are recoverable). */
  onRecovered?: () => void;
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
      onSwitchSource,
      onRecovered,
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

    // Branded error + recovery. On a fatal main-frame failure we cover the
    // WebView's raw "net::ERR" page with our own overlay (Retry / Try another
    // source) and auto-retry with backoff, so a transient network blip self-heals
    // WITHOUT a NetInfo dependency (which would force a native rebuild).
    const [fatalError, setFatalError] = useState<FatalError | null>(null);
    // A retry REMOUNTS the WebView (key bump) rather than reload()-ing it —
    // reload() is a no-op on a dead renderer (render_crash), which needs a fresh
    // instance.
    const [remountNonce, setRemountNonce] = useState(0);
    const retryAttemptRef = useRef(0);
    // Survives reloadNow()'s transient clear of `fatalError`, so a genuine recovery
    // still fires onRecovered. Set on error; consumed on the next SUCCESSFUL load.
    const hadErrorRef = useRef(false);
    // True once THIS load has errored. Android fires onLoad even AFTER onHttpError
    // for a 4xx/5xx body, so without this onLoad would mistake the error page for a
    // recovery (clear the overlay, cancel retries, falsely un-exclude). Reset at
    // onLoadStart.
    const erroredThisLoadRef = useRef(false);
    // Delayed retry-budget reset — only refresh the 3-try budget after a load has
    // stayed up briefly, so a load→crash loop keeps climbing toward the cap instead
    // of zeroing every cycle.
    const stableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const reloadNow = useCallback(() => {
      setBound(false);
      setSlow(false);
      boundRef.current = false;
      setFatalError(null);
      setRemountNonce((n) => n + 1); // remount the WebView → fresh renderer + load
    }, []);

    // Manual retry (button / foreground / re-pick) resets the auto-retry budget.
    const manualRetry = useCallback(() => {
      retryAttemptRef.current = 0;
      reloadNow();
    }, [reloadNow]);

    // Raise a fatal main-frame error: show the overlay + report telemetry once, and
    // cancel any pending stable-budget reset (this load did NOT stay up).
    const raiseFatal = useCallback(
      (info: FatalError) => {
        hadErrorRef.current = true;
        erroredThisLoadRef.current = true;
        if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
        setFatalError(info);
        onFatalError?.(info);
      },
      [onFatalError],
    );

    // "Try another source": the user is leaving this provider — stop auto-retrying
    // behind the picker and suppress onRecovered, so a background retry can't
    // silently reverse their choice (un-exclude the provider they just left).
    const switchSource = useCallback(() => {
      retryAttemptRef.current = 3; // exhaust the budget → no more auto-retries
      hadErrorRef.current = false; // a stray successful load won't fire onRecovered
      if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
      onSwitchSource?.();
    }, [onSwitchSource]);

    // A successful (re)load that did NOT error clears the overlay, schedules the
    // stable-budget reset, and fires onRecovered if we were recovering. Written as
    // a stable callback so the WebView onLoad/onLoadStart stay lean.
    const handleLoadEnd = useCallback(() => {
      if (erroredThisLoadRef.current) return; // this load was an error page, not a recovery
      setFatalError(null);
      if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
      stableTimerRef.current = setTimeout(() => {
        retryAttemptRef.current = 0; // budget refreshes only after ~8s stayed up
      }, 8000);
      if (hadErrorRef.current) {
        hadErrorRef.current = false;
        onRecovered?.();
      }
    }, [onRecovered]);

    // Bounded auto-retry while errored (5s, 10s, 15s). A persisting failure stops
    // after 3 tries and waits for the user; the budget accumulates across the
    // null→set cycles reloadNow() causes AND across a load→crash loop (it resets
    // only via handleLoadEnd's stable timer or a manual retry).
    useEffect(() => {
      if (!fatalError || retryAttemptRef.current >= 3) return;
      const t = setTimeout(() => {
        // Re-check the budget on fire: switchSource() (user tapped "Try another
        // source") sets it to 3 but can't cancel this already-scheduled timer, so
        // without this the abandoned provider would reload once behind the picker.
        if (retryAttemptRef.current >= 3) return;
        retryAttemptRef.current += 1;
        reloadNow();
      }, 5000 * (retryAttemptRef.current + 1));
      return () => clearTimeout(t);
    }, [fatalError, reloadNow]);

    // Returning to the foreground (e.g. the user just restored Wi-Fi) → retry —
    // unless the budget is spent (auto-retries exhausted, or the user left via
    // "Try another source", which sets it to 3).
    useEffect(() => {
      const sub = AppState.addEventListener("change", (s) => {
        if (s === "active" && fatalError && retryAttemptRef.current < 3) manualRetry();
      });
      return () => sub.remove();
    }, [fatalError, manualRetry]);

    // Clear the stable-budget timer on unmount.
    useEffect(
      () => () => {
        if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
      },
      [],
    );

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
        reload: () => manualRetry(),
      }),
      [cmd, manualRetry],
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

    // Bind detection + "still syncing" banner. Re-armed on media change AND every
    // remount (a retry bumps remountNonce), so a remounted WebView that loads but
    // never binds a <video> still surfaces the banner + fires onBindFailed.
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
    }, [providerId, tmdbId, type, season, episode, remountNonce]);

    // Recovery-state reset — ONLY on a real media/provider/episode change, NOT on a
    // retry remount (which must PRESERVE the auto-retry budget so the load→crash
    // cap still works). Drops a stale overlay / spent budget / pending onRecovered
    // carried from the previous episode.
    useEffect(() => {
      setFatalError(null);
      hadErrorRef.current = false;
      erroredThisLoadRef.current = false;
      retryAttemptRef.current = 0;
      if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
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
          key={`${providerId}:${uri}:${remountNonce}`}
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
          onLoadStart={() => {
            erroredThisLoadRef.current = false; // fresh load — clear the per-load error flag
          }}
          onLoad={handleLoadEnd}
          // MAIN-FRAME failures only. Provider pages throw constant sub-resource
          // 404s (ads/trackers); we compare the errored URL to the embed URL so
          // those never trigger the overlay/telemetry.
          onError={(ev) => {
            const n = ev.nativeEvent;
            if (!n.url || n.url === uri) raiseFatal({ kind: "http_error", description: n.description });
          }}
          onHttpError={(ev) => {
            const n = ev.nativeEvent;
            if (n.url === uri && n.statusCode >= 400) raiseFatal({ kind: "http_error", statusCode: n.statusCode });
          }}
          onRenderProcessGone={() => raiseFatal({ kind: "render_crash" })}
          onContentProcessDidTerminate={() => raiseFatal({ kind: "render_crash" })}
        />
        {/* Slow to bind — keep the WebView mounted (finder keeps polling), just warn. */}
        {!bound && slow && !fatalError && (
          <View style={styles.banner} pointerEvents="none">
            <Text style={styles.bannerText}>
              Still syncing {provider.name}… if it doesn’t start, try another server.
            </Text>
          </View>
        )}
        {/* Branded fatal-error overlay — covers the WebView's raw net::ERR page.
            No blur/elevation (video screen). Auto-retry runs behind it. */}
        {fatalError && (
          <View style={styles.errorOverlay}>
            <Ionicons name="cloud-offline-outline" size={46} color={colors.textDim} />
            <Text style={styles.errorTitle}>Couldn’t load {provider.name}</Text>
            <Text style={styles.errorSub} numberOfLines={2}>
              {fatalError.kind === "render_crash"
                ? "The player crashed unexpectedly."
                : fatalError.statusCode
                  ? `The source returned an error (${fatalError.statusCode}).`
                  : "Check your connection — we’ll keep retrying."}
            </Text>
            <View style={styles.errorBtns}>
              <TouchableOpacity onPress={manualRetry} style={styles.errorPrimary} hitSlop={8}>
                <Ionicons name="refresh" size={16} color={colors.onHoney} />
                <Text style={styles.errorPrimaryText}>Retry</Text>
              </TouchableOpacity>
              {onSwitchSource && (
                <TouchableOpacity onPress={switchSource} style={styles.errorGhost} hitSlop={8}>
                  <Text style={styles.errorGhostText}>Try another source</Text>
                </TouchableOpacity>
              )}
            </View>
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
  errorOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 28,
    backgroundColor: colors.playerBg,
  },
  errorTitle: { color: colors.white, fontSize: 16, fontWeight: "700", textAlign: "center" },
  errorSub: { color: colors.textDim, fontSize: 13, textAlign: "center", lineHeight: 18 },
  errorBtns: { flexDirection: "row", gap: 10, marginTop: 10 },
  errorPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.honey,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
  },
  errorPrimaryText: { color: colors.onHoney, fontSize: 14, fontWeight: "700" },
  errorGhost: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  errorGhostText: { color: colors.text, fontSize: 14, fontWeight: "600" },
});

export default HijackPlayer;
