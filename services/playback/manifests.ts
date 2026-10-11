/**
 * Just enough of HLS, DASH and MP4 to probe a stream (spec §5.5): variants and audio languages, total duration, the
 * first segment, and the movie header's duration. Pure functions over text and bytes.
 */
import { normalizeLanguage } from "@/components/player/native/languages";

export function isHls(text: string): boolean {
  return /^\s*#EXTM3U/.test(text);
}

export function looksLikeHtml(text: string): boolean {
  return /^\s*(<!doctype html|<html|<head|<body)/i.test(text);
}

function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|,)${name}=("([^"]*)"|[^,]*)`).exec(attrs);
  return m ? (m[2] ?? m[1]) : undefined;
}

function resolveUrl(uri: string, base: string): string {
  try {
    return new URL(uri, base).toString();
  } catch {
    return uri;
  }
}

function pushLang(list: string[], raw: string | undefined): void {
  const code = normalizeLanguage(raw);
  if (code && !list.includes(code)) list.push(code);
}

export function parseHlsMaster(
  text: string,
  baseUrl: string,
): { variants: { url: string; height?: number; bandwidth?: number }[]; audioLanguages: string[] } | null {
  if (!/#EXT-X-STREAM-INF/.test(text)) return null;
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const variants: { url: string; height?: number; bandwidth?: number }[] = [];
  const audioLanguages: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith("#EXT-X-STREAM-INF:")) {
      const a = l.slice("#EXT-X-STREAM-INF:".length);
      let j = i + 1;
      while (j < lines.length && (!lines[j] || lines[j].startsWith("#"))) j++;
      if (j >= lines.length) continue;
      const res = attr(a, "RESOLUTION");
      const bw = attr(a, "BANDWIDTH");
      const height = res ? Number(res.split("x")[1]) || undefined : undefined;
      variants.push({ url: resolveUrl(lines[j], baseUrl), height, bandwidth: bw ? Number(bw) || undefined : undefined });
    } else if (l.startsWith("#EXT-X-MEDIA:")) {
      const a = l.slice("#EXT-X-MEDIA:".length);
      if (attr(a, "TYPE") === "AUDIO") pushLang(audioLanguages, attr(a, "LANGUAGE"));
    }
  }
  return { variants, audioLanguages };
}

export function parseHlsMedia(text: string, baseUrl: string): { durationSec?: number; firstSegment?: string; ended: boolean } {
  let total = 0;
  let sawInf = false;
  let firstSegment: string | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim();
    if (l.startsWith("#EXTINF:")) {
      total += parseFloat(l.slice("#EXTINF:".length)) || 0;
      sawInf = true;
    } else if (l && !l.startsWith("#") && !firstSegment) {
      firstSegment = resolveUrl(l, baseUrl);
    }
  }
  const ended = /#EXT-X-ENDLIST/.test(text);
  return { durationSec: ended && sawInf ? Math.round(total * 1000) / 1000 : undefined, firstSegment, ended };
}

export function isoDuration(s: string): number | undefined {
  const m = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(s.trim());
  if (!m) return undefined;
  const [d, h, mi, se] = m.slice(1).map((x) => (x ? Number(x) : 0));
  const total = d * 86400 + h * 3600 + mi * 60 + se;
  return total > 0 ? total : undefined;
}

export function parseDash(text: string): { durationSec?: number; audioLanguages: string[] } | null {
  if (!/<MPD[\s>]/.test(text)) return null;
  const dur = /mediaPresentationDuration="([^"]+)"/.exec(text);
  const audioLanguages: string[] = [];
  for (const m of text.matchAll(/<AdaptationSet\b[^>]*>/g)) {
    const tag = m[0];
    const audio = /contentType="audio"/.test(tag) || /mimeType="audio\//.test(tag);
    if (audio) pushLang(audioLanguages, /\blang="([^"]+)"/.exec(tag)?.[1]);
  }
  return { durationSec: dur ? isoDuration(dur[1]) : undefined, audioLanguages };
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function base64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buf = 0;
  let bits = 0;
  let j = 0;
  for (const ch of clean) {
    buf = (buf << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (buf >> bits) & 0xff;
    }
  }
  return out.subarray(0, j);
}

export function asciiHead(bytes: Uint8Array, n = 512): string {
  let s = "";
  for (let i = 0; i < Math.min(n, bytes.length); i++) s += String.fromCharCode(bytes[i]);
  return s;
}

export function isMp4(b: Uint8Array): boolean {
  return b.length >= 8 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70; // "ftyp"
}

export function isMatroska(b: Uint8Array): boolean {
  return b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
}

/** The movie header's duration, when `moov` sits within the bytes read (fast-start files). */
export function mp4Duration(b: Uint8Array): number | undefined {
  const u32 = (o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  for (let i = 4; i + 36 <= b.length; i++) {
    if (b[i] !== 0x6d || b[i + 1] !== 0x76 || b[i + 2] !== 0x68 || b[i + 3] !== 0x64) continue; // "mvhd"
    const v1 = b[i + 4] === 1;
    const scale = v1 ? u32(i + 24) : u32(i + 16);
    const dur = v1 ? u32(i + 28) * 2 ** 32 + u32(i + 32) : u32(i + 20);
    return scale > 0 && dur > 0 ? dur / scale : undefined;
  }
  return undefined;
}
