/**
 * streamResolver — REFERENCE SCAFFOLDING for the native-player POC (not wired).
 *
 * Pure helpers for turning a provider + media ref into an embed URL, deriving
 * the embed origin (for synthesized Referer/Origin headers), and describing the
 * per-provider on-device sniff strategy. Consumed by the (also-.old) SnifferWebView.
 *
 * NOTE: the former `resolveNativeStream` (on-device extraction via
 * `@movie-web/providers`) was REMOVED — those scrapers are dead and the package
 * was uninstalled. The native player resolves streams by SNIFFING the provider's
 * own web player in a hidden WebView instead (see docs/architecture/native-player.md).
 */

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
 * matcher/timeout as we learn which providers are actually sniffable on-device.
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

/**
 * Build the embed URL for a provider from the TMDB id/season/episode template,
 * incl. the videasy autoplay query-string special case. (The live app uses
 * providerRegistry.buildEmbedUrl; this is the resolver-path variant.)
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
