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
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import WebView from "react-native-webview";
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
  | "tick";

export interface PlayerEvent {
  event: PlayerEventType;
  currentTime: number;
  duration: number;
  paused: boolean;
}

export interface PlayerHandle {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setRate(rate: number): void;
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
}

/** If no <video> binds within this window, show a soft "still trying" banner
 *  (we DON'T unmount — the finder keeps polling, so a slow provider still binds). */
const BIND_TIMEOUT_MS = 30000;

/**
 * Injected before content loads. Recursively finds the <video> across the top
 * document AND any same-origin iframes, relays its events to RN, and exposes
 * window.__vlCmd(cmd) so RN can drive it. An `applying` guard suppresses events
 * caused by our own programmatic changes (echo suppression).
 */
const BRIDGE_JS = `
(function(){
  if (window.__vlBridge) return; window.__vlBridge = true;
  function post(o){ try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch(e){} }
  try { window.open = function(){ return null; }; } catch(e){}
  try {
    document.addEventListener('click', function(ev){
      var a = ev.target && ev.target.closest && ev.target.closest('a[target=_blank]');
      if (a){ ev.preventDefault(); ev.stopPropagation(); }
    }, true);
  } catch(e){}
  var vid = null, applying = 0;
  function markApplying(){ applying = Date.now() + 500; }
  function isApplying(){ return Date.now() < applying; }
  function findVideo(doc){
    try {
      var v = doc.getElementsByTagName('video')[0];
      if (v) return v;
      var frames = doc.getElementsByTagName('iframe');
      for (var i=0;i<frames.length;i++){
        var cd = null; try { cd = frames[i].contentDocument; } catch(e){}
        if (cd){ var r = findVideo(cd); if (r) return r; }
      }
    } catch(e){}
    return null;
  }
  function bind(v){
    if (!v || v.__vlBound) return; v.__vlBound = true; vid = v;
    ['play','pause','seeking','seeked','ended','waiting','playing','canplay'].forEach(function(ev){
      v.addEventListener(ev, function(){
        if (isApplying()) return;
        post({ event:ev, currentTime:v.currentTime||0, duration:v.duration||0, paused:!!v.paused });
      });
    });
    post({ event:'ready', currentTime:v.currentTime||0, duration:v.duration||0, paused:!!v.paused });
  }
  var finder = setInterval(function(){
    var v = findVideo(document);
    if (v){ clearInterval(finder); bind(v); }
  }, 700);
  setInterval(function(){
    if (vid) post({ event:'tick', currentTime:vid.currentTime||0, duration:vid.duration||0, paused:!!vid.paused });
  }, 1000);
  window.__vlCmd = function(cmd){
    if (!vid) return;
    markApplying();
    try {
      if (cmd.action === 'play') { var p = vid.play(); if (p && p.catch) p.catch(function(){}); }
      else if (cmd.action === 'pause') vid.pause();
      else if (cmd.action === 'seek') vid.currentTime = cmd.time;
      else if (cmd.action === 'rate') vid.playbackRate = cmd.rate;
    } catch(e){}
  };
  true;
})();
`;

export const HijackPlayer = forwardRef<PlayerHandle, Props>(
  (
    { providerId, tmdbId, type, season, episode, startAt, onPlayerEvent, onBound, onBindFailed },
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
      }),
      [cmd],
    );

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
      { party: true },
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
              <ActivityIndicator color="#fff" />
              <Text style={styles.msg}>Loading {provider.name}…</Text>
            </View>
          )}
          setSupportMultipleWindows={false}
          onOpenWindow={() => {
            /* swallow popups */
          }}
          onShouldStartLoadWithRequest={(req) => isAllowedTopNav(hosts, req)}
          injectedJavaScriptBeforeContentLoaded={BRIDGE_JS}
          onMessage={(ev) => handleMessage(ev.nativeEvent.data)}
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
  web: { flex: 1, backgroundColor: "#000" },
  center: { alignItems: "center", justifyContent: "center", gap: 10 },
  msg: { color: "#bbb", fontSize: 14, paddingHorizontal: 24, textAlign: "center" },
  banner: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(224,163,22,0.9)",
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  bannerText: { color: "#111", fontSize: 12, textAlign: "center", fontWeight: "600" },
});

export default HijackPlayer;
