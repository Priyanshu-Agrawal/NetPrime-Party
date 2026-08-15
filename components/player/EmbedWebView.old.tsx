/**
 * EmbedWebView — the legacy third-party embed player, extracted from player.tsx.
 *
 * This is the automatic fallback whenever on-device stream sniffing fails for a
 * provider. Behavior here is identical to what the app shipped before the native
 * player migration: load the provider's embed page in a WebView, sandbox
 * navigation to the provider's own domain, block pop-ups, and bridge the page's
 * fullscreenchange event to screen-orientation locking.
 */
import * as ScreenOrientation from "expo-screen-orientation";
import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import WebView from "react-native-webview";

interface ShouldStartLoadEvent {
  url: string;
  [key: string]: any;
}

interface EmbedWebViewProps {
  /** The embed URL to load (built via streamResolver.buildEmbedUrl). */
  embedUrl: string;
  /** Provider id — used as the WebView key so it remounts on provider switch. */
  providerKey: string;
  /** Whitelisted navigation domains (allowedDomain of every provider). */
  allowedDomains: string[];
}

export const EmbedWebView: React.FC<EmbedWebViewProps> = ({
  embedUrl,
  providerKey,
  allowedDomains,
}) => {
  const handleShouldStartLoadWithRequest = (
    event: ShouldStartLoadEvent,
  ): boolean => {
    const { url } = event;
    if (allowedDomains.some((domain) => url.startsWith(domain))) {
      return true;
    }
    console.warn(`Blocked external navigation from WebView: ${url}`);
    return false;
  };

  const handleOnOpenWindow = ({
    nativeEvent,
  }: {
    nativeEvent: { targetUrl: string };
  }) => {
    console.log("WebView tried to open new window:", nativeEvent.targetUrl);
    return false;
  };

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data?.type === "fullscreenchange" && data.isFullscreen) {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } else if (data?.type === "fullscreenchange" && !data.isFullscreen) {
        ScreenOrientation.unlockAsync();
      }
    } catch (e) {
      console.error("Error parsing WebView message:", e);
    }
  };

  return (
    <WebView
      key={providerKey}
      style={[styles.webview, { backgroundColor: "#000" }]}
      javaScriptEnabled
      allowsFullscreenVideo
      overScrollMode="never"
      startInLoadingState
      renderLoading={() => (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#007bff" />
        </View>
      )}
      source={{ uri: embedUrl }}
      onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
      setSupportMultipleWindows={false}
      onOpenWindow={handleOnOpenWindow}
      onMessage={handleMessage}
      injectedJavaScript={`
        document.documentElement.style.backgroundColor = '#000000';
        document.body.style.backgroundColor = '#000000';
        document.addEventListener('fullscreenchange', function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'fullscreenchange', isFullscreen: !!document.fullscreenElement }));
        });
        const video = document.querySelector('video');
        if (video) { video.play().catch(e => console.log("Autoplay failed:", e)); }
        true;
      `}
    />
  );
};

const styles = StyleSheet.create({
  webview: {
    flex: 1,
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});

export default EmbedWebView;
