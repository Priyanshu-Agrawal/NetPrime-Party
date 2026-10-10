/**
 * The slice of a Supabase RealtimeChannel that party broadcasts need. A real
 * RealtimeChannel satisfies it; tests pass a fake.
 */
export interface BroadcastChannel {
  readonly state: string;
  readonly socket: { isConnected(): boolean };
  send(args: { type: "broadcast"; event: string; payload: unknown }): Promise<unknown>;
  httpSend(event: string, payload: unknown): Promise<unknown>;
}

/**
 * Fire-and-forget broadcast. Over the socket once the channel has joined; before
 * that (or while the socket reconnects) explicitly over REST via httpSend() —
 * what send() used to do on its own, now deprecated with a console warning.
 * Never throws: party messages are best-effort, and the next snapshot or
 * heartbeat supersedes one that was lost.
 */
export async function sendBroadcast(
  channel: BroadcastChannel | null | undefined,
  event: string,
  payload: unknown,
): Promise<void> {
  if (!channel) return;
  try {
    if (channel.state === "joined" && channel.socket.isConnected()) {
      await channel.send({ type: "broadcast", event, payload });
    } else {
      await channel.httpSend(event, payload);
    }
  } catch {
    /* best-effort */
  }
}
