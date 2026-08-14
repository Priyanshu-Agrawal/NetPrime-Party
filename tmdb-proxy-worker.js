/**
 * TMDB proxy — Cloudflare Worker (your own, ~free, no CLI needed).
 *
 * WHY: api.themoviedb.org is blocked/RST on many Indian ISPs, so the app can't
 * call TMDB directly. This Worker runs on Cloudflare's network (not blocked),
 * forwards every request to TMDB, and INJECTS your token server-side — so your
 * token never ships inside the app.
 *
 * DEPLOY (all in the Cloudflare dashboard — no command line):
 *   1. Sign up free at https://dash.cloudflare.com  →  Workers & Pages.
 *   2. Create application → Create Worker → name it e.g. "tmdb" → Deploy.
 *   3. Click "Edit code", paste THIS file's contents, click Deploy.
 *   4. Go to the Worker's Settings → Variables and Secrets → Add:
 *        Type: Secret,  Name: TMDB_TOKEN,
 *        Value: <your TMDB v4 "API Read Access Token">
 *      → Deploy.
 *   5. Copy your Worker URL (e.g. https://tmdb.<your-subdomain>.workers.dev)
 *      and send it to me — I'll point the app at it and remove the token from
 *      the app entirely.
 *
 * TEST after deploy (in a browser):
 *   https://tmdb.<your-subdomain>.workers.dev/movie/550?language=en-US
 *   → should return Fight Club JSON.
 */
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors() });
    }
    const inUrl = new URL(request.url);
    const target = "https://api.themoviedb.org/3" + inUrl.pathname + inUrl.search;

    const res = await fetch(target, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${env.TMDB_TOKEN}`,
        accept: "application/json",
      },
    });

    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: { "content-type": "application/json", ...cors() },
    });
  },
};

function cors() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
  };
}
