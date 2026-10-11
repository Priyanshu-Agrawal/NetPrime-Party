/**
 * The app's resolver, wired to the real plugin host, the SSRF-guarded fetch and the device's source health.
 */
import { hostFetch, pluginHost } from "@/services/plugins";
import { warmSandbox } from "@/services/plugins/demand";
import { universalStorage } from "@/services/storage/universalStorage";
import { Platform } from "react-native";
import type { PlaybackCandidate } from "./candidate";
import { SourceHealth } from "./health";
import { probeCandidate, type ProbeFetch } from "./probe";
import { resolvePlayback, type ResolveResult, type TitleRequest } from "./resolver";

export const sourceHealth = new SourceHealth(universalStorage);

const probeFetch: ProbeFetch = async (url, headers, opts) => {
  const r = await hostFetch({ url, headers, maxBytes: opts.maxBytes, truncate: true, responseType: opts.responseType });
  return { status: r.status, url: r.url, redirected: r.redirected, body: r.body, encoding: r.encoding };
};

// Probe results by URL for 15 minutes (the plugin host's cache window); a re-resolve with fresh tokens probes again.
const PROBE_CACHE_MS = 15 * 60_000;
const probed = new Map<string, { at: number; c: PlaybackCandidate }>();

export function resolveTitle(req: TitleRequest, languages: string[]): Promise<ResolveResult> {
  return resolvePlayback(req, {
    getStreams: (r) => pluginHost.getStreams(r),
    probe: async (c, ctx) => {
      const hit = probed.get(c.url);
      if (hit && Date.now() - hit.at < PROBE_CACHE_MS) return { ...hit.c, order: c.order };
      const out = await probeCandidate(c, ctx, probeFetch);
      probed.set(c.url, { at: Date.now(), c: out });
      return out;
    },
    health: sourceHealth,
    platform: Platform.OS === "ios" ? "ios" : "android",
    languages,
    warm: () => warmSandbox(),
  });
}
