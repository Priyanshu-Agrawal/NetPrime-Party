/**
 * Unified provider registry — ONE runtime source of truth for solo playback and
 * watch-party, read live from the Redux store (Supabase → /config →
 * providersSlice); there is NO baked-in list. Each provider carries its
 * embed URLs + the hijack-capability overlay (which we can drive for sync). The
 * solo player lists them all; the "Watch Party" button lights up only for
 * `isHijackable` ones. `providers.json` + `HIJACK_CAPS` remain in the repo purely
 * as the Supabase seed source, not imported at runtime.
 */
import { type HijackCapability } from "./hijackCapabilities";
import { store } from "@/src/store";

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

/**
 * The live provider list — read straight from the Redux store, the SINGLE source
 * of truth (Supabase → /config → providersSlice). No module holder, no manual
 * sync. It's a non-reactive snapshot for imperative/utility code (event handlers,
 * HijackPlayer's URL build); React components must use `useProviders()` so they
 * re-render. Starts empty and stays empty when the server sends none — there is
 * NO baked-in fallback (deliberate: during store review we clear providers and
 * the app must show nothing). The `registry → store` import is one-way: the store
 * chain imports this file type-only, so there is no runtime cycle.
 */
export function getActiveProviders(): Provider[] {
  return store.getState().providers.providers;
}

export function getProvider(id: string): Provider | undefined {
  return getActiveProviders().find((p) => p.id === id);
}

export function isHijackable(p: Provider | undefined): boolean {
  return !!p?.hijack.supported;
}

/**
 * A sensible default provider for launching a watch party directly from a title
 * (e.g. Details → "Watch together"), where the user hasn't hand-picked one in
 * the solo player. Prefers a stable hijackable provider, falling back to any
 * hijackable one.
 */
export function defaultHijackProvider(): Provider | undefined {
  const list = getActiveProviders();
  return (
    list.find((p) => p.hijack.supported && !p.hijack.unstable) ??
    list.find((p) => p.hijack.supported)
  );
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
