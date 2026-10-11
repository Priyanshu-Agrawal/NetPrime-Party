/**
 * PlayerSettingsSheet — the player's settings: Audio · Subtitles · Quality · Speed · Source (spec §6.2.1).
 * A row renders only when the source can back it, and every row header shows its current value. Speed routes
 * through the room authority (host only); audio, subtitles and quality are per device.
 */
import type { SubtitleSize } from "@/components/player/subtitles/SubtitleOverlay";
import type { QualityLevel, SubtitleTrack } from "@/components/player/types";
import GlassCard from "@/components/ui/GlassCard";
import { colors, font, ms, radius } from "@/theme/bearoom";
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PLAYER_SHEET_ORIENTATIONS } from "@/components/player/sheetOrientations";

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export interface SubtitleAdjust {
  offsetSec: number;
  size: SubtitleSize;
  onOffset: (sec: number) => void;
  onSize: (size: SubtitleSize) => void;
}

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
  /** Overrides the derived quality value, e.g. "Auto (576p)". */
  qualitySummary?: string;
  /** Audio / dub tracks (per-device — NOT synced across the room). */
  audios: QualityLevel[];
  onSetAudio: (label: string) => void;
  /** Audio / Quality rows appear only when the source can switch them (default: shown). */
  showAudio?: boolean;
  showQuality?: boolean;
  /** Subtitle tracks; the row hides when there are none. */
  subtitles?: SubtitleTrack[];
  onSetSubtitle?: (id: string | null) => void;
  /** Offset + size for subtitles we draw ourselves (sidecar files). */
  subtitleAdjust?: SubtitleAdjust;
  /** The source in use, with a way to pick another. */
  source?: { label: string; onOpen: () => void };
  /** "Autoplay next episode" pref (TV only) — applies to the NEXT stream load. */
  showAutoplay?: boolean;
  autoplayNext?: boolean;
  onToggleAutoplayNext?: () => void;
}

const SIZES: { key: SubtitleSize; label: string }[] = [
  { key: "s", label: "Small" },
  { key: "m", label: "Medium" },
  { key: "l", label: "Large" },
];
const OFFSET_STEP = 0.5;

/** "+0.5 s", "−1.0 s", "±0.0 s". */
export function offsetLabel(sec: number): string {
  const s = Math.round(sec * 10) / 10;
  return `${s > 0 ? "+" : s < 0 ? "−" : "±"}${Math.abs(s).toFixed(1)} s`;
}

function Section({ title, value }: { title: string; value?: string }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.section}>{title}</Text>
      {value ? (
        <Text style={styles.sectionValue} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
    </View>
  );
}

export default function PlayerSettingsSheet({
  visible,
  onClose,
  canControl,
  rate,
  onSetRate,
  qualities,
  onSetQuality,
  qualitySummary,
  audios,
  onSetAudio,
  showAudio = true,
  showQuality = true,
  subtitles = [],
  onSetSubtitle,
  subtitleAdjust,
  source,
  showAutoplay,
  autoplayNext,
  onToggleAutoplayNext,
}: PlayerSettingsSheetProps) {
  const insets = useSafeAreaInsets();
  const selectedSub = subtitles.find((t) => t.selected);
  const adjustable = !!subtitleAdjust && !!selectedSub?.id.startsWith("side:");
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
          {/* Solid, not a live blur: blurring the playing video behind the sheet stutters it on the GPU
              (device-confirmed). */}
          <GlassCard blur={false} rounded={radius.xxl} bordered style={styles.solidSheet}>
            <View style={[styles.inner, { paddingBottom: Math.max(insets.bottom, ms(16)) }]}>
              <View style={styles.handle} />
              <Text style={styles.title}>Player</Text>

              {showAudio ? (
                <>
                  <Section title="AUDIO" value={audios.find((a) => a.active)?.label} />
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
                </>
              ) : null}

              {subtitles.length ? (
                <>
                  <Section title="SUBTITLES" value={selectedSub?.label ?? "Off"} />
                  <View style={styles.row}>
                    <Pressable
                      accessibilityLabel="Subtitles off"
                      style={[styles.chip, !selectedSub && styles.chipOn]}
                      onPress={() => onSetSubtitle?.(null)}
                    >
                      <Text style={[styles.chipText, !selectedSub && styles.chipTextOn]}>Off</Text>
                    </Pressable>
                    {subtitles.map((t) => (
                      <Pressable
                        key={t.id}
                        accessibilityLabel={`Subtitles ${t.label}`}
                        style={[styles.chip, t.selected && styles.chipOn]}
                        onPress={() => onSetSubtitle?.(t.id)}
                      >
                        <Text style={[styles.chipText, t.selected && styles.chipTextOn]}>{t.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {adjustable && subtitleAdjust ? (
                    <>
                      <View style={[styles.row, styles.rowGap]}>
                        <Pressable
                          accessibilityLabel="Subtitles earlier"
                          style={styles.chip}
                          onPress={() => subtitleAdjust.onOffset(subtitleAdjust.offsetSec - OFFSET_STEP)}
                        >
                          <Text style={styles.chipText}>−0.5 s</Text>
                        </Pressable>
                        <Text style={styles.offsetValue}>{offsetLabel(subtitleAdjust.offsetSec)}</Text>
                        <Pressable
                          accessibilityLabel="Subtitles later"
                          style={styles.chip}
                          onPress={() => subtitleAdjust.onOffset(subtitleAdjust.offsetSec + OFFSET_STEP)}
                        >
                          <Text style={styles.chipText}>+0.5 s</Text>
                        </Pressable>
                      </View>
                      <View style={[styles.row, styles.rowGap]}>
                        {SIZES.map((s) => {
                          const on = s.key === subtitleAdjust.size;
                          return (
                            <Pressable
                              key={s.key}
                              accessibilityLabel={`Subtitle size ${s.label}`}
                              style={[styles.chip, on && styles.chipOn]}
                              onPress={() => subtitleAdjust.onSize(s.key)}
                            >
                              <Text style={[styles.chipText, on && styles.chipTextOn]}>{s.label}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  ) : null}
                </>
              ) : null}

              {showQuality ? (
                <>
                  <Section title="QUALITY" value={qualitySummary ?? qualities.find((q) => q.active)?.label} />
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
                </>
              ) : null}

              {canControl ? (
                <>
                  <Section title="SPEED" value={`${rate}×`} />
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

              {source ? (
                <>
                  <Section title="SOURCE" value={source.label} />
                  <View style={styles.row}>
                    <Pressable accessibilityLabel="Change source" style={styles.chip} onPress={source.onOpen}>
                      <Text style={styles.chipText}>Change source</Text>
                    </Pressable>
                  </View>
                </>
              ) : null}

              {showAutoplay ? (
                <>
                  <Section title="PLAYBACK" />
                  <View style={styles.row}>
                    <Pressable style={[styles.chip, autoplayNext && styles.chipOn]} onPress={onToggleAutoplayNext}>
                      <Text style={[styles.chipText, autoplayNext && styles.chipTextOn]}>
                        Autoplay next episode · {autoplayNext ? "On" : "Off"}
                      </Text>
                    </Pressable>
                  </View>
                </>
              ) : null}
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
  sectionRow: { flexDirection: "row", alignItems: "baseline", gap: ms(8), marginTop: ms(16), marginBottom: ms(9) },
  section: { color: colors.textDim, fontFamily: font.label, fontSize: ms(11), letterSpacing: 1.2 },
  sectionValue: { flexShrink: 1, color: colors.honey, fontFamily: font.bodySemi, fontSize: ms(12) },
  row: { flexDirection: "row", flexWrap: "wrap", gap: ms(8) },
  rowGap: { marginTop: ms(8) },
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
  offsetValue: {
    color: colors.text,
    fontFamily: font.label,
    fontSize: ms(13),
    alignSelf: "center",
    minWidth: ms(56),
    textAlign: "center",
  },
  dim: { color: colors.textFaint, fontFamily: font.body, fontSize: ms(13), paddingVertical: ms(9) },
});
