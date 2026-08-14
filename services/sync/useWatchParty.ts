/**
 * useWatchParty — thin React wrapper around the pure SyncEngine core.
 * All the sync logic (virtual timeline, offset, scheduled playAt, AMP +
 * hysteresis drift correction, group-pause on buffering, SOURCE consistency)
 * lives in SyncEngine so it can be unit-tested in Node. See SyncEngine.ts.
 */
import type { PlayerEvent, PlayerHandle } from "@/components/player/HijackPlayer";
import { useEffect, useMemo, useState, type RefObject } from "react";
import { SyncEngine, type PlayerControl } from "./SyncEngine";
import type { PartyMedia, Transport } from "./types";

export interface WatchPartyControls {
  onPlayerEvent: (e: PlayerEvent) => void;
  requestPlay: () => void;
  requestPause: () => void;
  requestSeek: (position: number) => void;
  /** Host: declare the provider (+ media) the whole room plays (call on resolve). */
  setSource: (id: string, media?: PartyMedia) => void;
  /** Guest: true while the user has locally paused and is behind the host. */
  detached: boolean;
  /** Guest: re-attach and jump to the host's current live position. */
  jumpToLive: () => void;
}

export function useWatchParty(opts: {
  transport: Transport;
  isHost: boolean;
  playerRef: RefObject<PlayerHandle | null>;
  /** Guest: called when the host's chosen provider + media arrive, to load them. */
  onSource?: (id: string, media: PartyMedia | null) => void;
}): WatchPartyControls {
  const { transport, isHost, playerRef, onSource } = opts;
  const [detached, setDetached] = useState(false);

  const engine = useMemo(() => {
    const player: PlayerControl = {
      play: () => playerRef.current?.play(),
      pause: () => playerRef.current?.pause(),
      seek: (s) => playerRef.current?.seek(s),
      setRate: (r) => playerRef.current?.setRate(r),
    };
    return new SyncEngine(transport, isHost, player, {
      onSource: (id, media) => onSource?.(id, media),
      onDetach: setDetached,
    });
  }, [transport, isHost, playerRef, onSource]);

  useEffect(() => {
    engine.start();
    return () => engine.stop();
  }, [engine]);

  return useMemo(
    () => ({
      onPlayerEvent: (e: PlayerEvent) => engine.onPlayerEvent(e),
      requestPlay: () => engine.requestPlay(),
      requestPause: () => engine.requestPause(),
      requestSeek: (p: number) => engine.requestSeek(p),
      setSource: (id: string, media?: PartyMedia) => engine.setSource(id, media),
      jumpToLive: () => engine.jumpToLive(),
      detached,
    }),
    [engine, detached],
  );
}
