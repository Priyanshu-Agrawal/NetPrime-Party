/**
 * Native Synchronous Storage Adapter (iOS / Android)
 * Backed by C++ MMKV for fast sub-millisecond I/O.
 */
import { createMMKV } from "react-native-mmkv";
import type { UniversalStorage } from "./universalStorage.types";

export type { UniversalStorage };

export function createUniversalStorage(): UniversalStorage {
  const mmkv = createMMKV();
  return {
    getString: (k: string) => mmkv.getString(k),
    set: (k: string, v: string | boolean | number) => mmkv.set(k, v),
    getBoolean: (k: string) => mmkv.getBoolean(k),
    getNumber: (k: string) => mmkv.getNumber(k),
    remove: (k: string) => {
      mmkv.remove(k);
    },
    delete: (k: string) => {
      mmkv.remove(k);
    },
    contains: (k: string) => mmkv.contains(k),
    clearAll: () => mmkv.clearAll(),
  };
}

export const universalStorage: UniversalStorage = createUniversalStorage();
