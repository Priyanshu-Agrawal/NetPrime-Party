/**
 * PartyChatThread — the compact chat used inside PartyTray.
 *
 * Reads the room's chat straight off the session context, so it is the SAME
 * conversation PartyScreen shows: messages sent from the tray while browsing
 * appear in the room, and messages that arrive while you are away are waiting
 * when you open it. Bubble grouping/colour come from chatFormat.ts, shared with
 * PartyScreen so the two renderings can't drift.
 *
 * Deliberately narrower than the full screen: no GIF picker, no timestamp chip,
 * no floating reactions. Those belong to the room itself; this is "keep talking
 * while I look for something to queue".
 */
import BearAvatar from "@/components/avatar/BearAvatar";
import { GifPicker } from "@/components/party/GifPicker";
import { bubbleCorners, fmtClock, groupFlags, senderColor } from "@/components/party/chatFormat";
import { generateRandomBearConfig } from "@/services/avatar/bearAvatar";
import { usePartyChatSession, usePartySession } from "@/services/party/PartySession";
import type { ChatMessage } from "@/services/party/usePartyChat";
import { colors, font, ms, radius } from "@/theme/bearoom";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

const bearCache = new Map<string, ReturnType<typeof generateRandomBearConfig>>();
function bearFor(userId: string) {
  let c = bearCache.get(userId);
  if (!c) {
    c = generateRandomBearConfig("neutral", userId);
    bearCache.set(userId, c);
  }
  return c;
}

export function PartyChatThread({ compact = false }: { compact?: boolean }) {
  const chat = usePartyChatSession();
  const { userId } = usePartySession();
  const [draft, setDraft] = useState("");
  const [showGif, setShowGif] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    if (chat.messages.length) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [chat.messages.length]);

  const send = () => {
    const t = draft.trim();
    if (!t) return;
    chat.sendChat(t);
    setDraft("");
  };

  return (
    <View style={styles.wrap}>
      <FlatList
        ref={listRef}
        data={chat.messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={[styles.list, chat.messages.length ? styles.listFilled : styles.listEmpty]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="chatbubbles-outline" size={ms(18)} color={colors.honey} />
            </View>
            <Text style={styles.emptyText}>Say something to the pack</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const prev = chat.messages[index - 1];
          const next = chat.messages[index + 1];
          const { firstOfGroup, lastOfGroup } = groupFlags(prev, item, next);
          const mine = item.userId === userId;
          return (
            <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
              {!mine ? (
                <View style={styles.avatarCol}>
                  {firstOfGroup ? <BearAvatar config={bearFor(item.userId)} size={ms(22)} /> : null}
                </View>
              ) : null}
              <View style={styles.bubbleCol}>
                {!mine && firstOfGroup ? (
                  <Text style={[styles.sender, { color: senderColor(item.userId) }]}>
                    {item.name}
                  </Text>
                ) : null}
                <View
                  style={[
                    styles.bubble,
                    mine ? styles.bubbleMine : styles.bubbleTheirs,
                    bubbleCorners(mine, firstOfGroup, lastOfGroup),
                  ]}
                >
                  {item.kind === "gif" && item.gifUrl ? (
                    <Image
                      source={{ uri: item.gifUrl }}
                      style={[styles.gif, item.sticker && styles.sticker]}
                      contentFit="contain"
                    />
                  ) : (
                    <Text style={styles.bubbleText}>{item.text}</Text>
                  )}
                </View>
                {lastOfGroup ? <Text style={styles.time}>{fmtClock(item.ts)}</Text> : null}
              </View>
            </View>
          );
        }}
      />

      <View style={styles.quickRow}>
        {QUICK_REACTIONS.map((e) => (
          <Pressable
            key={e}
            onPress={() => chat.sendReaction(e)}
            hitSlop={6}
            style={styles.quickChip}
            accessibilityRole="button"
            accessibilityLabel={`React ${e}`}
          >
            <Text style={styles.quickEmoji}>{e}</Text>
          </Pressable>
        ))}
      </View>

      <View style={[styles.composer, compact && styles.composerCompact]}>
        <Pressable
          onPress={() => setShowGif(true)}
          hitSlop={6}
          style={styles.gifBtn}
          accessibilityRole="button"
          accessibilityLabel="Send a GIF or sticker"
        >
          <Text style={styles.gifText}>GIF</Text>
        </Pressable>
        <TextInput
          style={styles.input}
          placeholder="Say something to the pack…"
          placeholderTextColor={colors.textDim}
          value={draft}
          onChangeText={setDraft}
          selectionColor={colors.honey}
          returnKeyType="send"
          onSubmitEditing={send}
          blurOnSubmit={false}
        />
        <Pressable
          style={[styles.send, !draft.trim() && styles.sendOff]}
          onPress={send}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Send"
        >
          <Ionicons
            name="arrow-up"
            size={ms(17)}
            color={draft.trim() ? colors.onHoney : colors.textDim}
          />
        </Pressable>
      </View>

      <GifPicker
        visible={showGif}
        onClose={() => setShowGif(false)}
        customerId={userId}
        onPick={(g, k) => chat.sendGif(g, k === "stickers")}
      />
    </View>
  );
}

/** Same set the room uses, so a reaction sent from the tray reads identically. */
const QUICK_REACTIONS = ["❤️", "😂", "🔥", "👏", "😮"];

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  list: { paddingHorizontal: ms(12), paddingBottom: ms(8), gap: ms(2), flexGrow: 1 },
  listFilled: { justifyContent: "flex-end" },
  listEmpty: { justifyContent: "center" },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: ms(18), gap: ms(7) },
  emptyIcon: {
    width: ms(34),
    height: ms(34),
    borderRadius: ms(17),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.honeySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.honeyGlow,
  },
  emptyText: { color: colors.textDim, fontFamily: font.bodyMed, fontSize: ms(12.5) },
  row: { flexDirection: "row", alignItems: "flex-end", gap: ms(6) },
  rowMine: { justifyContent: "flex-end" },
  rowTheirs: { justifyContent: "flex-start" },
  avatarCol: { width: ms(22) },
  bubbleCol: { maxWidth: "78%" },
  sender: { fontFamily: font.label, fontSize: ms(10.5), marginBottom: ms(2) },
  bubble: { paddingHorizontal: ms(11), paddingVertical: ms(7), overflow: "hidden" },
  /* Mine vs theirs is carried by lightness plus a whisper of warmth. A honey-
     tinted block for every message you sent turned the thread into a wall of
     accent and pulled focus off whatever you were browsing. */
  bubbleMine: { backgroundColor: "rgba(240,169,60,0.09)", alignSelf: "flex-end" },
  bubbleTheirs: { backgroundColor: colors.surface, alignSelf: "flex-start" },
  bubbleText: { color: colors.text, fontFamily: font.body, fontSize: ms(13), lineHeight: ms(18) },
  time: { color: colors.textFaint, fontFamily: font.body, fontSize: ms(9.5), marginTop: ms(2) },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(8),
    paddingHorizontal: ms(12),
    paddingTop: ms(8),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  composerCompact: { paddingBottom: ms(4) },
  quickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: ms(10),
    paddingHorizontal: ms(14),
    paddingBottom: ms(8),
  },
  quickChip: {
    width: ms(30),
    height: ms(30),
    borderRadius: ms(15),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  quickEmoji: { fontSize: ms(15) },
  gifBtn: {
    paddingHorizontal: ms(9),
    height: ms(40),
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  gifText: { fontFamily: font.label, fontSize: ms(11), color: colors.honey, letterSpacing: 0.5 },
  gif: { width: ms(150), height: ms(150), borderRadius: radius.sm },
  sticker: { width: ms(110), height: ms(110) },
  input: {
    flex: 1,
    height: ms(40),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: ms(14),
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: font.body,
    fontSize: ms(13),
  },
  send: {
    width: ms(40),
    height: ms(40),
    borderRadius: ms(20),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.honey,
  },
  /* At rest the composer shouldn't glow — the button takes the accent only once
     there is something to send. */
  sendOff: { backgroundColor: colors.surfaceStrong },
});

export default PartyChatThread;
