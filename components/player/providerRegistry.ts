/**
 * Unified provider registry — ONE runtime source of truth for solo playback and
 * watch-party, read live from the Redux store (Supabase → /config →
 * providersSlice); there is NO baked-in list. Each provider carries its
 * embed URLs + the hijack-capability overlay (which we can drive for sync). The
 * solo player lists them all; the "Watch Party" button lights up only for
 * `isHijackable` ones. `providers.json` + `HIJACK_CAPS` remain in the repo purely
 * as the Supabase seed source, not imported at runtime.
 */
import { isPartyCapable } from "./capabilities";
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

// The capability predicates are pure, so they live in capabilities.ts (testable
// without the store); re-exported here so existing imports keep working.
export { isHijackable, isPartyCapable } from "./capabilities";
export { buildEmbedUrl, type MediaRef } from "./embedUrl";

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
