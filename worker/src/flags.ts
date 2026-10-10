/**
 * @file flags.ts
 * Remote on/off switches for new playback lanes, sent in /config.flags so a lane
 * can be turned off for every installed app without an app release.
 *
 * The switch of record is the KV key `flags:v1` in the CONFIG_LKG namespace (a JSON
 * object of booleans) — NOT dashboard vars, which the next `wrangler deploy` resets:
 *   npx wrangler kv key put --binding CONFIG_LKG flags:v1 '{"embedApiLane":true}' --remote
 * Optional FLAG_* worker vars are only the baseline under it. Everything defaults off.
 */
export interface FeatureFlags {
  embedApiLane: boolean;
  nativeLane: boolean;
  pluginHost: boolean;
}

const ENV_NAMES: Record<keyof FeatureFlags, string> = {
  embedApiLane: "FLAG_EMBED_API_LANE",
  nativeLane: "FLAG_NATIVE_LANE",
  pluginHost: "FLAG_PLUGIN_HOST",
};

const isOn = (v: unknown): boolean => typeof v === "string" && /^(1|true|on|yes)$/i.test(v.trim());

export const FLAGS_KEY = "flags:v1";

/**
 * Overlay the KV switches on the baseline. Only real booleans for known lanes
 * count — a typo, a string or an unknown key never switches anything on.
 */
export function resolveFlags(base: FeatureFlags, kvRaw: string | null): FeatureFlags {
  if (!kvRaw) return base;
  let parsed: unknown;
  try {
    parsed = JSON.parse(kvRaw);
  } catch {
    return base;
  }
  if (!parsed || typeof parsed !== "object") return base;
  const next = { ...base };
  for (const k of Object.keys(ENV_NAMES) as (keyof FeatureFlags)[]) {
    const v = (parsed as Record<string, unknown>)[k];
    if (typeof v === "boolean") next[k] = v;
  }
  return next;
}

export function parseFlags(env: Record<string, unknown>): FeatureFlags {
  return {
    embedApiLane: isOn(env[ENV_NAMES.embedApiLane]),
    nativeLane: isOn(env[ENV_NAMES.nativeLane]),
    pluginHost: isOn(env[ENV_NAMES.pluginHost]),
  };
}
