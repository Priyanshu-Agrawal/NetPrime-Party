import type { HijackCapability } from "./hijackCapabilities";

export interface MediaRef {
  tmdbId: string;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
  startAt?: number;
}

/** The slice of a provider an embed URL needs (pure — no store). */
export interface EmbedProvider {
  id: string;
  urls: { movie: string; tv: string };
  hijack: HijackCapability;
}

function fill(template: string, m: MediaRef): string {
  if (!template) return ""; // defensive: a malformed provider row shouldn't crash the player
  return template
    .replace(/\$\{id\}/g, m.tmdbId)
    .replace(/\$\{season\}/g, String(m.season ?? 1))
    .replace(/\$\{episode\}/g, String(m.episode ?? 1));
}

/**
 * Build the embed URL for a provider + title. `party` mode appends the provider's
 * autoplay-off param (so members don't each auto-start before the party syncs).
 */
export function buildEmbedUrl(
  p: EmbedProvider,
  m: MediaRef,
  opts: { party?: boolean; autoplayNext?: boolean } = {},
): string {
  let url = m.type === "tv" ? fill(p.urls.tv, m) : fill(p.urls.movie, m);
  const extra: string[] = [];
  if (p.id === "videasy" && m.type === "tv") {
    extra.push("episodeSelector=true");
    // Solo only: in a party the host's queue decides the next episode, so videasy
    // must not advance on its own (members would drift onto different episodes).
    if (!opts.party && opts.autoplayNext !== false) extra.push("nextEpisode=true", "autoplayNextEpisode=true");
  }
  if (opts.party && p.hijack.autoplayParam) extra.push(p.hijack.autoplayParam);
  if (opts.party && m.startAt && m.startAt > 5) {
    extra.push(`startAt=${Math.floor(m.startAt)}`);
  }
  if (extra.length) url += (url.includes("?") ? "&" : "?") + extra.join("&");
  return url;
}
