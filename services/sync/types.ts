/**
 * Watch-party sync message schema + transport interface.
 * The transport is intentionally abstract so a mock (in-memory) implementation
 * can be swapped for a real WebSocket / Supabase Realtime / Durable Object later
 * with no change to the sync engine.
 */
export type SyncAction =
  | "PLAY"
  | "PAUSE"
  | "SEEK"
  | "STATE"
  | "BUFFER"
  | "SOURCE";

export interface PartyMedia {
  tmdbId: string;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
  title?: string;
}

export interface SyncMessage {
  /** Sender client id. */
  from: string;
  action: SyncAction;
  /** Media position (seconds) at the moment the message was created. */
  position: number;
  paused: boolean;
  /**
   * Sender REFERENCE-clock timestamp (ms). In the real system the server/relay
   * stamps this; in the mock the transport stamps it. Clients estimate their
   * offset to this reference clock, so it is the basis for latency compensation.
   */
  serverTs: number;
  /**
   * Wall-clock instant (reference-clock ms) at which a discrete command
   * (PLAY/SEEK) should be executed. Absent for STATE heartbeats.
   */
  playAt?: number;
  /** For BUFFER messages: whether this member just started (true) or ended (false) buffering. */
  buffering?: boolean;
  /**
   * For SOURCE messages (and echoed on STATE): the provider id the whole room
   * must play, so every member shares one timeline. The host resolves it (first
   * provider whose <video> binds for the title) and broadcasts it; guests adopt.
   */
  source?: string;
  /**
   * For SOURCE messages (and echoed on STATE): WHAT to play. A guest who joined
   * by room code doesn't know the title, so the host broadcasts it and the guest
   * loads it.
   */
  media?: PartyMedia;
  /** Monotonic sequence number from the authority; guests drop stale msgs. */
  seq: number;
}

export interface Transport {
  readonly clientId: string;
  send(msg: SyncMessage): void;
  /** Returns an unsubscribe function. */
  subscribe(handler: (msg: SyncMessage) => void): () => void;
  /**
   * This client's view of the REFERENCE clock (ms). The real transport derives
   * it from server-stamped messages (offset estimation); the mock derives it
   * from a simulated per-client skew. The engine must use this, never Date.now.
   */
  now(): number;
}
