/**
 * The JS half of the plugin host's SSRF guard (spec §8). It refuses obvious local targets before anything leaves the
 * app; the BearoomFetch module re-checks the addresses each hostname actually resolves to, on every hop.
 */
export type UrlVerdict = { ok: true; url: URL } | { ok: false; reason: "scheme" | "credentials" | "host" };

const LOCAL_SUFFIXES = [".local", ".localhost", ".internal", ".lan", ".home", ".corp", ".intranet", ".invalid", ".test", ".example", ".onion", ".arpa"];
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export function checkUrl(raw: string): UrlVerdict {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "scheme" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, reason: "scheme" };
  if (url.username || url.password) return { ok: false, reason: "credentials" };
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || LOCAL_SUFFIXES.some((s) => host.endsWith(s))) return { ok: false, reason: "host" };
  if (host.startsWith("[")) return isPublicV6Literal(host.slice(1, -1)) ? { ok: true, url } : { ok: false, reason: "host" };
  if (IPV4.test(host)) return isPublicV4Literal(host) ? { ok: true, url } : { ok: false, reason: "host" };
  if (!host.includes(".")) return { ok: false, reason: "host" }; // single-label names are intranet hosts
  return { ok: true, url };
}

function isPublicV4Literal(host: string): boolean {
  const [a, b, c] = host.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  return true;
}

/** Only global unicast (2000::/3) literals, minus the documentation block; everything else is local or special. */
function isPublicV6Literal(host: string): boolean {
  return /^[23][0-9a-f]{0,3}:/.test(host) && !host.startsWith("2001:db8:");
}

// Headers the HTTP client owns (framing, compression, routing); a plugin setting them breaks the exchange.
const CLIENT_OWNED = new Set([
  "host", "content-length", "connection", "transfer-encoding", "accept-encoding", "keep-alive",
  "upgrade", "proxy-connection", "proxy-authorization", "te", "trailer", "expect",
]);
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/** Plugin-supplied headers minus client-owned ones; non-token names and values with CR/LF/NUL are dropped. */
export function cleanHeaders(h: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h || typeof h !== "object") return out;
  for (const [k, v] of Object.entries(h as Record<string, unknown>)) {
    if (typeof v !== "string" && typeof v !== "number") continue;
    const value = String(v);
    if (!TOKEN.test(k) || CLIENT_OWNED.has(k.toLowerCase()) || /[\r\n\0]/.test(value) || value.length > 8192) continue;
    out[k] = value;
  }
  return out;
}

export function hasHeader(h: Record<string, string>, name: string): boolean {
  const n = name.toLowerCase();
  return Object.keys(h).some((k) => k.toLowerCase() === n);
}

export function withoutHeader(h: Record<string, string>, name: string): Record<string, string> {
  const n = name.toLowerCase();
  return Object.fromEntries(Object.entries(h).filter(([k]) => k.toLowerCase() !== n));
}
