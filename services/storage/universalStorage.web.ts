/**
 * Web Synchronous Storage Adapter
 * Backed by window.localStorage with in-memory fallback for SSR/prerender.
 */
import type { UniversalStorage } from "./universalStorage.types";

export type { UniversalStorage };

class MemoryStorage implements UniversalStorage {
  private store = new Map<string, string>();

  getString(key: string): string | undefined {
    return this.store.get(key);
  }

  set(key: string, value: string | boolean | number): void {
    this.store.set(key, String(value));
  }

  getBoolean(key: string): boolean | undefined {
    const v = this.store.get(key);
    if (v === undefined) return undefined;
    return v === "true";
  }

  getNumber(key: string): number | undefined {
    const v = this.store.get(key);
    if (v === undefined) return undefined;
    const num = Number(v);
    return isNaN(num) ? undefined : num;
  }

  remove(key: string): void {
    this.store.delete(key);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  contains(key: string): boolean {
    return this.store.has(key);
  }

  clearAll(): void {
    this.store.clear();
  }
}

class WebLocalStorage implements UniversalStorage {
  getString(key: string): string | undefined {
    try {
      if (typeof window === "undefined" || !window.localStorage) return undefined;
      const v = window.localStorage.getItem(key);
      return v === null ? undefined : v;
    } catch {
      return undefined;
    }
  }

  set(key: string, value: string | boolean | number): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, String(value));
      }
    } catch {}
  }

  getBoolean(key: string): boolean | undefined {
    const v = this.getString(key);
    if (v === undefined) return undefined;
    return v === "true";
  }

  getNumber(key: string): number | undefined {
    const v = this.getString(key);
    if (v === undefined) return undefined;
    const num = Number(v);
    return isNaN(num) ? undefined : num;
  }

  remove(key: string): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {}
  }

  delete(key: string): void {
    this.remove(key);
  }

  contains(key: string): boolean {
    try {
      if (typeof window === "undefined" || !window.localStorage) return false;
      return window.localStorage.getItem(key) !== null;
    } catch {
      return false;
    }
  }

  clearAll(): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.clear();
      }
    } catch {}
  }
}

export function createUniversalStorage(): UniversalStorage {
  if (typeof window !== "undefined" && window.localStorage) {
    return new WebLocalStorage();
  }
  return new MemoryStorage();
}

export const universalStorage: UniversalStorage = createUniversalStorage();
