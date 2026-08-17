/**
 * Local identity for the watch-party system (Phase 1 foundation).
 *
 * THREE identities, kept distinct (see protocol.ts):
 *   - installationId : this app install/device. Stable across app restarts,
 *                      lost on reinstall. Persisted here in MMKV. NOT a secret,
 *                      NOT proof of ownership on its own — the server issues a
 *                      session token that authenticates a reconnect.
 *   - userId         : the person. For now derived from Supabase anonymous auth
 *                      (auth.uid()) once wired; until then we fall back to the
 *                      installationId so the rest of the system can be built.
 *   - connectionId   : one live WebSocket connection. Assigned by the Room DO,
 *                      never stored here.
 *
 * This module owns only the *local, offline-available* bits: installationId +
 * the user's chosen display name. Everything authoritative (role, permissions,
 * lease, membership) lives on the server and is never trusted from the client.
 */
import { BearAvatarConfig, GenderPreference, generateRandomBearConfig } from "@/services/avatar/bearAvatar";
import "react-native-get-random-values";
import { universalStorage as storage } from "@/services/storage/universalStorage";

const K_INSTALLATION = "party.installationId";
const K_DISPLAY_NAME = "party.displayName";
const K_GENDER = "party.gender";
const K_AVATAR_CONFIG = "party.avatarConfig";

/** RFC-4122 v4, sourced from the crypto polyfill; weak fallback never throws. */
function uuidv4(): string {
  try {
    const b = new Uint8Array(16);
    (globalThis.crypto as Crypto).getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0"));
    return (
      `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-` +
      `${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`
    );
  } catch {
    // Extremely unlikely (polyfill missing). An id, not a secret — ok to weaken.
    return `inst-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
}

/** Stable per-install id. Generated + persisted on first call, reused forever after. */
export function getInstallationId(): string {
  let id = storage.getString(K_INSTALLATION);
  if (!id) {
    id = uuidv4();
    storage.set(K_INSTALLATION, id);
  }
  return id;
}

/** The user's chosen display name, or null if they haven't set one yet. */
export function getDisplayName(): string | null {
  return storage.getString(K_DISPLAY_NAME) ?? null;
}

export function setDisplayName(name: string): void {
  storage.set(K_DISPLAY_NAME, name.trim().slice(0, 32));
}

/** The user's chosen gender preference (masculine, feminine, neutral) */
export function getGender(): GenderPreference {
  const g = storage.getString(K_GENDER);
  if (g === "masculine" || g === "feminine" || g === "neutral") {
    return g;
  }
  return "neutral";
}

export function setGender(gender: GenderPreference): void {
  storage.set(K_GENDER, gender);
}

/** The user's Bear Avatar configuration */
export function getAvatarConfig(): BearAvatarConfig {
  const raw = storage.getString(K_AVATAR_CONFIG);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      // ignore
    }
  }
  const fallback = generateRandomBearConfig(getGender(), getInstallationId());
  setAvatarConfig(fallback);
  return fallback;
}

export function setAvatarConfig(config: BearAvatarConfig): void {
  storage.set(K_AVATAR_CONFIG, JSON.stringify(config));
  if (config.gender) {
    storage.set(K_GENDER, config.gender);
  }
}

export interface LocalIdentity {
  installationId: string;
  displayName: string;
  gender: GenderPreference;
  avatarConfig: BearAvatarConfig;
}

/**
 * Convenience for join flows: guarantees an installationId, name, and avatar config
 */
export function getLocalIdentity(): LocalIdentity {
  return {
    installationId: getInstallationId(),
    displayName: getDisplayName() ?? "Guest",
    gender: getGender(),
    avatarConfig: getAvatarConfig(),
  };
}
