import { afterEach, describe, expect, it, vi } from "vitest";
import app from "./index";

const repoRow = { id: "open-movies", manifest_url: "https://h.test/m.json", version: 1, files: [], enabled: true, down: false, allow_plugins: ["open-movies"] };
const providerRow = { id: "vidfast", name: "VidFast", enabled: true, priority: 1, url_movie: "https://v/{id}", url_tv: null, allowed_domain: "https://v", hijack: { supported: false }, script_version: null };

function stub() {
  const inserts: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("provider_reports")) {
      inserts.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 201 });
    }
    if (url.includes("provider_health")) return new Response("[]", { status: 200 });
    if (url.includes("plugin_repos")) return new Response(JSON.stringify([repoRow]), { status: 200 });
    return new Response(JSON.stringify([providerRow]), { status: 200 });
  });
  const store = new Map<string, Response>();
  vi.stubGlobal("caches", {
    default: { match: async (r: Request) => store.get(r.url)?.clone(), put: async (r: Request, res: Response) => void store.set(r.url, res) },
  });
  return inserts;
}

const env = {
  SUPABASE_URL: "https://supa.test",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "svc",
  IP_HASH_SALT: "salt",
  REPORT_LIMITER: { limit: async () => ({ success: true }) },
};

async function report(body: Record<string, unknown>) {
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => void pending.push(p), passThroughOnException: () => {} };
  const res = await app.request(
    "/report",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tmdbId: "10378", mediaType: "movie", outcome: "success", platform: "android", ...body }) },
    env,
    ctx as never,
  );
  await Promise.allSettled(pending);
  return res.status;
}

afterEach(() => vi.unstubAllGlobals());

describe("POST /report", () => {
  it("stores a native-lane report for a listed plugin source", async () => {
    const inserts = stub();
    expect(await report({ providerId: "open-movies/open-movies", lane: "native", stage: "playing", ttffMs: 900 })).toBe(202);
    expect(inserts).toEqual([expect.objectContaining({ provider_id: "open-movies/open-movies", lane: "native", ttff_ms: 900 })]);
  });

  it("drops made-up sources, and plugin ids reported on the embed lane", async () => {
    const inserts = stub();
    expect(await report({ providerId: "made-up/x", lane: "native" })).toBe(202);
    expect(await report({ providerId: "open-movies/made-up", lane: "native" })).toBe(202);
    expect(await report({ providerId: "open-movies/open-movies", lane: "embed" })).toBe(202);
    expect(inserts).toEqual([]);
  });

  it("still stores embed reports for registry providers", async () => {
    const inserts = stub();
    await report({ providerId: "vidfast", lane: "embed" });
    expect(inserts).toEqual([expect.objectContaining({ provider_id: "vidfast" })]);
  });
});
