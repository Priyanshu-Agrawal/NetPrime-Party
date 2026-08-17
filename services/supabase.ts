/**
 * Supabase client — powers the watch-party backend.
 *
 * Auth: ANONYMOUS sign-in gives every install a stable `auth.uid()` on the
 * `authenticated` role — our RLS principal and the identity the party authority
 * (Postgres) keys on. The session is persisted in MMKV so the SAME install keeps
 * the SAME userId across app restarts (this is what lets a returning host be
 * recognized). Tokens auto-refresh only while the app is foregrounded (the RN
 * pattern), so a backgrounded app doesn't churn refreshes.
 */
import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";
import { universalStorage } from "./storage/universalStorage";

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || "https://kdcghbuknadvcmjctsqk.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_swMZtjF8JU-aJBnl3HKLnA_bu6yU7RP";

// Universal storage adapter for the auth session (synchronous).
const AuthStorageAdapter = {
  getItem: (k: string): string | null => universalStorage.getString(k) ?? null,
  setItem: (k: string, v: string): void => {
    universalStorage.set(k, v);
  },
  removeItem: (k: string): void => {
    universalStorage.remove(k);
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AuthStorageAdapter as any,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  realtime: {
    // Light sync traffic (control events + a ~2s host heartbeat + clock pings).
    params: { eventsPerSecond: 20 },
  },
});

// Refresh tokens only while foregrounded (Supabase's recommended RN pattern).
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

/**
 * Ensure an anonymous identity exists, returning the stable userId. Lazy +
 * memoized: only signs in the first time a party is entered, and reuses the
 * persisted session (same userId) on every later call / app launch.
 */
let authReady: Promise<string> | null = null;
export function ensurePartyAuth(): Promise<string> {
  if (!authReady) {
    authReady = (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) return session.user.id;
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      if (!data.user) throw new Error("anonymous sign-in returned no user");
      return data.user.id;
    })();
  }
  return authReady;
}
