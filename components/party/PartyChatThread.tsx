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
import { bubbleCorners, fmtClock, groupFlags, senderColor } from "@/components/party/chatFormat";
import { generateRandomBearConfig } from "@/services/avatar/bearAvatar";
import { usePartyChatSession, usePartySession } from "@/services/party/PartySession";
import { colors, font, ms, radius } from "@/theme/bearoom";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { ChatMessage } from "@/services/party/usePartyChat";

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
        contentContainerStyle={styles.list}
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
                  {item.kind === "gif" ? (
                    <Text style={styles.bubbleText}>[GIF]</Text>
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

      <View style={[styles.composer, compact && styles.composerCompact]}>
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
        >
          <Ionicons name="arrow-up" size={ms(17)} color={colors.onHoney} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  list: { paddingHorizontal: ms(12), paddingBottom: ms(8), gap: ms(2) },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: ms(26), gap: ms(8) },
  emptyIcon: {
    width: ms(40),
    height: ms(40),
    borderRadius: ms(20),
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
  bubble: { paddingHorizontal: ms(11), paddingVertical: ms(7) },
  bubbleMine: { backgroundColor: colors.honeySoft, alignSelf: "flex-end" },
  bubbleTheirs: { backgroundColor: colors.surfaceStrong, alignSelf: "flex-start" },
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
  sendOff: { opacity: 0.45 },
});

export default PartyChatThread;
