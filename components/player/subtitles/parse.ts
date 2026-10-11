export interface Cue {
  start: number;
  end: number;
  text: string;
}

const TIMESTAMP = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;

function seconds(s: string): number | null {
  const m = TIMESTAMP.exec(s);
  if (!m) return null;
  const [, h, mm, ss, frac] = m;
  return Number(h ?? 0) * 3600 + Number(mm) * 60 + Number(ss) + Number(frac.padEnd(3, "0")) / 1000;
}

const decode = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

/**
 * Parses WebVTT or SRT into cues sorted by start. Header, NOTE, STYLE and REGION blocks, cue settings, tags and
 * broken cues are dropped; anything that isn't subtitles yields no cues rather than an error.
 */
export function parseSubtitles(raw: string): Cue[] {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const cues: Cue[] = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split("\n");
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const [a, b = ""] = lines[i].split("-->");
    const start = seconds(a);
    const end = seconds(b);
    if (start == null || end == null || end <= start) continue;
    const body = lines
      .slice(i + 1)
      .map((l) => l.replace(/<[^>]+>/g, "").replace(/\{\\[^}]*\}/g, "").trim())
      .filter(Boolean)
      .join("\n");
    if (body) cues.push({ start, end, text: decode(body) });
  }
  return cues.sort((x, y) => x.start - y.start);
}

/** Text of every cue on screen at `t` (overlapping cues stack), or null. Cues must be sorted by start. */
export function activeText(cues: Cue[], t: number): string | null {
  const on: string[] = [];
  for (const c of cues) {
    if (c.start > t) break;
    if (t < c.end) on.push(c.text);
  }
  return on.length ? on.join("\n") : null;
}

/** The next time after `t` at which the shown text can change, or null after the last cue. */
export function nextChange(cues: Cue[], t: number): number | null {
  let next: number | null = null;
  for (const c of cues) {
    if (c.start > t) {
      next = next == null ? c.start : Math.min(next, c.start);
      break;
    }
    if (c.end > t) next = next == null ? c.end : Math.min(next, c.end);
  }
  return next;
}
