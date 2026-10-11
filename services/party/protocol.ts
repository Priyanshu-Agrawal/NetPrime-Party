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

// ─────────────────────────────────── queue ──────────────────────────────────
// The room plays a QUEUE; `media` is a derived mirror of the current item, kept
// so v1 clients keep working (see supabase/migrations/0008_party_queue.sql).
//
// A `ref` is a discriminated SOURCE DESCRIPTOR, and the discriminator exists from
// day one because P3/P4 sources are designed, not hypothetical. Note what is NOT
// in here: no variant except `direct` carries a resolved stream URL. A plugin ref
// carries the identifier tuple and every client resolves it locally — plugin
// resolution was measured to be deterministic, so shipping a URL would only add
// an expiry problem.

export type QueueSourceType = "tmdb" | "direct" | "plugin" | "youtube";

/** A TMDB title played through an embed provider — the lane that exists today. */
export interface QueueRefTmdb {
  source: "tmdb";
  tmdbId: string;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
  /** Pin the room to one provider; omitted means "whatever the client picks". */
  providerId?: string;
}

/** A TMDB title resolved ON-DEVICE by a sandboxed plugin (Program 1 · P3). */
export interface QueueRefPlugin {
  source: "plugin";
  tmdbId: string;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
  /** Pinned to a commit SHA at the registry level, never a moving branch. */
  pluginId: string;
  /** Which of the plugin's returned streams — omitted means "best available". */
  streamId?: string;
  /** ISO-639-1 audio preference, e.g. "hi" for a Hindi dub. */
  language?: string;
}

/** A raw stream URL — sniffed in-app (P4) or pasted. The only variant with a URL. */
export interface QueueRefDirect {
  source: "direct";
  url: string;
  headers?: Record<string, string>;
}

export interface QueueRefYoutube {
  source: "youtube";
  videoId: string;
}

export type QueueRef = QueueRefTmdb | QueueRefPlugin | QueueRefDirect | QueueRefYoutube;

/**
 * The host's resolved stream for the room's current plugin item (spec §6.4), sent ONLY as an ephemeral broadcast on
 * the private `party:<code>` channel — never stored in the queue/Postgres, never in route params, never logged.
 */
export interface StreamHandoff {
  /** The queue item it belongs to (a handoff for an older item is ignored). */
  itemId: string;
  key: string;
  sourceId: string;
  url: string;
  headers: Record<string, string>;
  durationSec?: number;
  language?: string;
}

const HANDOFF_MAX_URL = 4096;
const HANDOFF_MAX_HEADERS = 32;
const HANDOFF_MAX_HEADER_BYTES = 8192;

/** A handoff from the wire, or null: https only, a small string header map, a sane length. */
export function parseStreamHandoff(raw: unknown): StreamHandoff | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const str = (v: unknown, max = 512) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);
  const itemId = str(o.itemId);
  const key = str(o.key);
  const sourceId = str(o.sourceId);
  const url = str(o.url, HANDOFF_MAX_URL);
  if (!itemId || !key || !sourceId || !url) return null;
  try {
    if (new URL(url).protocol !== "https:") return null;
  } catch {
    return null;
  }
  if (!o.headers || typeof o.headers !== "object" || Array.isArray(o.headers)) return null;
  const entries = Object.entries(o.headers as Record<string, unknown>);
  if (entries.length > HANDOFF_MAX_HEADERS || entries.some(([, v]) => typeof v !== "string")) return null;
  const headers = Object.fromEntries(entries) as Record<string, string>;
  if (JSON.stringify(headers).length > HANDOFF_MAX_HEADER_BYTES) return null;
  const out: StreamHandoff = { itemId, key, sourceId, url, headers };
  if (o.durationSec != null) {
    if (typeof o.durationSec !== "number" || !Number.isFinite(o.durationSec) || o.durationSec <= 0) return null;
    out.durationSec = o.durationSec;
  }
  const language = str(o.language, 16);
  if (language) out.language = language;
  return out;
}

/** The room's queue ref for a native candidate: source + stable key + language — never a URL. */
export function pluginRefFor(
  c: { sourceId: string; key: string; languages: string[] },
  title: { tmdbId: string; type: "movie" | "tv"; season?: number; episode?: number },
): QueueRefPlugin {
  return {
    source: "plugin",
    tmdbId: title.tmdbId,
    type: title.type,
    ...(title.season != null ? { season: title.season } : {}),
    ...(title.episode != null ? { episode: title.episode } : {}),
    pluginId: c.sourceId,
    streamId: c.key,
    ...(c.languages[0] ? { language: c.languages[0] } : {}),
  };
}

export type QueueItemStatus = "queued" | "done" | "failed";

/** One queue entry. Server-stamped: id, addedByUserId, addedAt, status. */
export interface QueueItem {
  id: string;
  ref: QueueRef;
  title?: string;
  subtitle?: string;
  posterPath?: string;
  runtimeMs?: number;
  addedByUserId: string;
  addedAt: number;
  status: QueueItemStatus;
  /**
   * False for a source only the adder can play (an IP-locked sniffed stream).
   * The room still advances through it; other members just cannot follow along.
   */
  syncable: boolean;
}

/** What a client sends to party_queue_add — the server stamps everything else. */
export interface QueueItemInput {
  ref: QueueRef;
  title?: string;
  subtitle?: string;
  posterPath?: string;
  runtimeMs?: number;
  syncable?: boolean;
}

export function isPluginItem(item?: QueueItem | null): item is QueueItem & { ref: QueueRefPlugin } {
  return item?.ref?.source === "plugin";
}

export const QUEUE_MAX_ITEMS = 100;

/**
 * Mirrors party_queue_item_id() in 0008, which in turn reuses mediaKey() from
 * utils/failureMemory.ts — the three must stay in lockstep so queue ids and
 * failure-memory keys line up.
 *
 * Returns null for `direct`, whose id is an md5 of the URL that only the server
 * computes. That is not a gap: the server dedupes on add, so a client only needs
 * this for optimistic "is this already queued?" checks, and those only happen on
 * TMDB-shaped refs (the Add-to-queue affordances on details screens).
 */
export function queueItemId(ref: QueueRef): string | null {
  switch (ref.source) {
    case "youtube":
      return `yt:${ref.videoId}`;
    case "direct":
      return null;
    default:
      return ref.type === "tv"
        ? `tv:${ref.tmdbId}:${ref.season ?? 1}:${ref.episode ?? 1}`
        : `movie:${ref.tmdbId}`;
  }
}

/**
 * Mirrors party_media_of_item(). Only TMDB-shaped sources have a PartyMedia;
 * direct/youtube yield null, which is what a v1 client sees for them.
 */
export function partyMediaFromRef(ref: QueueRef, title?: string): PartyMedia | null {
  if (ref.source !== "tmdb" && ref.source !== "plugin") return null;
  return {
    tmdbId: ref.tmdbId,
    type: ref.type,
    ...(ref.season != null ? { season: ref.season } : {}),
    ...(ref.episode != null ? { episode: ref.episode } : {}),
    ...(title ? { title } : {}),
    ...(ref.source === "tmdb" && ref.providerId ? { providerId: ref.providerId } : {}),
  };
}

/** Mirrors party_ref_of_media() — the inverse, for the legacy set-media path. */
export function refFromPartyMedia(m: PartyMedia): QueueRefTmdb {
  return {
    source: "tmdb",
    tmdbId: m.tmdbId,
    type: m.type,
    ...(m.season != null ? { season: m.season } : {}),
    ...(m.episode != null ? { episode: m.episode } : {}),
    ...(m.providerId ? { providerId: m.providerId } : {}),
  };
}

// ───────────────────────────── tunables (server) ────────────────────────────
// Lease well under any mobile-network stall; renew at ~1/3 of it.
export const LEASE_DURATION_MS = 6000;
export const LEASE_RENEW_INTERVAL_MS = 2000;
