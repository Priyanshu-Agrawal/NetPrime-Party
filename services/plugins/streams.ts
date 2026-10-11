import type { CookieJar } from "./cookieJar";
import { checkUrl, cleanHeaders, hasHeader } from "./urlGuard";

/**
 * A plugin's raw answer → streams Bearoom can hand on (spec §5.3–5.4). Plugin output is untrusted: anything that is
 * not an http(s) stream is dropped, strings are cleaned and capped, and the plugin's own jar cookies become the
 * stream's Cookie header (the Cookie-gated DASH case) unless the plugin set one.
 */
export interface PluginStreamSubtitle {
  url: string;
  language?: string;
  label: string;
}

export interface PluginStream {
  pluginKey: string;
  repoId: string;
  pluginId: string;
  /** Source line, e.g. "Vidrock • Hindi". */
  name: string;
  title: string;
  url: string;
  quality?: string;
  /** What the player must send for this stream. */
  headers: Record<string, string>;
  subtitles: PluginStreamSubtitle[];
  language?: string;
  size?: string;
}

export const MAX_STREAMS_PER_PLUGIN = 200;
const ZERO_WIDTH = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;
const MAX_URL = 8192;

/** A public http(s) URL in canonical form, or null: the video player fetches these, so the SSRF guard applies here too. */
function publicUrl(v: unknown): string | null {
  if (typeof v !== "string" || v.length > MAX_URL) return null;
  const verdict = checkUrl(v.trim());
  return verdict.ok ? verdict.url.toString() : null;
}

export function cleanText(v: unknown, max = 200): string {
  if (typeof v !== "string" && typeof v !== "number") return "";
  return String(v).replace(ZERO_WIDTH, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function subtitlesOf(v: unknown): PluginStreamSubtitle[] {
  if (!Array.isArray(v)) return [];
  const out: PluginStreamSubtitle[] = [];
  for (const t of v) {
    if (out.length >= 50) break;
    const sub = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
    const url = publicUrl(sub.url);
    if (!url) continue;
    const language = cleanText(sub.lang ?? sub.language, 20) || undefined;
    out.push({ url, language, label: cleanText(sub.label ?? sub.name, 60) || language || "Subtitles" });
  }
  return out;
}

export function normaliseStreams(plugin: { key: string; repoId: string; pluginId: string }, raw: unknown, jar: CookieJar): PluginStream[] | null {
  if (!Array.isArray(raw)) return null;
  const out: PluginStream[] = [];
  for (const item of raw) {
    if (out.length >= MAX_STREAMS_PER_PLUGIN) break;
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    const url = publicUrl(s.url);
    if (!url) continue; // magnets, torrents, relative, script and private-network URLs
    const hints = s.behaviorHints as { proxyHeaders?: { request?: unknown } } | undefined;
    const headers = cleanHeaders(s.headers ?? hints?.proxyHeaders?.request);
    if (!hasHeader(headers, "cookie")) {
      const fromJar = jar.header(url);
      if (fromJar) headers.Cookie = fromJar;
    }
    out.push({
      pluginKey: plugin.key,
      repoId: plugin.repoId,
      pluginId: plugin.pluginId,
      name: cleanText(s.name) || plugin.pluginId,
      title: cleanText(s.title, 300),
      url,
      quality: cleanText(s.quality, 40) || undefined,
      headers,
      subtitles: subtitlesOf(s.subtitles),
      language: cleanText(s.language, 40) || undefined,
      size: cleanText(s.size, 40) || undefined,
    });
  }
  return out;
}
