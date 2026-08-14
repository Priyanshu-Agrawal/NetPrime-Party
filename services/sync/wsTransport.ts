/**
 * wsTransport — a real cross-process Transport over a WebSocket, for testing
 * sync across two devices/emulators against the throwaway local relay
 * (scratchpad/relay.mjs). Same offset-estimation model as the mock: the relay
 * stamps every message with its reference clock (serverTs); this client keeps a
 * min-latency (max-offset) estimate so `now()` ≈ reference time.
 *
 * This is a DEV harness, not the production backend (that decision — Supabase vs
 * Cloudflare Durable Object — is still open).
 */
import type { SyncMessage, Transport } from "./types";

export function createWsTransport(
  url: string,
  roomId: string,
  clientId: string,
): Transport {
  let handler: ((m: SyncMessage) => void) | null = null;
  let ws: WebSocket | null = null;
  const outQueue: string[] = [];

  const OFFSET_WINDOW = 12;
  const samples: number[] = [];
  let offset = 0;
  function ingest(serverTs: number) {
    samples.push(serverTs - Date.now());
    if (samples.length > OFFSET_WINDOW) samples.shift();
    offset = Math.max(...samples);
  }

  function connect() {
    ws = new WebSocket(url);
    ws.onopen = () => {
      ws?.send(JSON.stringify({ type: "join", room: roomId, clientId }));
      while (outQueue.length && ws) ws.send(outQueue.shift() as string);
    };
    ws.onmessage = (ev: { data: unknown }) => {
      let m: { type?: string; serverTs?: number; payload?: SyncMessage };
      try {
        m = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (typeof m.serverTs === "number") ingest(m.serverTs);
      if (m.type === "sync" && m.payload && handler) handler(m.payload);
    };
    ws.onclose = () => {
      setTimeout(connect, 1000); // keep the transport connected for its lifetime
    };
    ws.onerror = () => {
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }
  connect();

  return {
    clientId,
    now() {
      return Date.now() + offset;
    },
    send(msg: SyncMessage) {
      const data = JSON.stringify({ type: "sync", room: roomId, payload: msg });
      if (ws && ws.readyState === 1) ws.send(data);
      else outQueue.push(data);
    },
    subscribe(h) {
      handler = h;
      // Detach the handler only; keep the socket alive so effect re-runs don't
      // churn the connection (dev harness — the socket lives with the screen).
      return () => {
        if (handler === h) handler = null;
      };
    },
  };
}
