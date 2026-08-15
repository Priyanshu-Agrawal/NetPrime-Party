/**
 * TEMPORARY dev route (netprime://vidinspect) — a plain, persistent, VISIBLE
 * videasy WebView for CDP DOM reverse-engineering (settings gear → Servers/dub
 * tab selectors). No play-kick, so the DOM stays stable for inspection. DELETE
 * with resolvertest once the native player is wired.
 */
import {
  buildEmbedUrl,
  getProvider,
  isAllowedTopNav,
  providerHosts,
} from "@/components/player/providerRegistry";
import React from "react";
import { StyleSheet, View } from "react-native";
import WebView from "react-native-webview";

const p = getProvider("videasy");
const URL = p ? buildEmbedUrl(p, { tmdbId: "550", type: "movie" }) : "about:blank";
const HOSTS = p ? providerHosts(p) : [];
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export default function VidInspect() {
  return (
    <View style={styles.root}>
      <WebView
        source={{ uri: URL, headers: { "User-Agent": UA } }}
        userAgent={UA}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        onShouldStartLoadWithRequest={(req) => isAllowedTopNav(HOSTS, req)}
        injectedJavaScriptBeforeContentLoaded={
          'try{window.open=function(){return null};}catch(e){}; true;'
        }
        style={styles.web}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  web: { flex: 1 },
});
