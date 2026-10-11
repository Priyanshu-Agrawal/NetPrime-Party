import type { PlayerEvent, PlayerEventType } from "../types";

export type NativeStatus = "idle" | "loading" | "readyToPlay" | "error";

/** A seek lands when the player reports a position this close to the target (spec §1.1 gate: ≤ 0.25 s). */
export const LAND_TOLERANCE_SEC = 0.25;
/** A seek that never reports landing resolves anyway after this long, with wherever playback is. */
export const SEEK_TIMEOUT_MS = 8000;

interface PendingSeek {
  target: number;
  startedAt: number;
  sawLoading: boolean;
  resolve: (landed: number) => void;
}

/**
 * Turns expo-video's raw signals into the PlayerEvents every engine emits. expo-video has no seek event and shows a
 * stall only as status "loading", so `seeked` and `buffering` are synthesised here (spec §6.2). `paused` follows the
 * user's intent, not `isPlaying` — which is also false while buffering.
 */
export class NativeEventMachine {
  private wantPlaying = false;
  private status: NativeStatus = "idle";
  private time = 0;
  private duration = 0;
  private buffered = 0;
  private ready = false;
  private stalled = false;
  private atEnd = false;
  private seek: PendingSeek | null = null;

  constructor(
    private readonly emit: (e: PlayerEvent) => void,
    private readonly now: () => number = Date.now,
  ) {}

  get position(): number {
    return this.time;
  }
  get paused(): boolean {
    return !this.wantPlaying;
  }
  get isBuffering(): boolean {
    return this.stalled;
  }
  /** Playback reached the end and hasn't been sent anywhere since (a plain play won't restart it). */
  get ended(): boolean {
    return this.atEnd;
  }

  setIntent(play: boolean): void {
    if (play) this.atEnd = false;
    if (play === this.wantPlaying) return;
    this.wantPlaying = play;
    this.out(play ? "play" : "pause");
    this.updateStall();
  }

  onStatus(status: NativeStatus, duration?: number): void {
    const prev = this.status;
    this.status = status;
    if (duration != null) this.onDuration(duration);
    if (status === "loading" && this.seek) this.seek.sawLoading = true;
    if (status === "readyToPlay" && !this.ready) {
      this.ready = true;
      this.out("ready");
    }
    if (status === "readyToPlay" && prev === "loading" && this.seek?.sawLoading) this.land();
    this.updateStall();
  }

  onDuration(duration: number): void {
    if (Number.isFinite(duration) && duration > 0) this.duration = duration;
  }

  onPlaying(isPlaying: boolean): void {
    if (isPlaying) this.out("playing");
  }

  onTime(currentTime: number, bufferedPosition: number): void {
    if (Number.isFinite(currentTime)) this.time = currentTime;
    if (Number.isFinite(bufferedPosition)) this.buffered = bufferedPosition;
    if (this.seek && Math.abs(this.time - this.seek.target) <= LAND_TOLERANCE_SEC) this.land();
    else this.expireSeek();
    this.out("tick", { bufferedAheadSec: Math.max(0, this.buffered - this.time) });
  }

  onEnded(): void {
    this.atEnd = true;
    this.wantPlaying = false;
    this.updateStall();
    this.out("ended");
  }

  /** Starts a seek; resolves with the LANDED position. A newer seek resolves an older one where playback is. */
  beginSeek(target: number): Promise<number> {
    const t = Math.max(0, this.duration > 0 ? Math.min(target, this.duration) : target);
    this.atEnd = false;
    this.seek?.resolve(this.time);
    this.out("seeking", undefined, t);
    return new Promise((resolve) => {
      this.seek = { target: t, startedAt: this.now(), sawLoading: false, resolve };
    });
  }

  /** Resolves a seek that never reported landing (called by the player's timer and on every tick). */
  expireSeek(): void {
    if (this.seek && this.now() - this.seek.startedAt >= SEEK_TIMEOUT_MS) this.land();
  }

  private land(): void {
    const s = this.seek;
    if (!s) return;
    this.seek = null;
    s.resolve(this.time);
    this.out("seeked");
  }

  private updateStall(): void {
    const stalled = this.ready && this.wantPlaying && this.status === "loading";
    if (stalled === this.stalled) return;
    this.stalled = stalled;
    this.out("buffering", { buffering: stalled });
  }

  private out(event: PlayerEventType, extra?: Partial<PlayerEvent>, currentTime = this.time): void {
    this.emit({
      event,
      currentTime,
      duration: this.duration,
      paused: !this.wantPlaying,
      readyState: this.stalled ? 2 : 4,
      ...extra,
    });
  }
}
