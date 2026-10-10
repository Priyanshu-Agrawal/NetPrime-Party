import type { Provider } from "./providerRegistry";
import type { PlayerCapabilities } from "./types";

type ProviderLike = Pick<Provider, "hijack" | "scriptVersion"> | undefined;

export type OS = "ios" | "android";

/** What the generic bridge reports about the bound <video> (its `caps` event). */
export interface BridgeCaps {
  quality: boolean;
  audio: boolean;
  subtitles: boolean;
}

/** The provider renders a <video> our injected bridge can reach (on some platform). */
export function isHijackable(p: ProviderLike): boolean {
  return !!p?.hijack.supported;
}

/**
 * Our skin can drive this provider on `os`: hijack support + a served script, and the
 * <video> is reachable there. Measured `platforms` data wins; otherwise a cross-origin
 * frame is reachable only on iOS (WKWebView injects into every frame; Android's
 * react-native-webview injects into the main frame only).
 */
export function isBindableOn(p: ProviderLike, os: OS): boolean {
  if (!isHijackable(p) || !p?.scriptVersion) return false;
  const measured = p.hijack.platforms?.[os];
  if (measured !== undefined) return measured;
  return p.hijack.videoLocation !== "cross-origin-iframe" || os === "ios";
}

/**
 * PARTY-capable = bindable on BOTH platforms, so any member — iPhone or Android — can
 * bind it. The 🐾 badge, the "Watch Party" button and party launch gate on this.
 */
export function isPartyCapable(p: ProviderLike): boolean {
  return isBindableOn(p, "ios") && isBindableOn(p, "android");
}

export const NO_CAPABILITIES: PlayerCapabilities = {
  fractionalRate: false,
  preciseSeek: false,
  audioTracks: false,
  qualitySelect: false,
  subtitles: false,
  partySync: false,
};

/**
 * What the WebView hijack player can do for a provider on this platform. The generic
 * bridge reports quality/audio/subtitle support for the bound <video>; the legacy
 * videasy bridge reports nothing, so it keeps the full set it has always driven.
 */
export function hijackCapabilities(p: ProviderLike, os: OS, reported?: BridgeCaps): PlayerCapabilities {
  if (!isBindableOn(p, os)) return NO_CAPABILITIES;
  return {
    fractionalRate: true,
    preciseSeek: true,
    audioTracks: reported ? reported.audio : true,
    qualitySelect: reported ? reported.quality : true,
    subtitles: reported ? reported.subtitles : false,
    partySync: isPartyCapable(p),
  };
}
