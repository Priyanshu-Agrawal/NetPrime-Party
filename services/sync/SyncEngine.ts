/**
 * SyncEngine — the pure (non-React) watch-party sync core, so it can be unit
 * tested deterministically in Node against a fake player + simulated network.
 * `useWatchParty` is a thin React wrapper around this.
 *
 * See useWatchParty for the full model description (virtual timeline, NTP
 * offset via the transport, scheduled playAt, AMP + hysteresis drift
 * correction, and group-pause on buffering).
 */
import type { PartyMedia, SyncMessage, Transport } from "./types";

export interface PlayerControl {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setRate(rate: number): void;
}

export type SyncEventType =
  | "ready"
  | "play"
  | "pause"
  | "seeking"
  | "seeked"
  | "ended"
  | "waiting"
  | "playing"
  | "canplay"
  | "tick";

export interface SyncPlayerEvent {
  event: SyncEventType;
  currentTime: number;
  duration: number;
  paused: boolean;
}

// --- Tunable parameters (from robust-sync research) ------------------------
const SCHEDULE_DELAY_MS = 400;
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
const STATE_INTERVAL_MS = 1000;
const STALL_DEBOUNCE_MS = 500;
// A `seeked` event landing within this of the expected position is our own
// programmatic re-seek, not a user scrub — ignore it so we don't loop.
const USER_SEEK_THRESHOLD_S = 2.0;

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

interface Timeline {
  streamStart: number; // reference ms at which media pos 0 plays (when playing)
  paused: boolean;
  pausedPos: number;
}

export class SyncEngine {
  private timeline: Timeline = { streamStart: 0, paused: true, pausedPos: 0 };
  private lastPos = 0;
  private driftEma = 0;
  private driftSamples: number[] = [];
  private correcting = false;
  private persist = 0;
  private rate = 1;
  private lastHardSeek = 0;
  private seq = 0;
  private lastSeq = -1;

  private synced = false; // guest: has it caught up to the host's timeline yet?
  private source: string | null = null; // provider id the whole room plays
  private media: PartyMedia | null = null; // what the whole room plays
  private adoptedSource = false; // guest: has it adopted the host's source yet?
  private detached = false; // guest: user locally paused → stop following until they resume/jump
  private userPaused = true;
  private memberBuffering = new Map<string, boolean>();
  private localBuffering = false;
  private bufTimer: ReturnType<typeof setTimeout> | null = null;

  private timers = new Set<ReturnType<typeof setTimeout>>();
  private stateTimer: ReturnType<typeof setInterval> | null = null;
  private unsub: (() => void) | null = null;

  constructor(
    private transport: Transport,
    private isHost: boolean,
    private player: PlayerControl,
    private opts: {
      onSource?: (id: string, media: PartyMedia | null) => void;
      /** Guest: fired when the user locally pauses (detached) / re-attaches. */
      onDetach?: (detached: boolean) => void;
    } = {},
  ) {}

  // --- lifecycle -----------------------------------------------------------
  start(): void {
    if (this.isHost) {
      this.unsub = this.transport.subscribe((msg) => this.onHostMessage(msg));
      this.stateTimer = setInterval(() => this.sendState(), STATE_INTERVAL_MS);
    } else {
      this.unsub = this.transport.subscribe((msg) => this.onGuestMessage(msg));
    }
  }
  stop(): void {
    this.unsub?.();
    this.unsub = null;
    if (this.stateTimer) clearInterval(this.stateTimer);
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    if (this.bufTimer) clearTimeout(this.bufTimer);
  }

  // --- helpers -------------------------------------------------------------
  private expectedPos(atMs: number): number {
    const t = this.timeline;
    return t.paused ? t.pausedPos : Math.max(0, (atMs - t.streamStart) / 1000);
  }
  private setRate(r: number): void {
    if (this.rate !== r) {
      this.rate = r;
      this.player.setRate(r);
    }
  }
  private scheduleExec(fn: () => void, playAt: number): void {
    const delay = Math.max(0, playAt - this.transport.now());
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, delay);
    this.timers.add(id);
  }
  private applyTimelineNow = (): void => {
    // A guest who locally paused (detached) must not be force-followed; they
    // re-sync only on resume / "Jump to Live".
    if (this.detached) return;
    this.driftEma = 0;
    this.setRate(1);
    const pos = this.expectedPos(this.transport.now());
    this.player.seek(pos);
    if (this.timeline.paused) this.player.pause();
    else this.player.play();
  };

  private setDetached(d: boolean): void {
    if (this.detached === d) return;
    this.detached = d;
    this.opts.onDetach?.(d);
  }

  /** Guest: re-attach to the party and jump to the host's current live position. */
  jumpToLive(): void {
    this.setDetached(false);
    this.applyTimelineNow();
  }

  /**
   * A play/pause/seeked event from the embed's OWN controls (programmatic ones
   * are suppressed by the bridge's applying-guard, so anything reaching here is
   * the USER). Host: make it authoritative for the room. Guest: pausing detaches
   * (local pause); resuming re-attaches and jumps to the host's live position.
   */
  private handleUserControl(e: SyncPlayerEvent): void {
    if (this.isHost) {
      if (e.event === "play") {
        if (this.timeline.paused) this.requestPlay();
      } else if (e.event === "pause") {
        if (!this.timeline.paused) this.requestPause();
      } else if (e.event === "seeked") {
        const expected = this.expectedPos(this.transport.now());
        if (Math.abs(e.currentTime - expected) > USER_SEEK_THRESHOLD_S) {
          this.requestSeek(e.currentTime);
        }
      }
    } else {
      if (e.event === "pause") {
        if (!this.timeline.paused && !this.detached) this.setDetached(true);
      } else if (e.event === "play") {
        if (this.detached) this.jumpToLive();
      }
      // guest scrub (seeked) is left to drift correction (host authority)
    }
  }

  // --- host command emit + reconcile --------------------------------------
  private emit(
    action: SyncMessage["action"],
    position: number,
    paused: boolean,
  ): void {
    const playAt = this.transport.now() + SCHEDULE_DELAY_MS;
    if (action === "PLAY") {
      this.timeline = { paused: false, pausedPos: position, streamStart: playAt - position * 1000 };
    } else if (action === "PAUSE") {
      this.timeline = { ...this.timeline, paused: true, pausedPos: position };
    } else if (action === "SEEK") {
      this.timeline = this.timeline.paused
        ? { ...this.timeline, pausedPos: position }
        : { paused: false, pausedPos: position, streamStart: playAt - position * 1000 };
    }
    this.transport.send({
      from: this.transport.clientId,
      action,
      position,
      paused,
      serverTs: this.transport.now(),
      playAt,
      seq: ++this.seq,
    });
    this.scheduleExec(this.applyTimelineNow, playAt);
  }

  private effectivePaused(): boolean {
    return (
      this.userPaused ||
      Array.from(this.memberBuffering.values()).some(Boolean)
    );
  }
  private reconcile(): void {
    const shouldPause = this.effectivePaused();
    if (shouldPause === this.timeline.paused) return;
    if (shouldPause) this.emit("PAUSE", this.expectedPos(this.transport.now()), true);
    else this.emit("PLAY", this.timeline.pausedPos, false);
  }

  private sendState(): void {
    const t = this.timeline;
    this.transport.send({
      from: this.transport.clientId,
      action: "STATE",
      position: this.expectedPos(this.transport.now()),
      paused: t.paused,
      serverTs: this.transport.now(),
      seq: this.seq,
      // Echo the room's source + media so a late joiner adopts the right provider
      // and title even if it missed the one-shot SOURCE broadcast.
      source: this.source ?? undefined,
      media: this.media ?? undefined,
    });
  }

  /**
   * Host: declare WHAT (media) + WHERE (provider) the whole room plays. Broadcast
   * it and re-echo it on every STATE so late joiners (who only entered a code)
   * learn the title + provider.
   */
  setSource(id: string, media?: PartyMedia): void {
    if (media) this.media = media;
    if (!this.isHost || (this.source === id && !media)) return;
    this.source = id;
    this.transport.send({
      from: this.transport.clientId,
      action: "SOURCE",
      position: 0,
      paused: this.timeline.paused,
      serverTs: this.transport.now(),
      source: id,
      media: this.media ?? undefined,
      seq: this.seq,
    });
  }

  // --- public host API -----------------------------------------------------
  requestPlay(): void {
    this.userPaused = false;
    this.reconcile();
  }
  requestPause(): void {
    this.userPaused = true;
    this.reconcile();
  }
  requestSeek(position: number): void {
    this.emit("SEEK", position, this.timeline.paused);
  }

  // --- buffering signalling ------------------------------------------------
  private signalBuffering(b: boolean): void {
    if (this.localBuffering === b) return;
    this.localBuffering = b;
    if (this.isHost) {
      this.memberBuffering.set(this.transport.clientId, b);
      this.reconcile();
    } else {
      this.transport.send({
        from: this.transport.clientId,
        action: "BUFFER",
        position: this.lastPos,
        paused: true,
        serverTs: this.transport.now(),
        buffering: b,
        seq: 0,
      });
    }
  }

  // --- message handlers ----------------------------------------------------
  private onHostMessage(msg: SyncMessage): void {
    if (msg.action === "BUFFER" && msg.from !== this.transport.clientId) {
      this.memberBuffering.set(msg.from, !!msg.buffering);
      this.reconcile();
    }
  }
  private adoptSource(id: string | undefined, media: PartyMedia | undefined): void {
    if (media) this.media = media;
    if (!id || (this.source === id && this.adoptedSource)) return;
    this.source = id;
    this.adoptedSource = true;
    this.opts.onSource?.(id, this.media);
  }
  private onGuestMessage(msg: SyncMessage): void {
    if (msg.from === this.transport.clientId) return;
    if (msg.action === "BUFFER") return;
    if (msg.action === "SOURCE") {
      this.adoptSource(msg.source, msg.media);
      return;
    }
    // A STATE heartbeat re-echoes the room source; adopt it if we missed the
    // one-shot SOURCE (e.g. we joined late).
    if (msg.action === "STATE" && !this.adoptedSource) this.adoptSource(msg.source, msg.media);
    if (msg.action !== "STATE") {
      if (msg.seq <= this.lastSeq) return;
      this.lastSeq = msg.seq;
    }
    const applyAt = msg.playAt ?? this.transport.now();
    switch (msg.action) {
      case "PLAY":
        this.timeline = {
          paused: false,
          pausedPos: msg.position,
          streamStart: (msg.playAt ?? msg.serverTs) - msg.position * 1000,
        };
        this.synced = true;
        this.scheduleExec(this.applyTimelineNow, applyAt);
        break;
      case "PAUSE":
        this.timeline = { ...this.timeline, paused: true, pausedPos: msg.position };
        this.synced = true;
        this.scheduleExec(this.applyTimelineNow, applyAt);
        break;
      case "SEEK":
        this.timeline = this.timeline.paused
          ? { ...this.timeline, pausedPos: msg.position }
          : {
              paused: false,
              pausedPos: msg.position,
              streamStart: (msg.playAt ?? msg.serverTs) - msg.position * 1000,
            };
        this.synced = true;
        this.scheduleExec(this.applyTimelineNow, applyAt);
        break;
      case "STATE":
        this.timeline = {
          streamStart: msg.paused
            ? this.timeline.streamStart
            : msg.serverTs - msg.position * 1000,
          paused: msg.paused,
          pausedPos: msg.position,
        };
        // LATE-JOINER CATCH-UP: the first time we learn the host's timeline,
        // jump our player straight to it (seek + play/pause) instead of waiting
        // for the drift loop to converge. Subsequent STATEs only re-anchor.
        if (!this.synced) {
          this.synced = true;
          this.scheduleExec(this.applyTimelineNow, this.transport.now());
        }
        break;
    }
  }

  // --- player events (drift correction + stall detection) ------------------
  onPlayerEvent(e: SyncPlayerEvent): void {
    if (e.event === "waiting") {
      if (!this.bufTimer && !this.localBuffering) {
        this.bufTimer = setTimeout(() => {
          this.bufTimer = null;
          this.signalBuffering(true);
        }, STALL_DEBOUNCE_MS);
      }
    } else if (e.event === "playing" || e.event === "canplay") {
      // Recovery = buffer refilled (`canplay`) or playback resumed (`playing`).
      // NOT `seeked`/tick-advance: a programmatic seek (e.g. the group-pause's
      // own seek) jumps currentTime and would be misread as recovery, canceling
      // the pause. (In the real player, programmatic seeks are also suppressed
      // by the bridge's applying-guard.)
      if (this.bufTimer) {
        clearTimeout(this.bufTimer);
        this.bufTimer = null;
      }
      this.signalBuffering(false);
    }

    // User pressed the embed's own play/pause/seek → sync it (host) or detach (guest).
    if (e.event === "play" || e.event === "pause" || e.event === "seeked") {
      this.handleUserControl(e);
    }

    if (e.event === "tick" || e.event === "seeked" || e.event === "playing") {
      this.lastPos = e.currentTime;
    }
    if (e.event !== "tick") return;

    // Detached guest is intentionally paused/behind — don't drift-correct them.
    if (this.detached) {
      this.setRate(1);
      return;
    }

    const t = this.timeline;
    if (t.streamStart === 0 && t.pausedPos === 0 && t.paused) return; // not started
    if (t.paused) {
      this.correcting = false;
      this.persist = 0;
      this.setRate(1);
      return;
    }

    const exp = this.expectedPos(this.transport.now());
    const rawDrift = e.currentTime - exp;
    this.driftSamples.push(rawDrift);
    if (this.driftSamples.length > MEDIAN_N) this.driftSamples.shift();
    const medDrift = median(this.driftSamples);
    this.driftEma = this.driftEma * (1 - DRIFT_EMA_ALPHA) + rawDrift * DRIFT_EMA_ALPHA;

    if (Math.abs(medDrift) >= RATE_ZONE_MAX_S) {
      this.persist += 1;
      const now = Date.now();
      if (
        this.persist >= SEEK_PERSIST_N &&
        now - this.lastHardSeek >= HARD_SEEK_COOLDOWN_MS
      ) {
        this.lastHardSeek = now;
        this.persist = 0;
        this.correcting = false;
        this.driftEma = 0;
        this.driftSamples.length = 0;
        this.setRate(1);
        this.player.seek(exp);
      }
      return;
    }
    this.persist = 0;

    const ema = this.driftEma;
    if (this.correcting) {
      if (Math.abs(ema) < RESET_BAND_S) {
        this.correcting = false;
        this.setRate(1);
      } else {
        this.setRate(clamp(1 - ema / SYNC_WINDOW_S, RATE_MIN, RATE_MAX));
      }
    } else if (Math.abs(ema) >= DEAD_BAND_S) {
      this.correcting = true;
      this.setRate(clamp(1 - ema / SYNC_WINDOW_S, RATE_MIN, RATE_MAX));
    } else {
      this.setRate(1);
    }
  }
}
