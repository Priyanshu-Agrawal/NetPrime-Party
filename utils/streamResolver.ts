/**
 * streamResolver — single source-resolution interface for the player.
 *
 * Native playback needs a real `.m3u8`/`.mp4` URL plus the request headers the
 * CDN expects. `resolveNativeStream` obtains that ON-DEVICE using the
 * `@movie-web/providers` extractor (pure-JS scrapers that fetch + parse the
 * source sites and return a direct stream). When the extractor returns nothing,
 * the caller falls back to the legacy embed WebView (see EmbedWebView).
 *
 * (The older hidden-WebView sniffer — SnifferWebView — never worked in practice
 * because sources load the stream inside a cross-origin iframe our injected JS
 * can't reach; the extractor replaces it. The embed WebView remains the deep
 * fallback so the app never regresses below its previous behavior.)
 */
import {
  makeProviders,
  makeStandardFetcher,
  targets,
  type RunOutput,
  type ScrapeMedia,
} from "@movie-web/providers";

export type StreamType = "movie" | "tv";

export interface Provider {
  id: string;
  name: string;
  urls: {
    movie: string;
    tv: string;
  };
  allowedDomain: string;
}

export interface ResolvedStream {
  /** Direct media URL (.m3u8 or .mp4). Only meaningful when isEmbedFallback is false. */
  url?: string;
  /** expo-video content type: 'hls' for .m3u8, 'progressive' for .mp4. */
  contentType?: "hls" | "progressive";
  /** Request headers captured while sniffing (Referer/Origin/User-Agent). */
  headers?: Record<string, string>;
  provider: string;
  /** When true the caller must render EmbedWebView with `embedUrl` instead. */
  isEmbedFallback?: boolean;
  embedUrl?: string;
}

export interface ResolveArgs {
  id: string;
  type: StreamType;
  season?: string;
  ep?: string;
  provider: Provider;
}

/**
 * Per-provider sniff strategy. Kept here so each provider can carry its own
 * matcher/timeout as we learn (in Phase 1) which providers are actually
 * sniffable on-device.
 */
export interface SniffConfig {
  /** Regex the captured URL must match to be accepted as the media stream. */
  mediaPattern: RegExp;
  /** How long to wait for a match before giving up (ms). */
  timeoutMs: number;
}

export const DEFAULT_SNIFF: SniffConfig = {
  mediaPattern: /\.m3u8|\.mp4/i,
  timeoutMs: 10000,
};

/** Providers we have NOT (yet) confirmed sniffable — skip straight to embed fallback. */
const FORCE_EMBED_PROVIDERS = new Set<string>();

export const GITHUB_RAW_JSON_URL =
  "https://raw.githubusercontent.com/roshang1t/NetPrime/refs/heads/master/providers.json";

/** Fetch the provider list (moved out of player.tsx). */
export async function listProviders(signal?: AbortSignal): Promise<Provider[]> {
  const response = await fetch(GITHUB_RAW_JSON_URL, { signal });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return (await response.json()) as Provider[];
}

/**
 * Build the embed URL for a provider from the TMDB id/season/episode template.
 * Extracted verbatim from the old player.tsx `getWebViewUrl`, incl. the videasy
 * autoplay query-string special case.
 */
export function buildEmbedUrl(args: ResolveArgs): string {
  const { id, type, season, ep, provider } = args;
  if (!provider || !id) return "about:blank";

  if (type === "tv" && season && ep) {
    const urlTemplate = provider.urls.tv;
    return (
      urlTemplate
        .replace(/\$\{id\}/g, id)
        .replace(/\$\{season\}/g, season)
        .replace(/\$\{episode\}/g, ep) +
      (provider.id === "videasy"
        ? "?nextEpisode=true&autoplayNextEpisode=true&episodeSelector=true"
        : "")
    );
  }
  if (type === "movie") {
    return provider.urls.movie.replace(/\$\{id\}/g, id);
  }
  return "about:blank";
}

/** Whitelist of allowed navigation domains across all providers. */
export function allowedDomainsFor(providers: Provider[]): string[] {
  return providers.map((p) => p.allowedDomain).filter(Boolean);
}

export function shouldForceEmbed(provider: Provider): boolean {
  return FORCE_EMBED_PROVIDERS.has(provider.id);
}

export function sniffConfigFor(_provider: Provider): SniffConfig {
  return DEFAULT_SNIFF;
}

/** Origin of the embed URL, used to synthesize Referer/Origin request headers. */
export function embedOrigin(embedUrl: string): string {
  try {
    return new URL(embedUrl).origin;
  } catch {
    return "";
  }
}

// --- Native extraction via @movie-web/providers ----------------------------

/**
 * Media descriptor the extractor needs. Note it requires `title` + `releaseYear`
 * (not just the TMDB id) to match the source sites' catalogs.
 */
export interface NativeMedia {
  tmdbId: string;
  type: StreamType;
  title: string;
  releaseYear: number;
  /** TV only. */
  season?: number;
  episode?: number;
  seasonTmdbId?: string;
  episodeTmdbId?: string;
}

let _providers: ReturnType<typeof makeProviders> | null = null;
function getProviders(): ReturnType<typeof makeProviders> {
  if (!_providers) {
    _providers = makeProviders({
      // RN global fetch — no CORS wall on native.
      fetcher: makeStandardFetcher(fetch),
      // NATIVE drops the CORS_ALLOWED requirement, unlocking most sources.
      target: targets.NATIVE,
      // Same device scrapes + plays → IP_LOCKED streams play without a proxy.
      consistentIpForRequests: true,
      // expo-video plays the stream directly (no stream proxy).
      proxyStreams: false,
    });
  }
  return _providers;
}

/** Best-quality order for file-based (progressive) streams. */
const QUALITY_ORDER = ["4k", "1080", "720", "480", "360", "unknown"] as const;

function mapStream(
  out: RunOutput,
  providerLabel: string,
): ResolvedStream | null {
  const stream = out.stream;
  const merged = {
    ...(stream.headers ?? {}),
    ...(stream.preferredHeaders ?? {}),
  };
  const headers = Object.keys(merged).length ? merged : undefined;

  if (stream.type === "hls") {
    return {
      url: stream.playlist,
      contentType: "hls",
      headers,
      provider: providerLabel,
    };
  }
  // file-based: pick the highest available quality.
  const key = QUALITY_ORDER.find((q) => stream.qualities[q]?.url);
  const file = key ? stream.qualities[key] : undefined;
  if (!file?.url) return null;
  return {
    url: file.url,
    contentType: "progressive",
    headers,
    provider: providerLabel,
  };
}

/**
 * Resolve a real, natively-playable stream for the given media using the
 * `@movie-web/providers` extractor. Returns null if no source yields a stream.
 */
export async function resolveNativeStream(
  media: NativeMedia,
  providerLabel = "auto",
): Promise<ResolvedStream | null> {
  const scrape: ScrapeMedia =
    media.type === "tv"
      ? {
          type: "show",
          title: media.title,
          releaseYear: media.releaseYear,
          tmdbId: media.tmdbId,
          season: {
            number: media.season ?? 1,
            tmdbId: media.seasonTmdbId ?? media.tmdbId,
          },
          episode: {
            number: media.episode ?? 1,
            tmdbId: media.episodeTmdbId ?? media.tmdbId,
          },
        }
      : {
          type: "movie",
          title: media.title,
          releaseYear: media.releaseYear,
          tmdbId: media.tmdbId,
        };

  console.log("[extractor] runAll for", JSON.stringify(scrape));
  let out: RunOutput | null = null;
  try {
    out = await getProviders().runAll({
      media: scrape,
      events: {
        init: (e: { sourceIds: string[] }) =>
          console.log("[extractor] sources:", e.sourceIds.join(",")),
        start: (id: string) => console.log("[extractor] start", id),
        update: (e: { id: string; status: string; reason?: string }) =>
          console.log("[extractor] update", e.id, e.status, e.reason ?? ""),
      },
    });
  } catch (err) {
    console.log("[extractor] runAll threw:", String(err));
    throw err;
  }
  console.log(
    "[extractor] result:",
    out ? `${out.sourceId} ${out.stream.type}` : "NULL",
  );
  if (!out) return null;
  return mapStream(out, providerLabel);
}
