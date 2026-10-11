/**
 * The stream a host starts a party with, kept in memory for its room's screen (never in route params, never stored):
 * the solo native player puts it here, the room seeds its queue from it and the room player takes it.
 */
import type { PlaybackCandidate } from "@/services/playback/candidate";

export interface PendingHostStream {
  candidate: PlaybackCandidate;
  title: { tmdbId: string; type: "movie" | "tv"; season?: number; episode?: number; name?: string };
}

const TTL_MS = 30 * 60_000;
const store = new Map<string, PendingHostStream & { at: number }>();

export const pendingHostStream = {
  set(code: string, entry: PendingHostStream, now = Date.now()): void {
    store.set(code, { ...entry, at: now });
  },
  peek(code: string, now = Date.now()): PendingHostStream | null {
    const e = store.get(code);
    if (!e) return null;
    if (now - e.at > TTL_MS) {
      store.delete(code);
      return null;
    }
    return e;
  },
  take(code: string, now = Date.now()): PlaybackCandidate | null {
    const e = pendingHostStream.peek(code, now);
    store.delete(code);
    return e?.candidate ?? null;
  },
};
