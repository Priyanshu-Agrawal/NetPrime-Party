/**
 * PartyClient — the client half of the Supabase-only watch party.
 *
 * MODEL (matches supabase/migrations/0001_party_core.sql):
 *   - Postgres is the AUTHORITY. Every mutation is an RPC that validates + writes
 *     one room row under a lock and returns the canonical snapshot.
 *   - now() is the STABLE server clock: we estimate our offset to party_server_time
 *     (min-RTT filtered). It does NOT move when the host changes — that's what
 *     makes handoff seamless.
 *   - TRANSPORT is Realtime Broadcast: after any mutating RPC the caller
 *     broadcasts the returned snapshot for low-latency fan-out; the host also
 *     re-broadcasts on each lease heartbeat so guests re-anchor + detect liveness.
 *     Snapshots are applied newest-wins by (epoch, seq).
 *   - HOST is a leased role. The host renews its lease every ~2s (RN interval
 *     in the foreground, and again from HijackPlayer ticks so Android Home
 *     does not drop the lease while the media pipeline is still alive). If the
 *     lease lapses, guests trigger party_claim_host with a joinedAt-ranked
 *     backoff; Postgres' row lock picks exactly one winner.
 *
 * PartyClient knows nothing about the video player — the sync engine sits on top
 * and drives the player from onSnapshot(playback) + now().
 */
import { ensurePartyAuth, supabase } from "@/services/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getInstallationId } from "./identity";
import { genRoomCode } from "@/utils/roomCode";
import { LEASE_RENEW_INTERVAL_MS } from "./protocol";
import type {
  HostLease,
  Member,
  PartyMedia,
  Permissions,
  PlaybackAnchor,
  QueueItem,
  QueueItemInput,
  RoomConfig,
} from "./protocol";

export interface RoomSnapshot {
  code: string;
  lease: HostLease;
  playback: PlaybackAnchor;
  /** Derived mirror of the current queue item; null for a non-TMDB source. */
  media: PartyMedia | null;
  queue: QueueItem[];
  currentItemId: string | null;
  /** Bumped by every queue mutation. Guards against out-of-order queue state. */
  queueRev: number;
  config: RoomConfig;
  members: Member[];
  serverTimeMs: number;
}

/**
 * A heartbeat broadcast omits the queue (see broadcast()), so the three queue
 * fields are optional on the wire and reconstructed in applySnapshot().
 */
type WireSnapshot = Omit<RoomSnapshot, "queue" | "currentItemId" | "queueRev"> &
  Partial<Pick<RoomSnapshot, "queue" | "currentItemId" | "queueRev">>;

const HOST_TIMEOUT_MS = 7000; // no host heartbeat this long -> consider host gone
const CLOCK_PING_BURST = 5; // initial offset-estimation pings
const CLOCK_PING_INTERVAL_MS = 10000;
const WATCHDOG_INTERVAL_MS = 1500;
const CLAIM_BACKOFF_MS = 700; // per joinedAt rank, staggers concurrent claims

export class PartyClient {
  userId = "";
  private code: string;
  private displayName: string;
  private wantHost: boolean;
  private initialMedia?: PartyMedia;
  private password?: string;

  private channel: RealtimeChannel | null = null;
  private snap: RoomSnapshot | null = null;

  private offset = 0;
  private clockSamples: { offset: number; rtt: number }[] = [];
  private lastSnapAt = 0;

  private leaseTimer: ReturnType<typeof setInterval> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private clockTimer: ReturnType<typeof setInterval> | null = null;
  private claiming = false;
  private destroyed = false;
  private kicked = false;
  private lastLeaseRenewAt = 0;
  private leaseRenewInFlight = false;

  // A Set, not a single callback: the snapshot is read through
  // useSyncExternalStore by every component that selects from it, so there are
  // many concurrent subscribers with independent lifetimes.
  private snapCbs = new Set<(s: RoomSnapshot) => void>();
  private connCb: ((n: number) => void) | null = null;
  private kickedCb: (() => void) | null = null;

  constructor(opts: {
    code: string;
    role: "host" | "guest";
    displayName: string;
    media?: PartyMedia;
    password?: string;
  }) {
    this.code = opts.code;
    this.displayName = opts.displayName;
    this.wantHost = opts.role === "host";
    this.initialMedia = opts.media;
    this.password = opts.password;
  }

  // --- public accessors -----------------------------------------------------
  /**
   * Subscribe to snapshots. Returns an unsubscribe, and the signature is
   * deliberately `() => void` so it drops straight into useSyncExternalStore
   * alongside the `snapshot` getter below — which is already a valid
   * getSnapshot, since applySnapshot() replaces `this.snap` wholesale and the
   * reference is therefore stable between broadcasts.
   *
   * Does NOT replay the current snapshot to the new subscriber: useSyncExternalStore
   * reads it via getSnapshot on mount, and an eager call here would be a render-phase
   * setState for the older useEffect-based callers.
   */
  onSnapshot(cb: (s: RoomSnapshot) => void): () => void {
    this.snapCbs.add(cb);
    return () => {
      this.snapCbs.delete(cb);
    };
  }
  onConnectedCount(cb: (n: number) => void): void {
    this.connCb = cb;
  }
  /** Fires once when the host removes us from the room. */
  onKicked(cb: () => void): void {
    this.kickedCb = cb;
  }
  /** Reference (server) clock in ms — stable across host changes. */
  now(): number {
    return Date.now() + this.offset;
  }
  get isHost(): boolean {
    return !!this.snap && this.snap.lease.hostId === this.userId;
  }
  get snapshot(): RoomSnapshot | null {
    return this.snap;
  }

  // --- lifecycle ------------------------------------------------------------
  async start(): Promise<void> {
    this.userId = await ensurePartyAuth();
    const instId = getInstallationId();

    // Estimate the server-clock offset before doing anything time-sensitive.
    for (let i = 0; i < CLOCK_PING_BURST; i++) await this.pingClock();

    if (this.wantHost) {
      // Codes are minted client-side; on the rare collision the server rejects with
      // "room in use" — regenerate a fresh code and retry instead of failing the host.
      for (let attempt = 0; ; attempt++) {
        try {
          await this.rpcSnap("party_create", {
            p_code: this.code,
            p_installation_id: instId,
            p_display_name: this.displayName,
          });
          break;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (/in use/i.test(msg) && attempt < 4) {
            this.code = genRoomCode();
            continue;
          }
          throw e;
        }
      }
      if (this.initialMedia) {
        await this.rpcSnap("party_set_media", { p_code: this.code, p_media: this.initialMedia });
      }
    } else {
      await this.rpcSnap("party_join", {
        p_code: this.code,
        p_installation_id: instId,
        p_display_name: this.displayName,
        p_password: this.password ?? null,
      });
    }

    await this.subscribe();
    if (this.destroyed) return; // torn down during create/subscribe — don't start timers
    // Our create/join RPC already ran + broadcast, but the channel wasn't
    // subscribed yet so peers never received it. Re-announce our snapshot now
    // that we're listening, so the host (and others) pick up our membership.
    if (this.snap) this.broadcast(this.snap);
    this.clockTimer = setInterval(() => void this.pingClock(), CLOCK_PING_INTERVAL_MS);
    this.watchdog = setInterval(() => this.checkHost(), WATCHDOG_INTERVAL_MS);
    this.reconcileRole();
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    if (this.leaseTimer) clearInterval(this.leaseTimer);
    if (this.watchdog) clearInterval(this.watchdog);
    if (this.clockTimer) clearInterval(this.clockTimer);
    this.leaseTimer = this.watchdog = this.clockTimer = null;
    try {
      await supabase.rpc("party_leave", { p_code: this.code });
    } catch {
      /* best-effort */
    }
    if (this.channel) await supabase.removeChannel(this.channel);
    this.channel = null;
  }

  // --- host controls --------------------------------------------------------
  async setMedia(m: PartyMedia): Promise<void> {
    await this.rpcSnap("party_set_media", { p_code: this.code, p_media: m });
  }
  async play(positionMs?: number): Promise<void> {
    await this.setPlayback("play", positionMs ?? null, null);
  }
  async pause(positionMs?: number): Promise<void> {
    await this.setPlayback("pause", positionMs ?? null, null);
  }
  async seek(positionMs: number): Promise<void> {
    await this.setPlayback("seek", Math.max(0, Math.round(positionMs)), null);
  }
  async setRate(rate: number): Promise<void> {
    await this.setPlayback("rate", null, rate);
  }
  async transferHost(userId: string): Promise<void> {
    await this.rpcSnap("party_transfer_host", { p_code: this.code, p_target: userId });
  }
  /** Manually attempt to take over (e.g. a "Take over as host" button). */
  async claimHost(): Promise<void> {
    await this.tryClaim(true);
  }

  // --- room administration (host-only server-side; guest calls are rejected) --
  async setConfig(patch: Partial<RoomConfig>, password?: string): Promise<void> {
    await this.rpcSnap("party_set_config", {
      p_code: this.code,
      p_patch: patch,
      p_password: password ?? null,
    });
  }
  async setPermissions(userId: string, patch: Partial<Permissions>): Promise<void> {
    await this.rpcSnap("party_set_permissions", {
      p_code: this.code,
      p_target: userId,
      p_patch: patch,
    });
  }
  async approveMember(userId: string): Promise<void> {
    await this.rpcSnap("party_approve_member", { p_code: this.code, p_target: userId });
  }
  async kick(userId: string): Promise<void> {
    await this.rpcSnap("party_kick", { p_code: this.code, p_target: userId });
  }
  /** Guest takes control — only succeeds when the host enabled guest control. */
  async grabControl(): Promise<void> {
    await this.rpcSnap("party_grab_control", { p_code: this.code });
  }

  // --- queue ----------------------------------------------------------------
  // All six go through rpcSnap, so the single "snap" broadcast stays the only
  // fan-out path. Authorization is the server's: add/remove need canQueue, the
  // rest are host-only, and a rejected call throws rather than silently no-oping.
  async queueAdd(items: QueueItemInput[], position: "end" | "next" = "end"): Promise<void> {
    await this.rpcSnap("party_queue_add", {
      p_code: this.code,
      p_items: items,
      p_position: position,
    });
  }
  async queueRemove(itemIds: string[]): Promise<void> {
    await this.rpcSnap("party_queue_remove", { p_code: this.code, p_item_ids: itemIds });
  }
  async queueMove(itemId: string, toIndex: number): Promise<void> {
    await this.rpcSnap("party_queue_move", {
      p_code: this.code,
      p_item_id: itemId,
      p_to_index: toIndex,
    });
  }
  async queueSetCurrent(itemId: string): Promise<void> {
    await this.rpcSnap("party_queue_set_current", { p_code: this.code, p_item_id: itemId });
  }
  /**
   * `fromItemId` is the idempotency key — pass the item you believe is playing.
   * A call naming a no-longer-current item is a server-side no-op, which is what
   * absorbs duplicate `ended` events from multiple frames. Pass null to force.
   */
  async queueAdvance(
    fromItemId: string | null,
    reason: "ended" | "failed" | "skipped" = "ended",
  ): Promise<void> {
    await this.rpcSnap("party_queue_advance", {
      p_code: this.code,
      p_from_item_id: fromItemId,
      p_reason: reason,
    });
  }
  async queueClear(scope: "done" | "all" = "done"): Promise<void> {
    await this.rpcSnap("party_queue_clear", { p_code: this.code, p_scope: scope });
  }

  private async setPlayback(action: string, positionMs: number | null, rate: number | null): Promise<void> {
    await this.rpcSnap("party_set_playback", {
      p_code: this.code,
      p_action: action,
      p_position_ms: positionMs,
      p_rate: rate,
    });
  }

  // --- rpc + snapshot application ------------------------------------------
  private async rpcSnap(fn: string, args: Record<string, unknown>): Promise<RoomSnapshot | null> {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    if (data) this.applySnapshot(data as WireSnapshot, true);
    return (data as RoomSnapshot) ?? null;
  }

  private applySnapshot(wire: WireSnapshot, fromSelf = false): void {
    if (this.destroyed || !wire || !wire.playback) return;
    const cur = this.snap;
    const s = this.withQueue(wire, cur);
    if (cur) {
      // Newest-wins by (epoch, seq) — applied to our OWN RPC results too, since
      // concurrent fire-and-forget mutations can resolve out of order and an
      // older self-snapshot must not regress local state / get re-broadcast.
      const a = s.playback,
        b = cur.playback;
      const newer = a.epoch > b.epoch || (a.epoch === b.epoch && a.seq >= b.seq);
      if (!newer) return; // stale — drop
      // A snapshot can be newer by (epoch, seq) and still carry OLDER queue state:
      // seq is bumped by every mutation, queueRev only by queue ones, so two
      // concurrent RPCs resolving out of order can pair a fresh seq with a stale
      // queue. Never let the queue go backwards.
      if (s.queueRev < cur.queueRev) {
        s.queue = cur.queue;
        s.currentItemId = cur.currentItemId;
        s.queueRev = cur.queueRev;
      }
    }
    // Kicked: a STRICTLY-NEWER authoritative snapshot no longer lists us (a real
    // kick bumps seq). We must require strictly-newer, not just `>=`: a stale host
    // lease-heartbeat broadcast carries an equal seq but a member list that
    // predates our own join, and would otherwise look like a removal.
    if (!fromSelf && this.userId && cur) {
      const strictlyNewer =
        s.playback.epoch > cur.playback.epoch ||
        (s.playback.epoch === cur.playback.epoch && s.playback.seq > cur.playback.seq);
      const wasMember = cur.members?.some((m) => m.userId === this.userId);
      const stillMember = s.members?.some((m) => m.userId === this.userId);
      if (strictlyNewer && wasMember && !stillMember) {
        this.snap = s;
        // Stop acting as a member: halt the watchdog/clock so we don't keep
        // pinging or re-attempting party_claim_host after being removed.
        this.kicked = true;
        if (this.watchdog) clearInterval(this.watchdog);
        if (this.clockTimer) clearInterval(this.clockTimer);
        this.watchdog = this.clockTimer = null;
        this.kickedCb?.();
        return;
      }
    }
    this.snap = s;
    this.lastSnapAt = Date.now();
    for (const cb of this.snapCbs) cb(s);
    this.reconcileRole();
    if (fromSelf) this.broadcast(s);
  }

  /**
   * `lite` strips the queue. The host re-broadcasts the whole snapshot on every
   * lease heartbeat (every 2s), and at the 100-item cap that snapshot is ~21 kB —
   * so a heartbeat would otherwise push ~10 kB/s per client for state that did not
   * change. A payload with no `queue` key means "queue unchanged"; the receiver
   * carries its own forward in withQueue().
   */
  private broadcast(s: RoomSnapshot, lite = false): void {
    const payload: WireSnapshot = lite
      ? { ...s, queue: undefined, currentItemId: undefined, queueRev: undefined }
      : s;
    void this.channel?.send({ type: "broadcast", event: "snap", payload });
  }

  /**
   * Reconstruct the three queue fields from a wire snapshot. Absent means
   * "unchanged" (a heartbeat, or a server predating 0008), so we carry the
   * current values forward — or start empty when we have no snapshot yet.
   */
  private withQueue(wire: WireSnapshot, cur: RoomSnapshot | null): RoomSnapshot {
    if (wire.queue !== undefined) return wire as RoomSnapshot;
    return {
      ...wire,
      queue: cur?.queue ?? [],
      currentItemId: cur?.currentItemId ?? null,
      queueRev: cur?.queueRev ?? 0,
    };
  }

  // --- realtime channel (broadcast transport + presence) --------------------
  private async subscribe(): Promise<void> {
    // Private channels are authorized by RLS on realtime.messages against auth.uid(),
    // so the realtime socket must carry our JWT before we subscribe (avoids a race
    // where the socket connects before the anon token propagates).
    await supabase.realtime.setAuth();
    const channel = supabase.channel(`party:${this.code}`, {
      // private: gated by RLS on realtime.messages (migration 0007) — only authed
      // room members can read/send, so an outsider can't hijack via a guessed code.
      config: { private: true, broadcast: { self: false }, presence: { key: this.userId } },
    });
    // Assign immediately so a destroy() that races this subscribe still removes it
    // (previously `this.channel` was only set after SUBSCRIBED resolved, leaking the
    // channel + its presence entry on a fast unmount / password-retry rebuild).
    this.channel = channel;
    channel.on("broadcast", { event: "snap" }, ({ payload }) =>
      this.applySnapshot(payload as WireSnapshot),
    );
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      this.connCb?.(Object.keys(state).length);
    });
    await new Promise<void>((resolve, reject) => {
      // Handle the failure statuses too — otherwise a CHANNEL_ERROR/TIMED_OUT left
      // the promise pending forever, hanging start() (no heartbeat/watchdog/role).
      const timer = setTimeout(
        () => reject(new Error("party channel subscribe timed out")),
        15000,
      );
      channel.subscribe((status) => {
        if (this.destroyed) {
          clearTimeout(timer);
          resolve();
          return;
        }
        if (status === "SUBSCRIBED") {
          clearTimeout(timer);
          void channel.track({ userId: this.userId });
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          clearTimeout(timer);
          reject(new Error(`party channel ${status}`));
        }
      });
    });
    // Torn down mid-subscribe: remove the channel we created if destroy() didn't
    // already (destroy() nulls this.channel after removing it).
    if (this.destroyed && this.channel === channel) {
      await supabase.removeChannel(channel);
      this.channel = null;
    }
  }

  // --- role reconciliation (host lease loop on/off) -------------------------
  private reconcileRole(): void {
    if (this.destroyed) return;
    if (this.isHost && !this.leaseTimer) {
      if (__DEV__) console.log("[party] lease loop START", this.code);
      this.leaseTimer = setInterval(() => this.renewLeaseIfDue(), LEASE_RENEW_INTERVAL_MS);
    } else if (!this.isHost && this.leaseTimer) {
      if (__DEV__)
        console.log(
          "[party] lease loop STOP",
          this.code,
          "hostId=", this.snap?.lease.hostId,
          "me=", this.userId,
        );
      clearInterval(this.leaseTimer);
      this.leaseTimer = null;
    }
  }

  /**
   * Host heartbeat. Safe to call from the player tick: RN's setInterval is
   * paused on Android HostPause (Home), but Chromium ticks keep crossing the
   * bridge while the FGS + AlwaysVisible WebView are up.
   */
  renewLeaseIfDue(): void {
    if (this.destroyed || !this.isHost || this.leaseRenewInFlight) return;
    const now = Date.now();
    if (now - this.lastLeaseRenewAt < LEASE_RENEW_INTERVAL_MS) return;
    this.lastLeaseRenewAt = now;
    void this.renewLease();
  }

  private async renewLease(): Promise<void> {
    if (this.destroyed || !this.isHost) return;
    this.leaseRenewInFlight = true;
    try {
      const { data, error } = await supabase.rpc("party_renew_lease", { p_code: this.code });
      if (error) throw error;
      if (this.snap && data) {
        // Refresh the lease on our cached snapshot and re-broadcast as heartbeat.
        this.snap = {
          ...this.snap,
          lease: {
            hostId: this.userId,
            epoch: (data as any).epoch,
            leaseExpiresAt: (data as any).leaseExpiresAt,
          },
        };
        this.lastSnapAt = Date.now();
        this.broadcast(this.snap, true); // heartbeat-lite: no queue
      }
    } catch (e) {
      // We're no longer host (taken over). Role reconciles on the next snapshot.
      if (__DEV__) console.log("[party] renewLease FAILED", String((e as Error)?.message ?? e));
    } finally {
      this.leaseRenewInFlight = false;
    }
  }

  // --- election (guest side) ------------------------------------------------
  private checkHost(): void {
    if (this.destroyed || this.kicked || this.isHost || !this.snap || this.claiming) return;
    const s = this.snap;
    const leaseExpired = !s.lease.leaseExpiresAt || s.lease.leaseExpiresAt < this.now();
    const staleHeartbeat = Date.now() - this.lastSnapAt > HOST_TIMEOUT_MS;
    if (!leaseExpired && !staleHeartbeat) return;

    // Deterministic backoff: earliest-joined eligible guest claims first. The DB
    // row lock guarantees a single winner even if two fire together.
    const guests = s.members
      .filter((m) => m.userId !== s.lease.hostId)
      .sort((a, b) => a.joinedAt - b.joinedAt);
    const rank = Math.max(0, guests.findIndex((m) => m.userId === this.userId));
    setTimeout(() => void this.tryClaim(), rank * CLAIM_BACKOFF_MS);
  }

  private async tryClaim(force = false): Promise<void> {
    if (this.destroyed || this.kicked || this.isHost || this.claiming) return;
    if (!force) {
      const s = this.snap;
      const stillHosted =
        s && s.lease.leaseExpiresAt && s.lease.leaseExpiresAt >= this.now() &&
        Date.now() - this.lastSnapAt < HOST_TIMEOUT_MS;
      if (stillHosted) return; // someone renewed/took over in the backoff window
    }
    this.claiming = true;
    try {
      await this.rpcSnap("party_claim_host", { p_code: this.code });
    } catch {
      // Another member won the election — fine, we stay a guest.
    } finally {
      this.claiming = false;
    }
  }

  // --- clock offset (min-RTT filter against the stable server clock) --------
  private async pingClock(): Promise<void> {
    if (this.destroyed || this.kicked) return;
    const t0 = Date.now();
    const { data, error } = await supabase.rpc("party_server_time");
    if (error || data == null) return;
    const t2 = Date.now();
    const serverMs = Number(data);
    const rtt = t2 - t0;
    const off = serverMs - (t0 + t2) / 2;
    this.clockSamples.push({ offset: off, rtt });
    if (this.clockSamples.length > 10) this.clockSamples.shift();
    let best = this.clockSamples[0];
    for (const s of this.clockSamples) if (s.rtt < best.rtt) best = s;
    this.offset = best.offset;
  }
}
