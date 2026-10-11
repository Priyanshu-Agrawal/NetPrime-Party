/**
 * One playable stream for a title (spec §5.3), whatever plugin it came from. Fields Bearoom measures itself (container,
 * duration, platforms, verdict) start from the URL and the probe fills them in; labels are never trusted as fact.
 */
import type { PluginStream } from "@/services/plugins/streams";
import { languageOf, streamLanguages } from "./languages";

export type Container = "hls" | "dash" | "mp4" | "unsupported" | "unknown";
export type Verdict = "ok" | "unverified" | "rejected";
export type RejectReason = "unreachable" | "duration" | "html-body" | "platform";

export interface CandidateSubtitle {
  id: string;
  url: string;
  label: string;
  language?: string;
}

export interface PlaybackCandidate {
  /** Stable across re-resolves: source + label + quality + title + URL shape (tokens and numbers masked). */
  key: string;
  /** `${repoId}/${pluginId}` — health, telemetry and failure memory key on this, never on a hostname. */
  sourceId: string;
  /** The plugin's own line, e.g. "Vidrock • Hindi". */
  label: string;
  url: string;
  headers: Record<string, string>;
  container: Container;
  /** ISO-639-1, most likely first; [] = unknown. */
  languages: string[];
  quality?: { label: string; height?: number };
  durationSec?: number;
  platforms: { ios: boolean; android: boolean };
  subtitles: CandidateSubtitle[];
  verdict: Verdict;
  rejectReason?: RejectReason;
  /** Arrival order: the latency tiebreak in ranking. */
  order: number;
}

export function containerOf(url: string): Container {
  let path: string;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    path = url.toLowerCase();
  }
  if (/\.m3u8?$/.test(path)) return "hls";
  if (path.endsWith(".mpd")) return "dash";
  if (/\.(mp4|m4v|mov)$/.test(path)) return "mp4";
  if (/\.(mkv|webm|avi)$/.test(path)) return "unsupported";
  return "unknown";
}

export function platformsOf(container: Container): { ios: boolean; android: boolean } {
  if (container === "dash") return { ios: false, android: true }; // AVPlayer has no DASH
  if (container === "unsupported") return { ios: false, android: false }; // spec §2: no MKV lane
  return { ios: true, android: true };
}

export function heightOf(label?: string): number | undefined {
  if (!label) return undefined;
  const s = label.toLowerCase();
  if (/\b(4k|uhd|2160p?)\b/.test(s)) return 2160;
  if (/\b(2k|1440p?)\b/.test(s)) return 1440;
  if (/\b(fhd|1080[pi]?)\b/.test(s)) return 1080;
  if (/\b720p?\b/.test(s)) return 720;
  const m = /\b(\d{3,4})p\b/.exec(s);
  if (m) return Number(m[1]);
  if (/\bhd\b/.test(s)) return 720;
  if (/\bsd\b/.test(s)) return 480;
  return undefined;
}

/** One path segment with its re-resolve noise masked: opaque tokens (12+ chars mixing letters and digits) whole, else hex runs and numbers. */
function maskSegment(seg: string): string {
  const m = /^(.*?)(\.[a-z0-9]{1,5})?$/.exec(seg)!;
  const stem = m[1];
  const ext = m[2] ?? "";
  if (stem.length >= 12 && /[a-z]/.test(stem) && /\d/.test(stem)) return `*${ext}`;
  return seg.replace(/[0-9a-f]{8,}|\d+/g, "#");
}

/** Host + path with tokens and numbers masked: what stays the same when a plugin re-resolves a stream. */
export function urlShape(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase().split("/").map(maskSegment).join("/");
    return u.hostname.toLowerCase().replace(/[0-9a-f]{8,}|\d+/g, "#") + path;
  } catch {
    return url;
  }
}

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** The title's numbers are masked: sizes, seed counts and dates can change between resolves; the words name the file. */
export function candidateKey(sourceId: string, label: string, url: string, quality?: string, title?: string): string {
  const name = norm(title ?? "").replace(/\d+/g, "#");
  return `${sourceId}:${fnv1a(`${norm(label)}|${norm(quality ?? "")}|${name}|${urlShape(url)}`)}`;
}

/** Which stream owns each URL: the lowest sourceId, so a URL two plugins share never changes hands between resolves. */
function urlOwners(streams: PluginStream[]): Map<string, PluginStream> {
  const owners = new Map<string, PluginStream>();
  for (const s of streams) {
    const cur = owners.get(s.url);
    if (!cur || `${s.repoId}/${s.pluginId}` < `${cur.repoId}/${cur.pluginId}`) owners.set(s.url, s);
  }
  return owners;
}

export function toCandidates(
  streams: PluginStream[],
  ctx: { originalLanguage?: string; titleName?: string; originalTitle?: string },
): PlaybackCandidate[] {
  const owners = urlOwners(streams);
  const taken = new Set<string>();
  const seenKeys = new Map<string, number>();
  const out: PlaybackCandidate[] = [];
  for (const s of streams) {
    if (owners.get(s.url) !== s || taken.has(s.url)) continue;
    taken.add(s.url);
    const sourceId = `${s.repoId}/${s.pluginId}`;
    const height = heightOf(s.quality) ?? heightOf(s.name) ?? heightOf(s.title);
    const qualityLabel = s.quality ?? (height ? `${height}p` : undefined);
    const base = candidateKey(sourceId, s.name, s.url, qualityLabel, s.title);
    const n = seenKeys.get(base) ?? 0;
    seenKeys.set(base, n + 1);
    const container = containerOf(s.url);
    const unsupported = container === "unsupported";
    out.push({
      key: n ? `${base}~${n}` : base,
      sourceId,
      label: s.name,
      url: s.url,
      headers: s.headers,
      container,
      languages: streamLanguages(s, ctx),
      quality: qualityLabel ? { label: qualityLabel, height } : undefined,
      platforms: platformsOf(container),
      subtitles: s.subtitles.map((t, i) => ({ id: String(i), url: t.url, label: t.label, language: languageOf(t.language) ?? languageOf(t.label) })),
      verdict: unsupported ? "rejected" : "unverified",
      rejectReason: unsupported ? "platform" : undefined,
      order: out.length,
    });
  }
  return out;
}
