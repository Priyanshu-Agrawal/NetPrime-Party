/**
 * Unified provider registry — ONE source of truth for both solo playback and
 * watch-party. It merges the user-maintained `providers.json` (the solo server
 * list, full catalog) with the hijack-capability overlay (which of those we can
 * drive for sync). The solo player lists them all; the "Watch Party" button lights
 * up only for `isHijackable` ones.
 */
import providersData from "@/providers.json";
import { HIJACK_CAPS, type HijackCapability } from "./hijackCapabilities";

export interface RawProvider {
  id: string;
  name: string;
  urls: { movie: string; tv: string };
  allowedDomain: string;
}

export interface Provider extends RawProvider {
  hijack: HijackCapability;
}

export interface MediaRef {
  tmdbId: string;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
  startAt?: number;
}

export const PROVIDERS: Provider[] = (providersData as RawProvider[]).map((p) => ({
  ...p,
  hijack: HIJACK_CAPS[p.id] ?? { supported: false },
}));

export function getProvider(id: string): Provider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function isHijackable(p: Provider | undefined): boolean {
  return !!p?.hijack.supported;
}

/** Hijackable but flaky (has an internal server picker) — warn in the UI. */
export function isUnstable(p: Provider | undefined): boolean {
  return !!p?.hijack.supported && !!p?.hijack.unstable;
}

function fill(template: string, m: MediaRef): string {
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
  p: Provider,
  m: MediaRef,
  opts: { party?: boolean } = {},
): string {
  let url = m.type === "tv" ? fill(p.urls.tv, m) : fill(p.urls.movie, m);
  const extra: string[] = [];
  if (p.id === "videasy" && m.type === "tv") {
    extra.push("nextEpisode=true", "autoplayNextEpisode=true", "episodeSelector=true");
  }
  if (opts.party && p.hijack.autoplayParam) extra.push(p.hijack.autoplayParam);
  if (opts.party && m.startAt && m.startAt > 5) {
    extra.push(`startAt=${Math.floor(m.startAt)}`);
  }
  if (extra.length) url += (url.includes("?") ? "&" : "?") + extra.join("&");
  return url;
}

/** Bare hostnames the top frame may navigate to for this provider (popup blocking). */
export function providerHosts(p: Provider): string[] {
  const hosts = new Set<string>();
  try {
    hosts.add(new URL(p.allowedDomain).hostname.toLowerCase());
  } catch {
    /* allowedDomain may be a bare host */
    if (p.allowedDomain) hosts.add(p.allowedDomain.replace(/^https?:\/\//, "").toLowerCase());
  }
  (p.hijack.navHosts ?? []).forEach((h) => hosts.add(h.toLowerCase()));
  return [...hosts];
}

/**
 * Allow only top-frame navigations to the given hosts; sub-resources / media /
 * iframes (isTopFrame === false) always pass so the stream still loads.
 */
export function isAllowedTopNav(
  hosts: string[],
  req: { url: string; isTopFrame?: boolean },
): boolean {
  if (req.isTopFrame === false) return true;
  const url = req.url || "";
  if (
    !url ||
    url.startsWith("about:") ||
    url.startsWith("data:") ||
    url.startsWith("blob:")
  ) {
    return true;
  }
  try {
    const host = new URL(url).hostname.toLowerCase();
    return hosts.some((d) => host === d || host.endsWith("." + d));
  } catch {
    return false;
  }
}
