/**
 * PartySyncEngine — drives the local player to match the room's authoritative
 * playback, and routes the user's own controls back to the authority.
 *
 * Ported from services/sync/SyncEngine, but re-based on the new model:
 *   - "Expected position" comes from the PlaybackAnchor + the STABLE server clock
 *     (client.now()), not a host-relative timeline. effectivePositionMs() is the
 *     single source of truth.
 *   - A NEW anchor (epoch:seq changed — a real control event or a handoff) is
 *     applied immediately: seek to the effective position + match play/pause/rate.
 *     No scheduled playAt is needed because the anchor is self-describing.
 *   - Between anchors, the same two-tier drift correction as before keeps us
 *     locked: dead-band → imperceptible rate nudge (0.9–1.1×) → hard seek when
 *     far off. (Programmatic seeks are echo-suppressed by the player bridge.)
 *   - Host: the user's embed controls become authoritative RPCs. Guest: a local
 *     pause DETACHES (stops following) and a resume JUMPS TO LIVE.
 *
 * Native rooms (players whose capabilities say partySync) add the spec §6.4 buffering protocol: a stall counts after
 * 3 s; the host's pauses the room, a guest's never does (it catches up to live on recovery). A player without
 * fractional rate is never nudged, only seeked when 2 s off. WebView rooms (no capabilities) behave as before.
 */
import type { PlayerEvent } from "@/components/player/HijackPlayer";
import type { PartyClient } from "./PartyClient";
import { effectivePositionMs, type PlaybackAnchor } from "./protocol";

export interface PlayerControl {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setRate(rate: number): void;
  /** What the player can do (PlayerHandle v2). Absent = today's WebView behaviour, unchanged. */
  capabilities?(): { fractionalRate: boolean; partySync: boolean } | undefined;
}

// --- drift tunables (identical to the proven SyncEngine values) -------------
const DEAD_BAND_S = 0.2;
const RESET_BAND_S = 0.1;
const RATE_ZONE_MAX_S = 3.0;
const SYNC_WINDOW_S = 1.0;
const RATE_MIN = 0.9;
const RATE_MAX = 1.1;
const HARD_SEEK_COOLDOWN_MS = 8000;
const SEEK_PERSIST_N = 3;
const DRIFT_EMA_ALPHA = 0.25;
const MEDIAN_N = 5;
// A `seeked` landing within this of expected is our own re-seek, not a user scrub.
const USER_SEEK_THRESHOLD_S = 2.0;
// Native rooms (spec §6.4): a stall counts only after this long; a guest catching up lands this far past live (HLS
// segments start on keyframes, so landing slightly ahead avoids an immediate re-buffer behind the room).
const STALL_MS = 3000;
const CATCH_UP_LEAD_S = 1;
// A player without fractional rate can't be nudged: it only seeks, once this far off.
const NO_RATE_SEEK_BAND_S = 2.0;

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class PartySyncEngine {
  private anchor: PlaybackAnchor | null = null;
  private appliedKey = ""; // epoch:seq of the last anchor we applied
  private detached = false;
  private lastCt = 0; // last observed player position (s), for redundant-seek avoidance

  private driftEma = 0;
  private driftSamples: number[] = [];
  private correcting = false;
  private persist = 0;
  private rate = 1;
  private lastHardSeek = 0;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  /** |offset from the room| per tick while following a playing room (the S5 readout); last 600 ticks. */
  private recentDrift: number[] = [];
  private stalled = false;
  /** The room was paused because of the host's stall (so recovery resumes it — and only then). */
  private pausedForStall = false;

  constructor(
    private client: PartyClient,
    private player: PlayerControl,
    private opts: {
      onDetach?: (detached: boolean) => void;
      /** Host only, native rooms: the host's player stalled for over 3 s — pause the room at `atSec`, the host's frozen
       * frame — or recovered (resume). */
      onHostStall?: (stalled: boolean, atSec?: number) => void;
    } = {},
  ) {}

  private caps() {
    return this.player.capabilities?.();
  }

  /** Feed a new snapshot's playback anchor. Re-applies only when it changed. */
  setAnchor(anchor: PlaybackAnchor): void {
    if (this.anchor && anchor.epoch !== this.anchor.epoch) this.resetStall(); // a new item: an old stall is moot
    this.anchor = anchor;
    const key = `${anchor.epoch}:${anchor.seq}`;
    if (key !== this.appliedKey) {
      this.appliedKey = key;
      this.applyAnchorNow();
    }
  }

  get isDetached(): boolean {
    return this.detached;
  }

  /** Guest: re-attach and jump to the room's current live position. */
  jumpToLive(): void {
    this.setDetached(false);
    this.applyAnchorNow();
  }

  /** Foreground: snap followers to live. Detached guests stay detached. */
  resync(): void {
    if (this.detached) return;
    this.applyAnchorNow();
  }

  onPlayerEvent(e: PlayerEvent): void {
    if (Number.isFinite(e.currentTime)) this.lastCt = e.currentTime;
    if (e.event === "buffering" && this.caps()?.partySync) {
      this.onBuffering(e.buffering === true);
      return;
    }
    // Anything reaching here is a USER action (bridge suppresses our own changes).
    if (e.event === "play" || e.event === "pause" || e.event === "seeked") {
      this.handleUserControl(e);
    }
    if (e.event !== "tick") return;
    if (__DEV__) {
      // Party-gate instrumentation (read over CDP): playback position on the shared
      // server clock, so host and guests can be compared without trusting device clocks.
      const g = globalThis as unknown as { __partyPos?: { t: number; ct: number }[] };
      (g.__partyPos ??= []).push({ t: this.client.now(), ct: e.currentTime });
    }
    if (this.detached) {
      this.setRate(1);
      return;
    }
    this.drift(e);
  }

  /** The host paused or seeked on purpose: a stall-pause in progress is theirs now, so recovery won't resume it. */
  userPaused(): void {
    this.pausedForStall = false;
  }

  /** Stop the stall timer (the session is going away). */
  dispose(): void {
    this.resetStall();
  }

  private resetStall(): void {
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.stallTimer = null;
    this.stalled = false;
    this.pausedForStall = false;
  }

  /** Spec §6.4 buffering protocol (native rooms): only a stall over 3 s counts; a host's pauses the room, a guest's
   * never does — the guest catches up to live when it recovers. */
  private onBuffering(buffering: boolean): void {
    if (buffering) {
      if (this.stallTimer || this.stalled) return;
      this.stallTimer = setTimeout(() => {
        this.stallTimer = null;
        this.stalled = true;
        if (this.client.isHost && this.anchor?.status === "playing") {
          this.pausedForStall = true;
          this.opts.onHostStall?.(true, this.lastCt);
        }
      }, STALL_MS);
      return;
    }
    if (this.stallTimer) {
      clearTimeout(this.stallTimer);
      this.stallTimer = null;
    }
    if (!this.stalled) return;
    this.stalled = false;
    if (this.client.isHost) {
      if (this.pausedForStall) {
        this.pausedForStall = false;
        this.opts.onHostStall?.(false);
      }
    } else if (this.pausedForStall) {
      this.pausedForStall = false; // lost the host role mid-stall: the new host owns the room now
    } else if (!this.detached && this.anchor?.status === "playing") this.player.seek(this.expectedSec() + CATCH_UP_LEAD_S);
  }

  /** p50/p95 of how far this player sat from the room over recent ticks (seconds; nearest rank). */
  driftStats(): { n: number; p50: number; p95: number } {
    const s = [...this.recentDrift].sort((a, b) => a - b);
    const at = (p: number) => (s.length ? s[Math.max(0, Math.ceil(p * s.length) - 1)] : 0);
    return { n: s.length, p50: at(0.5), p95: at(0.95) };
  }

  // --- helpers --------------------------------------------------------------
  private expectedSec(): number {
    if (!this.anchor) return 0;
    return effectivePositionMs(this.anchor, this.client.now()) / 1000;
  }

  private setRate(r: number): void {
    if (this.rate !== r) {
      this.rate = r;
      this.player.setRate(r);
    }
  }

  private setDetached(d: boolean): void {
    if (this.detached === d) return;
    this.detached = d;
    this.opts.onDetach?.(d);
  }

  private applyAnchorNow(): void {
    if (!this.anchor || this.detached) return;
    // The room paused for this host's own stall: leave the player loading where it froze — pausing it would end the
    // "stall" (and resume the room at once), and seeking would jump into media that isn't there yet.
    if (this.client.isHost && this.pausedForStall) return;
    this.driftEma = 0;
    this.driftSamples.length = 0;
    this.correcting = false;
    this.persist = 0;
    this.setRate(this.anchor.rate);
    const target = this.expectedSec();
    // Only re-seek when actually off target. A seek re-buffers these streams; when
    // the host acts, the video is already at the right spot, so a redundant seek
    // froze playback and made the controls feel unresponsive.
    if (Math.abs(this.lastCt - target) > 1.5) this.player.seek(target);
    if (this.anchor.status === "paused") this.player.pause();
    else this.player.play();
  }

  private handleUserControl(e: PlayerEvent): void {
    if (!this.anchor) return;
    if (this.client.isHost) {
      if (e.event === "play" && this.anchor.status === "paused") void this.client.play();
      else if (e.event === "pause" && this.anchor.status === "playing") void this.client.pause();
      else if (e.event === "seeked") {
        const exp = this.expectedSec();
        if (Math.abs(e.currentTime - exp) > USER_SEEK_THRESHOLD_S) {
          void this.client.seek(e.currentTime * 1000);
        }
      }
    } else {
      // Guest: local pause detaches; resume jumps to live. Scrubs are left to
      // drift correction (the host owns the timeline).
      if (e.event === "pause" && this.anchor.status === "playing" && !this.detached) {
        this.setDetached(true);
      } else if (e.event === "play" && this.detached) {
        this.jumpToLive();
      }
    }
  }

  private drift(e: PlayerEvent): void {
    if (!this.anchor) return;
    if (this.anchor.status === "paused") {
      this.correcting = false;
      this.persist = 0;
      this.setRate(1);
      return;
    }
    // The room's base playback rate (the host may have changed it). Drift
    // correction nudges AROUND this base, and "in sync" means playing at exactly
    // this rate — otherwise a non-1× room would drift every tick and hard-seek
    // forever. (base === 1 → identical to the original 1× behavior.)
    const base = this.anchor.rate || 1;
    const exp = this.expectedSec();
    const rawDrift = e.currentTime - exp;
    this.recentDrift.push(Math.abs(rawDrift));
    if (this.recentDrift.length > 600) this.recentDrift.shift();
    if (__DEV__) {
      // Party-gate instrumentation (read over CDP): every raw drift sample, in seconds.
      const g = globalThis as unknown as { __partyDrift?: { t: number; d: number }[] };
      (g.__partyDrift ??= []).push({ t: Date.now(), d: rawDrift });
    }
    this.driftSamples.push(rawDrift);
    if (this.driftSamples.length > MEDIAN_N) this.driftSamples.shift();
    const medDrift = median(this.driftSamples);

    if (this.caps()?.fractionalRate === false) {
      // No rate control: never nudge; seek once clearly off (2 s), with the usual persistence + cooldown.
      if (Math.abs(medDrift) < NO_RATE_SEEK_BAND_S) {
        this.persist = 0;
        return;
      }
      this.persist += 1;
      const nowMs = Date.now();
      if (this.persist >= SEEK_PERSIST_N && nowMs - this.lastHardSeek >= HARD_SEEK_COOLDOWN_MS) {
        this.lastHardSeek = nowMs;
        this.persist = 0;
        this.driftSamples.length = 0;
        this.player.seek(exp);
      }
      return;
    }
    this.driftEma = this.driftEma * (1 - DRIFT_EMA_ALPHA) + rawDrift * DRIFT_EMA_ALPHA;

    if (Math.abs(medDrift) >= RATE_ZONE_MAX_S) {
      this.persist += 1;
      const nowMs = Date.now();
      if (this.persist >= SEEK_PERSIST_N && nowMs - this.lastHardSeek >= HARD_SEEK_COOLDOWN_MS) {
        this.lastHardSeek = nowMs;
        this.persist = 0;
        this.correcting = false;
        this.driftEma = 0;
        this.driftSamples.length = 0;
        this.setRate(base);
        this.player.seek(exp);
      }
      return;
    }
    this.persist = 0;

    const ema = this.driftEma;
    const nudge = (): number => clamp(base * (1 - ema / SYNC_WINDOW_S), base * RATE_MIN, base * RATE_MAX);
    if (this.correcting) {
      if (Math.abs(ema) < RESET_BAND_S) {
        this.correcting = false;
        this.setRate(base);
      } else {
        this.setRate(nudge());
      }
    } else if (Math.abs(ema) >= DEAD_BAND_S) {
      this.correcting = true;
      this.setRate(nudge());
    } else {
      this.setRate(base);
    }
  }
}
