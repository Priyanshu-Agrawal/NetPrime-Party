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
import { absoluteFill } from "@/theme/styles/layout";
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
import { hijackCapabilities, isBindableOn, type BridgeCaps, type OS } from "./capabilities";
import { WALL_WATCH_JS, relayInjectJs, relayListenerJs as buildRelayListenerJs, sessionNonces } from "./frameScripts";
import { loadingCoverVisible } from "./loadingCover";
import type {
  FatalError,
  MediaTrack,
  PlayerCapabilities,
  PlayerEvent,
  PlayerHandle,
  SubtitleTrack,
} from "./types";

export type {
  EngineId,
  FatalError,
  MediaTrack,
  PlayerCapabilities,
  PlayerEvent,
  PlayerEventType,
  PlayerHandle,
  QualityLevel,
} from "./types";

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
  /** No other provider is left to try: if no <video> binds, show the provider's own
   *  page (chrome back on) rather than a blank frame. */
  revealProviderUiOnBindFail?: boolean;
}

const OS_NAME: OS = Platform.OS === "ios" ? "ios" : "android";

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
      revealProviderUiOnBindFail,
    },
    ref,
  ) => {
    const webRef = useRef<WebView>(null);
    const boundRef = useRef(false);
    // De-dupe transport events: the bridge is injected into ALL frames
    // (injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}), so more than
    // one frame can post the SAME event/tick — the sync engine would then process
    // every play/pause/seek/tick ~2×. Drop an event whose signature repeats within a
    // short window (genuine ticks are ~1s apart with a moving currentTime, so they
    // never collide; only near-simultaneous duplicates from a second frame do).
    const lastEventRef = useRef<{ sig: string; t: number }>({ sig: "", t: 0 });
    const lastTickRef = useRef(0);
    // H3: once we've seen ONE correctly-nonced message we know the bridge stamps the
    // per-session nonce, so from then on we drop any message lacking it (an embed-page
    // / ad script spoofing ready/ended/currentTime). Latches rather than requiring the
    // nonce upfront, so an older cached bridge that doesn't stamp still works (no
    // playback break) until the nonce-capable bridge is live.
    const nonceStrictRef = useRef(false);
    const [bound, setBound] = useState(false);
    const [slow, setSlow] = useState(false);
    // The page finished loading — lifts the cover over a plain embed (it never binds).
    const [pageLoaded, setPageLoaded] = useState(false);
    // A provider "we couldn't find that" wall (detected by WALL_WATCH_JS) — no <video>
    // will ever bind, so we show our own skinned "no stream" overlay instead of leaving
    // the spinner up forever / revealing the raw provider wall.
    const [noSource, setNoSource] = useState(false);
    // The hijack bridge is OTA-served (bridgeCache) with NO bundled fallback, filled
    // async by syncScripts after /config. The solo player mounts this the instant a
    // provider is selected — often BEFORE the cache is warm — and a scriptless WebView
    // never binds (the <video> plays under the provider's OWN controls, never our skin).
    // Gate the WebView mount on a cached script. Warm cache — the common case, and
    // every Watch Party mount (snapshot-gated, so seconds later) — is ready immediately.
    const [scriptReady, setScriptReady] = useState(
      () => !isBindableOn(getProvider(providerId), OS_NAME) || getCachedScript(providerId) != null,
    );
    // The "still syncing" banner appears at the 30s bind timeout. Some providers
    // (e.g. videasy on iOS) autoplay in a frame our bridge can't reach — the video
    // is PLAYING even though we never bound — so the banner is misleading and must
    // not linger over a watching user. Show it briefly, then auto-retire it (the
    // source pill stays as the real escape hatch).
    const [bannerRetired, setBannerRetired] = useState(false);
    const provider = getProvider(providerId);
    // Inject a bridge only where it can bind: on a platform where this provider's
    // <video> is unreachable, the generic bridge's chrome-off would blank the very
    // page the user falls back to.
    const bindable = isBindableOn(provider, OS_NAME);
    const bridgeScript = bindable ? (getCachedScript(providerId) ?? "") : "";
    const bridgeCfgJs = `;window.__vlCfg=${JSON.stringify({
      chromeOff: !!nativeControls,
      autoStart: true,
      startSelectors: provider?.hijack.startSelectors ?? [],
    })};`;
    // What the generic bridge reported for the bound <video> (legacy bridge: nothing).
    const reportedCapsRef = useRef<BridgeCaps | undefined>(undefined);
    const subsRef = useRef<SubtitleTrack[]>([]);
    const revealRef = useRef(revealProviderUiOnBindFail);
    revealRef.current = revealProviderUiOnBindFail;

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
      setNoSource(false);
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
      setPageLoaded(true);
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
    // descendant frame via postMessage. Two per-mount secrets: `relay` gates relayed code
    // (frames take it only from their parent), `msg` authenticates bridge messages and is
    // never sent over postMessage, so an ad frame that reads the relay can't spoof events.
    const nonces = useMemo(sessionNonces, []);
    // Appended to the injected bridge (runs in each frame) — see frameScripts.ts.
    const relayListenerJs = useMemo(() => buildRelayListenerJs(nonces.relay), [nonces]);
    // Run `code` in the main frame AND fan it out to all descendant frames.
    const relayInject = useCallback(
      (code: string) => {
        webRef.current?.injectJavaScript(relayInjectJs(code, nonces.relay));
      },
      [nonces],
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
        // The WebView can't report where the provider's <video> actually landed,
        // so v2's landed-position promise resolves with the requested target.
        seek: (seconds: number) => {
          cmd({ action: "seek", time: seconds });
          return Promise.resolve(seconds);
        },
        setRate: (rate: number) => cmd({ action: "rate", rate }),
        fullscreen: () => cmd({ action: "fullscreen" }),
        readQuality: () => cmd({ action: "readQuality" }),
        setQuality: (label: string) => cmd({ action: "setQuality", label }),
        readAudio: () => cmd({ action: "readAudio" }),
        setAudio: (label: string) => cmd({ action: "setAudio", label }),
        reload: () => manualRetry(),
        getCapabilities: (): PlayerCapabilities =>
          hijackCapabilities(getProvider(providerId), OS_NAME, reportedCapsRef.current),
        getTracks: (): MediaTrack[] =>
          subsRef.current.map((t) => ({
            id: t.id,
            label: t.label,
            language: t.language || undefined,
            kind: "text" as const,
            selected: t.selected,
          })),
        setSubtitle: (id: string | null) => cmd({ action: "setSub", id }),
      }),
      [cmd, manualRetry, providerId],
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
          "[class*='z-[110]']{display:none!important}" +
          // videasy's pre-play / PAUSED poster card is a full-screen clickable overlay
          // (div.fixed.inset-0.bg-black.cursor-pointer with the white play button
          // centered; verified live). Post-bind it re-appears on pause and blacks out
          // the frame ABOVE our own controls. Hide it with opacity:0 (NOT display:none)
          // so it's invisible but stays in layout + clickable — the resume path
          // (__vlCmd('play') → click the inner bg-white/95 button, which bubbles to this
          // overlay's handler) keeps working. Targeted by inset-0 + bg-black +
          // cursor-pointer so it can't match the video container.
          "div[class*='inset-0'][class*='bg-black'][class*='cursor-pointer']{opacity:0!important}"
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

    // Poll the MMKV script cache until this provider's OTA bridge lands (syncScripts
    // emits no signal to subscribe to), then let the WebView mount. After a grace
    // window we mount anyway, so an unreachable /scripts still degrades to the
    // provider's own page instead of hanging on the loader forever.
    useEffect(() => {
      if (!isBindableOn(getProvider(providerId), OS_NAME) || getCachedScript(providerId) != null) {
        setScriptReady(true);
        return;
      }
      setScriptReady(false);
      let tries = 0;
      const iv = setInterval(() => {
        if (getCachedScript(providerId) != null || ++tries >= 25) {
          setScriptReady(true);
          clearInterval(iv);
        }
      }, 400); // ~10s grace before degrading to a scriptless load
      return () => clearInterval(iv);
    }, [providerId]);

    // Bind detection + "still syncing" banner. Re-armed on media change AND every
    // remount (a retry bumps remountNonce), so a remounted WebView that loads but
    // never binds a <video> still surfaces the banner + fires onBindFailed.
    useEffect(() => {
      boundRef.current = false;
      setBound(false);
      setSlow(false);
      setNoSource(false);
      setBannerRetired(false);
      setPageLoaded(false);
      // A plain embed never binds: no "still syncing" banner, no move-on (its own page is the player).
      if (!bindable) return;
      const t = setTimeout(() => {
        if (!boundRef.current) {
          setSlow(true);
          // Nothing left to move on to: show the provider's own page (chrome back on)
          // rather than a blank frame painted by chrome-off.
          if (revealRef.current) relayInject("window.__vlChromeOff&&window.__vlChromeOff(false)");
          onBindFailed?.();
        }
      }, BIND_TIMEOUT_MS);
      return () => clearTimeout(t);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [providerId, tmdbId, type, season, episode, remountNonce, scriptReady]);

    // Recovery-state reset — ONLY on a real media/provider/episode change, NOT on a
    // retry remount (which must PRESERVE the auto-retry budget so the load→crash
    // cap still works). Drops a stale overlay / spent budget / pending onRecovered
    // carried from the previous episode.
    useEffect(() => {
      setFatalError(null);
      reportedCapsRef.current = undefined;
      subsRef.current = [];
      hadErrorRef.current = false;
      erroredThisLoadRef.current = false;
      retryAttemptRef.current = 0;
      if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
       
    }, [providerId, tmdbId, type, season, episode]);

    const handleMessage = useCallback(
      (raw: string) => {
        let e: PlayerEvent & { __n?: string };
        try {
          e = JSON.parse(raw) as PlayerEvent & { __n?: string };
        } catch {
          return;
        }
        // H3: authenticate the sender by the per-session nonce the bridge stamps on
        // every post(). A correct nonce latches strict mode; thereafter any message
        // without it is an embed-page/ad script spoof and is dropped. Before the first
        // nonced message (older bridge, or startup) we stay permissive so playback
        // isn't broken by a not-yet-redeployed bridge.
        if (e.__n === nonces.msg) nonceStrictRef.current = true;
        else if (nonceStrictRef.current) return;
        // Provider not-found wall (WALL_WATCH_JS): no <video> will ever bind, so surface
        // our own skinned "no stream" overlay. Ignore once a real video has bound.
        if (e.event === "notFound") {
          if (!boundRef.current) setNoSource(true);
          return;
        }
        // Drop duplicates posted by a SECOND injected frame (the bridge runs in every
        // frame). Two mechanisms because the two event kinds duplicate differently:
        const now = Date.now();
        if (e.event === "tick") {
          // Periodic (~1/s per frame) and each frame samples currentTime at a slightly
          // different instant, so values differ — an exact-value match misses them.
          // Rate-limit ticks to ~1/s by wall clock instead.
          if (now - lastTickRef.current < 850) return;
          lastTickRef.current = now;
        } else {
          // Discrete transport/state events fire at an agreed currentTime in both
          // frames, so a signature match within a short window drops the duplicate.
          const sig = `${e.event}|${Math.round((e.currentTime ?? 0) * 10)}|${e.paused ? 1 : 0}|${e.readyState ?? ""}`;
          if (sig === lastEventRef.current.sig && now - lastEventRef.current.t < 300) return;
          lastEventRef.current = { sig, t: now };
        }
        if (e.event === "ready" && !boundRef.current) {
          boundRef.current = true;
          setBound(true);
          setSlow(false);
          setNoSource(false);
          onBound?.();
        }
        if (e.event === "caps" && e.caps) reportedCapsRef.current = e.caps;
        if (e.event === "subs" && e.subs) subsRef.current = e.subs;
        onPlayerEvent?.(e);
      },
      [onPlayerEvent, onBound, nonces],
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
        {/* Gate the WebView until this provider's OTA bridge is cached — a scriptless
            load never binds (the video plays under the provider's OWN controls). Warm
            cache / every Watch Party mount renders immediately; the branded cover
            below fills the wait. */}
        {scriptReady && (
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
          injectedJavaScriptBeforeContentLoaded={
            // H3 prologue FIRST: publish the per-session nonce so the bridge (next)
            // can capture + delete it at documentStart, before any page/ad script
            // runs. Then the cached bridge, then the command-relay listener.
            `;window.__vlMsgNonce=${JSON.stringify(nonces.msg)};` +
            bridgeCfgJs +
            WALL_WATCH_JS +
            bridgeScript +
            relayListenerJs
          }
          // Inject the bridge into EVERY frame, not just the main one. On iOS videasy
          // renders its <video> inside a cross-origin iframe the main-frame finder
          // can't reach (contentDocument throws) → never binds. Running the bridge in
          // each frame lets the finder bind the video from inside its own frame.
          injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}
          // Redundant AFTER-load re-injection of the bridge — a backstop for the
          // intermittent "plays under the provider's OWN controls, never binds" bug.
          // injectedJavaScriptBeforeContentLoaded occasionally doesn't run for a load
          // (a known WebView race); when it doesn't, the bridge never injects, no
          // <video> is ever found, AND no `gesture` fires — so the no-bind fallback is
          // gated off and the title just plays under the provider's UI. This after-load
          // pass (which RN runs far more reliably) re-injects the bridge for the top
          // frame; idempotent — a no-op when the pre-load injection already ran (the
          // bridge guards on window.__vlBridge). Empty during a grace-window scriptless
          // load (getCachedScript null) — same graceful degrade as before.
          injectedJavaScript={bridgeScript}
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
        )}
        {/* Branded cover — opaque over the WebView from mount until the video paints
            its first frame, so the provider's own poster/splash never shows behind
            our controls on a slow start. Sits below the banner + error overlay.
            The blurred poster uses expo-image's STATIC blurRadius (a Glide/CoreImage
            transform, NOT a live backdrop capture) — safe over the player, and it
            unmounts before the video plays, so it never touches the stutter rule. */}
        {loadingCoverVisible({ bindable, bound, slow, noSource, fatal: !!fatalError, pageLoaded }) && (
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
        {!bound && slow && !noSource && !fatalError && !bannerRetired && (
          <View style={styles.banner} pointerEvents="none">
            <Text style={styles.bannerText}>
              Still syncing {provider.name}… if it doesn’t start, try another server.
            </Text>
          </View>
        )}
        {/* Provider not-found wall → our OWN skinned overlay (never the raw provider
            HTML). Opaque + tappable — a terminal "no stream on this source" state. The
            screen-level back chip (PlayerScreen) sits above for "go back". */}
        {!bound && noSource && !fatalError && (
          <View style={styles.errorOverlay}>
            <Ionicons name="film-outline" size={46} color={colors.textDim} />
            <Text style={styles.errorTitle}>No stream found</Text>
            <Text style={styles.errorSub} numberOfLines={2}>
              {provider.name} couldn’t find this title. Try a different source.
            </Text>
            <View style={styles.errorBtns}>
              {onSwitchSource ? (
                <TouchableOpacity onPress={switchSource} style={styles.errorPrimary} hitSlop={8}>
                  <Ionicons name="swap-horizontal" size={16} color={colors.onHoney} />
                  <Text style={styles.errorPrimaryText}>Try another source</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={manualRetry} style={styles.errorGhost} hitSlop={8}>
                <Text style={styles.errorGhostText}>Retry</Text>
              </TouchableOpacity>
            </View>
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
    ...absoluteFill,
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
  errorTitle: { color: colors.text, fontSize: 16, fontWeight: "700", textAlign: "center" },
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
