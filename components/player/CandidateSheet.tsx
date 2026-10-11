/**
 * The native lane's source picker (spec §6.2 Source row): every playable stream for this title with its language and
 * quality badges, and a way out to the web player (the providers' own pages). Solid sheet — no blur over video.
 */
import { languageName } from "@/components/player/native/languages";
import GlassCard from "@/components/ui/GlassCard";
import type { PlaybackCandidate } from "@/services/playback/candidate";
import { colors, font, ms, radius } from "@/theme/bearoom";
import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PLAYER_SHEET_ORIENTATIONS } from "@/components/player/sheetOrientations";

export interface CandidateSheetProps {
  visible: boolean;
  candidates: PlaybackCandidate[];
  currentKey: string | null;
  onPick: (c: PlaybackCandidate) => void;
  onUseWeb: () => void;
  onClose: () => void;
}

function details(c: PlaybackCandidate): string {
  const lang = c.languages[0];
  return [
    lang ? languageName(lang) : "Language unknown",
    c.quality?.label,
    c.verdict === "unverified" ? "Unverified" : null,
    c.platforms.ios ? null : "Android only",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function CandidateSheet({ visible, candidates, currentKey, onPick, onUseWeb, onClose }: CandidateSheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      supportedOrientations={PLAYER_SHEET_ORIENTATIONS}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.wrap} onPress={() => {}}>
          <GlassCard blur={false} rounded={radius.xxl} bordered style={styles.sheet}>
            <View style={[styles.inner, { paddingBottom: Math.max(insets.bottom, ms(16)) }]}>
              <View style={styles.handle} />
              <Text style={styles.title}>Source</Text>
              <ScrollView style={styles.list}>
                {candidates.map((c) => {
                  const on = c.key === currentKey;
                  const line = details(c);
                  return (
                    <Pressable
                      key={c.key}
                      accessibilityRole="button"
                      accessibilityLabel={`${c.label}, ${line}`}
                      accessibilityState={{ selected: on }}
                      style={[styles.row, on && styles.rowOn]}
                      onPress={() => onPick(c)}
                    >
                      <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
                        {c.label}
                      </Text>
                      <Text style={styles.details} numberOfLines={1}>
                        {line}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable accessibilityRole="button" accessibilityLabel="Use the web player" style={styles.row} onPress={onUseWeb}>
                  <Text style={styles.label}>Web player · other sources</Text>
                </Pressable>
              </ScrollView>
            </View>
          </GlassCard>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.modalBackdrop, justifyContent: "flex-end" },
  wrap: { paddingHorizontal: ms(10), paddingBottom: ms(10) },
  sheet: { backgroundColor: colors.bgElevated },
  inner: { paddingHorizontal: ms(18), paddingTop: ms(10) },
  handle: { alignSelf: "center", width: ms(38), height: ms(4), borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: ms(12) },
  title: { color: colors.text, fontFamily: font.headline, fontSize: ms(17), marginBottom: ms(10) },
  list: { maxHeight: ms(420) },
  row: { paddingVertical: ms(11), paddingHorizontal: ms(12), borderRadius: radius.lg, marginBottom: ms(6), backgroundColor: colors.surfaceStrong },
  rowOn: { backgroundColor: colors.honeySoft, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.honey },
  label: { color: colors.text, fontFamily: font.bodySemi, fontSize: ms(14) },
  labelOn: { color: colors.honey },
  details: { color: colors.textDim, fontFamily: font.body, fontSize: ms(12), marginTop: ms(2) },
});
