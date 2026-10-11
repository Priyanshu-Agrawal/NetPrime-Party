/**
 * The one hidden WebView that runs plugin code (spec §5.4). It is invisible and untouchable, loads only the sandbox
 * page, keeps no storage or cookies, and is replaced when its process dies (spec §7 F9).
 */
import type { SandboxBridge } from "@/services/plugins/sandboxBridge";
import { SANDBOX_HTML } from "@/services/plugins/sandbox/runtime.generated";
import React, { useLayoutEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import WebView from "react-native-webview";

export const SANDBOX_ORIGIN = "https://plugin-sandbox.invalid/";

type Bridge = Pick<SandboxBridge, "attach" | "detach" | "onMessage" | "crashed" | "setRestartHandler">;

export default function PluginSandbox({ bridge }: { bridge: Bridge }) {
  const ref = useRef<WebView>(null);
  const [generation, setGeneration] = useState(0);

  // Layout effect: attached before the page can load and announce `ready`.
  useLayoutEffect(() => {
    bridge.setRestartHandler(() => setGeneration((g) => g + 1));
    bridge.attach((js) => ref.current?.injectJavaScript(js));
    return () => bridge.detach();
  }, [bridge, generation]);

  return (
    <View style={styles.host} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <WebView
        key={generation}
        ref={ref}
        source={{ html: SANDBOX_HTML, baseUrl: SANDBOX_ORIGIN }}
        onMessage={(e) => bridge.onMessage(e.nativeEvent.data)}
        onShouldStartLoadWithRequest={(r: { url: string }) => r.url === SANDBOX_ORIGIN || r.url === "about:blank"}
        onRenderProcessGone={() => bridge.crashed()}
        onContentProcessDidTerminate={() => bridge.crashed()}
        javaScriptEnabled
        domStorageEnabled={false}
        cacheEnabled={false}
        incognito
        thirdPartyCookiesEnabled={false}
        sharedCookiesEnabled={false}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        mediaPlaybackRequiresUserAction
        style={styles.web}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: -10, top: -10, width: 1, height: 1, opacity: 0, overflow: "hidden" },
  web: { width: 1, height: 1, backgroundColor: "transparent" },
});
