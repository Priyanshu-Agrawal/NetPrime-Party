/**
 * Watch-party shared contract — the types both sides agree on. The authority is
 * Postgres: clients call SECURITY DEFINER RPCs, which validate and return a full
 * snapshot; that snapshot is fanned out on a single "snap" broadcast. Supabase
 * Realtime is transport, never authority.
 *
 * Design invariants encoded here (agreed in design review):
 *   1.  One authority per room (the room row). A client *asks* via RPC; the
 *       server validates membership / role / lease / epoch / permissions / config
 *       and only then mutates and re-broadcasts.
 *   2.  The SERVER owns the clock. Clients estimate their offset to
 *       `party_server_time` (see PartyClient.pingClock) so the reference clock
 *       never moves when the host changes.
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

// ─────────────────────────────────── chat ───────────────────────────────────

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

// ───────────────────────────── tunables (server) ────────────────────────────
// Lease well under any mobile-network stall; renew at ~1/3 of it.
export const LEASE_DURATION_MS = 6000;
export const LEASE_RENEW_INTERVAL_MS = 2000;
