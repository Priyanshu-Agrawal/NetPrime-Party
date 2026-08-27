/**
 * NotificationPermissionModal — Cozy Cinema-Lounge Pre-Permission Prompt
 *
 * Explains clearly why Bearoom needs notification permission (lock-screen media controls & watch-party invites)
 * to avoid confusing layman users before presenting the native system permission dialog.
 */
import BearAvatar from "@/components/avatar/BearAvatar";
import { generateRandomBearConfig } from "@/services/avatar/bearAvatar";
import { requestNotificationPermission } from "@/services/permissions/notifications";
import { Appear } from "@/src/ui";
import { colors, font, glow, ms, radius } from "@/theme/bearoom";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export interface NotificationPermissionModalProps {
  visible: boolean;
  onClose: (granted: boolean) => void;
}

export default function NotificationPermissionModal({
  visible,
  onClose,
}: NotificationPermissionModalProps) {
  const handleAllow = async () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const granted = await requestNotificationPermission();
    onClose(granted);
  };

  const handleDismiss = () => {
    void Haptics.selectionAsync();
    onClose(false);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Top Emblem */}
          <Appear variant="rise" index={0} style={styles.appearFull}>
            <View style={styles.emblemWrap}>
              <View style={styles.glow} />
              <View style={styles.iconCircle}>
                <Ionicons name="headset" size={ms(32)} color={colors.honey} />
              </View>
            </View>

            {/* Headline */}
            <Text style={styles.title}>Keep the sound going</Text>
            <Text style={styles.subtitle}>
              Enable controls so you can listen and manage playback seamlessly.
            </Text>
          </Appear>

          {/* Benefits */}
          <Appear variant="rise" index={1} style={styles.appearFull}>
            <View style={styles.benefitsList}>
            <View style={styles.benefitRow}>
              <View style={styles.bulletIcon}>
                <Ionicons name="play-circle" size={ms(18)} color={colors.honey} />
              </View>
              <View style={styles.benefitTextWrap}>
                <Text style={styles.benefitTitle}>Lock-Screen Audio</Text>
                <Text style={styles.benefitDesc}>
                  Play, pause, and seek without unlocking your phone or leaving other apps.
                </Text>
              </View>
            </View>

            <View style={styles.benefitRow}>
              <View style={styles.bulletIcon}>
                <Ionicons name="people" size={ms(18)} color={colors.honey} />
              </View>
              <View style={styles.benefitTextWrap}>
                <Text style={styles.benefitTitle}>Watch Party Invites</Text>
                <Text style={styles.benefitDesc}>
                  Get notified instantly when your pack starts a synchronized watch party.
                </Text>
              </View>
            </View>
            </View>
          </Appear>

          {/* Actions */}
          <Appear variant="rise" index={2} style={styles.appearFull}>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.allowBtn} onPress={handleAllow} activeOpacity={0.8}>
                <Text style={styles.allowBtnText}>Enable Controls</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.laterBtn} onPress={handleDismiss} activeOpacity={0.7}>
                <Text style={styles.laterBtnText}>Maybe Later</Text>
              </TouchableOpacity>
            </View>
          </Appear>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.modalBackdrop,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: ms(24),
  },
  card: {
    width: "100%",
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    borderRadius: radius.xxl,
    padding: ms(24),
    alignItems: "center",
  },
  appearFull: {
    width: "100%",
    alignItems: "center",
  },
  emblemWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: ms(16),
  },
  glow: {
    position: "absolute",
    width: ms(80),
    height: ms(80),
    borderRadius: radius.pill,
    backgroundColor: colors.honeyGlow,
    opacity: 0.35,
  },
  iconCircle: {
    width: ms(64),
    height: ms(64),
    borderRadius: radius.pill,
    backgroundColor: colors.honeySoft,
    borderWidth: 1.5,
    borderColor: colors.honey,
    alignItems: "center",
    justifyContent: "center",
    ...glow.honey,
  },
  title: {
    color: colors.text,
    fontFamily: font.headlineXbold,
    fontSize: ms(22),
    textAlign: "center",
  },
  subtitle: {
    color: colors.textDim,
    fontFamily: font.body,
    fontSize: ms(13),
    textAlign: "center",
    marginTop: ms(6),
    lineHeight: ms(18),
    paddingHorizontal: ms(8),
  },

  benefitsList: {
    width: "100%",
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: ms(14),
    marginTop: ms(18),
    marginBottom: ms(20),
    gap: ms(14),
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: ms(10),
  },
  bulletIcon: {
    width: ms(28),
    height: ms(28),
    borderRadius: radius.pill,
    backgroundColor: colors.honeySoft,
    alignItems: "center",
    justifyContent: "center",
    marginTop: ms(2),
  },
  benefitTextWrap: {
    flex: 1,
  },
  benefitTitle: {
    color: colors.text,
    fontFamily: font.bodySemi,
    fontSize: ms(14),
  },
  benefitDesc: {
    color: colors.textDim,
    fontFamily: font.body,
    fontSize: ms(12),
    lineHeight: ms(16),
    marginTop: ms(2),
  },

  actions: {
    width: "100%",
    gap: ms(8),
  },
  allowBtn: {
    width: "100%",
    height: ms(48),
    borderRadius: radius.pill,
    backgroundColor: colors.honey,
    alignItems: "center",
    justifyContent: "center",
    ...glow.honey,
  },
  allowBtnText: {
    color: colors.onHoney,
    fontFamily: font.headline,
    fontSize: ms(15),
  },
  laterBtn: {
    width: "100%",
    height: ms(40),
    alignItems: "center",
    justifyContent: "center",
  },
  laterBtnText: {
    color: colors.textDim,
    fontFamily: font.label,
    fontSize: ms(13),
  },
});
