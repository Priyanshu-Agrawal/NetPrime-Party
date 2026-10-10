/**
 * @file configResolve.ts
 * Pure decisions behind GET /config's provider list (and /scripts' bridge list).
 *
 * "Supabase answered with an empty list" and "Supabase didn't answer" used to look
 * identical (both became `providers: []`), so a paused Free-tier project silently
 * looked like the operator's killswitch and every app went dark (2026-10-10). Now:
 *   - a successful answer is the truth — an EMPTY one is the deliberate killswitch;
 *   - no answer → serve the last-known-good copy from Workers KV, marked `stale`.
 */
import type { Provider } from "./schemas";

export type LiveOutcome = { ok: true; providers: Provider[] } | { ok: false; reason: string };

/** A last-known-good copy as stored in KV. */
export interface LkgRecord<T> {
  items: T[];
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
export const SCRIPTS_LKG_KEY = "scripts:lkg:v1";

export function resolveProviders(live: LiveOutcome, lkg: LkgRecord<Provider> | null): ProvidersResult {
  if (live.ok) {
    return { providers: live.providers, stale: false, killswitch: live.providers.length === 0, source: "live" };
  }
  if (lkg) {
    return { providers: lkg.items, stale: true, killswitch: lkg.items.length === 0, source: "lkg" };
  }
  return { providers: [], stale: true, killswitch: false, source: "none" };
}

export function serializeLkg<T>(items: T[], now: Date): string {
  return JSON.stringify({ items, savedAt: now.toISOString() });
}

/** Reads `{ items }`, and the first deployed format `{ providers }` (2026-10-10). */
export function parseLkg<T>(raw: string | null): LkgRecord<T> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { items?: unknown; providers?: unknown; savedAt?: unknown };
    const items = Array.isArray(v.items) ? v.items : Array.isArray(v.providers) ? v.providers : null;
    return items ? { items: items as T[], savedAt: String(v.savedAt ?? "") } : null;
  } catch {
    return null;
  }
}

/** Order-insensitive identity: health ordering flaps, and a reorder isn't worth a KV write. */
function fingerprint<T extends { id: string }>(items: T[]): string {
  return JSON.stringify([...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
}

/** Persist only when the set changed — KV's free tier allows ~1k writes/day per account. */
export async function writeLkgIfChanged<T extends { id: string }>(
  kv: KvLike,
  items: T[],
  now: Date,
  key: string = LKG_KEY,
): Promise<boolean> {
  const prev = parseLkg<T>(await kv.get(key));
  if (prev && fingerprint(prev.items) === fingerprint(items)) return false;
  await kv.put(key, serializeLkg(items, now));
  return true;
}
