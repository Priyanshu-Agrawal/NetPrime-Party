/**
 * Deterministic test for the NEW control behaviors (Node, no device):
 *   1. HOST native controls are authoritative — when the host uses the embed's
 *      OWN play/pause/seek, it syncs to the room (not just the overlay buttons).
 *   2. GUEST local pause DETACHES (host keeps playing, guest stays put), and on
 *      resume the guest JUMPS to the host's live position (catch-up).
 *
 * A "user control" is simulated by feeding a play/pause/seeked event into the
 * engine (exactly what the WebView bridge does). The engine's OWN programmatic
 * play/pause/seek never re-enter onPlayerEvent (the bridge's applying-guard
 * suppresses those), so the FakePlayer here never echoes engine-driven changes.
 *
 * Run:  npx --yes tsx services/sync/selftest-controls.mts
 */
import { SyncEngine, type PlayerControl, type SyncEventType } from "./SyncEngine";
import { createMockTransport } from "./mockTransport";

class FakePlayer implements PlayerControl {
  currentTime = 0;
  paused = true;
  rate = 1;
  private last = Date.now();
  play() { this.paused = false; }
  pause() { this.paused = true; }
  seek(s: number) { this.currentTime = Math.max(0, s); }
  setRate(r: number) { this.rate = r; }
  advance() {
    const now = Date.now();
    const dt = (now - this.last) / 1000;
    this.last = now;
    if (!this.paused) this.currentTime += dt * this.rate;
  }
}

// Mild network here: this test verifies CONTROL PROPAGATION (play/pause/seek/
// detach), not drift robustness under adverse conditions — that's selftest.mts.
// A generous settle window before each check keeps it stable under machine load.
const hostT = createMockTransport("c", "host", { latencyMs: 40, jitterMs: 15, clockSkewMs: -100 });
const guestT = createMockTransport("c", "guest", { latencyMs: 60, jitterMs: 20, clockSkewMs: 150 });
const hostP = new FakePlayer();
const guestP = new FakePlayer();
let detached = false;
const host = new SyncEngine(hostT, true, hostP);
const guest = new SyncEngine(guestT, false, guestP, { onDetach: (d) => (detached = d) });
host.start();
guest.start();

/** Simulate the USER pressing a native control: set the player state + emit the event. */
function user(p: FakePlayer, eng: SyncEngine, event: SyncEventType, opts: { paused?: boolean; seekTo?: number } = {}) {
  if (opts.seekTo != null) p.currentTime = opts.seekTo;
  if (opts.paused != null) p.paused = opts.paused;
  eng.onPlayerEvent({ event, currentTime: p.currentTime, duration: 8000, paused: p.paused });
}
function tick(p: FakePlayer, eng: SyncEngine) {
  eng.onPlayerEvent({ event: "tick", currentTime: p.currentTime, duration: 8000, paused: p.paused });
}

let t = 0;
const drift = () => Math.abs(hostP.currentTime - guestP.currentTime);
const checks: { name: string; ok: boolean; detail: string }[] = [];

// Poll-until-condition assertions: robust to machine-load timing slippage (we
// wait up to `ticks` for the condition to hold, rather than sampling one instant).
const pending: { name: string; cond: () => boolean; detail: () => string; deadline: number }[] = [];
function expect(name: string, cond: () => boolean, detail: () => string, ticks = 20) {
  pending.push({ name, cond, detail, deadline: t + ticks });
}
function record(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

// Scripted actions (spaced out); each registers a poll-based expectation.
const script: [number, () => void][] = [
  [3, () => {
    user(hostP, host, "play", { paused: false }); // host presses PLAY on the embed
    expect("host native PLAY synced guest", () => !hostP.paused && !guestP.paused && drift() < 1.5,
      () => `host=${hostP.currentTime.toFixed(2)} guest=${guestP.currentTime.toFixed(2)} drift=${drift().toFixed(3)}`);
  }],
  [9, () => {
    user(hostP, host, "pause", { paused: true }); // host presses PAUSE
    expect("host native PAUSE synced guest", () => hostP.paused && guestP.paused,
      () => `hostPaused=${hostP.paused} guestPaused=${guestP.paused}`);
  }],
  [14, () => {
    user(hostP, host, "play", { paused: false }); // host resumes
    expect("host native resume synced guest", () => !hostP.paused && !guestP.paused,
      () => `hostPaused=${hostP.paused} guestPaused=${guestP.paused}`);
  }],
  [19, () => {
    user(hostP, host, "seeked", { seekTo: hostP.currentTime + 300 }); // host scrubs +300s
    expect("host native SEEK synced guest", () => drift() < 1.5,
      () => `host=${hostP.currentTime.toFixed(1)} guest=${guestP.currentTime.toFixed(1)} drift=${drift().toFixed(3)}`);
  }],
  [25, () => {
    user(guestP, guest, "pause", { paused: true }); // guest pauses locally → detach
    expect("guest pause DETACHES (host runs ahead, guest frozen)",
      () => detached && guestP.paused && !hostP.paused && hostP.currentTime > guestP.currentTime + 2,
      () => `detached=${detached} guestPaused=${guestP.paused} host=${hostP.currentTime.toFixed(1)} guest=${guestP.currentTime.toFixed(1)}`);
  }],
  [32, () => {
    user(guestP, guest, "play", { paused: false }); // guest resumes → jump to live
    expect("guest resume JUMPS to host live (caught up)",
      () => !detached && !guestP.paused && drift() < 1.5,
      () => `detached=${detached} drift=${drift().toFixed(3)} host=${hostP.currentTime.toFixed(1)} guest=${guestP.currentTime.toFixed(1)}`);
  }],
];
const TOTAL_CHECKS = script.length;

const loop = setInterval(() => {
  t += 0.25;
  hostP.advance();
  guestP.advance();
  tick(hostP, host);
  tick(guestP, guest);

  for (const [at, fn] of script) if (Math.abs(t - at) < 0.01) fn();

  for (let i = pending.length - 1; i >= 0; i--) {
    const p = pending[i];
    if (p.cond()) { record(p.name, true, p.detail()); pending.splice(i, 1); }
    else if (t >= p.deadline) { record(p.name, false, p.detail()); pending.splice(i, 1); }
  }

  if (checks.length >= TOTAL_CHECKS) {
    clearInterval(loop);
    finish();
  }
}, 250);

function finish() {
  host.stop();
  guest.stop();
  const all = checks.every((c) => c.ok);
  console.log("\n========== RESULT ==========");
  for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}`);
  console.log(`\nOVERALL: ${all ? "✅ ALL PASS" : "❌ FAIL"}`);
  process.exit(all ? 0 : 1);
}
