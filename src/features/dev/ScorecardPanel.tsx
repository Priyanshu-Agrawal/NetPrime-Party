/**
 * Plugin Lab › Scorecard (dev only, spec §9 row 2): run a pinned candidate repo over the benchmark in Bearoom's real
 * sandbox and show what it really plays here. Smoke = 4 titles (60 MB cap), Full = 20 titles (400 MB cap) — the
 * network may be metered. Hosts and counts only: no URL ever reaches this screen.
 */
import type { PluginHost } from "@/services/plugins/PluginHost";
import type { RepoStatus } from "@/services/plugins/registry";
import type { BenchTitle, ScoreDeps, ScoreReport } from "@/services/plugins/scorecard";
import type { PluginRepoRow } from "@/src/types/worker.types";
import { colors, font, ms, radius, spacing } from "@/theme/bearoom";
import React, { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BENCH_FULL, BENCH_SMOKE } from "./scorecardData";

const MB = 1024 * 1024;
const STAGES = { smoke: { titles: BENCH_SMOKE, budget: 60 * MB }, full: { titles: BENCH_FULL, budget: 400 * MB } } as const;
type Stage = keyof typeof STAGES;

export interface ScorecardPanelProps {
  candidates: PluginRepoRow[];
  openRepo(row: PluginRepoRow): Promise<{ host: Pick<PluginHost, "getStreams">; plugins: unknown[]; status: Pick<RepoStatus, "state" | "detail">; obfuscated: string[] }>;
  runScore(titles: BenchTitle[], deps: ScoreDeps): Promise<ScoreReport>;
  probe: ScoreDeps["probe"];
  platform: "ios" | "android";
  bytesUsed(): number;
}

function commitOf(manifestUrl: string): string {
  return /\/([0-9a-f]{7,64})\/manifest\.json$/.exec(manifestUrl)?.[1].slice(0, 7) ?? "?";
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
}

const secs = (ms: number | null) => (ms == null ? "–" : `${(ms / 1000).toFixed(1)} s`);

export function summaryLine(id: string, stage: string, platform: string, r: ScoreReport, obfuscated: number, plugins: number): string {
  const playable = r.titles.filter((t) => t.playable > 0).length;
  const hindi = r.titles.filter((t) => t.hindiPlayable > 0).length;
  const wrong = r.titles.reduce((n, t) => n + t.wrong, 0);
  const p50 = median(r.titles.map((t) => t.firstStreamMs).filter((x): x is number => x != null));
  return `${id} ${stage} · ${platform}: ${playable}/${r.titles.length} titles playable · Hindi on ${hindi} · wrong ${wrong} · first stream p50 ${secs(p50)} · ${(r.bytes / MB).toFixed(1)} MB · ${r.stoppedBy} · obfuscated ${obfuscated}/${plugins}`;
}

interface Result {
  id: string;
  lines: string[];
}

export function ScorecardPanel({ candidates, openRepo, runScore, probe, platform, bytesUsed }: ScorecardPanelProps) {
  const [running, setRunning] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const stop = useRef(false);

  const run = async (row: PluginRepoRow, stage: Stage) => {
    stop.current = false;
    setRunning(row.id);
    setProgress(`${row.id} ${stage}: installing…`);
    const done = (lines: string[]) => setResults((prev) => [{ id: `${row.id}-${stage}-${prev.length}`, lines }, ...prev]);
    try {
      const repo = await openRepo(row);
      if (repo.status.state !== "ok") {
        done([`${row.id}: ${repo.status.state} — ${repo.status.detail ?? "no detail"}`]);
        return;
      }
      const start = bytesUsed();
      const { titles, budget } = STAGES[stage];
      const report = await runScore(titles, {
        getStreams: (req, opts) => repo.host.getStreams(req, opts),
        probe,
        platform,
        now: Date.now,
        bytesUsed,
        budgetBytes: budget,
        stopped: () => stop.current,
        probeLimit: 8,
        onProgress: (n, total) => setProgress(`${row.id} ${stage}: ${n}/${total} · ${((bytesUsed() - start) / MB).toFixed(1)} MB`),
      });
      const silent = report.plugins.filter((p) => p.streams === 0);
      done([
        summaryLine(row.id, stage, platform, report, repo.obfuscated.length, repo.plugins.length),
        ...report.titles.map((t) => `${t.name}: ${t.streams} streams · ${t.playable} playable · ${t.hindiPlayable} Hindi · ${t.wrong} wrong · ${secs(t.firstStreamMs)}`),
        ...report.plugins
          .filter((p) => p.streams > 0)
          .map((p) => {
            const fails = Object.entries(p.failures).map(([k, n]) => `${k}×${n}`).join(", ");
            return `${p.pluginId}: ${p.titlesWithStreams} titles · ${p.streams} streams · ${p.playable} playable · ${p.hindiPlayable} Hindi · ${p.wrong} wrong${fails ? ` · ${fails}` : ""}`;
          }),
        ...(silent.length ? [`no streams: ${silent.map((p) => p.pluginId).join(", ")}`] : []),
        ...(repo.obfuscated.length ? [`obfuscated: ${repo.obfuscated.join(", ")}`] : []),
      ]);
    } catch (e) {
      done([`${row.id}: error — ${String((e as Error)?.message ?? e).replace(/https?:\/\/\S+/g, "<url>")}`]);
    } finally {
      setRunning(null);
      setProgress("");
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Scorecard</Text>
      {candidates.map((row) => (
        <View key={row.id} style={styles.row}>
          <Text style={styles.text}>{`${row.id} · ${commitOf(row.manifestUrl)} · ${row.allowPlugins?.length ?? "all"} plugins`}</Text>
          <View style={styles.buttons}>
            {(["smoke", "full"] as const).map((stage) => (
              <Pressable
                key={stage}
                accessibilityRole="button"
                accessibilityLabel={`${stage === "smoke" ? "Smoke" : "Full"} ${row.id}`}
                disabled={running != null}
                onPress={() => void run(row, stage)}
                style={[styles.button, running != null && styles.disabled]}
              >
                <Text style={styles.buttonText}>{stage === "smoke" ? "Smoke" : "Full"}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      {running ? (
        <View style={styles.row}>
          <Text style={styles.text}>{progress}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Stop scorecard" onPress={() => (stop.current = true)} style={styles.button}>
            <Text style={styles.buttonText}>Stop</Text>
          </Pressable>
        </View>
      ) : null}
      {results.map((r) => (
        <View key={r.id} style={styles.result}>
          {r.lines.map((l, i) => (
            <Text key={i} style={i === 0 ? styles.summary : styles.text}>
              {l}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  title: { color: colors.text, fontFamily: font.headline, fontSize: ms(15) },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  buttons: { flexDirection: "row", gap: spacing.xs },
  button: { paddingHorizontal: ms(12), paddingVertical: ms(6), borderRadius: radius.pill, backgroundColor: colors.honeySoft },
  disabled: { opacity: 0.5 },
  buttonText: { color: colors.honey, fontFamily: font.label, fontSize: ms(12) },
  text: { color: colors.textDim, fontFamily: font.body, fontSize: ms(11.5), flexShrink: 1 },
  summary: { color: colors.text, fontFamily: font.bodySemi, fontSize: ms(12) },
  result: { gap: ms(2), paddingTop: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
