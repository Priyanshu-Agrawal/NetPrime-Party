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
  /** Version tag of this provider's served injection script (or null). */
  scriptVersion?: string | null;
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
 * PARTY-capable = hijackable AND we actually serve an injection script for it
 * (`scriptVersion` set). Only these can bind the bridge and drive a synced watch
 * party; a hijackable provider with no served script injects nothing and never
 * binds (see F1 — currently only `videasy` qualifies). The 🐾 Party badge, the
 * "Watch Party" button, and party launch all gate on THIS, not bare
 * `isHijackable`, so the app never offers a party that silently can't sync.
 */
export function isPartyCapable(p: Provider | undefined): boolean {
  return isHijackable(p) && !!p?.scriptVersion;
}

/**
 * A sensible default provider for launching a watch party directly from a title
 * (e.g. Details → "Watch together"), where the user hasn't hand-picked one in
 * the solo player. Prefers a stable hijackable provider, falling back to any
 * hijackable one.
 */
export function defaultHijackProvider(): Provider | undefined {
  const list = getActiveProviders();
  // Only launch a party on a provider we can actually drive (has a served
  // script); prefer a stable one. Returns undefined if none are party-capable —
  // callers pass `?.id`, so an undefined provider simply can't host.
  return (
    list.find((p) => isPartyCapable(p) && !p.hijack.unstable) ??
    list.find((p) => isPartyCapable(p))
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
  opts: { party?: boolean; autoplayNext?: boolean } = {},
): string {
  let url = m.type === "tv" ? fill(p.urls.tv, m) : fill(p.urls.movie, m);
  const extra: string[] = [];
  if (p.id === "videasy" && m.type === "tv") {
    extra.push("episodeSelector=true");
    // Respect the "autoplay next episode" pref (default on). videasy advances
    // internally, so we gate its params rather than hooking the `ended` event.
    if (opts.autoplayNext !== false) extra.push("nextEpisode=true", "autoplayNextEpisode=true");
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
  if (req.isTopFrame === false) return true; // subframes (incl. their data:/blob:) unrestricted
  const url = req.url || "";
  // Allow blank/transition URLs on the TOP frame, but NOT data:/blob: — navigating the
  // main frame to an attacker-authored data:/blob: document would keep the RN bridge on
  // a page we don't control (bridge escape). Those remain allowed only in subframes above.
  if (!url || url.startsWith("about:")) {
    return true;
  }
  try {
    const host = new URL(url).hostname.toLowerCase();
    return hosts.some((d) => host === d || host.endsWith("." + d));
  } catch {
    return false;
  }
}
