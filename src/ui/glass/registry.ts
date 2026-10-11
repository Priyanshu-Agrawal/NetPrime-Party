import type { RefObject } from "react";
import type { View } from "react-native";
import type { BackdropState } from "./engine";

export interface BackdropEntry {
  id: number;
  ref: RefObject<View | null>;
}

/** An ordered set of backdrops; the most recently added one is current. */
export interface BackdropRegistry {
  add(entry: BackdropEntry): void;
  remove(id: number): void;
  current(): BackdropEntry | null;
  subscribe(listener: () => void): () => void;
}

export function createBackdropRegistry(): BackdropRegistry {
  let entries: BackdropEntry[] = [];
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    add(entry) {
      entries = [...entries.filter((e) => e.id !== entry.id), entry];
      emit();
    },
    remove(id) {
      const next = entries.filter((e) => e.id !== id);
      if (next.length === entries.length) return;
      entries = next;
      emit();
    },
    current: () => entries[entries.length - 1] ?? null,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Backdrops of focused screens: floating chrome (tab bar, peek bar, headers) blurs the current one. */
export const screenBackdrops = createBackdropRegistry();

let lastId = 0;
export const nextBackdropId = (): number => ++lastId;

/** What a glass may blur: its backdrop, unless it opted out or sits inside it. */
export function resolveBackdrop(
  mode: "auto" | "none",
  entry: BackdropEntry | null,
  insideIds: readonly number[],
): { entry: BackdropEntry | null; state: BackdropState } {
  if (mode === "none" || !entry) return { entry: null, state: "none" };
  if (insideIds.includes(entry.id)) return { entry: null, state: "inside" };
  return { entry, state: "available" };
}
