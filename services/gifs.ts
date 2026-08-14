/**
 * GIF client — talks ONLY to our KLIPY Cloudflare Worker proxy
 * (klipy-proxy-worker.js), which injects the key server-side. No key ships in
 * the app. The proxy returns a trimmed { gifs: GifItem[] }.
 *
 * If you deploy the worker under a different name/subdomain, update GIF_PROXY.
 */
export const GIF_PROXY = "https://klipy.spiderfan-no1.workers.dev/";

export interface GifItem {
  id: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
}

async function get(path: string): Promise<GifItem[]> {
  try {
    const res = await fetch(GIF_PROXY.replace(/\/+$/, "") + path);
    if (!res.ok) return [];
    const data = (await res.json()) as { gifs?: GifItem[] };
    return Array.isArray(data.gifs) ? data.gifs : [];
  } catch {
    return [];
  }
}

export function trendingGifs(limit = 24): Promise<GifItem[]> {
  return get(`/trending?limit=${limit}`);
}

export function searchGifs(query: string, limit = 24): Promise<GifItem[]> {
  const q = query.trim();
  if (!q) return trendingGifs(limit);
  return get(`/search?q=${encodeURIComponent(q)}&limit=${limit}`);
}
