/** What a room plays (spec §6.4): a plugin item in the native room player, a provider item in the web player. */
import type { RoomSnapshot } from "@/services/party/PartyClient";
import { isPluginItem, pluginRefFor, queueItemId, type QueueItem, type QueueItemInput } from "@/services/party/protocol";
import type { PendingHostStream } from "./pendingHostStream";

export function currentItem(snap: Pick<RoomSnapshot, "queue" | "currentItemId"> | null): QueueItem | null {
  if (!snap?.currentItemId) return null;
  return snap.queue.find((i) => i.id === snap.currentItemId) ?? null;
}

export function roomLane(snap: Pick<RoomSnapshot, "queue" | "currentItemId" | "media"> | null): "native" | "web" | "empty" {
  if (!snap) return "empty";
  if (isPluginItem(currentItem(snap))) return "native";
  return snap.media?.providerId ? "web" : "empty";
}

/** The queue item a host's native stream becomes (no URL), unless the room already plays it. */
export function nativeSeed(
  entry: PendingHostStream | null,
  snap: Pick<RoomSnapshot, "queue" | "currentItemId"> | null,
): { item: QueueItemInput; id: string } | null {
  if (!entry || !snap) return null;
  const ref = pluginRefFor(entry.candidate, entry.title);
  const id = queueItemId(ref);
  if (!id) return null;
  const cur = currentItem(snap);
  if (cur?.id === id && isPluginItem(cur)) return null;
  return { id, item: { ref, ...(entry.title.name ? { title: entry.title.name } : {}) } };
}

/** End of item in a native room: the host advances the queue (0008's idempotent advance), so the room doesn't run on
 * past the end. Web rooms keep today's behaviour. */
export function advancesOnEnd(event: string, lane: "native" | "web" | "empty", isHost: boolean): boolean {
  return event === "ended" && lane === "native" && isHost;
}

