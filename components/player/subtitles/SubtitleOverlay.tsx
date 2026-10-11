/**
 * Our own subtitle layer for sidecar files (WebVTT / SRT), because expo-video's source has no sidecar field
 * (spec §6.2). Instead of polling, it schedules one timer to the next moment the text can change.
 */
import { font, ms } from "@/theme/bearoom";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { activeText, nextChange, parseSubtitles, type Cue } from "./parse";

export type SubtitleSize = "s" | "m" | "l";
export const SUBTITLE_FONT: Record<SubtitleSize, number> = { s: ms(14), m: ms(17), l: ms(21) };

/** The last reported playback position and when it was reported. */
export interface PlaybackClock {
  time: number;
  at: number;
  playing: boolean;
  rate: number;
}

/** Where playback is now, extrapolated from the last report. */
export function clockNow(c: PlaybackClock, now: number): number {
  return c.playing ? c.time + ((now - c.at) / 1000) * c.rate : c.time;
}

const cache = new Map<string, Promise<Cue[]>>();

/** Downloads and parses a sidecar file once per URL. Failures are not cached, so the next pick retries. */
export function loadCues(url: string, headers?: Record<string, string>, fetcher: typeof fetch = fetch): Promise<Cue[]> {
  let pending = cache.get(url);
  if (!pending) {
    pending = fetcher(url, { headers })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(parseSubtitles);
    pending.catch(() => cache.delete(url));
    cache.set(url, pending);
  }
  return pending;
}

/** Cues for the chosen sidecar track; [] while loading, after a failure, or with none chosen. */
export function useSidecarCues(track?: { url: string; headers?: Record<string, string> }): Cue[] {
  const [cues, setCues] = useState<Cue[]>([]);
  const url = track?.url;
  const headers = track?.headers;
  useEffect(() => {
    setCues([]);
    if (!url) return;
    let live = true;
    loadCues(url, headers).then(
      (c) => live && setCues(c),
      () => live && setCues([]),
    );
    return () => {
      live = false;
    };
  }, [url, headers]);
  return cues;
}

interface Props {
  cues: Cue[];
  clock: PlaybackClock;
  /** Positive shows subtitles later, negative earlier. */
  offsetSec?: number;
  size?: SubtitleSize;
  /** Raise above the control bar while it shows. */
  lifted?: boolean;
}

export function SubtitleOverlay({ cues, clock, offsetSec = 0, size = "m", lifted = false }: Props) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const step = () => {
      const t = clockNow(clock, Date.now()) - offsetSec;
      setText(activeText(cues, t));
      if (!clock.playing) return;
      const next = nextChange(cues, t);
      if (next == null) return;
      const wait = ((next - t) / Math.max(clock.rate, 0.1)) * 1000 + 15;
      timer = setTimeout(step, Math.min(wait, 60_000));
    };
    step();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [cues, clock, offsetSec]);

  if (!text) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, lifted && styles.lifted]}>
      <Text style={[styles.text, { fontSize: SUBTITLE_FONT[size] }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: ms(24), right: ms(24), bottom: ms(22), alignItems: "center" },
  lifted: { bottom: ms(104) },
  text: {
    color: "#FFFFFF",
    fontFamily: font.bodySemi,
    textAlign: "center",
    backgroundColor: "rgba(0,0,0,0.62)",
    paddingHorizontal: ms(8),
    paddingVertical: ms(3),
    borderRadius: ms(6),
    overflow: "hidden",
  },
});
