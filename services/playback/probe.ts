/**
 * StreamProbe (spec §5.5): trust nothing a plugin says. Within 6 s per candidate: is it reachable down to a first
 * segment, is it a playlist or video rather than an HTML page, does its length match the title, which audio
 * languages does it carry, and which platforms can play it. Only evidence rejects — a probe that runs out of time
 * leaves the candidate playable but unverified.
 */
import { hasHeader } from "@/services/plugins/urlGuard";
import type { PlaybackCandidate, RejectReason } from "./candidate";
import { asciiHead, base64ToBytes, isHls, isMatroska, isMp4, looksLikeHtml, mp4Duration, parseDash, parseHlsMaster, parseHlsMedia } from "./manifests";

export interface ProbeResponse {
  status: number;
  url: string;
  redirected: boolean;
  body: string;
  encoding: "text" | "base64";
}

export type ProbeFetch = (
  url: string,
  headers: Record<string, string>,
  opts: { maxBytes: number; responseType: "text" | "base64" },
) => Promise<ProbeResponse>;

export interface ProbeContext {
  kind: "movie" | "tv";
  /** TMDB runtime in minutes; unknown skips the length check. */
  runtimeMin?: number;
}

export const PROBE_BUDGET_MS = 6000;
const PLAYLIST_BYTES = 2 * 1024 * 1024;
const HEAD_BYTES = 64 * 1024;
const TOLERANCE_MIN = { movie: 8, tv: 3 } as const;

const reject = (c: PlaybackCandidate, reason: RejectReason, extra: Partial<PlaybackCandidate> = {}): PlaybackCandidate => ({
  ...c,
  ...extra,
  verdict: "rejected",
  rejectReason: reason,
});

export async function probeCandidate(c: PlaybackCandidate, ctx: ProbeContext, fetch: ProbeFetch, budgetMs = PROBE_BUDGET_MS): Promise<PlaybackCandidate> {
  if (c.verdict === "rejected") return c;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const outOfTime = new Promise<PlaybackCandidate>((resolve) => {
    timer = setTimeout(() => resolve(c), budgetMs);
  });
  try {
    return await Promise.race([inspect(c, ctx, fetch).catch(() => reject(c, "unreachable")), outOfTime]);
  } finally {
    clearTimeout(timer);
  }
}

async function inspect(c: PlaybackCandidate, ctx: ProbeContext, fetch: ProbeFetch): Promise<PlaybackCandidate> {
  const sniff = c.container === "mp4" || c.container === "unknown";
  let first = await fetch(c.url, sniff ? { ...c.headers, Range: "bytes=0-65535" } : c.headers, {
    maxBytes: sniff ? HEAD_BYTES : PLAYLIST_BYTES,
    responseType: sniff ? "base64" : "text",
  });
  if (first.status >= 400) return reject(c, "unreachable");
  const platforms = { ...c.platforms };
  if (first.redirected && hasHeader(c.headers, "origin")) platforms.ios = false; // iOS drops Origin after a 302 (spike T1)
  const languages = [...c.languages];
  const addLanguages = (codes: string[]) => {
    for (const l of codes) if (!languages.includes(l)) languages.push(l);
  };
  let container = c.container;
  let probedHeight: number | undefined;
  let durationSec: number | undefined;

  if (first.encoding === "base64") {
    const bytes = base64ToBytes(first.body);
    const head = asciiHead(bytes);
    if (isHls(head) || /<MPD[\s>]/.test(head)) {
      // A playlist behind an extensionless URL: read it whole, as text.
      first = await fetch(c.url, c.headers, { maxBytes: PLAYLIST_BYTES, responseType: "text" });
      if (first.status >= 400) return reject(c, "unreachable");
    } else if (looksLikeHtml(head)) {
      return reject(c, "html-body");
    } else if (isMatroska(bytes)) {
      return reject(c, "platform", { container: "unsupported", platforms: { ios: false, android: false } });
    } else {
      if (isMp4(bytes)) container = "mp4";
      durationSec = mp4Duration(bytes);
    }
  }

  if (first.encoding === "text") {
    const text = first.body;
    if (isHls(text)) {
      container = "hls";
      let media = text;
      let mediaUrl = first.url;
      const master = parseHlsMaster(text, first.url);
      if (master) {
        addLanguages(master.audioLanguages);
        const tallest = Math.max(0, ...master.variants.map((v) => v.height ?? 0));
        if (tallest) probedHeight = tallest;
        const variant = master.variants[0];
        if (!variant) return reject(c, "unreachable");
        const r = await fetch(variant.url, c.headers, { maxBytes: PLAYLIST_BYTES, responseType: "text" });
        if (r.status >= 400) return reject(c, "unreachable");
        if (!isHls(r.body)) return reject(c, looksLikeHtml(r.body) ? "html-body" : "unreachable");
        media = r.body;
        mediaUrl = r.url;
      }
      const m = parseHlsMedia(media, mediaUrl);
      durationSec = m.durationSec;
      if (m.firstSegment) {
        const seg = await fetch(m.firstSegment, { ...c.headers, Range: "bytes=0-2047" }, { maxBytes: 4096, responseType: "base64" });
        if (seg.status >= 400) return reject(c, "unreachable");
        // Disguised segments (.jpg, .html, no extension) are fine; an actual HTML page is not.
        if (looksLikeHtml(asciiHead(base64ToBytes(seg.body)))) return reject(c, "html-body");
      }
    } else {
      const dash = parseDash(text);
      if (!dash) return reject(c, looksLikeHtml(text) ? "html-body" : "unreachable");
      container = "dash";
      platforms.ios = false;
      durationSec = dash.durationSec;
      addLanguages(dash.audioLanguages);
    }
  }

  if (durationSec != null && ctx.runtimeMin && Math.abs(durationSec / 60 - ctx.runtimeMin) > TOLERANCE_MIN[ctx.kind]) {
    return reject(c, "duration", { durationSec });
  }
  return {
    ...c,
    container,
    languages,
    platforms,
    durationSec,
    quality: probedHeight ? { label: `${probedHeight}p`, height: probedHeight } : c.quality,
    verdict: durationSec != null ? "ok" : "unverified",
  };
}
