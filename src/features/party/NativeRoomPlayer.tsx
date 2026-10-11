/**
 * The room's player for a plugin item (spec §6.4): Bearoom's native player under the party screen's own controls.
 * - Host: plays its own candidate (handed over from the solo player, or found again after a restart) and hands the
 *   stream to the room on the private channel — again whenever a member asks.
 * - Guest: asks for the host's stream and plays it; if it won't load here, finds its own copy of the same source and
 *   plays that only when it is the same cut (±2.5 s). Otherwise: "This source won't play here".
 * Its handle says `engine: "native"`, which turns on the §6.4 buffering protocol in the sync engine.
 */
import { NativePlayer, type NativeSource } from "@/components/player/native/NativePlayer";
import { PlayerErrorCard } from "@/components/player/PlayerErrorCard";
import { PlayerLoadingCard } from "@/components/player/PlayerLoadingCard";
import type { PlayerEvent, PlayerHandle } from "@/components/player/types";
import type { QueueItem, QueueRefPlugin, StreamHandoff } from "@/services/party/protocol";
import type { StreamRelay } from "@/services/party/streamRelay";
import type { PlaybackCandidate } from "@/services/playback/candidate";
import { toNativeSource } from "@/src/features/player/nativeSession";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { guestFallback, hostSource } from "./roomStream";

/** What a re-resolve needs to find the same stream again. */
export interface StreamIdentity {
  itemId: string;
  key: string;
  sourceId: string;
  language?: string;
}

export interface NativeRoomPlayerProps {
  item: QueueItem & { ref: QueueRefPlugin };
  isHost: boolean;
  roomCode: string;
  posterUrl?: string;
  relay: Pick<StreamRelay, "send" | "request" | "onStream" | "onRequest"> | null;
  onPlayerEvent(e: PlayerEvent): void;
  /** The first frame is up: the party screen mounts its controls. */
  onBound(): void;
  /** Find the same stream on this device (re-resolve). */
  relocate(id: StreamIdentity): Promise<PlaybackCandidate | null>;
  /** The candidate the host started the party with, if this device has it. */
  takePending(roomCode: string): PlaybackCandidate | null;
}

const ASK_EVERY_MS = 5000;

function handoffOf(itemId: string, c: PlaybackCandidate): StreamHandoff {
  return {
    itemId,
    key: c.key,
    sourceId: c.sourceId,
    url: c.url,
    headers: c.headers,
    ...(c.container === "hls" || c.container === "dash" || c.container === "mp4" ? { container: c.container } : {}),
    ...(c.durationSec != null ? { durationSec: c.durationSec } : {}),
    ...(c.languages[0] ? { language: c.languages[0] } : {}),
  };
}

export const NativeRoomPlayer = forwardRef<PlayerHandle, NativeRoomPlayerProps>(function NativeRoomPlayer(
  { item, isHost, roomCode, posterUrl, relay, onPlayerEvent, onBound, relocate, takePending },
  ref,
) {
  const inner = useRef<PlayerHandle>(null);
  const [source, setSource] = useState<NativeSource | null>(null);
  const [failed, setFailed] = useState(false);
  const handoff = useRef<StreamHandoff | null>(null);
  const usingHostLink = useRef(false);
  const bound = useRef(false);
  const live = useRef(true);
  const identity: StreamIdentity = {
    itemId: item.id,
    key: item.ref.streamId ?? "",
    sourceId: item.ref.pluginId,
    ...(item.ref.language ? { language: item.ref.language } : {}),
  };
  const identityRef = useRef(identity);
  identityRef.current = identity;

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  // Host: own stream first (pending from the solo player, else found again), then hand it over.
  useEffect(() => {
    if (!isHost) return;
    let on = true;
    void (async () => {
      const c = takePending(roomCode) ?? (await relocate(identityRef.current).catch(() => null));
      if (!on || !live.current) return;
      if (!c) {
        setFailed(true);
        return;
      }
      handoff.current = handoffOf(item.id, c);
      setSource(toNativeSource(c));
      relay?.send(handoff.current);
    })();
    return () => {
      on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per item
  }, [isHost, item.id]);

  // Host: answer a member's request for this item's stream.
  useEffect(() => {
    if (!isHost || !relay) return;
    return relay.onRequest((id) => {
      if (id === item.id && handoff.current) relay.send(handoff.current);
    });
  }, [isHost, relay, item.id]);

  // Guest: ask until the host's stream arrives; play it.
  useEffect(() => {
    if (isHost || !relay) return;
    const off = relay.onStream((h) => {
      if (h.itemId !== item.id || handoff.current) return;
      handoff.current = h;
      usingHostLink.current = true;
      setSource(hostSource(h));
    });
    relay.request(item.id);
    const timer = setInterval(() => {
      if (!handoff.current) relay.request(item.id);
    }, ASK_EVERY_MS);
    return () => {
      off();
      clearInterval(timer);
    };
  }, [isHost, relay, item.id]);

  const onFatalError = useCallback(() => {
    const h = handoff.current;
    if (isHost || !h || !usingHostLink.current) {
      setFailed(true);
      return;
    }
    usingHostLink.current = false;
    setSource(null);
    void guestFallback(h, () => relocate(identityRef.current)).then((r) => {
      if (!live.current) return;
      if (r.kind === "local") setSource(toNativeSource(r.candidate));
      else setFailed(true);
    });
  }, [isHost, relocate]);

  const onFirstFrame = useCallback(() => {
    if (bound.current) return;
    bound.current = true;
    onBound();
  }, [onBound]);

  useImperativeHandle(
    ref,
    (): PlayerHandle => ({
      engine: "native",
      play: () => inner.current?.play(),
      pause: () => inner.current?.pause(),
      seek: (s) => inner.current?.seek(s) ?? Promise.resolve(s),
      setRate: (r) => inner.current?.setRate(r),
      fullscreen: () => inner.current?.fullscreen(),
      readQuality: () => inner.current?.readQuality(),
      setQuality: (l) => inner.current?.setQuality(l),
      readAudio: () => inner.current?.readAudio(),
      setAudio: (l) => inner.current?.setAudio(l),
      reload: () => inner.current?.reload(),
      setSubtitle: (id) => inner.current?.setSubtitle(id),
      getTracks: () => inner.current?.getTracks() ?? [],
      getCapabilities: () => ({
        fractionalRate: true,
        preciseSeek: true,
        audioTracks: false,
        qualitySelect: false,
        subtitles: false,
        ...inner.current?.getCapabilities(),
        partySync: true,
      }),
    }),
    [],
  );

  if (failed) {
    return (
      <View style={StyleSheet.absoluteFill}>
        <PlayerErrorCard title="This source won't play here" message="Ask the host to pick another source." actions={[]} />
      </View>
    );
  }
  if (!source) {
    return (
      <View style={StyleSheet.absoluteFill}>
        <PlayerLoadingCard posterUrl={posterUrl} status={isHost ? "Starting…" : "Waiting for the host's stream…"} />
      </View>
    );
  }
  return (
    <NativePlayer
      key={source.uri}
      ref={inner}
      source={source}
      autoPlay={false}
      onPlayerEvent={onPlayerEvent}
      onFirstFrame={onFirstFrame}
      onFatalError={onFatalError}
      style={StyleSheet.absoluteFill}
    />
  );
});
