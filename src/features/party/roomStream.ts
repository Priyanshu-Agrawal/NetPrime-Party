/**
 * Which stream a party member plays for the room's plugin item (spec §6.4): the host's own (handed over on the private
 * channel), and if that won't load on this device, the same source re-resolved here — accepted only when it is the
 * same cut (length within ±2.5 s). Otherwise: "This source won't play here".
 */
import type { NativeSource } from "@/components/player/native/NativePlayer";
import type { StreamHandoff } from "@/services/party/protocol";
import type { PlaybackCandidate } from "@/services/playback/candidate";
import type { ResolveResult, TitleRequest } from "@/services/playback/resolver";

export const SAME_CUT_SEC = 2.5;

const CONTENT_TYPE = { hls: "hls", dash: "dash", mp4: "progressive" } as const;

export function hostSource(h: StreamHandoff): NativeSource {
  return { uri: h.url, headers: h.headers, ...(h.container ? { contentType: CONTENT_TYPE[h.container] } : {}) };
}

export function withinCut(a?: number, b?: number): boolean {
  return a == null || b == null || Math.abs(a - b) <= SAME_CUT_SEC;
}

/** The same stream re-resolved on this device: the same key, else the same source in the room's language. */
export async function relocateSame(
  h: Pick<StreamHandoff, "key" | "sourceId" | "language">,
  resolve: (req: TitleRequest, languages: string[]) => Promise<ResolveResult>,
  title: TitleRequest,
  languages: string[],
): Promise<PlaybackCandidate | null> {
  const { ranked } = await resolve(title, h.language ? [h.language, ...languages.filter((l) => l !== h.language)] : languages);
  return (
    ranked.find((c) => c.key === h.key) ??
    ranked.find((c) => c.sourceId === h.sourceId && (!h.language || c.languages.includes(h.language))) ??
    null
  );
}

export type GuestFallback = { kind: "local"; candidate: PlaybackCandidate } | { kind: "none"; reason: "not-found" | "different-cut" };

/** After the host's stream failed here: this device's own copy, if it is the same cut. */
export async function guestFallback(h: StreamHandoff, relocate: () => Promise<PlaybackCandidate | null>): Promise<GuestFallback> {
  let c: PlaybackCandidate | null = null;
  try {
    c = await relocate();
  } catch {
    c = null;
  }
  if (!c) return { kind: "none", reason: "not-found" };
  if (!withinCut(c.durationSec, h.durationSec)) return { kind: "none", reason: "different-cut" };
  return { kind: "local", candidate: c };
}
