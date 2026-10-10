import type { Provider } from "./providerRegistry";
import type { PlayerCapabilities } from "./types";

type ProviderLike = Pick<Provider, "hijack" | "scriptVersion"> | undefined;

/** The provider renders a <video> our injected bridge can reach. */
export function isHijackable(p: ProviderLike): boolean {
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
export function isPartyCapable(p: ProviderLike): boolean {
  return isHijackable(p) && !!p?.scriptVersion;
}

export const NO_CAPABILITIES: PlayerCapabilities = {
  fractionalRate: false,
  preciseSeek: false,
  audioTracks: false,
  qualitySelect: false,
  subtitles: false,
  partySync: false,
};

/** What the WebView hijack player can do for a given provider. */
export function hijackCapabilities(p: ProviderLike): PlayerCapabilities {
  if (!isPartyCapable(p)) return NO_CAPABILITIES;
  // A bound bridge drives the provider's own <video> (rate, seek) and its menus (quality, dubs).
  return {
    fractionalRate: true,
    preciseSeek: true,
    audioTracks: true,
    qualitySelect: true,
    subtitles: false,
    partySync: true,
  };
}
