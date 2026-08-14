/**
 * Watch-party screen (one player per device), backed by the Supabase-only
 * authority (see services/party/*). Postgres owns the timeline + host lease;
 * this screen just renders the room's media, forwards player events to the sync
 * engine, and exposes host controls + handoff (auto-election, manual take-over,
 * and host→guest transfer).
 *
 * Host arrives from the player's "Watch Party" button (role=host + provider/media
 * params). Guest arrives from "Join a Party" (role=guest + room code); it learns
 * what/where to play from the room snapshot.
 */
import HijackPlayer, {
  type PlayerEvent,
  type PlayerHandle,
} from "@/components/player/HijackPlayer";
import { getDisplayName } from "@/services/party/identity";
import type { PartyMedia } from "@/services/party/protocol";
import { useParty } from "@/services/party/useParty";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useRef } from "react";
import {
  Alert,
  SafeAreaView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function Party() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    role?: string;
    room?: string;
    provider?: string;
    id?: string;
    type?: string;
    season?: string;
    ep?: string;
    title?: string;
  }>();
  const isHostParam = params.role === "host";
  const room = (params.room ?? "").toUpperCase();

  // Host: build the room's media from the route (includes the chosen provider).
  const hostMedia: PartyMedia | undefined = useMemo(
    () =>
      isHostParam && params.id
        ? {
            tmdbId: params.id,
            type: params.type === "tv" ? "tv" : "movie",
            season: params.season ? Number(params.season) : undefined,
            episode: params.ep ? Number(params.ep) : undefined,
            title: params.title,
            providerId: params.provider,
          }
        : undefined,
    [isHostParam, params.id, params.type, params.season, params.ep, params.title, params.provider],
  );

  const displayName = useMemo(
    () => getDisplayName() ?? (isHostParam ? "Host" : "Guest"),
    [isHostParam],
  );

  const playerRef = useRef<PlayerHandle>(null);

  const party = useParty({
    code: room,
    role: isHostParam ? "host" : "guest",
    displayName,
    media: hostMedia,
    playerRef,
  });

  const snap = party.snapshot;
  const media = snap?.media;
  const providerId = media?.providerId;
  const hostPresent = !!snap?.lease.hostId;
  const guests = useMemo(
    () => (snap?.members ?? []).filter((m) => m.userId !== party.userId),
    [snap?.members, party.userId],
  );

  const onEvent = (e: PlayerEvent) => party.onPlayerEvent(e);

  const share = () => {
    void Share.share({
      message:
        `Join my Bearoom watch party!\n\nRoom code: ${room}\n\n` +
        `Open Bearoom → “Join a Party” → enter ${room}.`,
    });
  };

  const confirmTransfer = (userId: string, name?: string) => {
    Alert.alert("Make host?", `Hand control to ${name || "this member"}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Make host", onPress: () => party.transferHost(userId) },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* top bar: code + members */}
      <View style={styles.bar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.codePill} onPress={share}>
          <Text style={styles.codeLabel}>ROOM</Text>
          <Text style={styles.code}>{room}</Text>
          <Ionicons name="share-social" size={15} color="#4ea1ff" />
        </TouchableOpacity>
        <View style={styles.members}>
          <Ionicons name="people" size={16} color="#9aa0a6" />
          <Text style={styles.membersText}>{party.connectedCount || 1}</Text>
          {party.isHost && <View style={styles.hostDot} />}
        </View>
      </View>

      <View style={styles.player}>
        {party.error ? (
          <View style={styles.waiting}>
            <Ionicons name="alert-circle-outline" size={30} color="#c15" />
            <Text style={styles.waitingText}>{party.error}</Text>
          </View>
        ) : providerId && media ? (
          <HijackPlayer
            ref={playerRef}
            providerId={providerId}
            tmdbId={media.tmdbId}
            type={media.type}
            season={media.season}
            episode={media.episode}
            onPlayerEvent={onEvent}
          />
        ) : (
          <View style={styles.waiting}>
            <Ionicons name="hourglass-outline" size={30} color="#666" />
            <Text style={styles.waitingText}>
              {isHostParam ? "Starting party…" : "Waiting for the host to start…"}
            </Text>
          </View>
        )}

        {/* guest, locally paused → jump back to the room's live position */}
        {!party.isHost && party.detached && (
          <TouchableOpacity style={styles.floatBtn} onPress={party.jumpToLive}>
            <Ionicons name="flash" size={16} color="#fff" />
            <Text style={styles.floatText}>Jump to Live</Text>
          </TouchableOpacity>
        )}

        {/* no active host → offer to take over (auto-election also runs) */}
        {!party.isHost && !hostPresent && !!snap && (
          <TouchableOpacity style={[styles.floatBtn, styles.takeoverBtn]} onPress={party.claimHost}>
            <Ionicons name="megaphone" size={16} color="#fff" />
            <Text style={styles.floatText}>Take over as host</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* host controls */}
      {party.isHost && (
        <>
          <View style={styles.controls}>
            <Ctl icon="play" label="Play" onPress={party.play} />
            <Ctl icon="pause" label="Pause" onPress={party.pause} />
            <Ctl icon="play-back" label="−30" onPress={() => party.seekBy(-30)} />
            <Ctl icon="play-forward" label="+30" onPress={() => party.seekBy(30)} />
          </View>
          {guests.length > 0 && (
            <View style={styles.membersRow}>
              <Text style={styles.membersRowLabel}>Make host:</Text>
              {guests.map((m) => (
                <TouchableOpacity
                  key={m.userId}
                  style={styles.memberChip}
                  onPress={() => confirmTransfer(m.userId, m.displayName)}
                >
                  <Ionicons name="swap-horizontal" size={13} color="#4ea1ff" />
                  <Text style={styles.memberChipText} numberOfLines={1}>
                    {m.displayName || "Guest"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

function Ctl({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.ctl} onPress={onPress}>
      <Ionicons name={icon} size={20} color="#fff" />
      <Text style={styles.ctlLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0c" },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 10,
  },
  codePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#17171b",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
  },
  codeLabel: { color: "#7d828a", fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  code: { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: 2 },
  members: { flexDirection: "row", alignItems: "center", gap: 4 },
  membersText: { color: "#f2f2f4", fontSize: 14, fontWeight: "700" },
  hostDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#39d353", marginLeft: 2 },

  player: { flex: 1, backgroundColor: "#000" },
  waiting: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 24 },
  waitingText: { color: "#888", fontSize: 14, textAlign: "center" },

  floatBtn: {
    position: "absolute",
    alignSelf: "center",
    bottom: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#0a7ea4",
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 24,
    elevation: 6,
  },
  takeoverBtn: { backgroundColor: "#8a5a00", bottom: 76 },
  floatText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  controls: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 12,
    backgroundColor: "#101014",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#1e1e22",
  },
  ctl: { alignItems: "center", gap: 3 },
  ctlLabel: { color: "#cfd2d6", fontSize: 11, fontWeight: "600" },

  membersRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: "#101014",
  },
  membersRowLabel: { color: "#7d828a", fontSize: 12, fontWeight: "600" },
  memberChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#17171b",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    maxWidth: 140,
  },
  memberChipText: { color: "#dfe3e8", fontSize: 12, fontWeight: "600" },
});
