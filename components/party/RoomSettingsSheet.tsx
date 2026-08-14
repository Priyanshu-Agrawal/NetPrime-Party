/**
 * RoomSettingsSheet — the host's room-administration bottom sheet (Stitch
 * "Room Settings"). Fully wired to the Supabase authority via the callbacks:
 * access mode + password, room toggles, per-member permissions, approve/kick,
 * and host transfer. Host-only — the caller renders it only when isHost.
 */
import { colors, font, glow, ms, radius } from "@/theme/bearoom";
import type { Member, RoomAccess, RoomConfig } from "@/services/party/protocol";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const ACCESS: { key: RoomAccess; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "open", label: "Open", icon: "globe-outline" },
  { key: "locked", label: "Locked", icon: "lock-closed-outline" },
  { key: "private", label: "Private", icon: "eye-off-outline" },
  { key: "password", label: "Password", icon: "key-outline" },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  config: RoomConfig;
  members: Member[];
  hostId?: string | null;
  selfId: string;
  onSetConfig: (patch: Partial<RoomConfig>, password?: string) => void;
  onSetPermissions: (userId: string, patch: Partial<Member["permissions"]>) => void;
  onApprove: (userId: string) => void;
  onKick: (userId: string) => void;
  onTransferHost: (userId: string) => void;
}

export function RoomSettingsSheet({
  visible,
  onClose,
  config,
  members,
  hostId,
  selfId,
  onSetConfig,
  onSetPermissions,
  onApprove,
  onKick,
  onTransferHost,
}: Props) {
  const insets = useSafeAreaInsets();
  // Local access selection lets "Password" reveal the field before we commit the
  // change (the RPC rejects password mode with no password set).
  const [pendingAccess, setPendingAccess] = useState<RoomAccess | null>(null);
  const [pw, setPw] = useState("");
  const access = pendingAccess ?? config.access;

  useEffect(() => {
    if (visible) {
      setPendingAccess(null);
      setPw("");
    }
  }, [visible]);

  const pickAccess = (key: RoomAccess) => {
    if (key === "password") {
      // Keep an existing password; otherwise reveal the field and wait for input.
      if (config.passwordRequired) onSetConfig({ access: "password" });
      else setPendingAccess("password");
      return;
    }
    setPendingAccess(null);
    onSetConfig({ access: key });
  };

  const savePassword = () => {
    if (pw.trim().length < 3) {
      Alert.alert("Password too short", "Use at least 3 characters.");
      return;
    }
    onSetConfig({ access: "password" }, pw.trim());
    setPendingAccess(null);
    setPw("");
  };

  const memberMenu = (m: Member) => {
    if (m.userId === selfId) return;
    const isHostRow = m.userId === hostId;
    const canControl = !!m.permissions?.canControlPlayback;
    const canChat = m.permissions?.canChat !== false;
    Alert.alert(m.displayName || "Guest", undefined, [
      ...(m.approved ? [] : [{ text: "Approve", onPress: () => onApprove(m.userId) }]),
      ...(isHostRow ? [] : [{ text: "Make host", onPress: () => onTransferHost(m.userId) }]),
      {
        text: canControl ? "Revoke playback control" : "Allow playback control",
        onPress: () => onSetPermissions(m.userId, { canControlPlayback: !canControl }),
      },
      {
        text: canChat ? "Mute in chat" : "Unmute in chat",
        onPress: () => onSetPermissions(m.userId, { canChat: !canChat }),
      },
      { text: "Remove from room", style: "destructive", onPress: () => onKick(m.userId) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, ms(12)) }]}>
        <View style={styles.grabber} />
        <Text style={styles.title}>Room settings</Text>

        <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
          {/* Access */}
          <Text style={styles.overline}>ROOM ACCESS</Text>
          <View style={styles.segment}>
            {ACCESS.map((a) => {
              const active = access === a.key;
              return (
                <Pressable
                  key={a.key}
                  style={[styles.segItem, active && styles.segItemActive]}
                  onPress={() => pickAccess(a.key)}
                >
                  <Text style={[styles.segText, active && styles.segTextActive]}>{a.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {access === "password" ? (
            <View style={styles.pwRow}>
              <View style={styles.pwField}>
                <Ionicons name="lock-closed" size={ms(15)} color={colors.textDim} />
                <TextInput
                  value={pw}
                  onChangeText={setPw}
                  placeholder={config.passwordRequired ? "Change password" : "Set a password"}
                  placeholderTextColor={colors.textFaint}
                  style={styles.pwInput}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  selectionColor={colors.honey}
                />
              </View>
              <Pressable style={styles.pwSave} onPress={savePassword}>
                <Text style={styles.pwSaveText}>{config.passwordRequired ? "Update" : "Set"}</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Toggles */}
          <View style={styles.card}>
            <ToggleRow
              label="Anyone can chat"
              value={config.chatEnabled}
              onValueChange={(v) => onSetConfig({ chatEnabled: v })}
            />
            <ToggleRow
              label="Reactions & GIFs"
              value={config.gifsEnabled}
              onValueChange={(v) => onSetConfig({ gifsEnabled: v })}
            />
            <ToggleRow
              label="Guests can control playback"
              value={config.guestControlDefault}
              onValueChange={(v) => onSetConfig({ guestControlDefault: v })}
            />
            <ToggleRow
              label="Approve guests before joining"
              value={config.approveGuests}
              onValueChange={(v) => onSetConfig({ approveGuests: v })}
              last
            />
          </View>

          {/* Members */}
          <Text style={styles.overline}>MEMBERS ({members.length})</Text>
          <View style={styles.card}>
            {members.map((m, i) => {
              const isHostRow = m.userId === hostId;
              const isSelf = m.userId === selfId;
              const muted = m.permissions?.canChat === false;
              return (
                <View key={m.userId} style={[styles.memberRow, i < members.length - 1 && styles.rowBorder]}>
                  <View style={[styles.avatar, isHostRow && styles.avatarHost]}>
                    <Text style={styles.avatarText}>
                      {(m.displayName || "G").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.memberMid}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {m.displayName || "Guest"}
                      {isSelf ? " (you)" : ""}
                    </Text>
                    {muted ? (
                      <View style={styles.mutedTag}>
                        <Ionicons name="mic-off" size={ms(11)} color={colors.textDim} />
                        <Text style={styles.mutedText}>muted</Text>
                      </View>
                    ) : null}
                  </View>
                  {!m.approved ? <View style={styles.pendingBadge}><Text style={styles.pendingText}>PENDING</Text></View> : null}
                  <View style={[styles.roleBadge, isHostRow && styles.roleBadgeHost]}>
                    <Text style={[styles.roleText, isHostRow && styles.roleTextHost]}>
                      {isHostRow ? "HOST" : "GUEST"}
                    </Text>
                  </View>
                  {isSelf ? (
                    <View style={styles.dotsSpacer} />
                  ) : (
                    <Pressable onPress={() => memberMenu(m)} hitSlop={8} style={styles.dots}>
                      <Ionicons name="ellipsis-horizontal" size={ms(18)} color={colors.textDim} />
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        </ScrollView>

        <Pressable style={styles.done} onPress={onClose}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
  last,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  last?: boolean;
}) {
  return (
    <View style={[styles.toggleRow, !last && styles.rowBorder]}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.surfaceStrong, true: colors.honey }}
        thumbColor={colors.text}
        ios_backgroundColor={colors.surfaceStrong}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(8,6,4,0.6)" },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    paddingHorizontal: ms(18),
    paddingTop: ms(10),
    maxHeight: "88%",
  },
  grabber: {
    alignSelf: "center",
    width: ms(38),
    height: ms(4),
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: ms(10),
  },
  title: {
    color: colors.text,
    fontFamily: font.headline,
    fontSize: ms(18),
    textAlign: "center",
    marginBottom: ms(14),
  },
  scroll: { flexGrow: 0 },

  overline: {
    color: colors.textDim,
    fontFamily: font.label,
    fontSize: ms(11),
    letterSpacing: 1.4,
    marginBottom: ms(10),
    marginTop: ms(4),
  },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    padding: ms(4),
    gap: ms(4),
  },
  segItem: {
    flex: 1,
    paddingVertical: ms(9),
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  segItemActive: { backgroundColor: colors.honey, ...glow.honey },
  segText: { color: colors.textDim, fontFamily: font.label, fontSize: ms(12) },
  segTextActive: { color: colors.onHoney },

  pwRow: { flexDirection: "row", alignItems: "center", gap: ms(8), marginTop: ms(10) },
  pwField: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: ms(8),
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: ms(14),
    height: ms(46),
  },
  pwInput: { flex: 1, color: colors.text, fontFamily: font.body, fontSize: ms(14), letterSpacing: 2 },
  pwSave: {
    height: ms(46),
    paddingHorizontal: ms(18),
    borderRadius: radius.md,
    backgroundColor: colors.honey,
    alignItems: "center",
    justifyContent: "center",
  },
  pwSaveText: { color: colors.onHoney, fontFamily: font.label, fontSize: ms(13) },

  card: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.lg,
    marginTop: ms(14),
    marginBottom: ms(6),
    overflow: "hidden",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: ms(16),
    paddingVertical: ms(12),
    minHeight: ms(52),
  },
  toggleLabel: { color: colors.text, fontFamily: font.bodyMed, fontSize: ms(14), flex: 1, paddingRight: ms(10) },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },

  memberRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: ms(14), paddingVertical: ms(11), gap: ms(10) },
  avatar: {
    width: ms(38),
    height: ms(38),
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarHost: { borderColor: colors.honey },
  avatarText: { color: colors.text, fontFamily: font.bodySemi, fontSize: ms(14) },
  memberMid: { flex: 1 },
  memberName: { color: colors.text, fontFamily: font.bodySemi, fontSize: ms(14) },
  mutedTag: { flexDirection: "row", alignItems: "center", gap: ms(4), marginTop: ms(2) },
  mutedText: { color: colors.textDim, fontFamily: font.body, fontSize: ms(11) },
  pendingBadge: {
    backgroundColor: colors.honeySoft,
    borderRadius: radius.sm,
    paddingHorizontal: ms(7),
    paddingVertical: ms(3),
  },
  pendingText: { color: colors.honey, fontFamily: font.label, fontSize: ms(9), letterSpacing: 0.5 },
  roleBadge: { backgroundColor: colors.surfaceStrong, borderRadius: radius.sm, paddingHorizontal: ms(8), paddingVertical: ms(4) },
  roleBadgeHost: { backgroundColor: colors.honeySoft },
  roleText: { color: colors.textDim, fontFamily: font.label, fontSize: ms(9), letterSpacing: 0.5 },
  roleTextHost: { color: colors.honey },
  dots: { padding: ms(4) },
  dotsSpacer: { width: ms(26) },

  done: {
    marginTop: ms(14),
    height: ms(52),
    borderRadius: radius.pill,
    backgroundColor: colors.honey,
    alignItems: "center",
    justifyContent: "center",
    ...glow.honey,
  },
  doneText: { color: colors.onHoney, fontFamily: font.headlineSemi, fontSize: ms(16) },
});

export default RoomSettingsSheet;
