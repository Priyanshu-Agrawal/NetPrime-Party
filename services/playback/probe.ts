/**
 * StreamProbe (spec §5.5): trust nothing a plugin says. Within 6 s per candidate: is it reachable down to a first
 * segment, is it a playlist or video rather than an HTML page, does its length match the title, which audio
 * languages does it carry, and which platforms can play it. Only evidence rejects — a probe that runs out of time
 * leaves the candidate playable but unverified.
 */
import { hasHeader } from "@/services/plugins/urlGuard";
import type { PlaybackCandidate, RejectReason } from "./candidate";
import {
  asciiHead,
  base64ToBytes,
  isDash,
  isHls,
  isMatroska,
  isMediaBytes,
  isMostlyText,
  isMp4,
  looksLikeHtml,
  mp4Duration,
  parseDash,
  parseHlsMaster,
  parseHlsMedia,
} from "./manifests";

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
  opts: { maxBytes: number; responseType: "text" | "base64"; alive?: () => boolean },
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

/** Busy or failing servers say nothing about the stream: try again later rather than reject (only evidence rejects). */
const transient = (status: number) => status === 408 || status === 429 || status >= 500;

class Inconclusive extends Error {}

const reject = (c: PlaybackCandidate, reason: RejectReason, extra: Partial<PlaybackCandidate> = {}): PlaybackCandidate => ({
  ...c,
  ...extra,
  verdict: "rejected",
  rejectReason: reason,
});

export async function probeCandidate(c: PlaybackCandidate, ctx: ProbeContext, fetch: ProbeFetch, budgetMs = PROBE_BUDGET_MS): Promise<PlaybackCandidate> {
  if (c.verdict === "rejected") return c;
  let live = true;
  const alive = () => live;
  // Every request knows whether the probe still wants it: queued ones are dropped once the budget is spent.
  const guarded: ProbeFetch = async (url, headers, opts) => {
    if (!live) throw new Inconclusive("out of time");
    const r = await fetch(url, headers, { ...opts, alive });
    if (!live) throw new Inconclusive("out of time");
    if (transient(r.status)) throw new Inconclusive(`HTTP ${r.status}`);
    return r;
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const outOfTime = new Promise<PlaybackCandidate>((resolve) => {
    timer = setTimeout(() => resolve(c), budgetMs);
  });
  try {
    return await Promise.race([
      inspect(c, ctx, guarded).catch((e: unknown) =>
        (e as { code?: string })?.code === "blocked" ? reject(c, "unreachable") : c, // a refused address is evidence; anything else isn't
      ),
      outOfTime,
    ]);
  } finally {
    live = false;
    clearTimeout(timer);
  }
}

/** A cached probe result applied to a freshly resolved candidate: its identity stays, the measurements come over. */
export function mergeProbe(current: PlaybackCandidate, probed: PlaybackCandidate): PlaybackCandidate {
  const languages = [...current.languages];
  for (const l of probed.languages) if (!languages.includes(l)) languages.push(l);
  return {
    ...current,
    languages,
    container: probed.container,
    durationSec: probed.durationSec,
    platforms: probed.platforms,
    quality: probed.quality ?? current.quality,
    verdict: probed.verdict,
    rejectReason: probed.rejectReason,
  };
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
    if (isHls(head) || isDash(head)) {
      // A playlist behind an extensionless URL: read it whole, as text.
      first = await fetch(c.url, c.headers, { maxBytes: PLAYLIST_BYTES, responseType: "text" });
      if (first.status >= 400) return reject(c, "unreachable");
    } else if (isMatroska(bytes)) {
      return reject(c, "platform", { container: "unsupported", platforms: { ios: false, android: false } });
    } else if (!isMp4(bytes) && (looksLikeHtml(head) || isMostlyText(bytes))) {
      // A page or an error message where a video should be. An MP4/QuickTime header wins: x264 writes its settings
      // as ASCII into the first frame, so a real file can read as "mostly text".
      return reject(c, "html-body");
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
        // Disguised segments (.jpg, .html, no extension) are fine; a page or an error message is not.
        const segBytes = base64ToBytes(seg.body);
        if (!isMediaBytes(segBytes) && (looksLikeHtml(asciiHead(segBytes)) || isMostlyText(segBytes))) return reject(c, "html-body");
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

const CACHE_MS = 15 * 60_000;
const CACHE_MAX = 500;

/**
 * Conclusive probe results for 15 minutes (the plugin host's own cache window), keyed by URL and the title context
 * that judged them. Inconclusive ones (timeouts, busy servers) are never kept, so a blip can't lock a stream out.
 */
export class ProbeCache {
  private entries = new Map<string, { at: number; probed: PlaybackCandidate }>();

  constructor(private readonly now: () => number = Date.now) {}

  private key(c: PlaybackCandidate, ctx: ProbeContext): string {
    return `${c.url}|${ctx.kind}|${ctx.runtimeMin ?? ""}`;
  }

  get(c: PlaybackCandidate, ctx: ProbeContext): PlaybackCandidate | undefined {
    const hit = this.entries.get(this.key(c, ctx));
    if (!hit || this.now() - hit.at >= CACHE_MS) return undefined;
    return mergeProbe(c, hit.probed);
  }

  set(probed: PlaybackCandidate, ctx: ProbeContext): void {
    if (probed.verdict === "unverified") return;
    const key = this.key(probed, ctx);
    this.entries.delete(key);
    this.entries.set(key, { at: this.now(), probed });
    if (this.entries.size > CACHE_MAX) this.entries.delete(this.entries.keys().next().value as string);
  }
}
