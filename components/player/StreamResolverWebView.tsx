/**
 * StreamResolverWebView — hidden, offscreen resolver for the NATIVE player.
 *
 * Loads a provider's embed page in a 1×1 offscreen WebView, TRIGGERS playback
 * (videasy binds its `<video>` + fetches the HLS stream only after a gesture),
 * and hooks `window.fetch` / `XMLHttpRequest.open` in the TOP frame to capture
 * the `master.m3u8` URL — which is then handed to `expo-video` for native
 * playback. See docs/architecture/native-player.md + docs/providers/videasy.md.
 *
 * Difference from the older SnifferWebView.old (which never resolved videasy):
 *   1. `mediaPlaybackRequiresUserAction={false}` + `allowsInlineMediaPlayback`
 *      so programmatic play is allowed without a real touch.
 *   2. A "kick" routine that repeatedly tries to start playback (click the
 *      center play button / call video.play()) until the sniff fires — videasy
 *      resolves nothing until play is triggered.
 *
 * DUB SELECTION (v1, best-effort): if `dubLabel` is given we try to open the
 * settings gear → "Servers" tab → click the server whose text matches (Hindi =
 * "Fade"); on any failure we fall through to Original. Each dub is a SEPARATE
 * stream, so switching dubs = re-run this resolver for that server.
 */
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import WebView from "react-native-webview";
import {
  DEFAULT_SNIFF,
  embedOrigin,
  type SniffConfig,
} from "@/utils/streamResolver.old";

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface ResolvedNativeStream {
  /** The captured playlist URL (master.m3u8 preferred). */
  url: string;
  /** Synthesized request headers (videasy needs none, but harmless/general). */
  headers: Record<string, string>;
  /** The dub/audio server we actually landed on ("Original" when not switched). */
  dub: string | null;
}

interface StreamResolverWebViewProps {
  /** Embed URL (built via providerRegistry.buildEmbedUrl — videasy). */
  embedUrl: string;
  /** Server/dub label to select (e.g. "Fade" = Hindi). Omit/null = Original. */
  dubLabel?: string | null;
  /**
   * Bare hostnames the TOP frame may navigate to (e.g. providerHosts(videasy)).
   * ⚠ REQUIRED for reliability: videasy fires ad redirects that hijack the top
   * frame (e.g. → naidunia.com) and kill the sniff. Anything else is blocked.
   * Defaults to just the embed URL's own host.
   */
  navHosts?: string[];
  config?: SniffConfig;
  onResolved: (r: ResolvedNativeStream) => void;
  onFail: (reason: string) => void;
}

/**
 * Injected before content loads: installs the fetch/XHR sniff, then (once the
 * page is up) runs the dub-select + play-kick loop. All wrapped so a throw in
 * any provider's DOM never breaks the capture.
 */
const buildInjectedJS = (pattern: RegExp, dubLabel: string | null) => `
(function () {
  var re = ${pattern.toString()};
  var DUB = ${JSON.stringify(dubLabel)};
  window.__captured = false;
  var dubStage = DUB ? 0 : 2;   // 0=open Servers tab, 1=pick language, 2=ready to capture
  var dubTries = 0;

  // Ad/popup defense (top-frame nav is also blocked RN-side via onShouldStart).
  try { window.open = function(){ return null; }; } catch (e) {}
  document.addEventListener('click', function(ev){
    try { var a = ev.target && ev.target.closest && ev.target.closest('a[target="_blank"]'); if (a) ev.preventDefault(); } catch (e) {}
  }, true); // capture-phase, preventDefault ONLY (never stopPropagation — it'd eat the play-kick)

  function post(obj){ try { window.ReactNativeWebView.postMessage(JSON.stringify(obj)); } catch (e) {} }
  function headerObj(h){
    var out = {};
    try {
      if (!h) return out;
      if (typeof h.forEach === 'function') { h.forEach(function (v,k){ out[k]=v; }); return out; }
      if (Array.isArray(h)) { h.forEach(function (p){ out[p[0]]=p[1]; }); return out; }
      return h;
    } catch (e) { return out; }
  }
  // Capture the first .m3u8/.mp4. If a dub was requested, WAIT until the dub
  // server is selected (dubStage>=2) so we grab the DUB's stream, not Original.
  function report(u, headers){
    try {
      if (!u || window.__captured || !re.test(u)) return;
      if (dubStage < 2) return;
      window.__captured = true;
      post({ type:'media', url:u, headers:headers||null, dub: DUB || 'Original' });
    } catch (e) {}
  }

  var of = window.fetch;
  if (of) { window.fetch = function (input, init){
    try { var u = typeof input==='string' ? input : (input && input.url); report(u, init && headerObj(init.headers)); } catch (e) {}
    return of.apply(this, arguments);
  }; }
  var oo = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url){ try { report(url); } catch (e) {} return oo.apply(this, arguments); };

  // --- dub selection (videasy) ------------------------------------------------
  // ⚠ videasy's React tabs/servers respond to a FULL synthetic pointer sequence,
  // NOT element.click() (proven via CDP). Labels read e.g. "FadeHindi audio", so
  // we match the language (DUB, e.g. "Hindi"). Staged: open Servers → click lang.
  // If Servers/lang never appear, bail to Original so we still resolve something.
  function pdispatch(b){
    try {
      var r = b.getBoundingClientRect(), cx = r.left + r.width/2, cy = r.top + r.height/2;
      ['pointerover','pointerenter','pointerdown','pointerup','click','mousedown','mouseup'].forEach(function (t){
        try { b.dispatchEvent(new (t.indexOf('pointer')===0?PointerEvent:MouseEvent)(t,{bubbles:true,cancelable:true,composed:true,clientX:cx,clientY:cy,button:0,isPrimary:true})); } catch (e) {}
      });
    } catch (e) {}
  }
  function findBtn(pred){ try { return Array.prototype.slice.call(document.querySelectorAll('button')).find(pred); } catch (e) { return null; } }
  function selectDub(){
    if (dubStage >= 2) return;
    if (dubStage === 0){
      var srv = findBtn(function (x){ return (x.textContent||'').trim() === 'Servers'; });
      if (srv){ pdispatch(srv); dubStage = 1; dubTries = 0; }
      else if (++dubTries > 14){ dubStage = 2; }   // no Servers tab → give up → Original
      return;
    }
    if (dubStage === 1){
      var reD = new RegExp(DUB, 'i');
      var lang = findBtn(function (x){ var t = x.textContent||''; return reD.test(t) && /audio/i.test(t); });
      if (lang){ pdispatch(lang); dubStage = 2; }   // switched → next m3u8 is the dub stream
      else if (++dubTries > 14){ dubStage = 2; }     // dub language absent → Original fallback
      return;
    }
  }

  // --- play kick: start playback, THEN hand off to dub selection --------------
  function kick(){
    try { var v = document.querySelector('video'); if (v) { v.muted = true; var p = v.play && v.play(); if (p && p.catch) p.catch(function(){}); } } catch (e) {}
    try {
      var cx = Math.floor((window.innerWidth||360)/2), cy = Math.floor((window.innerHeight||640)/2);
      var el = document.elementFromPoint(cx, cy);
      if (el) { ['pointerdown','mousedown','mouseup','click'].forEach(function (t){ try { el.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,view:window,clientX:cx,clientY:cy})); } catch (e) {} }); }
    } catch (e) {}
    try { var b = document.querySelector('button.tabbable, [class*="mobileCenterControls"] button, button[aria-label*="lay"], .play-button'); if (b) b.click(); } catch (e) {}
  }

  var tries = 0;
  var iv = setInterval(function (){
    if (window.__captured || tries > 40) { clearInterval(iv); return; }
    tries++;
    var v = document.querySelector('video');
    if (!v || v.paused) { kick(); }   // not playing yet → keep kicking to start it
    else { selectDub(); }             // playing → drive the dub switch; report() then captures
  }, 500);
  post({ type:'debug', msg:'resolver injected' });
  true;
})();
`;

export const StreamResolverWebView: React.FC<StreamResolverWebViewProps> = ({
  embedUrl,
  dubLabel = null,
  navHosts,
  config = DEFAULT_SNIFF,
  onResolved,
  onFail,
}) => {
  const settled = useRef(false);

  const allowedHosts = useMemo(() => {
    if (navHosts && navHosts.length) return navHosts.map((h) => h.toLowerCase());
    try {
      return [new URL(embedUrl).hostname.toLowerCase()];
    } catch {
      return [];
    }
  }, [navHosts, embedUrl]);

  // Block top-frame navigations away from the provider (ad redirects); always
  // allow sub-resources / media / iframes (isTopFrame === false) so the stream loads.
  const onShouldStart = useCallback(
    (req: { url: string; isTopFrame?: boolean }) => {
      if (req.isTopFrame === false) return true;
      const url = req.url || "";
      if (!url || /^(about:|data:|blob:)/.test(url)) return true;
      try {
        const host = new URL(url).hostname.toLowerCase();
        return allowedHosts.some((d) => host === d || host.endsWith("." + d));
      } catch {
        return false;
      }
    },
    [allowedHosts],
  );

  useEffect(() => {
    settled.current = false;
    const timer = setTimeout(() => {
      if (!settled.current) {
        settled.current = true;
        onFail("timeout");
      }
    }, config.timeoutMs);
    return () => clearTimeout(timer);
  }, [embedUrl, config.timeoutMs, onFail]);

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data?.type === "debug") {
        // eslint-disable-next-line no-console
        console.log("[resolver]", data.msg);
        return;
      }
      if (settled.current) return;
      if (data?.type === "media" && data.url) {
        settled.current = true;
        const origin = embedOrigin(embedUrl);
        const headers: Record<string, string> = {
          "User-Agent": DESKTOP_UA,
          ...(origin ? { Referer: origin + "/", Origin: origin } : {}),
          ...(data.headers && typeof data.headers === "object"
            ? data.headers
            : {}),
        };
        // eslint-disable-next-line no-console
        console.log("[resolver] CAPTURED", data.dub, data.url);
        onResolved({ url: data.url, headers, dub: dubLabel ?? "Original" });
      }
    } catch {
      // ignore non-JSON
    }
  };

  const handleError = () => {
    if (settled.current) return;
    settled.current = true;
    onFail("webview-error");
  };

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        source={{ uri: embedUrl, headers: { "User-Agent": DESKTOP_UA } }}
        userAgent={DESKTOP_UA}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        onShouldStartLoadWithRequest={onShouldStart}
        injectedJavaScriptBeforeContentLoaded={buildInjectedJS(
          config.mediaPattern,
          dubLabel,
        )}
        onMessage={handleMessage}
        onError={handleError}
        onHttpError={handleError}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  hidden: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    top: -10,
    left: -10,
  },
});

export default StreamResolverWebView;
