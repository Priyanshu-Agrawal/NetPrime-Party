/**
 * TEMPORARY dev harness to verify StreamResolverWebView resolves videasy's
 * master.m3u8 OFFSCREEN. Reach it: `adb shell am start -a android.intent.action.VIEW
 * -d "bearoom://resolvertest"`. DELETE once the native player is wired.
 */
import StreamResolverWebView, {
  type ResolvedNativeStream,
} from "@/components/player/StreamResolverWebView";
import {
  buildEmbedUrl,
  getProvider,
  providerHosts,
} from "@/components/player/providerRegistry";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const TEST_TMDB = "550"; // Fight Club (movie)

/** Mounts AFTER capture: proves expo-video plays the sniffed HLS URL natively. */
function NativePlayback({
  url,
  headers,
}: {
  url: string;
  headers: Record<string, string>;
}) {
  const player = useVideoPlayer({ uri: url, headers, contentType: "hls" }, (p) => {
    p.timeUpdateEventInterval = 1;
    p.play();
  });
  const [t, setT] = useState(0);
  const [pstatus, setPstatus] = useState("idle");
  const [err, setErr] = useState("");

  useEffect(() => {
    const iv = setInterval(() => {
      try {
        if (player.status === "readyToPlay" && !player.playing) player.play();
        setT(player.currentTime);
        setPstatus(player.status);
      } catch (e) {
        setErr(String(e));
      }
    }, 500);
    return () => clearInterval(iv);
  }, [player]);

  return (
    <View style={{ marginTop: 16 }}>
      <Text style={styles.label}>expo-video (native playback)</Text>
      <Text style={styles.status}>
        {err
          ? `❌ ${err}`
          : `status: ${pstatus}   t=${t.toFixed(1)}s   playing=${String(
              player.playing,
            )}`}
      </Text>
      <VideoView
        player={player}
        style={{ width: "100%", height: 200, marginTop: 8, backgroundColor: "#000" }}
        contentFit="contain"
        nativeControls
      />
    </View>
  );
}

export default function ResolverTest() {
  // Auto-runs the Original resolve on mount (headless: deep-link is enough).
  const [runId, setRunId] = useState(1);
  const [dub, setDub] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "resolving" | "ok" | "fail">(
    "resolving",
  );
  const [result, setResult] = useState<ResolvedNativeStream | null>(null);
  const [reason, setReason] = useState("");
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);

  const provider = getProvider("videasy");
  const embedUrl = useMemo(
    () =>
      provider
        ? buildEmbedUrl(provider, { tmdbId: TEST_TMDB, type: "movie" })
        : "",
    [provider],
  );
  const navHosts = useMemo(
    () => (provider ? providerHosts(provider) : []),
    [provider],
  );

  const run = (dubLabel: string | null) => {
    setDub(dubLabel);
    setStatus("resolving");
    setResult(null);
    setReason("");
    setStartedAt(Date.now());
    setElapsed(0);
    setRunId((n) => n + 1);
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ padding: 16, paddingTop: 56 }}
    >
      <Text style={styles.h1}>Resolver Test</Text>
      <Text style={styles.mono}>{embedUrl || "no videasy provider"}</Text>

      <View style={styles.row}>
        <Pressable style={styles.btn} onPress={() => run(null)}>
          <Text style={styles.btnText}>Resolve (Original)</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={() => run("Hindi")}>
          <Text style={styles.btnText}>Resolve Hindi (Fade)</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>Status</Text>
      <Text
        style={[
          styles.status,
          status === "ok" && styles.ok,
          status === "fail" && styles.fail,
        ]}
      >
        {status === "idle" && "— tap a button —"}
        {status === "resolving" && `RESOLVING… (${dub ?? "Original"})`}
        {status === "ok" && `✅ CAPTURED (${result?.dub})  ${elapsed}ms`}
        {status === "fail" && `❌ FAILED: ${reason}  ${elapsed}ms`}
      </Text>

      {result && (
        <>
          <Text style={styles.label}>Captured URL</Text>
          <Text selectable style={styles.mono}>
            {result.url}
          </Text>
          <Text style={styles.label}>Headers</Text>
          <Text style={styles.mono}>{JSON.stringify(result.headers)}</Text>
          <NativePlayback url={result.url} headers={result.headers} />
        </>
      )}

      {status === "resolving" && embedUrl && (
        <StreamResolverWebView
          key={runId}
          embedUrl={embedUrl}
          dubLabel={dub}
          navHosts={navHosts}
          config={{ mediaPattern: /\.m3u8|\.mp4/i, timeoutMs: 25000 }}
          onResolved={(r) => {
            setElapsed(Date.now() - startedAt);
            setResult(r);
            setStatus("ok");
          }}
          onFail={(why) => {
            setElapsed(Date.now() - startedAt);
            setReason(why);
            setStatus("fail");
          }}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#100D0A" },
  h1: { color: "#F6EFE3", fontSize: 24, fontWeight: "800", marginBottom: 8 },
  label: {
    color: "#A79E90",
    fontSize: 12,
    marginTop: 16,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  mono: { color: "#F0A93C", fontSize: 12, fontFamily: "monospace" },
  row: { flexDirection: "row", gap: 10, marginTop: 16, flexWrap: "wrap" },
  btn: {
    backgroundColor: "#F0A93C",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  btnText: { color: "#1A1206", fontWeight: "700" },
  status: { color: "#F6EFE3", fontSize: 16, fontWeight: "600" },
  ok: { color: "#7BD88F" },
  fail: { color: "#E5736B" },
});
