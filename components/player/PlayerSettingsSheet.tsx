/**
 * PlayerSettingsSheet — a frosted bottom sheet for playback speed + quality.
 *
 * Speed routes through the room authority (host only → syncs to everyone via the
 * anchor). Quality is per-device — it drives videasy's own quality tab through
 * the HijackPlayer bridge (hls.js isn't reachable, so pointer-dispatch the option).
 */
import type { QualityLevel } from "@/components/player/HijackPlayer";
import GlassCard from "@/components/ui/GlassCard";
import { colors, font, ms, radius } from "@/theme/bearoom";
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export interface PlayerSettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Host / controller → may change the room's speed. */
  canControl: boolean;
  /** Current room playback rate. */
  rate: number;
  onSetRate: (rate: number) => void;
  qualities: QualityLevel[];
  onSetQuality: (label: string) => void;
  /** Audio / dub tracks (per-device — NOT synced across the room). */
  audios: QualityLevel[];
  onSetAudio: (label: string) => void;
}

export default function PlayerSettingsSheet({
  visible,
  onClose,
  canControl,
  rate,
  onSetRate,
  qualities,
  onSetQuality,
  audios,
  onSetAudio,
}: PlayerSettingsSheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.wrap} onPress={() => {}}>
          {/* Solid, not a live blur: blurring the playing video behind the sheet
              stutters it on the GPU (device-confirmed). */}
          <GlassCard blur={false} rounded={radius.xxl} bordered style={styles.solidSheet}>
            <View style={[styles.inner, { paddingBottom: Math.max(insets.bottom, ms(16)) }]}>
              <View style={styles.handle} />
              <Text style={styles.title}>Player</Text>

              {canControl ? (
                <>
                  <Text style={styles.section}>SPEED</Text>
                  <View style={styles.row}>
                    {SPEEDS.map((r) => {
                      const on = Math.abs(r - rate) < 0.01;
                      return (
                        <Pressable key={r} style={[styles.chip, on && styles.chipOn]} onPress={() => onSetRate(r)}>
                          <Text style={[styles.chipText, on && styles.chipTextOn]}>{r}×</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : null}

              <Text style={styles.section}>AUDIO</Text>
              <View style={styles.row}>
                {audios.length ? (
                  audios.map((a) => (
                    <Pressable
                      key={a.label}
                      style={[styles.chip, a.active && styles.chipOn]}
                      onPress={() => onSetAudio(a.label)}
                    >
                      <Text style={[styles.chipText, a.active && styles.chipTextOn]}>{a.label}</Text>
                    </Pressable>
                  ))
                ) : (
                  <Text style={styles.dim}>Loading…</Text>
                )}
              </View>

              <Text style={styles.section}>QUALITY</Text>
              <View style={styles.row}>
                {qualities.length ? (
                  qualities.map((q) => (
                    <Pressable
                      key={q.label}
                      style={[styles.chip, q.active && styles.chipOn]}
                      onPress={() => onSetQuality(q.label)}
                    >
                      <Text style={[styles.chipText, q.active && styles.chipTextOn]}>{q.label}</Text>
                    </Pressable>
                  ))
                ) : (
                  <Text style={styles.dim}>Loading…</Text>
                )}
              </View>
            </View>
          </GlassCard>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.modalBackdrop, justifyContent: "flex-end" },
  solidSheet: { backgroundColor: colors.bgElevated },
  wrap: { paddingHorizontal: ms(10), paddingBottom: ms(10) },
  inner: { paddingHorizontal: ms(18), paddingTop: ms(10) },
  handle: {
    alignSelf: "center",
    width: ms(38),
    height: ms(4),
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: ms(12),
  },
  title: { color: colors.text, fontFamily: font.headline, fontSize: ms(17) },
  section: {
    color: colors.textDim,
    fontFamily: font.label,
    fontSize: ms(11),
    letterSpacing: 1.2,
    marginTop: ms(16),
    marginBottom: ms(9),
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: ms(8) },
  chip: {
    paddingHorizontal: ms(15),
    paddingVertical: ms(9),
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  chipOn: { backgroundColor: colors.honeySoft, borderColor: colors.honey },
  chipText: { color: colors.text, fontFamily: font.bodySemi, fontSize: ms(13) },
  chipTextOn: { color: colors.honey },
  dim: { color: colors.textFaint, fontFamily: font.body, fontSize: ms(13), paddingVertical: ms(9) },
});
