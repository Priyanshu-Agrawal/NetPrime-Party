/**
 * mockTransport — an in-memory NETWORK SIMULATOR standing in for the real
 * backend (WebSocket / Supabase Realtime / Durable Object), so the sync engine
 * can be stress-tested on a single device before any backend exists.
 *
 * It simulates, per client:
 *   - latencyMs + jitterMs  → variable message delivery delay
 *   - clockSkewMs           → a wrong local clock (to exercise offset estimation)
 *
 * Clock-sync lives HERE (a transport concern), not in the engine: the routing
 * layer stamps every message with a reference timestamp (serverTs = the shared
 * "true" clock), and each client estimates its offset to that reference from an
 * internal one-way ping stream, using a min-latency (max-offset) filter over a
 * sliding window. `now()` then returns the client's estimate of reference time.
 * Swap this whole file for a real Transport later; the engine is unchanged.
 */
import type { SyncMessage, Transport } from "./types";

export interface MockNetOpts {
  /** Base one-way delivery delay (ms). */
  latencyMs?: number;
  /** +/- random variance added to each delivery (ms). */
  jitterMs?: number;
  /** This client's local-clock error vs reference (ms); tests offset estimation. */
  clockSkewMs?: number;
}

interface InternalMsg {
  kind: "sync" | "ping";
  serverTs: number; // stamped by the routing layer = reference clock
  payload?: SyncMessage;
}

interface Member {
  id: string;
  skewMs: number;
  latencyMs: number;
  jitterMs: number;
  deliver: (m: InternalMsg) => void;
}

const rooms = new Map<string, Set<Member>>();

/** Ground-truth reference clock the "server" stamps with. */
function referenceNow(): number {
  return Date.now();
}

export function createMockTransport(
  roomId: string,
  clientId: string,
  opts: MockNetOpts = {},
): Transport {
  const latencyMs = opts.latencyMs ?? 120;
  const jitterMs = opts.jitterMs ?? 40;
  const skewMs = opts.clockSkewMs ?? 0;

  let members = rooms.get(roomId);
  if (!members) {
    members = new Set();
    rooms.set(roomId, members);
  }
  const room = members;

  let handler: ((msg: SyncMessage) => void) | null = null;

  // --- clock offset estimation (min-latency / max-offset over a window) ------
  const OFFSET_WINDOW = 12;
  const offsetSamples: number[] = [];
  let offset = 0;

  /** This client's raw (skewed, wrong) clock. */
  const rawNow = () => Date.now() + skewMs;

  function ingestForOffset(serverTs: number) {
    // sample = referenceAtSend - localReceive = -(latency + skew)
    const sample = serverTs - rawNow();
    offsetSamples.push(sample);
    if (offsetSamples.length > OFFSET_WINDOW) offsetSamples.shift();
    // The largest sample corresponds to the smallest latency → cleanest offset.
    offset = Math.max(...offsetSamples);
  }

  const self: Member = {
    id: clientId,
    skewMs,
    latencyMs,
    jitterMs,
    deliver(m: InternalMsg) {
      ingestForOffset(m.serverTs);
      if (m.kind === "sync" && m.payload && handler) handler(m.payload);
    },
  };
  room.add(self);

  function route(m: InternalMsg) {
    for (const peer of room) {
      if (peer.id === clientId) continue; // never echo to sender
      const jitter = (Math.random() * 2 - 1) * peer.jitterMs;
      const delay = Math.max(0, peer.latencyMs + jitter);
      setTimeout(() => peer.deliver(m), delay);
    }
  }

  // Internal one-way ping stream so BOTH sides get continuous offset samples
  // regardless of who is emitting sync messages.
  const pingTimer = setInterval(() => {
    route({ kind: "ping", serverTs: referenceNow() });
  }, 500);

  return {
    clientId,
    now() {
      return rawNow() + offset;
    },
    send(msg: SyncMessage) {
      // The routing layer (server) stamps the reference timestamp.
      const stamped: SyncMessage = { ...msg, serverTs: referenceNow() };
      route({ kind: "sync", serverTs: stamped.serverTs, payload: stamped });
    },
    subscribe(h) {
      handler = h;
      return () => {
        handler = null;
        clearInterval(pingTimer);
        room.delete(self);
        if (room.size === 0) rooms.delete(roomId);
      };
    },
  };
}
