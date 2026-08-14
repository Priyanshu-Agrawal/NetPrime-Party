/**
 * SnifferWebView — on-device stream extractor.
 *
 * Renders an offscreen (0-size) WebView that loads a provider's embed page and
 * hooks `window.fetch` / `XMLHttpRequest.open` in the TOP document, posting back
 * the first URL that looks like a media stream (.m3u8/.mp4). The player hands the
 * captured URL + synthesized request headers to expo-video.
 *
 * KNOWN LIMITATION: injected JS runs in the top frame only. If a provider fetches
 * its stream from inside a CROSS-ORIGIN iframe, that request is invisible here and
 * the sniff will time out — the caller then falls back to the embed WebView. Which
 * providers are actually sniffable must be measured on-device (migration Phase 1).
 */
import React, { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import WebView from "react-native-webview";
import {
  DEFAULT_SNIFF,
  embedOrigin,
  type SniffConfig,
} from "@/utils/streamResolver";

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface SniffResult {
  url: string;
  headers: Record<string, string>;
}

interface SnifferWebViewProps {
  embedUrl: string;
  config?: SniffConfig;
  onCapture: (result: SniffResult) => void;
  onFail: (reason: string) => void;
}

const buildInjectedJS = (pattern: RegExp) => `
(function () {
  var re = ${pattern.toString()};
  function report(u, headers) {
    try {
      if (u && re.test(u)) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'media', url: u, headers: headers || null }));
      }
    } catch (e) {}
  }
  function headerObj(h) {
    var out = {};
    try {
      if (!h) return out;
      if (typeof h.forEach === 'function') { h.forEach(function (v, k) { out[k] = v; }); return out; }
      if (Array.isArray(h)) { h.forEach(function (p) { out[p[0]] = p[1]; }); return out; }
      return h;
    } catch (e) { return out; }
  }
  var of = window.fetch;
  if (of) {
    window.fetch = function (input, init) {
      try {
        var u = typeof input === 'string' ? input : (input && input.url);
        report(u, init && headerObj(init.headers));
      } catch (e) {}
      return of.apply(this, arguments);
    };
  }
  var oo = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    try { report(url); } catch (e) {}
    return oo.apply(this, arguments);
  };
  true;
})();
`;

export const SnifferWebView: React.FC<SnifferWebViewProps> = ({
  embedUrl,
  config = DEFAULT_SNIFF,
  onCapture,
  onFail,
}) => {
  const settled = useRef(false);

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
    if (settled.current) return;
    try {
      const data = JSON.parse(event.nativeEvent.data);
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
        onCapture({ url: data.url, headers });
      }
    } catch {
      // ignore non-JSON messages
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
        injectedJavaScriptBeforeContentLoaded={buildInjectedJS(
          config.mediaPattern,
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

export default SnifferWebView;
