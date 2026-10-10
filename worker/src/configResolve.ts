/**
 * @file configResolve.ts
 * Pure decisions behind GET /config's provider list.
 *
 * "Supabase answered with an empty list" and "Supabase didn't answer" used to look
 * identical (both became `providers: []`), so a paused Free-tier project silently
 * looked like the operator's killswitch and every app went dark (2026-10-10). Now:
 *   - a successful answer is the truth — an EMPTY one is the deliberate killswitch;
 *   - no answer → serve the last-known-good list from Workers KV, marked `stale`.
 */
import type { Provider } from "./schemas";

export type LiveOutcome = { ok: true; providers: Provider[] } | { ok: false; reason: string };

export interface LkgRecord {
  providers: Provider[];
  savedAt: string;
}

export interface ProvidersResult {
  providers: Provider[];
  /** True when Supabase did not answer: we're serving last-known-good (or nothing). */
  stale: boolean;
  /** True only when the list is deliberately empty (a successful empty answer, or an LKG of one). */
  killswitch: boolean;
  source: "live" | "lkg" | "none";
}

/** Minimal KV surface (a Workers KVNamespace satisfies it). */
export type KvLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
};

export const LKG_KEY = "providers:lkg:v1";

export function resolveProviders(live: LiveOutcome, lkg: LkgRecord | null): ProvidersResult {
  if (live.ok) {
    return { providers: live.providers, stale: false, killswitch: live.providers.length === 0, source: "live" };
  }
  if (lkg) {
    return { providers: lkg.providers, stale: true, killswitch: lkg.providers.length === 0, source: "lkg" };
  }
  return { providers: [], stale: true, killswitch: false, source: "none" };
}

export function serializeLkg(providers: Provider[], now: Date): string {
  return JSON.stringify({ providers, savedAt: now.toISOString() });
}

export function parseLkg(raw: string | null): LkgRecord | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<LkgRecord>;
    return Array.isArray(v.providers) ? { providers: v.providers, savedAt: String(v.savedAt ?? "") } : null;
  } catch {
    return null;
  }
}

/** Persist the list only when it changed — KV's free tier allows ~1k writes/day. */
export async function writeLkgIfChanged(kv: KvLike, providers: Provider[], now: Date): Promise<boolean> {
  const prev = parseLkg(await kv.get(LKG_KEY));
  if (prev && JSON.stringify(prev.providers) === JSON.stringify(providers)) return false;
  await kv.put(LKG_KEY, serializeLkg(providers, now));
  return true;
}
