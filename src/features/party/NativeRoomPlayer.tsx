/**
 * The room's player for a plugin item (spec §6.4): Bearoom's native player under the party screen's own controls.
 * - Host: plays its own candidate (handed over from the solo player, or found again after a restart) and hands the
 *   stream to the room on the private channel — again whenever a member asks. If it fails, it finds it again once
 *   (fresh tokens) and re-shares it (F6), then shows the card.
 * - Guest: asks for the host's stream and plays it; if it won't load here, finds its own copy of the same source and
 *   plays that only when it is the same cut (±2.5 s). Left waiting 20 s, it can look for the stream itself.
 * - A guest promoted to host keeps what it is playing and re-shares it.
 * Every card has an action (spec §7). Each new source reports its first frame so the room re-syncs it. The handle says
 * `engine: "native"`, which turns on the §6.4 buffering protocol in the sync engine.
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
  /** A source's first frame is up (each new source): the party screen mounts its controls and re-syncs. */
  onBound(): void;
  /** Find the same stream on this device (re-resolve). */
  relocate(id: StreamIdentity): Promise<PlaybackCandidate | null>;
  /** The candidate the host started the party with, if this device has it. */
  takePending(roomCode: string): PlaybackCandidate | null;
}

const ASK_EVERY_MS = 5000;
const WAIT_LONG_MS = 20_000;

type Card = null | "failed" | "waited";

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
  const [card, setCard] = useState<Card>(null);
  const [attempt, setAttempt] = useState(0);
  const handoff = useRef<StreamHandoff | null>(null);
  const usingHostLink = useRef(false);
  const hostRetried = useRef(false);
  const boundUri = useRef<string | null>(null);
  const live = useRef(true);
  const relayRef = useRef(relay);
  relayRef.current = relay;
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

  const playCandidate = useCallback(
    (c: PlaybackCandidate, share: boolean) => {
      handoff.current = handoffOf(item.id, c);
      usingHostLink.current = false;
      setCard(null);
      setSource(toNativeSource(c));
      if (share) relayRef.current?.send(handoff.current);
    },
    [item.id],
  );

  // Host: keep a stream it already plays (promoted guest) and re-share it; else its own (pending, or found again).
  useEffect(() => {
    if (!isHost) return;
    if (handoff.current) {
      relayRef.current?.send(handoff.current);
      return;
    }
    let on = true;
    void (async () => {
      const c = takePending(roomCode) ?? (await relocate(identityRef.current).catch(() => null));
      if (!on || !live.current) return;
      if (c) playCandidate(c, true);
      else setCard("failed");
    })();
    return () => {
      on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- per item, per role, per retry
  }, [isHost, item.id, attempt]);

  // Host: answer a member's request for this item's stream.
  useEffect(() => {
    if (!isHost || !relay) return;
    return relay.onRequest((id) => {
      if (id === item.id && handoff.current) relay.send(handoff.current);
    });
  }, [isHost, relay, item.id]);

  // Guest: ask until the host's stream arrives; play it. Left waiting too long: offer to look for it here.
  useEffect(() => {
    if (isHost || !relay || handoff.current) return;
    const off = relay.onStream((h) => {
      if (h.itemId !== item.id || handoff.current) return;
      handoff.current = h;
      usingHostLink.current = true;
      setCard(null);
      setSource(hostSource(h));
    });
    relay.request(item.id);
    const ask = setInterval(() => {
      if (!handoff.current) relay.request(item.id);
    }, ASK_EVERY_MS);
    const waited = setTimeout(() => {
      if (!handoff.current && live.current) setCard("waited");
    }, WAIT_LONG_MS);
    return () => {
      off();
      clearInterval(ask);
      clearTimeout(waited);
    };
  }, [isHost, relay, item.id, attempt]);

  const findHere = useCallback(() => {
    setCard(null);
    void relocate(identityRef.current)
      .catch(() => null)
      .then((c) => {
        if (!live.current) return;
        if (c) playCandidate(c, false);
        else setCard("failed");
      });
  }, [relocate, playCandidate]);

  const onFatalError = useCallback(() => {
    if (isHost) {
      // F6: once, the same stream found again (fresh tokens), re-shared; then the card.
      if (hostRetried.current) {
        setCard("failed");
        return;
      }
      hostRetried.current = true;
      setSource(null);
      void relocate(identityRef.current)
        .catch(() => null)
        .then((c) => {
          if (!live.current) return;
          if (c) playCandidate(c, true);
          else setCard("failed");
        });
      return;
    }
    const h = handoff.current;
    if (!h || !usingHostLink.current) {
      setCard("failed");
      return;
    }
    usingHostLink.current = false;
    setSource(null);
    void guestFallback(h, () => relocate(identityRef.current)).then((r) => {
      if (!live.current) return;
      if (r.kind === "local") playCandidate(r.candidate, false);
      else setCard("failed");
    });
  }, [isHost, relocate, playCandidate]);

  const retry = useCallback(() => {
    handoff.current = null;
    usingHostLink.current = false;
    hostRetried.current = false;
    setSource(null);
    setCard(null);
    setAttempt((n) => n + 1);
  }, []);

  const onFirstFrame = useCallback(() => {
    const uri = source?.uri ?? null;
    if (boundUri.current === uri) return;
    boundUri.current = uri;
    onBound();
  }, [onBound, source?.uri]);

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

  if (card === "failed") {
    return (
      <View style={StyleSheet.absoluteFill}>
        <PlayerErrorCard
          title="This source won't play here"
          message="Ask the host to pick another source."
          actions={[{ label: "Try again", icon: "refresh", kind: "primary", onPress: retry }]}
        />
      </View>
    );
  }
  if (card === "waited") {
    return (
      <View style={StyleSheet.absoluteFill}>
        <PlayerErrorCard
          title="The host hasn't shared the stream yet"
          message="You can look for it on this device."
          actions={[{ label: "Find it here", kind: "primary", onPress: findHere }]}
        />
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
