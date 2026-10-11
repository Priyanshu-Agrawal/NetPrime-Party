/**
 * The app's resolver, wired to the real plugin host, the SSRF-guarded fetch and the device's source health.
 */
import { hostFetch, pluginHost } from "@/services/plugins";
import { warmSandbox } from "@/services/plugins/demand";
import { universalStorage } from "@/services/storage/universalStorage";
import { Platform } from "react-native";
import { SourceHealth } from "./health";
import { ProbeCache, probeCandidate, type ProbeFetch } from "./probe";
import { previewPlayback, resolvePlayback, type ResolveResult, type TitleRequest } from "./resolver";
import { oneAtATime } from "./serial";

export const sourceHealth = new SourceHealth(universalStorage);

const probeFetch: ProbeFetch = async (url, headers, opts) => {
  const r = await hostFetch({ url, headers, maxBytes: opts.maxBytes, truncate: true, responseType: opts.responseType }, opts.alive);
  return { status: r.status, url: r.url, redirected: r.redirected, body: r.body, encoding: r.encoding };
};

const probeCache = new ProbeCache();

/** The StreamProbe on the real fetch path, uncached (the dev scorecard measures every run afresh). */
export function probeStream(c: Parameters<typeof probeCandidate>[0], ctx: Parameters<typeof probeCandidate>[1]) {
  return probeCandidate(c, ctx, probeFetch);
}

export function resolveTitle(req: TitleRequest, languages: string[]): Promise<ResolveResult> {
  return resolvePlayback(req, {
    getStreams: (r, opts) => pluginHost.getStreams(r, opts),
    probe: async (c, ctx) => {
      const hit = probeCache.get(c, ctx);
      if (hit) return hit;
      const out = await probeCandidate(c, ctx, probeFetch);
      probeCache.set(out, ctx);
      return out;
    },
    health: sourceHealth,
    platform: Platform.OS === "ios" ? "ios" : "android",
    languages,
    warm: () => warmSandbox(),
  });
}

const previews = oneAtATime();

/**
 * The title page's preview: languages without probing; its streams seed Play through the plugin host's cache. One
 * preview at a time across the app; one whose page has gone (`alive` false) by its turn is skipped (undefined).
 */
export function previewTitle(req: TitleRequest, languages: string[], alive?: () => boolean) {
  return previews(
    () =>
      previewPlayback(req, {
        getStreams: (r, opts) => pluginHost.getStreams(r, opts),
        health: sourceHealth,
        platform: Platform.OS === "ios" ? "ios" : "android",
        languages,
        warm: () => warmSandbox(),
      }),
    alive,
  );
}
