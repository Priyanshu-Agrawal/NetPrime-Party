/**
 * Deterministic sync self-test (Node, no emulator/stream/network needed).
 * HOST + GUEST SyncEngine over the in-memory mock network with adverse,
 * asymmetric conditions (latency, jitter, 800ms clock-skew gap) + fake players.
 *
 * Scenario: host plays → GUEST JOINS LATE (must catch up) → seek → guest stalls
 * (group-pause) → recover. Asserts:
 *   1. late joiner catches up to the host within ~a few seconds,
 *   2. sync stays tight while playing (AMP, no thrash),
 *   3. a guest stall group-pauses BOTH, then both resume together.
 *
 * Run:  npx --yes tsx services/sync/selftest.mts
 */
import { SyncEngine, type PlayerControl, type SyncEventType } from "./SyncEngine";
import { createMockTransport } from "./mockTransport";

class FakePlayer implements PlayerControl {
  currentTime = 0;
  paused = true; // no autoplay — matches VidLink autoplay=false
  rate = 1;
  buffering = false;
  private last = Date.now();
  play() {
    this.paused = false;
  }
  pause() {
    this.paused = true;
  }
  seek(s: number) {
    this.currentTime = Math.max(0, s);
  }
  setRate(r: number) {
    this.rate = r;
  }
  advance() {
    const now = Date.now();
    const dt = (now - this.last) / 1000;
    this.last = now;
    if (!this.paused && !this.buffering) this.currentTime += dt * this.rate;
  }
}

const hostT = createMockTransport("t", "host", { latencyMs: 90, jitterMs: 40, clockSkewMs: -300 });
const guestT = createMockTransport("t", "guest", { latencyMs: 200, jitterMs: 80, clockSkewMs: 500 });
const hostP = new FakePlayer();
const guestP = new FakePlayer();
const host = new SyncEngine(hostT, true, hostP);
const guest = new SyncEngine(guestT, false, guestP);
host.start(); // guest joins LATE (see t=4)
let guestJoined = false;

function emit(p: FakePlayer, eng: SyncEngine, event: SyncEventType) {
  eng.onPlayerEvent({ event, currentTime: p.currentTime, duration: 8000, paused: p.paused });
}

let t = 0;
let maxDriftPlaying = 0;
let lateJoinDrift = 99;
let stallHostPaused = false;
let stallGuestPaused = false;
let resumedBoth = false;
let phase = "warmup";

const loop = setInterval(() => {
  t += 0.25;
  hostP.advance();
  guestP.advance();
  emit(hostP, host, "tick");
  if (guestJoined) emit(guestP, guest, "tick");

  const drift = Math.abs(hostP.currentTime - guestP.currentTime);
  if (phase === "playing" || phase === "afterresume") {
    maxDriftPlaying = Math.max(maxDriftPlaying, drift);
  }
  if (Math.abs(t - Math.round(t)) < 0.01) {
    console.log(`  t=${t.toFixed(0)}s drift=${drift.toFixed(3)}s host=${hostP.currentTime.toFixed(2)} guest=${guestP.currentTime.toFixed(2)} rate(g)=${guestP.rate.toFixed(2)} ${hostP.paused ? "Hpause" : ""}${guestP.paused ? " Gpause" : ""}`);
  }

  if (t === 2) {
    console.log(`[t=2] host requestPlay (guest not joined yet)`);
    host.requestPlay();
  }
  if (t === 4) {
    console.log(`[t=4] GUEST JOINS LATE (host already at ${hostP.currentTime.toFixed(1)}s)`);
    guest.start();
    guestJoined = true;
  }
  if (t === 7) {
    lateJoinDrift = drift;
    console.log(`[t=7] late-join caught up? drift=${lateJoinDrift.toFixed(3)}s`);
    phase = "playing";
    maxDriftPlaying = 0;
  }
  if (t === 9) {
    console.log(`[t=9] steady drift max=${maxDriftPlaying.toFixed(3)}s → seek +120`);
    host.requestSeek(hostP.currentTime + 120);
  }
  if (t === 10) maxDriftPlaying = 0;
  if (t === 12) {
    console.log(`[t=12] GUEST STALL`);
    guestP.buffering = true;
    emit(guestP, guest, "waiting");
    phase = "stalling";
  }
  if (t === 14.5) {
    stallHostPaused = hostP.paused;
    stallGuestPaused = guestP.paused;
    console.log(`[t=14.5] during stall: hostPaused=${hostP.paused} guestPaused=${guestP.paused} host=${hostP.currentTime.toFixed(1)} guest=${guestP.currentTime.toFixed(1)}`);
  }
  if (t === 16) {
    console.log(`[t=16] GUEST RECOVERS (canplay)`);
    guestP.buffering = false;
    emit(guestP, guest, "canplay");
    phase = "afterresume";
    maxDriftPlaying = 0;
  }
  if (t === 17) phase = "playing";
  if (t === 21) {
    resumedBoth = !hostP.paused && !guestP.paused;
    console.log(`[t=21] after resume: hostPaused=${hostP.paused} guestPaused=${guestP.paused} drift max=${maxDriftPlaying.toFixed(3)}s`);
    clearInterval(loop);
    finish();
  }
}, 250);

function finish() {
  host.stop();
  guest.stop();
  const okJoin = lateJoinDrift < 1.5;
  const okDrift = maxDriftPlaying < 1.5;
  const okGroupPause = stallHostPaused && stallGuestPaused;
  const okResume = resumedBoth;
  console.log("\n========== RESULT ==========");
  console.log(`late joiner catches up (drift < 1.5s):     ${okJoin ? "PASS" : "FAIL"} (${lateJoinDrift.toFixed(3)}s)`);
  console.log(`sync while playing (max drift < 1.5s):     ${okDrift ? "PASS" : "FAIL"} (${maxDriftPlaying.toFixed(3)}s)`);
  console.log(`group-pause on guest stall (both paused):  ${okGroupPause ? "PASS" : "FAIL"}`);
  console.log(`resume together after recovery:            ${okResume ? "PASS" : "FAIL"}`);
  const all = okJoin && okDrift && okGroupPause && okResume;
  console.log(`\nOVERALL: ${all ? "✅ ALL PASS" : "❌ FAIL"}`);
  process.exit(all ? 0 : 1);
}
