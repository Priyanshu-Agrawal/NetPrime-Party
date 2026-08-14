/**
 * KLIPY proxy — Cloudflare Worker (mirrors tmdb-proxy-worker.js).
 *
 * WHY: the KLIPY key must NOT ship in the app (a client bundle is extractable).
 * KLIPY puts the key in the URL PATH (/api/v1/{KEY}/gifs/...), so this Worker
 * injects it server-side and the app only ever talks to the Worker.
 *
 * Endpoints the app calls:
 *   GET /trending?limit=24            → KLIPY gifs/trending
 *   GET /search?q=<query>&limit=24    → KLIPY gifs/search
 * Response is trimmed to { gifs: [{ id, url, previewUrl, width, height }] }.
 *
 * DEPLOY (Cloudflare dashboard — no CLI):
 *   1. dash.cloudflare.com → Workers & Pages → Create Worker → name it "klipy" → Deploy.
 *   2. Edit code → paste THIS file → Deploy.
 *   3. Settings → Variables and Secrets → Add:
 *        Type: Secret,  Name: KLIPY_KEY,  Value: <your KLIPY API key>  → Deploy.
 *   4. Your URL is https://klipy.<your-subdomain>.workers.dev
 *      (subdomain spiderfan-no1 → the app already defaults to
 *       https://klipy.spiderfan-no1.workers.dev/). If yours differs, tell me.
 *
 * Get a free key: https://klipy.com/developers  (Test key = 100/hr, Production = unlimited).
 *
 * TEST after deploy (browser):
 *   https://klipy.<your-subdomain>.workers.dev/trending?limit=6  → JSON with gifs[].
 */
const BASE = "https://api.klipy.com/api/v1";
const CUSTOMER_ID = "bearoom"; // KLIPY uses this for ad frequency; fixed is fine (no ads here)

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors() });

    const inUrl = new URL(request.url);
    const path = inUrl.pathname.replace(/\/+$/, "");
    const limit = clampInt(inUrl.searchParams.get("limit"), 24, 8, 50);
    const page = clampInt(inUrl.searchParams.get("page"), 1, 1, 200);

    let target;
    if (path.endsWith("/search")) {
      const q = (inUrl.searchParams.get("q") || "").trim();
      if (!q) return json({ gifs: [] });
      target =
        `${BASE}/${env.KLIPY_KEY}/gifs/search?q=${encodeURIComponent(q)}` +
        `&per_page=${limit}&page=${page}&customer_id=${CUSTOMER_ID}`;
    } else {
      target = `${BASE}/${env.KLIPY_KEY}/gifs/trending?per_page=${limit}&page=${page}&customer_id=${CUSTOMER_ID}`;
    }

    try {
      const res = await fetch(target, { headers: { accept: "application/json" } });
      const data = await res.json();
      if (!res.ok || data.result === false) {
        const msg = data?.errors?.message?.[0] || `klipy ${res.status}`;
        return json({ gifs: [], error: msg }, res.ok ? 200 : res.status);
      }
      // KLIPY: { result:true, data:{ data:[items], ... } }. Ad slots (type:"ad")
      // are skipped; only real GIF items are returned.
      const items = data?.data?.data || data?.data || [];
      const gifs = items.map(pickGif).filter(Boolean);
      return json({ gifs });
    } catch (e) {
      return json({ gifs: [], error: String(e) }, 502);
    }
  },
};

/**
 * Normalize one KLIPY item → { id, url, previewUrl, width, height }.
 * KLIPY nests media as file[SIZE][FORMAT] → {url,width,height,size}, with
 * SIZE ∈ {hd,md,sm,xs} and FORMAT ∈ {gif,webp,jpg,mp4,webm}. We use animated
 * `gif`: md for display, xs for the grid preview. Ad slots (type:"ad") skipped.
 */
function pickGif(item) {
  if (!item || item.type === "ad") return null;
  const file = item.file || item.files || {};

  const gifAt = (size) => {
    const g = file[size] && file[size].gif;
    return g && g.url ? { url: g.url, width: num(g.width), height: num(g.height) } : null;
  };

  const display = gifAt("md") || gifAt("sm") || gifAt("hd") || gifAt("xs");
  if (!display) return null;
  const preview = gifAt("xs") || gifAt("sm") || display;

  return {
    id: String(item.id ?? item.slug ?? display.url),
    url: display.url,
    previewUrl: preview.url,
    width: display.width || 200,
    height: display.height || 200,
  };
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

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
  return { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
}
