/**
 * @file flags.ts
 * Remote on/off switches for new playback lanes, sent in /config.flags. Set as
 * plain worker vars (wrangler.toml [vars] or the Cloudflare dashboard) so a lane
 * can be turned off for every installed app without an app release.
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

export function parseFlags(env: Record<string, unknown>): FeatureFlags {
  return {
    embedApiLane: isOn(env[ENV_NAMES.embedApiLane]),
    nativeLane: isOn(env[ENV_NAMES.nativeLane]),
    pluginHost: isOn(env[ENV_NAMES.pluginHost]),
  };
}
