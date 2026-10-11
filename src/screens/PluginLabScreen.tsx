/** Dev-only Plugin Lab: sandbox state, installed repos, the on-device self-test, and a resolve probe (spec §5.4). */
import { runSelfTest, type SelfTestResult } from "@/src/features/dev/pluginSelfTest";
import { useTestStreamsEnabled } from "@/src/features/dev/testStreamsGate";
import { pluginHost, repoStatuses, runInSandbox, sandboxBridge, subscribeRepos } from "@/services/plugins";
import { holdSandbox } from "@/services/plugins/demand";
import type { HostResult } from "@/services/plugins/PluginHost";
import { IconButton } from "@/src/ui";
import { colors, font, ms, radius, spacing } from "@/theme/bearoom";
import { pressedStyle } from "@/theme/styles/interaction";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState, useSyncExternalStore } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function hostOf(url: string): string {
  try {
    return new URL(url).host; // never the full URL: screenshots of this screen must not carry tokens
  } catch {
    return "?";
  }
}

function Button({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && pressedStyle, disabled && styles.disabled]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export default function PluginLabScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const enabled = useTestStreamsEnabled();
  const sandbox = useSyncExternalStore(sandboxBridge.subscribe, sandboxBridge.getState);
  const repos = useSyncExternalStore(subscribeRepos, repoStatuses);
  const [busy, setBusy] = useState(false);
  const [tests, setTests] = useState<SelfTestResult[]>([]);
  const [tmdbId, setTmdbId] = useState("10378");
  const [type, setType] = useState<"movie" | "tv">("movie");
  const [result, setResult] = useState<(HostResult & { ms: number }) | null>(null);

  useEffect(() => (enabled ? holdSandbox() : undefined), [enabled]);

  const selfTest = async () => {
    setBusy(true);
    setTests([]);
    await runSelfTest((key, source, timeoutMs) => runInSandbox(key, source, [], timeoutMs), (r) => setTests((prev) => [...prev, r]));
    setBusy(false);
  };

  const resolve = async () => {
    setBusy(true);
    setResult(null);
    pluginHost.clearCache();
    const started = Date.now();
    const r = await pluginHost.getStreams({ tmdbId: tmdbId.trim(), type, season: type === "tv" ? 1 : undefined, episode: type === "tv" ? 1 : undefined });
    setResult({ ...r, ms: Date.now() - started });
    setBusy(false);
  };

  const passed = tests.filter((t) => t.pass).length;
  return (
    <View style={[styles.root, { paddingTop: insets.top + ms(8) }]}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <IconButton accessibilityLabel="Go back" onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={ms(22)} color={colors.text} />
        </IconButton>
        <Text style={styles.title}>Plugin lab</Text>
      </View>
      {!enabled ? (
        <Text style={styles.dim}>The plugin lab is switched off.</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.lg }}>
          <Text style={styles.section}>SANDBOX</Text>
          <Text style={styles.line}>
            {!sandbox.attached ? "Not mounted" : !sandbox.ready ? "Starting…" : sandbox.csp ? "Ready · direct network blocked" : "Ready · CSP NOT enforced"}
            {`  ·  page ${sandbox.generation}  ·  ${sandbox.running} running`}
          </Text>

          <Text style={styles.section}>REPOS</Text>
          {repos.length ? (
            repos.map((r) => (
              <Text key={r.id} style={styles.line}>
                {`${r.id} · ${r.state} · runs v${r.version ?? "–"}${r.wanted !== r.version ? ` (wants v${r.wanted})` : ""}${r.detail ? ` · ${r.detail}` : ""}`}
              </Text>
            ))
          ) : (
            <Text style={styles.dim}>None listed (or the plugin-host flag is off).</Text>
          )}

          <Text style={styles.section}>SELF-TEST</Text>
          <Button label={busy ? "Running…" : "Run self-test"} onPress={selfTest} disabled={busy} />
          {tests.length ? <Text style={styles.line}>{`${passed}/${tests.length} passed`}</Text> : null}
          {tests.map((t) => (
            <Text key={t.name} style={[styles.line, !t.pass && styles.fail]}>
              {`${t.pass ? "✓" : "✗"} ${t.name} · ${t.ms} ms${t.pass ? "" : `\n   ${t.detail}`}`}
            </Text>
          ))}

          <Text style={styles.section}>RESOLVE</Text>
          <View style={styles.row}>
            <TextInput
              accessibilityLabel="TMDB id"
              value={tmdbId}
              onChangeText={setTmdbId}
              keyboardType="number-pad"
              style={styles.input}
              placeholderTextColor={colors.textFaint}
            />
            <Button label={type === "movie" ? "Movie" : "TV S1E1"} onPress={() => setType(type === "movie" ? "tv" : "movie")} />
            <Button label="Resolve" onPress={resolve} disabled={busy} />
          </View>
          {result ? (
            <>
              <Text style={styles.line}>{`${result.streams.length} streams · ${result.failures.length} failures · ${(result.ms / 1000).toFixed(1)} s · ${result.complete ? "complete" : "returned early"}`}</Text>
              {result.streams.map((s, i) => (
                <Text key={`${s.pluginKey}-${i}`} style={styles.line}>
                  {`${s.name} · ${s.quality ?? "?"} · ${hostOf(s.url)} · subs ${s.subtitles.length}${s.headers.Cookie ? " · cookie" : ""}`}
                </Text>
              ))}
              {result.failures.map((f) => (
                <Text key={f.pluginKey} style={[styles.line, styles.fail]}>{`${f.pluginKey} · ${f.reason} · ${f.ms} ms`}</Text>
              ))}
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", gap: ms(12), paddingHorizontal: spacing.lg },
  title: { color: colors.text, fontFamily: font.headline, fontSize: ms(20) },
  section: { color: colors.textDim, fontFamily: font.label, fontSize: ms(11), letterSpacing: 1.2, marginTop: spacing.sm },
  line: { color: colors.text, fontFamily: font.body, fontSize: ms(13) },
  fail: { color: colors.danger },
  dim: { color: colors.textFaint, fontFamily: font.body, fontSize: ms(13), padding: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  input: {
    flex: 1,
    color: colors.text,
    fontFamily: font.body,
    fontSize: ms(14),
    paddingHorizontal: spacing.md,
    paddingVertical: ms(8),
    borderRadius: radius.md,
    backgroundColor: colors.surfaceStrong,
  },
  button: { paddingHorizontal: spacing.md, paddingVertical: ms(9), borderRadius: radius.pill, backgroundColor: colors.surfaceStrong },
  buttonText: { color: colors.text, fontFamily: font.bodySemi, fontSize: ms(13) },
  disabled: { opacity: 0.5 },
});
