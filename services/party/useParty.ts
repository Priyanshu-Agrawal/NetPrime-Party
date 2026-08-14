/**
 * useParty — React glue around PartyClient (transport/authority) + PartySyncEngine
 * (drives the player). The screen renders HijackPlayer for `snapshot.media` and
 * forwards its events here; host controls call the authority, guests get
 * detach / jump-to-live.
 */
import type { PlayerEvent, PlayerHandle } from "@/components/player/HijackPlayer";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { PartyClient, type RoomSnapshot } from "./PartyClient";
import { PartySyncEngine, type PlayerControl } from "./PartySyncEngine";
import { effectivePositionMs, type PartyMedia } from "./protocol";

export interface UseParty {
  snapshot: RoomSnapshot | null;
  isHost: boolean;
  userId: string;
  connectedCount: number;
  detached: boolean;
  /** Non-null if joining/creating failed (e.g. "no such room"). */
  error: string | null;
  /** Forward every HijackPlayer event here. */
  onPlayerEvent: (e: PlayerEvent) => void;
  // host controls (no-ops / rejected server-side for guests)
  play: () => void;
  pause: () => void;
  seekBy: (deltaSec: number) => void;
  transferHost: (userId: string) => void;
  claimHost: () => void;
  // guest
  jumpToLive: () => void;
}

export function useParty(opts: {
  code: string;
  role: "host" | "guest";
  displayName: string;
  media?: PartyMedia;
  playerRef: RefObject<PlayerHandle | null>;
}): UseParty {
  const { code, role, displayName, media, playerRef } = opts;
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [connectedCount, setConnectedCount] = useState(1);
  const [detached, setDetached] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Media is fixed for the room's life; keep it out of the client's deps so a
  // new object identity each render doesn't rebuild the whole party.
  const mediaRef = useRef(media);

  const client = useMemo(
    () => new PartyClient({ code, role, displayName, media: mediaRef.current }),
    [code, role, displayName],
  );

  const engine = useMemo(() => {
    const player: PlayerControl = {
      play: () => playerRef.current?.play(),
      pause: () => playerRef.current?.pause(),
      seek: (s) => playerRef.current?.seek(s),
      setRate: (r) => playerRef.current?.setRate(r),
    };
    return new PartySyncEngine(client, player, { onDetach: setDetached });
  }, [client, playerRef]);

  useEffect(() => {
    let cancelled = false;
    client.onConnectedCount((n) => {
      if (!cancelled) setConnectedCount(n);
    });
    client.onSnapshot((s) => {
      if (cancelled) return;
      setSnapshot(s);
      engine.setAnchor(s.playback);
    });
    client.start().catch((e) => {
      const msg = e?.message ?? String(e);
      console.warn("[party] start failed:", msg);
      if (!cancelled) setError(msg);
    });
    return () => {
      cancelled = true;
      void client.destroy();
    };
  }, [client, engine]);

  return useMemo<UseParty>(
    () => ({
      snapshot,
      isHost: !!snapshot && snapshot.lease.hostId === client.userId,
      userId: client.userId,
      connectedCount,
      detached,
      error,
      onPlayerEvent: (e) => engine.onPlayerEvent(e),
      play: () => void client.play(),
      pause: () => void client.pause(),
      seekBy: (deltaSec) => {
        const s = client.snapshot;
        if (!s) return;
        const curSec = effectivePositionMs(s.playback, client.now()) / 1000;
        void client.seek(Math.max(0, curSec + deltaSec) * 1000);
      },
      transferHost: (uid) => void client.transferHost(uid),
      claimHost: () => void client.claimHost(),
      jumpToLive: () => engine.jumpToLive(),
    }),
    [snapshot, connectedCount, detached, error, client, engine],
  );
}
