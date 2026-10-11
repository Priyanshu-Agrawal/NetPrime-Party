import { runPlugin, type ShimRequest, type WorkerIo } from "@/services/plugins/sandbox/workerCore";
import { readFileSync } from "fs";
import { join } from "path";

const SOURCE = readFileSync(join(__dirname, "providers/open-movies.js"), "utf8");
const ENV = { tmdbApiKey: "bearoom-proxy", settings: {}, debug: false };

function network(streamStatus: (url: string) => number, tmdb: { id: number } | null) {
  const calls: ShimRequest[] = [];
  const io: WorkerIo = {
    fetch: async (req) => {
      calls.push(req);
      const tmdbCall = req.url.startsWith("https://api.themoviedb.org/");
      const status = tmdbCall ? (tmdb ? 200 : 503) : streamStatus(req.url);
      return { status, url: req.url, redirected: false, headers: {}, body: tmdbCall ? JSON.stringify(tmdb ?? {}) : "", encoding: "text" };
    },
    log: () => {},
  };
  return { calls, io };
}
const run = (id: string, type: string, io: WorkerIo) => runPlugin(SOURCE, [id, type, null, null], ENV, io, { cheerio: {}, CryptoJS: {} }) as Promise<Record<string, unknown>[]>;

describe("Open Movies", () => {
  it("offers Big Buck Bunny once TMDB confirms the title and the stream answers", async () => {
    const net = network(() => 206, { id: 10378 });
    await expect(run("10378", "movie", net.io)).resolves.toEqual([
      {
        name: "Open Movies • HLS",
        title: "Big Buck Bunny · 720p",
        url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
        quality: "720p",
        language: "en",
        headers: {},
        subtitles: [],
      },
    ]);
    expect(net.calls[0].url).toBe("https://api.themoviedb.org/3/movie/10378?api_key=bearoom-proxy");
    expect(net.calls[1].headers).toEqual({ Range: "bytes=0-1023" });
  });

  it("Tears of Steel comes as HLS and as a progressive file with six subtitle languages", async () => {
    const out = await run("133701", "movie", network(() => 200, { id: 133701 }).io);
    expect(out.map((s) => s.name)).toEqual(["Open Movies • HLS", "Open Movies • MOV"]);
    expect((out[1].subtitles as { label: string }[]).map((s) => s.label)).toEqual(["English", "German", "Spanish", "French", "Italian", "Russian"]);
  });

  it("Sintel comes as DASH", async () => {
    const out = await run("45745", "movie", network(() => 200, { id: 45745 }).io);
    expect(out).toEqual([expect.objectContaining({ name: "Open Movies • DASH", url: "https://storage.googleapis.com/shaka-demo-assets/sintel/dash.mpd" })]);
  });

  it("answers nothing, with no network at all, for other titles and for series", async () => {
    const net = network(() => 200, { id: 550 });
    await expect(run("550", "movie", net.io)).resolves.toEqual([]);
    await expect(run("10378", "tv", net.io)).resolves.toEqual([]);
    expect(net.calls).toHaveLength(0);
  });

  it("answers nothing when TMDB cannot confirm the title", async () => {
    await expect(run("10378", "movie", network(() => 200, null).io)).resolves.toEqual([]);
    await expect(run("10378", "movie", network(() => 200, { id: 1 }).io)).resolves.toEqual([]);
  });

  it("skips a stream that does not answer", async () => {
    await expect(run("10378", "movie", network(() => 404, { id: 10378 }).io)).resolves.toEqual([]);
  });
});
