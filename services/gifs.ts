/**
 * KLIPY GIF / sticker / clip client — DIRECT from the app, per KLIPY's
 * Integration Requirements ("API requests and media loads must originate from
 * the user's client; do not route through proxies/servers"). We therefore:
 *   - call api.klipy.com straight from the device (no proxy),
 *   - send the real per-user `customer_id`,
 *   - preserve the returned result order + each item's delivery URLs (no
 *     reordering / filtering / rewriting), only mapping to the fields we render,
 *   - load media directly from the returned static.klipy.com URLs,
 *   - fire the Share Trigger when a user sends an item (personalization +
 *     reporting), and expose Report for moderation.
 * Ads/moderation are configured in the KLIPY Partner Panel, never in code.
 *
 * The app_key is a client key. It is read from EXPO_PUBLIC_KLIPY_KEY (set in
 * .env.local — gitignored — and EAS build secrets), never committed.
 * Attribution: "Powered by KLIPY".
 */
const KEY = process.env.EXPO_PUBLIC_KLIPY_KEY;
const BASE = "https://api.klipy.com/api/v1";

export type MediaKind = "gifs" | "stickers" | "clips";

export interface MediaItem {
  id: string;
  slug: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
  /** data: JPEG placeholder (KLIPY blur_preview) for a blur-up while loading. */
  blur?: string;
}

export interface MediaCategory {
  category: string;
  query: string;
  previewUrl: string;
}

/** A short reason accepted by KLIPY's Report API. */
export type ReportReason =
  | "nudity"
  | "violence"
  | "hate_speech"
  | "harassment"
  | "spam"
  | "offensive"
  | "broken"
  | "not_relevant"
  | "other";

// Format preference per content type. Stickers → transparent animated webp.
const FORMATS: Record<MediaKind, string[]> = {
  gifs: ["gif", "webp"],
  stickers: ["webp", "gif", "png"],
  clips: ["mp4", "webm", "gif"],
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// KLIPY nests media as file[SIZE][FORMAT] → {url,width,height}; SIZE ∈ hd/md/sm/xs.
function mediaAt(file: any, size: string, order: string[]) {
  const s = file?.[size];
  if (!s) return null;
  for (const fmt of order) {
    const m = s[fmt];
    if (m?.url) return { url: m.url as string, width: num(m.width), height: num(m.height) };
  }
  return null;
}

function pickMedia(item: any, order: string[]): MediaItem | null {
  const file = item?.file;
  const display =
    mediaAt(file, "md", order) || mediaAt(file, "sm", order) || mediaAt(file, "hd", order) || mediaAt(file, "xs", order);
  if (!display) return null; // unrenderable item (no matching media) — skip; order otherwise preserved
  const preview = mediaAt(file, "xs", order) || mediaAt(file, "sm", order) || display;
  return {
    id: String(item.id ?? item.slug ?? display.url),
    slug: String(item.slug ?? item.id ?? ""),
    url: display.url,
    previewUrl: preview.url,
    width: display.width || 200,
    height: display.height || 200,
    blur: typeof item.blur_preview === "string" ? item.blur_preview : undefined,
  };
}

async function getItems(url: string, order: string[]): Promise<MediaItem[]> {
  if (!KEY) return []; // no key configured → graceful empty (see EXPO_PUBLIC_KLIPY_KEY)
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { result?: boolean; data?: { data?: any[] } };
    if (data.result === false) return [];
    return (data.data?.data ?? []).map((it) => pickMedia(it, order)).filter((x): x is MediaItem => !!x);
  } catch {
    return [];
  }
}

function qs(params: Record<string, string>) {
  return new URLSearchParams(params).toString();
}

export function trendingMedia(kind: MediaKind, customerId: string, limit = 24): Promise<MediaItem[]> {
  return getItems(`${BASE}/${KEY}/${kind}/trending?${qs({ per_page: String(limit), customer_id: customerId || "anon" })}`, FORMATS[kind]);
}

export function searchMedia(kind: MediaKind, query: string, customerId: string, limit = 24): Promise<MediaItem[]> {
  const q = query.trim();
  if (!q) return trendingMedia(kind, customerId, limit);
  return getItems(`${BASE}/${KEY}/${kind}/search?${qs({ per_page: String(limit), customer_id: customerId || "anon", q })}`, FORMATS[kind]);
}

/** The user's recently-shared items (populated as they send GIFs). */
export function recentMedia(kind: MediaKind, customerId: string, limit = 24): Promise<MediaItem[]> {
  if (!customerId) return Promise.resolve([]);
  return getItems(`${BASE}/${KEY}/${kind}/recent/${encodeURIComponent(customerId)}?${qs({ per_page: String(limit) })}`, FORMATS[kind]);
}

/** Curated category chips (name + query + preview) for discovery. */
export async function getCategories(kind: MediaKind, locale = "en_US"): Promise<MediaCategory[]> {
  if (!KEY) return [];
  try {
    const res = await fetch(`${BASE}/${KEY}/${kind}/categories?locale=${encodeURIComponent(locale)}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { result?: boolean; data?: { categories?: any[] } };
    if (data.result === false) return [];
    return (data.data?.categories ?? [])
      .map((c) => ({ category: String(c.category ?? c.query ?? ""), query: String(c.query ?? ""), previewUrl: String(c.preview_url ?? "") }))
      .filter((c) => c.query);
  } catch {
    return [];
  }
}

/**
 * Log that the user SENT/shared an item — KLIPY uses this for personalization
 * (populates "recent") + reporting. `q` = the search that led here ("" for
 * trending). Fire-and-forget; failures are non-fatal.
 */
export function shareTrigger(kind: MediaKind, slug: string, customerId: string, q = ""): void {
  if (!KEY || !slug) return;
  void fetch(`${BASE}/${KEY}/${kind}/share/${encodeURIComponent(slug)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ customer_id: customerId || "anon", q }),
  }).catch(() => {});
}

/** Report an item a user flagged. Fire-and-forget. */
export function reportMedia(kind: MediaKind, slug: string, customerId: string, reason: ReportReason): void {
  if (!KEY || !slug) return;
  void fetch(`${BASE}/${KEY}/${kind}/report/${encodeURIComponent(slug)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ customer_id: customerId || "anon", reason }),
  }).catch(() => {});
}
