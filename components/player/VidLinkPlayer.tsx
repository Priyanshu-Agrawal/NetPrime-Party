/**
 * VidLinkPlayer — a VidLink embed WebView with an injected control + event
 * bridge, so the app can BOTH observe the player (play/pause/seek/time) AND
 * drive it (play/pause/seek/rate) directly on the same-origin <video> element.
 *
 * Verified 2026-08-13: VidLink renders its <video> in the top (same-origin)
 * document, so injected JS controls it with no reload and no cross-origin wall.
 * This is the basis for continuous watch-party sync.
 */
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
} from "react";
import { StyleSheet } from "react-native";
import WebView from "react-native-webview";

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

export interface VidLinkHandle {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setRate(rate: number): void;
  /** Ask the provider's <video> to enter native HTML5 fullscreen. */
  fullscreen(): void;
}

interface Props {
  tmdbId: string;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
  startAt?: number;
  /** Fires for every player event/heartbeat coming from the injected bridge. */
  onPlayerEvent?: (e: PlayerEvent) => void;
}

/** Hosts the top frame is allowed to navigate to; everything else (ad redirects) is blocked. */
const ALLOWED_NAV_HOSTS = ["vidlink.pro"];

/**
 * Allow only top-frame navigations to VidLink's own host; block ad-redirects.
 * Sub-resources / media / iframes (isTopFrame === false) are always allowed so
 * the stream still loads.
 */
function isAllowedNav(req: {
  url: string;
  isTopFrame?: boolean;
}): boolean {
  if (req.isTopFrame === false) return true;
  const url = req.url || "";
  if (
    !url ||
    url.startsWith("about:") ||
    url.startsWith("data:") ||
    url.startsWith("blob:")
  ) {
    return true;
  }
  try {
    const host = new URL(url).hostname.toLowerCase();
    return ALLOWED_NAV_HOSTS.some((d) => host === d || host.endsWith("." + d));
  } catch {
    return false;
  }
}

export function buildVidLinkUrl(p: {
  tmdbId: string;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
  startAt?: number;
}): string {
  const base =
    p.type === "tv"
      ? `https://vidlink.pro/tv/${p.tmdbId}/${p.season ?? 1}/${p.episode ?? 1}`
      : `https://vidlink.pro/movie/${p.tmdbId}`;
  // autoplay=false so members don't each auto-start at a different position
  // before the party has synced; the sync engine starts playback in unison.
  const qs: string[] = ["autoplay=false"];
  if (p.startAt && p.startAt > 5) qs.push(`startAt=${Math.floor(p.startAt)}`);
  return `${base}?${qs.join("&")}`;
}

/**
 * Injected before content loads. Finds the <video>, relays its events to RN,
 * and exposes window.__vlCmd(cmd) so RN can drive it. An `applying` guard
 * suppresses events caused by our own programmatic changes (echo suppression).
 */
const BRIDGE_JS = `
(function(){
  if (window.__vlBridge) return; window.__vlBridge = true;
  function post(o){ try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch(e){} }
  // Neutralize popup ads at the source (window.open + target=_blank).
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
    var v = document.getElementsByTagName('video')[0];
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
      else if (cmd.action === 'fullscreen') {
        var fs = vid.requestFullscreen || vid.webkitRequestFullscreen || vid.webkitEnterFullscreen || vid.mozRequestFullScreen;
        if (fs) fs.call(vid);
      }
    } catch(e){}
  };
  true;
})();
`;

export const VidLinkPlayer = forwardRef<VidLinkHandle, Props>(
  ({ tmdbId, type, season, episode, startAt, onPlayerEvent }, ref) => {
    const webRef = useRef<WebView>(null);

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

    const uri = buildVidLinkUrl({ tmdbId, type, season, episode, startAt });

    return (
      <WebView
        ref={webRef}
        style={styles.web}
        source={{ uri }}
        javaScriptEnabled
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        // --- Popup / ad-redirect blocking ---
        setSupportMultipleWindows={false}
        onOpenWindow={() => {
          /* swallow window.open / target=_blank popups */
        }}
        onShouldStartLoadWithRequest={(req) => isAllowedNav(req)}
        injectedJavaScriptBeforeContentLoaded={BRIDGE_JS}
        onMessage={(e) => {
          if (!onPlayerEvent) return;
          try {
            onPlayerEvent(JSON.parse(e.nativeEvent.data) as PlayerEvent);
          } catch {
            // ignore non-JSON page noise
          }
        }}
      />
    );
  },
);

VidLinkPlayer.displayName = "VidLinkPlayer";

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: "#000" },
});

export default VidLinkPlayer;
