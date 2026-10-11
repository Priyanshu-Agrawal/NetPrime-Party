import { createMMKV } from "react-native-mmkv";
import type { PluginStore } from "./store";

/** The app's plugin store: its own MMKV instance, so a few hundred KB of plugin code never slows the preferences store. */
export function mmkvPluginStore(): PluginStore {
  const m = createMMKV({ id: "plugins" });
  return {
    get: (k) => m.getString(k),
    set: (k, v) => m.set(k, v),
    has: (k) => m.contains(k),
    remove: (k) => {
      m.remove(k);
    },
    keys: () => m.getAllKeys(),
  };
}
