/**
 * Watch-party wire protocol — the single shared contract between the Room
 * Durable Object (the authority) and the React Native client (a controller /
 * viewer). Both sides import these types; neither invents its own.
 *
 * Design invariants encoded here (agreed in design review):
 *   1.  One authority per room (the Room DO). Clients send INTENTS; the server
 *       emits authoritative EVENTS. Realtime is transport, never authority.
 *   2.  The SERVER owns the clock. Clients estimate their offset to server time
 *       (Ping/Pong) so the reference clock never moves when the host changes.
 *   3.  Playback is a TIMELINE ANCHOR, not a per-second position — see
 *       PlaybackAnchor + effectivePositionMs().
 *   4.  Every authoritative playback mutation carries { epoch, seq }:
 *       epoch = leadership generation, seq = order within a generation.
 *       Clients reject epoch < current, or (epoch ==, seq <= last).
 *   5.  Host is a LEASED ROLE, not the authority. Lease is server-stamped.
 *   6.  Permissions are enforced at the server chokepoint; UI gating is cosmetic.
 *   7.  Identity is three things: installation / user / connection (see identity.ts).
 */

// ─────────────────────────── identity & membership ──────────────────────────

export type Role = "host" | "guest";

export interface Permissions {
  canControlPlayback: boolean;
  canChat: boolean;
  canQueue: boolean;
  canVote: boolean;
}

/** A person in the room (durable across reconnects — keyed by userId). */
export interface Member {
  userId: string;
  installationId: string;
  displayName: string;
  role: Role;
  /** Server-stamped (DO clock) — safe to sort on for deterministic election. */
  joinedAt: number;
  permissions: Permissions;
  /** False while a gated guest is waiting for the host to approve them. */
  approved: boolean;
  /** Whether the member currently has at least one live connection. */
  connected: boolean;
}

/** One live WebSocket connection (a member may have several across devices). */
export interface SessionInfo {
  connectionId: string;
  userId: string;
  installationId: string;
  /** Server-stamped last-seen; drives connection-level liveness for election. */
  lastSeenAt: number;
}

// ─────────────────────────────── room config ────────────────────────────────

export type RoomAccess = "open" | "locked" | "private" | "password";

/** Toggleable room settings. Every field is host-controlled + server-enforced. */
export interface RoomConfig {
  access: RoomAccess;
  /** True when a password is set (the hash lives server-side only, never sent). */
  passwordRequired: boolean;
  chatEnabled: boolean;
  gifsEnabled: boolean;
  queueEnabled: boolean;
  pollsEnabled: boolean;
  /** Default canControlPlayback granted to a newly-joined guest. */
  guestControlDefault: boolean;
  /** New guests join un-approved and wait for the host to let them in. */
  approveGuests: boolean;
}

export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  access: "open",
  passwordRequired: false,
  chatEnabled: true,
  gifsEnabled: true,
  queueEnabled: true,
  pollsEnabled: true,
  guestControlDefault: false,
  approveGuests: false,
};

export const DEFAULT_GUEST_PERMISSIONS: Permissions = {
  canControlPlayback: false,
  canChat: true,
  canQueue: false,
  canVote: true,
};

// ───────────────────────────── media & playback ─────────────────────────────

export interface PartyMedia {
  tmdbId: string;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
  title?: string;
  /** The provider/source id the whole room plays (one source = one timeline). */
  providerId?: string;
}

export type PlaybackStatus = "playing" | "paused";

/**
 * The canonical playback state as a timeline anchor. `positionMs` was true at
 * `anchorServerTimeMs` (server clock); while playing, the effective position
 * advances at `rate`. This is what makes host handoff a no-op for playback:
 * only the anchor's epoch/host changes, the timeline itself keeps flowing.
 */
export interface PlaybackAnchor {
  status: PlaybackStatus;
  positionMs: number;
  rate: number;
  anchorServerTimeMs: number;
  epoch: number;
  seq: number;
}

/** The effective media position (ms) at a given SERVER time. Shared by both sides. */
export function effectivePositionMs(a: PlaybackAnchor, serverNowMs: number): number {
  if (a.status === "paused") return a.positionMs;
  return Math.max(0, a.positionMs + (serverNowMs - a.anchorServerTimeMs) * a.rate);
}

/** Host lease — server-owned, server-stamped. The client only reads it. */
export interface HostLease {
  hostId: string | null;
  epoch: number;
  /** Server time at which the lease lapses if not renewed by the host. */
  leaseExpiresAt: number | null;
}

// ─────────────────────────── chat / queue / polls ───────────────────────────

export interface ChatMessage {
  id: string;
  userId: string;
  displayName: string;
  kind: "text" | "gif";
  body: string;
  /** For kind==="gif": the resolved gif URL. */
  gifUrl?: string;
  /** Server-stamped. */
  at: number;
}

export interface QueueItem {
  id: string;
  media: PartyMedia;
  addedByUserId: string;
  at: number;
}

export interface Poll {
  id: string;
  question: string;
  options: string[];
  /** optionIdx -> vote count. */
  tally: number[];
  /** userId -> optionIdx (server-side truth; sent to clients for their own vote). */
  open: boolean;
  createdByUserId: string;
  at: number;
}

// ─────────────────────── client → server: INTENTS ───────────────────────────
// A client *asks*. The server validates (membership, role, lease, epoch,
// permissions, config) and only then mutates + fans out an authoritative event.

export type ClientIntent =
  // handshake / liveness
  | { t: "hello"; installationId: string; userId?: string; displayName: string; token?: string; password?: string }
  | { t: "bye" }
  | { t: "ping"; c0: number } // c0 = client time; server replies pong with its time
  | { t: "renewLease" } // host heartbeat
  // playback (require canControlPlayback + valid lease/epoch)
  | { t: "setMedia"; media: PartyMedia }
  | { t: "play"; positionMs?: number }
  | { t: "pause"; positionMs?: number }
  | { t: "seek"; positionMs: number }
  | { t: "setRate"; rate: number }
  | { t: "buffering"; buffering: boolean }
  // host / room administration
  | { t: "transferHost"; targetUserId: string }
  | { t: "grabControl" } // guest takes control when the host has opted in
  | { t: "setConfig"; patch: Partial<RoomConfig> }
  | { t: "setPermissions"; targetUserId: string; patch: Partial<Permissions> }
  | { t: "approveMember"; targetUserId: string }
  | { t: "kick"; targetUserId: string }
  // chat / gifs
  | { t: "chat"; kind: "text" | "gif"; body: string; gifUrl?: string }
  // queue
  | { t: "queueAdd"; media: PartyMedia }
  | { t: "queueRemove"; itemId: string }
  | { t: "queueNext" }
  // polls
  | { t: "pollCreate"; question: string; options: string[] }
  | { t: "pollVote"; pollId: string; optionIdx: number }
  | { t: "pollClose"; pollId: string };

// ─────────────────────── server → client: EVENTS ────────────────────────────
// Authoritative. `welcome`/`state` carry full snapshots (also used for late-join
// catch-up); the rest are deltas. `playback` is the hot path.

export type ServerEvent =
  | { t: "welcome"; connectionId: string; you: Member; token: string; serverTimeMs: number }
  | { t: "pong"; c0: number; s: number } // s = server time when it replied
  // full canonical snapshot (join / re-sync)
  | {
      t: "state";
      playback: PlaybackAnchor;
      media: PartyMedia | null;
      lease: HostLease;
      config: RoomConfig;
      members: Member[];
    }
  // deltas
  | { t: "playback"; playback: PlaybackAnchor; media?: PartyMedia | null }
  | { t: "lease"; lease: HostLease }
  | { t: "config"; config: RoomConfig }
  | { t: "members"; members: Member[]; sessions?: SessionInfo[] }
  | { t: "chat"; msg: ChatMessage }
  | { t: "queue"; items: QueueItem[]; currentItemId?: string }
  | { t: "poll"; poll: Poll }
  | { t: "error"; code: string; message: string }
  | { t: "kicked"; reason?: string };

// ───────────────────────────── tunables (server) ────────────────────────────
// Lease well under any mobile-network stall; renew at ~1/3 of it.
export const LEASE_DURATION_MS = 6000;
export const LEASE_RENEW_INTERVAL_MS = 2000;
