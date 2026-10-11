/**
 * Where installed plugin files live (spec §5.4): content-addressed blobs (`blob:<sha256>`, written only after the hash
 * checked out) plus one pointer per repo (`repo:<id>`) naming its last good version. The app's copy is MMKV
 * (mmkvStore.ts); tests use the in-memory one.
 */
export interface PluginStore {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  has(key: string): boolean;
  remove(key: string): void;
  keys(): string[];
}

export function memoryPluginStore(): PluginStore {
  const m = new Map<string, string>();
  return {
    get: (k) => m.get(k),
    set: (k, v) => {
      m.set(k, v);
    },
    has: (k) => m.has(k),
    remove: (k) => {
      m.delete(k);
    },
    keys: () => [...m.keys()],
  };
}
