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
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
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
  /** Ask the provider's <video> to enter native HTML5 fullscreen. */
  fullscreen(): void;
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
 *
 * Background keep-alive lives HERE (do not import SOLO_BG_JS): wasPlaying is the
 * INTENDED play-state, including engine __vlCmd. Chromium's hidden-pause is
 * swallowed; lock-screen __soloCmd is un-suppressed so handleUserControl sees it.
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
  // Some embed players (videasy) use a FIXED-height bottom control bar
  // (absolute bottom-0 h-44 = 176px). In the short inline/collapsed viewport that
  // bar blankets the vertical-center play/pause/+-10s buttons and, being
  // pointer-events:auto, swallows their taps (fullscreen is tall, so the bar is a
  // thin strip and the same controls work — hence "collapsed broken, expanded
  // fine"). Collapsing it to content height ONLY in short viewports removes the
  // overlap; children keep their own pointer-events, so the scrubber / quality /
  // subtitle controls are unaffected. Verified via CDP on player.videasy.to.
  try {
    var __addSt = function(){
      try {
        if (document.getElementById('__vlStyle')) return;
        var st = document.createElement('style'); st.id = '__vlStyle';
        st.textContent = '@media (max-height:480px){div.absolute.bottom-0.h-44{height:auto!important}}';
        (document.head || document.documentElement).appendChild(st);
      } catch(e){}
    };
    __addSt();
    document.addEventListener('DOMContentLoaded', __addSt);
  } catch(e){}
  var vid = null, applying = 0, wasPlaying = false;
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
  function keepAlive(){
    if (!vid) vid = findVideo(document);
    if (!vid) return;
    if (document.hidden && wasPlaying && vid.paused) {
      markApplying();
      var kp = vid.play();
      if (kp && kp.catch) kp.catch(function(){});
    }
  }
  function bind(v){
    if (!v || v.__vlBound) return; v.__vlBound = true; vid = v;
    wasPlaying = !v.paused;
    ['play','pause','seeking','seeked','ended','waiting','playing','canplay'].forEach(function(ev){
      v.addEventListener(ev, function(){
        if (ev === 'pause' && document.hidden && wasPlaying) { keepAlive(); return; }
        if (isApplying()) return;
        if (ev === 'play' || ev === 'playing') wasPlaying = true;
        if (ev === 'pause' || ev === 'ended') wasPlaying = false;
        post({ event:ev, currentTime:v.currentTime||0, duration:v.duration||0, paused:!!v.paused });
      });
    });
    post({ event:'ready', currentTime:v.currentTime||0, duration:v.duration||0, paused:!!v.paused });
  }
  var finder = setInterval(function(){
    var v = findVideo(document);
    if (v){ clearInterval(finder); bind(v); }
  }, 700);
  document.addEventListener('visibilitychange', function(){
    if (!document.hidden) return;
    keepAlive();
    setTimeout(keepAlive, 50);
    setTimeout(keepAlive, 250);
    setTimeout(keepAlive, 1000);
  });
  setInterval(function(){
    keepAlive();
    if (vid) post({ event:'tick', currentTime:vid.currentTime||0, duration:vid.duration||0, paused:!!vid.paused });
  }, 1000);
  window.__soloKeepAlive = keepAlive;
  window.__vlCmd = function(cmd){
    if (!vid) return;
    try {
      // Only echo-suppress commands that actually emit a listened event (play/pause/
      // seeked). 'rate' emits 'ratechange' (which we don't observe), so suppressing
      // after it is needless AND harmful: the drift engine nudges playbackRate on
      // nearly every tick, and a blanket markApplying() there was swallowing the
      // user's real play/pause/seek taps during playback.
      if (cmd.action === 'play') { wasPlaying = true; markApplying(); var p = vid.play(); if (p && p.catch) p.catch(function(){}); }
      else if (cmd.action === 'pause') { wasPlaying = false; markApplying(); vid.pause(); }
      else if (cmd.action === 'seek') { markApplying(); vid.currentTime = cmd.time; }
      else if (cmd.action === 'rate') { vid.playbackRate = cmd.rate; }
      else if (cmd.action === 'fullscreen') {
        var fs = vid.requestFullscreen || vid.webkitRequestFullscreen || vid.webkitEnterFullscreen || vid.mozRequestFullScreen;
        if (fs) fs.call(vid);
      }
    } catch(e){}
  };
  // Lock-screen / notification: drive video WITHOUT markApplying so genuine
  // play/pause/seeked reach handleUserControl (host pauses room, guest detaches).
  window.__soloCmd = function(cmd){
    if (!vid || !cmd) return;
    try {
      if (cmd.action === 'play') {
        wasPlaying = true;
        var up = vid.play();
        if (up && up.catch) up.catch(function(){});
      } else if (cmd.action === 'pause') {
        wasPlaying = false;
        vid.pause();
      } else if (cmd.action === 'seek' && typeof cmd.time === 'number') {
        vid.currentTime = cmd.time;
      }
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
        fullscreen: () => cmd({ action: "fullscreen" }),
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
