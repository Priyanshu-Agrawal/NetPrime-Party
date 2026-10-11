import type { ScoreDeps, ScoreReport } from "@/services/plugins/scorecard";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ScorecardPanel } from "./ScorecardPanel";

const ROW = {
  id: "cand",
  manifestUrl: "https://codeberg.org/x/y/raw/commit/4e486ed0d02f/manifest.json",
  version: 1,
  files: [{ path: "manifest.json", sha256: "a".repeat(64) }],
  enabled: false,
  down: false,
  allowPlugins: ["p1", "p2"],
};
const REPORT: ScoreReport = {
  titles: [
    { name: "Jawan", streams: 6, probed: 5, playable: 3, unverified: 1, hindiPlayable: 2, wrong: 1, firstStreamMs: 1200 },
    { name: "Oppenheimer", streams: 0, probed: 0, playable: 0, unverified: 0, hindiPlayable: 0, wrong: 0, firstStreamMs: null },
  ],
  plugins: [
    { pluginId: "p1", answered: 2, empty: 1, notRun: 0, titlesWithStreams: 1, streams: 6, probed: 5, playable: 3, unverified: 1, hindiPlayable: 2, wrong: 1, failures: { timeout: 2 } },
    { pluginId: "p2", answered: 2, empty: 2, notRun: 0, titlesWithStreams: 0, streams: 0, probed: 0, playable: 0, unverified: 0, hindiPlayable: 0, wrong: 0, failures: {} },
    { pluginId: "p3", answered: 0, empty: 0, notRun: 0, titlesWithStreams: 0, streams: 0, probed: 0, playable: 0, unverified: 0, hindiPlayable: 0, wrong: 0, failures: { timeout: 2 } },
    { pluginId: "p4", answered: 0, empty: 0, notRun: 2, titlesWithStreams: 0, streams: 0, probed: 0, playable: 0, unverified: 0, hindiPlayable: 0, wrong: 0, failures: {} },
  ],
  bytes: 5 * 1024 * 1024,
  stoppedBy: "done",
};
const texts = (r: ReactTestRenderer) => r.root.findAll((n) => (n.type as unknown) === "Text").map((n) => [n.props.children].flat().join(""));
const press = (r: ReactTestRenderer, label: string) => act(() => r.root.findByProps({ accessibilityLabel: label }).props.onPress());
const flush = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });

describe("ScorecardPanel", () => {
  it("lists candidates, runs a smoke scorecard and shows the summary, titles and plugins (hosts only)", async () => {
    let bytes = 0;
    const openRepo = jest.fn(async () => {
      bytes += 2 * 1024 * 1024; // the install's downloads
      return { host: { getStreams: jest.fn() }, plugins: [{ pluginId: "p1" }, { pluginId: "p2" }], status: { state: "ok" }, obfuscated: ["p2"] };
    });
    const runScore = jest.fn(async (_titles: unknown, _deps: ScoreDeps) => REPORT);
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<ScorecardPanel candidates={[ROW]} openRepo={openRepo as never} runScore={runScore} platform="android" bytesUsed={() => bytes} probe={jest.fn()} />);
    });
    expect(texts(r)).toContain("cand · 4e486ed · 2 plugins");
    press(r, "Smoke cand");
    await flush();
    expect(runScore.mock.calls[0][1].budgetBytes).toBe(58 * 1024 * 1024); // 60 MB less what the install took
    expect(runScore.mock.calls[0][1].pluginIds).toEqual(["p1", "p2"]);
    const shown = texts(r).join("\n");
    expect(shown).toContain(
      "cand smoke · android: 1/2 titles playable · labelled Hindi on 1 · 1 wrong streams · first stream p50 1.2 s · 5.0 MB + 2.0 MB install · done · obfuscated 1/2",
    );
    expect(shown).toContain("Jawan: 6 streams · 5 probed · 3 ok · 1 unverified · 2 Hindi · 1 wrong · 1.2 s");
    expect(shown).toContain("p1: streams on 1/2 titles · 6 streams · 5 probed · 3 ok · 1 unverified · 2 Hindi · 1 wrong · timeout×2");
    expect(shown).toContain("answered with nothing: p2");
    expect(shown).toContain("only failed: p3 (timeout×2)");
    expect(shown).toContain("never ran: p4");
    expect(shown).not.toMatch(/https?:/);
  });

  it("Stop asks the running scorecard to stop", async () => {
    let deps!: ScoreDeps;
    let finish!: (r: ScoreReport) => void;
    const runScore = jest.fn((_t: unknown, d: ScoreDeps) => {
      deps = d;
      return new Promise<ScoreReport>((res) => (finish = res));
    });
    const openRepo = jest.fn(async () => ({ host: { getStreams: jest.fn() }, plugins: [], status: { state: "ok" }, obfuscated: [] }));
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<ScorecardPanel candidates={[ROW]} openRepo={openRepo as never} runScore={runScore} platform="ios" bytesUsed={() => 0} probe={jest.fn()} />);
    });
    press(r, "Smoke cand");
    await flush();
    expect(deps.stopped()).toBe(false);
    press(r, "Stop scorecard");
    expect(deps.stopped()).toBe(true);
    const shouldStop = (openRepo.mock.calls[0] as unknown as [unknown, () => boolean])[1];
    expect(shouldStop()).toBe(true); // no further plugin starts either
    expect(texts(r).join("\n")).toContain("stopping… (plugins already running finish first)");
    await act(async () => finish({ ...REPORT, stoppedBy: "user" }));
  });

  it("leaving the Lab stops the run, and a new Lab can't start another until it has finished", async () => {
    let deps!: ScoreDeps;
    let finish!: (r: ScoreReport) => void;
    const runScore = jest.fn((_t: unknown, d: ScoreDeps) => {
      deps = d;
      return new Promise<ScoreReport>((res) => (finish = res));
    });
    const openRepo = jest.fn(async () => ({ host: { getStreams: jest.fn() }, plugins: [], status: { state: "ok" }, obfuscated: [] }));
    const panel = () => <ScorecardPanel candidates={[ROW]} openRepo={openRepo as never} runScore={runScore} platform="android" bytesUsed={() => 0} probe={jest.fn()} />;
    let r!: ReactTestRenderer;
    act(() => {
      r = create(panel());
    });
    press(r, "Smoke cand");
    await flush();
    act(() => r.unmount());
    expect(deps.stopped()).toBe(true);
    let r2!: ReactTestRenderer;
    act(() => {
      r2 = create(panel());
    });
    expect(r2.root.findByProps({ accessibilityLabel: "Smoke cand" }).props.disabled).toBe(true);
    expect(texts(r2).join("\n")).toContain("a scorecard run is still finishing");
    await act(async () => finish({ ...REPORT, stoppedBy: "user" }));
    await flush();
    expect(r2.root.findByProps({ accessibilityLabel: "Smoke cand" }).props.disabled).toBe(false);
    act(() => r2.unmount());
  });

  it("a candidate that fails to install says why", async () => {
    const openRepo = jest.fn(async () => ({ host: { getStreams: jest.fn() }, plugins: [], status: { state: "failed", detail: "hash mismatch for providers/x.js" }, obfuscated: [] }));
    const runScore = jest.fn();
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<ScorecardPanel candidates={[ROW]} openRepo={openRepo as never} runScore={runScore} platform="android" bytesUsed={() => 0} probe={jest.fn()} />);
    });
    press(r, "Smoke cand");
    await flush();
    expect(texts(r).join("\n")).toContain("cand: failed — hash mismatch for providers/x.js");
    expect(runScore).not.toHaveBeenCalled();
  });
});
