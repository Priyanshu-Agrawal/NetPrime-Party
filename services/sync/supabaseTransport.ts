/**
 * supabaseTransport — the real, cross-internet watch-party Transport, built on
 * Supabase Realtime Broadcast (message relay) + Presence (live member list).
 *
 * Clock model: Supabase does NOT stamp a server timestamp on relayed messages,
 * so the HOST is the authoritative clock. Guests estimate their offset to the
 * host with an NTP-style ping/pong (min-RTT filtered) carried on a separate
 * "time" broadcast event, so `now()` returns host-reference time on every device
 * — exactly what the SyncEngine's scheduled playAt / expectedPos math expects.
 */
import { supabase } from "@/services/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { SyncMessage, Transport } from "./types";

export interface PartyMember {
  clientId: string;
  role: "host" | "guest";
  name?: string;
  joinedAt: number;
}

export interface SupabaseTransport extends Transport {
  onPresence(cb: (members: PartyMember[]) => void): void;
  destroy(): void;
}

type TimeMsg =
  | { kind: "ping"; from: string; t0: number }
  | { kind: "pong"; from: string; to: string; t0: number; t1: number };

export function createSupabaseTransport(opts: {
  roomId: string;
  clientId: string;
  isHost: boolean;
  name?: string;
}): SupabaseTransport {
  const { roomId, clientId, isHost, name } = opts;
  let handler: ((m: SyncMessage) => void) | null = null;
  let presenceCb: ((m: PartyMember[]) => void) | null = null;
  let subscribed = false;
  const outSync: SyncMessage[] = [];
  const joinedAt = Date.now();

  // --- guest → host clock offset via NTP-style min-RTT filter ---------------
  let offset = 0;
  const samples: { offset: number; rtt: number }[] = [];
  function addSample(off: number, rtt: number) {
    samples.push({ offset: off, rtt });
    if (samples.length > 10) samples.shift();
    let best = samples[0];
    for (const s of samples) if (s.rtt < best.rtt) best = s;
    offset = best.offset; // least-noisy (lowest round-trip) estimate
  }

  const channel: RealtimeChannel = supabase.channel(`party:${roomId}`, {
    config: { broadcast: { self: false, ack: false }, presence: { key: clientId } },
  });

  const rawSend = (event: string, payload: unknown) =>
    channel.send({ type: "broadcast", event, payload });

  channel.on("broadcast", { event: "sync" }, ({ payload }) => {
    const msg = payload as SyncMessage;
    if (msg.from === clientId) return;
    handler?.(msg);
  });

  channel.on("broadcast", { event: "time" }, ({ payload }) => {
    const t = payload as TimeMsg;
    if (t.kind === "ping" && isHost) {
      rawSend("time", { kind: "pong", from: clientId, to: t.from, t0: t.t0, t1: Date.now() } as TimeMsg);
    } else if (t.kind === "pong" && !isHost && t.to === clientId) {
      const t2 = Date.now();
      addSample(t.t1 - (t.t0 + t2) / 2, t2 - t.t0);
    }
  });

  function emitPresence() {
    if (!presenceCb) return;
    const state = channel.presenceState() as Record<string, any[]>;
    const members: PartyMember[] = [];
    for (const key in state) {
      const m = state[key]?.[0];
      if (m) {
        members.push({
          clientId: m.clientId ?? key,
          role: m.role === "host" ? "host" : "guest",
          name: m.name,
          joinedAt: m.joinedAt ?? 0,
        });
      }
    }
    members.sort((a, b) => a.joinedAt - b.joinedAt);
    presenceCb(members);
  }
  channel.on("presence", { event: "sync" }, emitPresence);

  let pingTimer: ReturnType<typeof setInterval> | null = null;
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      subscribed = true;
      void channel.track({ clientId, role: isHost ? "host" : "guest", name, joinedAt });
      while (outSync.length) void rawSend("sync", outSync.shift());
      if (!isHost) {
        const ping = () => void rawSend("time", { kind: "ping", from: clientId, t0: Date.now() } as TimeMsg);
        ping();
        pingTimer = setInterval(ping, 2000);
      }
    }
  });

  return {
    clientId,
    now() {
      return Date.now() + (isHost ? 0 : offset);
    },
    send(msg: SyncMessage) {
      if (subscribed) void rawSend("sync", msg);
      else outSync.push(msg);
    },
    subscribe(h) {
      handler = h;
      return () => {
        if (handler === h) handler = null;
      };
    },
    onPresence(cb) {
      presenceCb = cb;
      emitPresence();
    },
    destroy() {
      if (pingTimer) clearInterval(pingTimer);
      void supabase.removeChannel(channel);
    },
  };
}
