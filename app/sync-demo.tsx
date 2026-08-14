/**
 * Local watch-party sync DEMO (Phase 1, mock transport — no backend).
 *
 * Renders two VidLink players in the same "room": a HOST (top) and a GUEST
 * (bottom), connected through the in-memory mockTransport. The control bar
 * drives the HOST; the GUEST should mirror play/pause/seek continuously via the
 * injected video bridge. The t=…/Δ readout shows live drift between them.
 *
 * Reach it with:  adb shell am start -a android.intent.action.VIEW -d "netprime://sync-demo"
 */
import VidLinkPlayer, {
  type PlayerEvent,
  type VidLinkHandle,
} from "@/components/player/VidLinkPlayer";
import { createMockTransport } from "@/services/sync/mockTransport";
import { useWatchParty } from "@/services/sync/useWatchParty";
import { Stack } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// Fight Club — verified to load + be hijackable on VidLink.
const MEDIA = { tmdbId: "550", type: "movie" as const };
const ROOM = "demo-room";

export default function SyncDemo() {
  const hostRef = useRef<VidLinkHandle>(null);
  const guestRef = useRef<VidLinkHandle>(null);

  // Adverse, ASYMMETRIC network conditions to stress-test robustness:
  // host on "fast" link with a -300ms clock error; guest on "slow" link (200ms
  // latency, 80ms jitter) with a +500ms clock error. If sync holds here, it holds.
  const hostTransport = useMemo(
    () => createMockTransport(ROOM, "host", { latencyMs: 90, jitterMs: 40, clockSkewMs: -300 }),
    [],
  );
  const guestTransport = useMemo(
    () => createMockTransport(ROOM, "guest", { latencyMs: 200, jitterMs: 80, clockSkewMs: 500 }),
    [],
  );

  const host = useWatchParty({ transport: hostTransport, isHost: true, playerRef: hostRef });
  const guest = useWatchParty({ transport: guestTransport, isHost: false, playerRef: guestRef });

  const [hostT, setHostT] = useState(0);
  const [guestT, setGuestT] = useState(0);

  const onHost = (e: PlayerEvent) => {
    if (e.event === "tick") setHostT(e.currentTime);
    host.onPlayerEvent(e);
  };
  const onGuest = (e: PlayerEvent) => {
    if (e.event === "tick") setGuestT(e.currentTime);
    guest.onPlayerEvent(e);
  };

  const drift = Math.abs(hostT - guestT);
  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.playerWrap}>
        <Text style={styles.tag}>HOST  t={fmt(hostT)}</Text>
        <VidLinkPlayer ref={hostRef} {...MEDIA} onPlayerEvent={onHost} />
      </View>

      <View style={styles.playerWrap}>
        <Text style={styles.tag}>GUEST t={fmt(guestT)}  Δ={drift.toFixed(1)}s</Text>
        <VidLinkPlayer ref={guestRef} {...MEDIA} onPlayerEvent={onGuest} />
      </View>

      <View style={styles.bar}>
        <Ctl label="▶︎ Play" onPress={() => host.requestPlay()} />
        <Ctl label="⏸ Pause" onPress={() => host.requestPause()} />
        <Ctl label="⏪ 30" onPress={() => host.requestSeek(Math.max(0, hostT - 30))} />
        <Ctl label="30 ⏩" onPress={() => host.requestSeek(hostT + 30)} />
      </View>
      <Text style={styles.hint}>
        HOST: 90ms/40j/−300ms clock · GUEST: 200ms/80j/+500ms clock · scheduled
        playAt + AMP rate-sync. Δ is live drift.
      </Text>
    </SafeAreaView>
  );
}

function Ctl({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.btn} onPress={onPress}>
      <Text style={styles.btnText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  playerWrap: { flex: 1, borderBottomWidth: 1, borderBottomColor: "#222" },
  tag: {
    position: "absolute",
    top: 4,
    left: 6,
    zIndex: 10,
    color: "#7CFC00",
    fontSize: 12,
    fontWeight: "700",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  bar: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 10,
    backgroundColor: "#111",
  },
  btn: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  hint: {
    color: "#888",
    fontSize: 11,
    textAlign: "center",
    paddingBottom: 6,
    backgroundColor: "#111",
  },
});
