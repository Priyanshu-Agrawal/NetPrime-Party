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
import { getCachedScript } from "@/src/scripts/bridgeCache";
import { colors, font, ms } from "@/theme/bearoom";
import { getAutoplayNext } from "@/utils/prefs";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
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
  ActivityIndicator,
  AppState,
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import WebView from "react-native-webview";
import { subscribeRemoteCommands } from "./backgroundPlayback";
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
  /** Title artwork (TMDB poster URL) — used as the blurred backdrop + crisp thumb
   *  on the branded loading cover. Optional; falls back to a paw badge. */
  posterUrl?: string;
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
      posterUrl,
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
    // The "still syncing" banner appears at the 30s bind timeout. Some providers
    // (e.g. videasy on iOS) autoplay in a frame our bridge can't reach — the video
    // is PLAYING even though we never bound — so the banner is misleading and must
    // not linger over a watching user. Show it briefly, then auto-retire it (the
    // source pill stays as the real escape hatch).
    const [bannerRetired, setBannerRetired] = useState(false);
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
    // Snapshot the autoplay-next pref at mount. Reading it every render put it in the
    // WebView `key`, so toggling the setting mid-episode remounted the player and
    // restarted at 0:00. The pref is meant to apply to the NEXT load — honor that.
    const autoplayNextRef = useRef(getAutoplayNext());
    // The current main-frame URL (updated on every top-frame load, incl. redirects).
    // Fatal-error detection compares against THIS, not the original `uri`, so a
    // provider whose embed redirects (e.g. vidfast pro→vc) still surfaces a real
    // main-frame 4xx/5xx instead of it being filtered as a sub-resource error.
    const mainFrameUrlRef = useRef<string | null>(null);
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

    // The bridge is injected into EVERY frame (see the WebView's
    // injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}) because on iOS
    // videasy renders its <video> in a cross-origin sub-frame. But injectJavaScript
    // only reaches the MAIN frame, so bridge COMMANDS must be relayed down to every
    // descendant frame via postMessage. A per-mount nonce gates the relay so page/ad
    // scripts can't drive the bridge (also mitigates the message-spoofing concern).
    const relayNonce = useMemo(
      () => Math.random().toString(36).slice(2) + Date.now().toString(36),
      [],
    );
    // Appended to the injected bridge (runs in each frame): eval relayed code if the
    // nonce matches, then re-broadcast to this frame's own children (handles nesting).
    const relayListenerJs = useMemo(
      () =>
        `;(function(){try{if(window.__vlRelayI)return;window.__vlRelayI=1;` +
        `window.addEventListener('message',function(e){var d=e&&e.data;` +
        `if(d&&d.__vlEval&&d.__vlN===${JSON.stringify(relayNonce)}){` +
        `try{(0,eval)(d.__vlEval);}catch(_){}` +
        `try{var f=document.querySelectorAll('iframe');for(var i=0;i<f.length;i++){try{f[i].contentWindow.postMessage(d,'*');}catch(_){}}}catch(_){}` +
        `}});}catch(_){}})();`,
      [relayNonce],
    );
    // Run `code` in the main frame AND fan it out to all descendant frames.
    const relayInject = useCallback(
      (code: string) => {
        const payload = JSON.stringify({ __vlEval: code, __vlN: relayNonce });
        webRef.current?.injectJavaScript(
          `(function(){var P=${payload};` +
            `try{(0,eval)(P.__vlEval);}catch(e){}` +
            `try{var f=document.querySelectorAll('iframe');for(var i=0;i<f.length;i++){try{f[i].contentWindow.postMessage(P,'*');}catch(e){}}}catch(e){}` +
            `})();true;`,
        );
      },
      [relayNonce],
    );

    const cmd = useCallback(
      (c: Record<string, unknown>) => {
        relayInject(`window.__vlCmd && window.__vlCmd(${JSON.stringify(c)})`);
      },
      [relayInject],
    );

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
      relayInject(
        `window.__vlSetGuest && window.__vlSetGuest(${hideTransportControls ? "true" : "false"})`,
      );
    }, [hideTransportControls, bound, relayInject]);

    // Native-controls takeover: hide ALL of the provider's chrome and KEEP it hidden.
    // We render our own overlay, and — unlike the bridge's __vlChromeOff, which
    // deliberately restores chrome in HTML5 fullscreen — we never use HTML5 fullscreen
    // (our fullscreen is OS-rotation with the video inline, so our controls stay on
    // top and reachable). So we ALSO install a persistent, UNCONDITIONAL kill-style so
    // the provider's menu can never re-appear (e.g. a stray fullscreen state, or the
    // rotation reflow re-creating its control DOM). Subtitle controls are intentionally
    // NOT targeted here, so they stay reachable. Single-quoted attr selector keeps the
    // JSON.stringify'd injection clean.
    const applyChrome = useCallback(() => {
      const on = !!nativeControls;
      // videasy's on-screen chrome, verified live via CDP 2026-08-21:
      //  • control bar  → div.absolute.bottom-0.h-44 (seekbar + transport)
      //  • settings drawer → the z-[110] panel ("Player Settings / Quality / Subs /
      //    Servers"). It's ALWAYS in the DOM, parked off-screen via transforms, and
      //    its `transition-transform` animates THROUGH the visible area on rotation —
      //    that's the panel that flashed. Hidden here (its open button is in the bar
      //    we hide, so it was never user-reachable anyway).
      // NOTE: the legacy `mobileCenterControls` class is GONE on current videasy
      // (renamed) — kept only as a harmless legacy fallback.
      const css = on
        ? "[class*='mobileCenterControls']{display:none!important}" +
          "div.absolute.bottom-0.h-44{display:none!important}" +
          "[class*='z-[110]']{display:none!important}"
        : "";
      relayInject(
        `try{` +
          `window.__vlChromeOff&&window.__vlChromeOff(${on});` +
          `var el=document.getElementById('__npChromeKill');` +
          `if(!el){el=document.createElement('style');el.id='__npChromeKill';(document.head||document.documentElement).appendChild(el);}` +
          `el.textContent=${JSON.stringify(css)};` +
          `}catch(e){}`,
      );
    }, [nativeControls, relayInject]);

    // Re-applied when `bound` flips (lands even if set before the bridge loaded) and on
    // every rotation — a WebView reflow can re-create the provider's chrome DOM, which
    // would otherwise flash its menu until the next inject.
    useEffect(() => {
      applyChrome();
    }, [applyChrome, bound]);
    useEffect(() => {
      const sub = Dimensions.addEventListener("change", applyChrome);
      return () => sub.remove();
    }, [applyChrome]);

    // Auto-retire the "still syncing" banner ~6s after it appears, so it can't sit
    // on top of a video that's actually playing in an unreachable frame. Cleared on
    // bind and on every media change / remount (above).
    useEffect(() => {
      if (bound || !slow || bannerRetired) return;
      const t = setTimeout(() => setBannerRetired(true), 6000);
      return () => clearTimeout(t);
    }, [bound, slow, bannerRetired]);

    // Bind detection + "still syncing" banner. Re-armed on media change AND every
    // remount (a retry bumps remountNonce), so a remounted WebView that loads but
    // never binds a <video> still surfaces the banner + fires onBindFailed.
    useEffect(() => {
      boundRef.current = false;
      setBound(false);
      setSlow(false);
      setBannerRetired(false);
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
      { party, autoplayNext: autoplayNextRef.current },
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
          setSupportMultipleWindows={false}
          onOpenWindow={() => {
            /* swallow popups */
          }}
          onShouldStartLoadWithRequest={(req) => isAllowedTopNav(hosts, req)}
          injectedJavaScriptBeforeContentLoaded={(getCachedScript(providerId) ?? "") + relayListenerJs}
          // Inject the bridge into EVERY frame, not just the main one. On iOS videasy
          // renders its <video> inside a cross-origin iframe the main-frame finder
          // can't reach (contentDocument throws) → never binds. Running the bridge in
          // each frame lets the finder bind the video from inside its own frame.
          injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}
          onMessage={(ev) => handleMessage(ev.nativeEvent.data)}
          onLoadStart={(ev) => {
            erroredThisLoadRef.current = false; // fresh load — clear the per-load error flag
            // Track the committed main-frame URL (redirects included) for error scoping.
            if (ev.nativeEvent.url) mainFrameUrlRef.current = ev.nativeEvent.url;
          }}
          onLoad={handleLoadEnd}
          // MAIN-FRAME failures only. Provider pages throw constant sub-resource
          // 404s (ads/trackers); we treat a failure as fatal only when its URL is the
          // embed URL OR the current main-frame URL (so a redirected embed still counts).
          onError={(ev) => {
            const n = ev.nativeEvent;
            if (!n.url || n.url === uri || n.url === mainFrameUrlRef.current)
              raiseFatal({ kind: "http_error", description: n.description });
          }}
          onHttpError={(ev) => {
            const n = ev.nativeEvent;
            if ((n.url === uri || n.url === mainFrameUrlRef.current) && n.statusCode >= 400)
              raiseFatal({ kind: "http_error", statusCode: n.statusCode });
          }}
          onRenderProcessGone={() => raiseFatal({ kind: "render_crash" })}
          onContentProcessDidTerminate={() => raiseFatal({ kind: "render_crash" })}
        />
        {/* Branded cover — opaque over the WebView from mount until the video paints
            its first frame, so the provider's own poster/splash never shows behind
            our controls on a slow start. Sits below the banner + error overlay.
            The blurred poster uses expo-image's STATIC blurRadius (a Glide/CoreImage
            transform, NOT a live backdrop capture) — safe over the player, and it
            unmounts before the video plays, so it never touches the stutter rule. */}
        {!bound && !slow && !fatalError && (
          // Cover lifts on BIND (the bridge found the <video> — the proven, reliable,
          // cross-platform signal), NOT on a fragile "first painted frame" signal that
          // could leave the video masked behind "Loading" forever. Also lifts once the
          // bind times out (`slow`) so a stuck stream reveals the provider's own UI
          // (play button / error) instead of trapping the user.
          // pointerEvents="none": purely visual — taps pass THROUGH to the WebView so a
          // gesture-gated provider (videasy creates its <video> only after a user
          // gesture) still gets the tap that starts playback.
          <View style={styles.loading} pointerEvents="none">
            {posterUrl ? (
              <>
                <Image
                  source={{ uri: posterUrl }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  blurRadius={25}
                  transition={250}
                  cachePolicy="memory-disk"
                />
                <LinearGradient colors={LOADING_SCRIM} style={StyleSheet.absoluteFill} />
              </>
            ) : null}
            <View style={styles.loadingContent}>
              {posterUrl ? (
                // Clean poster card — NO spinner over the artwork (that reads as a
                // broken-image glitch). The spinner lives in the status row below.
                <View style={styles.loadingThumbWrap}>
                  <Image
                    source={{ uri: posterUrl }}
                    style={styles.loadingThumb}
                    contentFit="cover"
                    transition={250}
                    cachePolicy="memory-disk"
                  />
                </View>
              ) : (
                <View style={styles.loadingBadge}>
                  <Image
                    source={require("@/assets/images/brandmark.png")}
                    style={styles.loadingBrandMark}
                    contentFit="contain"
                  />
                </View>
              )}
              <View style={styles.loadingStatusRow}>
                <ActivityIndicator size="small" color={colors.honey} />
                <Text style={styles.loadingSub}>Getting your stream ready…</Text>
              </View>
            </View>
          </View>
        )}
        {/* Slow to bind — keep the WebView mounted (finder keeps polling), just warn. */}
        {!bound && slow && !fatalError && !bannerRetired && (
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

// Vertical scrim over the blurred poster — lighter at the top, deepening toward the
// bottom for text legibility (warm-charcoal, derived from colors.bg #100D0A).
const LOADING_SCRIM = ["rgba(16,13,10,0.62)", "rgba(16,13,10,0.94)"] as const;

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: colors.playerBg },
  center: { alignItems: "center", justifyContent: "center", gap: 10 },
  msg: { color: colors.textDim, fontSize: 14, paddingHorizontal: 24, textAlign: "center" },
  loading: {
    // Absolute-fill, NOT flex:1 — react-native-webview renders renderLoading() as
    // a normal flex sibling of the native WebView inside a column container, so a
    // flex:1 loader splits the space 50/50 (WebView top half, loader bottom half).
    // Overlaying it edge-to-edge makes the branded loading screen full-bleed.
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg, // solid base under the blurred poster (no poster → flat)
  },
  loadingContent: { alignItems: "center", gap: ms(20), paddingHorizontal: 32 },
  loadingThumbWrap: {
    width: ms(112),
    height: ms(168),
    borderRadius: ms(14),
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)", // hairline edge, not a hard honey outline
    // NO elevation/shadow — proven stutter rule on any video screen.
  },
  loadingThumb: { width: "100%", height: "100%" },
  loadingBadge: {
    width: ms(76),
    height: ms(76),
    borderRadius: ms(22),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.honeySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.honeyGlow,
  },
  loadingBrandMark: { width: ms(38), height: ms(38) },
  loadingStatusRow: { flexDirection: "row", alignItems: "center", gap: ms(8) },
  loadingSub: { color: colors.textFaint, fontFamily: font.body, fontSize: ms(13), letterSpacing: 0.2 },
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
