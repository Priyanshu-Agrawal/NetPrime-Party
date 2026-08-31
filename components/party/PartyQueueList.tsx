/**
 * PartyQueueList — the room's queue, as shown at the tray's full detent (and
 * reusable by PartyScreen later).
 *
 * Reads `queue` / `currentItemId` from the snapshot via narrow selectors, so a
 * lease heartbeat that changes nothing does not re-render the list. Ordering and
 * the current item are host-authoritative; a guest sees the same list, and the
 * host-only affordances are simply absent for everyone else (the server rejects
 * them anyway — the gating here is cosmetic, per the protocol's invariant 6).
 */
import {
  useIsPartyHost,
  usePartySession,
  usePartySnapshot,
} from "@/services/party/PartySession";
import type { QueueItem } from "@/services/party/protocol";
import { colors, font, ms, radius } from "@/theme/bearoom";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

function subtitleOf(item: QueueItem): string {
  const r = item.ref;
  if (r.source === "youtube") return "YouTube";
  if (r.source === "direct") return "Direct link";
  if (r.type === "tv") return `S${r.season ?? 1} · E${r.episode ?? 1}`;
  return r.source === "plugin" ? `Plugin${r.language ? ` · ${r.language}` : ""}` : "Movie";
}

export function PartyQueueList() {
  const queue = usePartySnapshot(
    (s) => s?.queue ?? [],
    (a, b) => a.length === b.length && a.every((x, i) => x.id === b[i].id && x.status === b[i].status),
  );
  const currentId = usePartySnapshot((s) => s?.currentItemId ?? null);
  const isHost = useIsPartyHost();
  const { queueSetCurrent, queueRemove, userId } = usePartySession();

  const play = useCallback((id: string) => void queueSetCurrent(id).catch(() => {}), [queueSetCurrent]);
  const drop = useCallback((id: string) => void queueRemove([id]).catch(() => {}), [queueRemove]);

  if (!queue.length) {
    return (
      <View style={styles.empty}>
        <Ionicons name="albums-outline" size={ms(22)} color={colors.textFaint} />
        <Text style={styles.emptyText}>Nothing queued yet</Text>
        <Text style={styles.emptyHint}>Browse and add something — it lands here for everyone.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={queue}
      keyExtractor={(i) => i.id}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      renderItem={({ item, index }) => {
        const current = item.id === currentId;
        const done = item.status === "done";
        const failed = item.status === "failed";
        // Non-hosts may still drop what they themselves queued.
        const canDrop = isHost || item.addedByUserId === userId;
        return (
          <View style={[styles.row, current && styles.rowCurrent]}>
            <Text style={[styles.idx, current && styles.idxCurrent]}>
              {current ? "▶" : index + 1}
            </Text>
            <View style={styles.mid}>
              <Text
                numberOfLines={1}
                style={[styles.title, (done || failed) && styles.titleMuted]}
              >
                {item.title ?? item.id}
              </Text>
              <Text numberOfLines={1} style={styles.sub}>
                {subtitleOf(item)}
                {failed ? " · couldn't play" : done ? " · watched" : ""}
              </Text>
            </View>
            {isHost && !current ? (
              <Pressable onPress={() => play(item.id)} hitSlop={6} style={styles.act}>
                <Ionicons name="play" size={ms(14)} color={colors.honey} />
              </Pressable>
            ) : null}
            {canDrop && !current ? (
              <Pressable onPress={() => drop(item.id)} hitSlop={6} style={styles.act}>
                <Ionicons name="close" size={ms(15)} color={colors.textDim} />
              </Pressable>
            ) : null}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: ms(12), paddingVertical: ms(6), gap: ms(4) },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: ms(6), paddingHorizontal: ms(28) },
  emptyText: { color: colors.textDim, fontFamily: font.headlineSemi, fontSize: ms(13) },
  emptyHint: { color: colors.textFaint, fontFamily: font.body, fontSize: ms(11.5), textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(10),
    paddingHorizontal: ms(10),
    paddingVertical: ms(9),
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  rowCurrent: { backgroundColor: colors.honeySoft },
  idx: {
    width: ms(18),
    textAlign: "center",
    color: colors.textFaint,
    fontFamily: font.label,
    fontSize: ms(12),
  },
  idxCurrent: { color: colors.honey },
  mid: { flex: 1, gap: ms(2) },
  title: { color: colors.text, fontFamily: font.body, fontSize: ms(13) },
  titleMuted: { color: colors.textDim },
  sub: { color: colors.textFaint, fontFamily: font.body, fontSize: ms(10.5) },
  act: { padding: ms(4) },
});

export default PartyQueueList;
