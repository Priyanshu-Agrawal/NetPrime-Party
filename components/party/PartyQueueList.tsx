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
import { colors, font, ms, radius, type } from "@/theme/bearoom";
import { Image } from "expo-image";
import { skipToken } from "@reduxjs/toolkit/query";
import { useDetailsQuery } from "@/src/store/services/tmdbApi";
import { img } from "@/utils/tmdbDetails";
import { Ionicons } from "@expo/vector-icons";
import { openSearchTab } from "@/src/navigation/actions";
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
  const { queueSetCurrent, queueRemove, userId, setTrayOpen } = usePartySession();
  const onBrowse = useCallback(() => {
    setTrayOpen(false);
    openSearchTab();
  }, [setTrayOpen]);

  const play = useCallback((id: string) => void queueSetCurrent(id).catch(() => {}), [queueSetCurrent]);
  const drop = useCallback((id: string) => void queueRemove([id]).catch(() => {}), [queueRemove]);

  if (!queue.length) {
    // The queue now owns a whole pane rather than a collapsed strip, so the empty
    // state centres and offers the action instead of sitting in the top corner.
    return (
      <View style={styles.empty}>
        <View style={styles.emptyIcon}>
          <Ionicons name="layers-outline" size={ms(22)} color={colors.honey} />
        </View>
        <Text style={styles.emptyText}>Nothing queued yet</Text>
        <Text style={styles.emptyHint}>
          Anything you add lands here for everyone in the room.
        </Text>
        <Pressable
          style={styles.emptyCta}
          onPress={onBrowse}
          accessibilityRole="button"
          accessibilityLabel="Find something to watch"
        >
          <Ionicons name="search" size={ms(14)} color={colors.onHoney} />
          <Text style={styles.emptyCtaText}>Find something to watch</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      data={queue}
      keyExtractor={(i) => i.id}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      renderItem={({ item, index }) => (
        <QueueRow
          item={item}
          index={index}
          current={item.id === currentId}
          isHost={isHost}
          mine={item.addedByUserId === userId}
          onPlay={play}
          onDrop={drop}
        />
      )}
    />
  );
}

function QueueRow({
  item,
  index,
  current,
  isHost,
  mine,
  onPlay,
  onDrop,
}: {
  item: QueueItem;
  index: number;
  current: boolean;
  isHost: boolean;
  mine: boolean;
  onPlay: (id: string) => void;
  onDrop: (id: string) => void;
}) {
  const r = item.ref;
  const tmdb = r.source === "tmdb" || r.source === "plugin" ? r : null;
  // Artwork is what makes a queue readable at a glance; the row falls back to a
  // tinted glyph for sources TMDB knows nothing about (direct links, YouTube).
  const { data: details } = useDetailsQuery(
    tmdb ? { type: tmdb.type, id: tmdb.tmdbId } : skipToken,
  );
  const poster = img(details?.poster_path, "w154") ?? undefined;
  const done = item.status === "done";
  const failed = item.status === "failed";
  const canDrop = isHost || mine;

  return (
    <View style={[styles.row, current && styles.rowCurrent]}>
      {/* No index badge over the artwork: the ORDER is the number, and the badge
          both clipped the poster and started counting at 2 once the current item
          stopped showing one. */}
      {poster ? (
        <Image source={{ uri: poster }} style={styles.thumb} contentFit="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]}>
          <Ionicons
            name={r.source === "youtube" ? "logo-youtube" : "link-outline"}
            size={ms(15)}
            color={colors.textDim}
          />
        </View>
      )}

      <View style={styles.mid}>
        <Text
          numberOfLines={1}
          style={[styles.title, current && styles.titleCurrent, (done || failed) && styles.titleMuted]}
        >
          {item.title ?? details?.title ?? details?.name ?? item.id}
        </Text>
        <View style={styles.metaRow}>
          {current ? (
            <>
              <View style={styles.nowDot} />
              <Text style={styles.nowText}>Now playing</Text>
            </>
          ) : (
            <Text numberOfLines={1} style={styles.sub}>
              {subtitleOf(item)}
            </Text>
          )}
          {/* Status is a chip, not more words on the metadata line — "Movie watched"
              read as one broken phrase. */}
          {failed ? (
            <View style={[styles.tag, styles.tagFail]}>
              <Text style={styles.tagFailText}>Couldn&apos;t play</Text>
            </View>
          ) : done ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>Watched</Text>
            </View>
          ) : null}
        </View>
      </View>

      {isHost && !current ? (
        <Pressable onPress={() => onPlay(item.id)} hitSlop={8} style={styles.act}>
          <Ionicons name="play" size={ms(16)} color={colors.honey} />
        </Pressable>
      ) : null}
      {canDrop && !current ? (
        <Pressable onPress={() => onDrop(item.id)} hitSlop={8} style={styles.act}>
          <Ionicons name="close" size={ms(16)} color={colors.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: ms(14), paddingBottom: ms(10), gap: ms(6) },
  /* Inline, not a centred hero: this sits inside a capped accordion. */
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: ms(8),
    paddingHorizontal: ms(34),
  },
  emptyIcon: {
    width: ms(52),
    height: ms(52),
    borderRadius: ms(26),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.honeySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.honeyGlow,
    marginBottom: ms(2),
  },
  emptyText: { ...type.h3, fontSize: ms(15) },
  emptyHint: {
    ...type.caption,
    fontSize: ms(12),
    color: colors.textFaint,
    textAlign: "center",
    lineHeight: ms(17),
  },
  emptyCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(6),
    marginTop: ms(8),
    paddingHorizontal: ms(16),
    height: ms(38),
    borderRadius: radius.pill,
    backgroundColor: colors.honey,
  },
  emptyCtaText: { fontFamily: font.label, fontSize: ms(12.5), color: colors.onHoney },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(11),
    padding: ms(8),
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  rowCurrent: {
    backgroundColor: colors.honeySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.honeyGlow,
  },
  thumb: { width: ms(38), height: ms(52), borderRadius: radius.sm },
  thumbEmpty: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceStrong,
  },
  /* The index/now badge sits ON the artwork so the row stays two columns wide. */

  mid: { flex: 1, gap: ms(3) },
  title: { ...type.body, fontSize: ms(13), fontFamily: font.bodyMed },
  titleCurrent: { color: colors.honeyBright },
  titleMuted: { color: colors.textDim },
  metaRow: { flexDirection: "row", alignItems: "center", gap: ms(6) },
  nowDot: { width: ms(5), height: ms(5), borderRadius: ms(3), backgroundColor: colors.honey },
  nowText: { fontFamily: font.label, fontSize: ms(10.5), color: colors.honey },
  tag: {
    paddingHorizontal: ms(6),
    paddingVertical: ms(2),
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceStrong,
  },
  tagText: { fontFamily: font.label, fontSize: ms(9.5), color: colors.textDim },
  tagFail: { backgroundColor: "rgba(229,89,89,0.14)" },
  tagFailText: { fontFamily: font.label, fontSize: ms(9.5), color: colors.danger },
  sub: { ...type.caption, fontSize: ms(10.5), color: colors.textFaint },
  act: { width: ms(30), height: ms(30), alignItems: "center", justifyContent: "center" },
});

export default PartyQueueList;
