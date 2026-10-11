/**
 * The host → members stream handoff on the private room channel (spec §6.4). Ephemeral broadcasts only: `stream`
 * carries the host's resolved URL + headers, `stream-req` lets a late joiner ask for it. Nothing is stored or logged;
 * an invalid payload is dropped silently.
 */
import { sendBroadcast, type BroadcastChannel } from "./broadcast";
import { parseStreamHandoff, type StreamHandoff } from "./protocol";

export interface RelayChannel extends BroadcastChannel {
  on(type: "broadcast", filter: { event: string }, cb: (m: { payload: unknown }) => void): unknown;
}

export class StreamRelay {
  private channel: BroadcastChannel | null = null;
  private streamCbs = new Set<(h: StreamHandoff) => void>();
  private requestCbs = new Set<(itemId: string) => void>();
  private stallCbs = new Set<(stalled: boolean) => void>();

  /** Wire the room channel (before it subscribes, like the other listeners). */
  attach(channel: RelayChannel): void {
    this.channel = channel;
    channel.on("broadcast", { event: "stream" }, ({ payload }) => {
      const h = parseStreamHandoff(payload);
      if (h) this.streamCbs.forEach((cb) => cb(h));
    });
    channel.on("broadcast", { event: "stream-req" }, ({ payload }) => {
      const id = (payload as { itemId?: unknown } | null)?.itemId;
      if (typeof id === "string" && id) this.requestCbs.forEach((cb) => cb(id));
    });
    channel.on("broadcast", { event: "stall" }, ({ payload }) => {
      const stalled = (payload as { stalled?: unknown } | null)?.stalled;
      if (typeof stalled === "boolean") this.stallCbs.forEach((cb) => cb(stalled));
    });
  }

  detach(): void {
    this.channel = null;
  }

  send(h: StreamHandoff): void {
    void sendBroadcast(this.channel, "stream", h);
  }

  request(itemId: string): void {
    void sendBroadcast(this.channel, "stream-req", { itemId });
  }

  /** Host: its player stalled (the room is waiting for it) / recovered. */
  sendStall(stalled: boolean): void {
    void sendBroadcast(this.channel, "stall", { stalled });
  }

  onStall(cb: (stalled: boolean) => void): () => void {
    this.stallCbs.add(cb);
    return () => {
      this.stallCbs.delete(cb);
    };
  }

  onStream(cb: (h: StreamHandoff) => void): () => void {
    this.streamCbs.add(cb);
    return () => {
      this.streamCbs.delete(cb);
    };
  }

  onRequest(cb: (itemId: string) => void): () => void {
    this.requestCbs.add(cb);
    return () => {
      this.requestCbs.delete(cb);
    };
  }
}
