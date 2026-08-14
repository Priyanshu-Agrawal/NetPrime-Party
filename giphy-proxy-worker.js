/**
 * Giphy proxy — Cloudflare Worker (mirrors tmdb-proxy-worker.js).
 *
 * WHY: the Giphy API key must NOT ship inside the app (a client bundle is
 * extractable). This Worker holds the key as a server-side secret and injects it
 * into every Giphy call, so the app only ever talks to your Worker.
 *
 * Endpoints the app calls:
 *   GET /trending?limit=24            → Giphy trending
 *   GET /search?q=<query>&limit=24    → Giphy search
 * Response is trimmed to a small { gifs: [{ id, url, previewUrl, width, height }] }.
 *
 * DEPLOY (Cloudflare dashboard — no CLI):
 *   1. dash.cloudflare.com → Workers & Pages → Create Worker → name it "giphy" → Deploy.
 *   2. Edit code → paste THIS file → Deploy.
 *   3. Settings → Variables and Secrets → Add:
 *        Type: Secret,  Name: GIPHY_KEY,  Value: <your Giphy API key>  → Deploy.
 *   4. Your URL is https://giphy.<your-subdomain>.workers.dev
 *      (with subdomain spiderfan-no1 the app already defaults to
 *       https://giphy.spiderfan-no1.workers.dev/). If yours differs, tell me.
 *
 * TEST after deploy (browser):
 *   https://giphy.<your-subdomain>.workers.dev/trending?limit=6  → JSON with gifs[].
 */
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors() });

    const inUrl = new URL(request.url);
    const path = inUrl.pathname.replace(/\/+$/, "");
    const limit = clampInt(inUrl.searchParams.get("limit"), 24, 1, 50);
    const rating = "pg-13";

    let target;
    if (path.endsWith("/search")) {
      const q = (inUrl.searchParams.get("q") || "").trim();
      if (!q) return json({ gifs: [] });
      target =
        `https://api.giphy.com/v1/gifs/search?api_key=${env.GIPHY_KEY}` +
        `&q=${encodeURIComponent(q)}&limit=${limit}&rating=${rating}&bundle=messaging_non_clips`;
    } else {
      // default + /trending
      target =
        `https://api.giphy.com/v1/gifs/trending?api_key=${env.GIPHY_KEY}` +
        `&limit=${limit}&rating=${rating}&bundle=messaging_non_clips`;
    }

    try {
      const res = await fetch(target, { headers: { accept: "application/json" } });
      if (!res.ok) return json({ gifs: [], error: `giphy ${res.status}` }, res.status);
      const data = await res.json();
      const gifs = (data.data || [])
        .map((g) => {
          const img = g.images || {};
          const display = img.fixed_height || img.downsized_medium || img.original || {};
          const preview = img.fixed_height_small || img.preview_gif || display;
          if (!display.url) return null;
          return {
            id: g.id,
            url: display.url,
            previewUrl: preview.url || display.url,
            width: Number(display.width) || 200,
            height: Number(display.height) || 200,
          };
        })
        .filter(Boolean);
      return json({ gifs });
    } catch (e) {
      return json({ gifs: [], error: String(e) }, 502);
    }
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...cors() },
  });
}

function clampInt(v, dflt, lo, hi) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
}

function cors() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
  };
}
