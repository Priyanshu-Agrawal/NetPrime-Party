import { useSyncExternalStore } from "react";

/** Lets a dev screen (the Plugin Lab) keep the sandbox mounted while the plugin-host flag is off. */
let count = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function holdSandbox(): () => void {
  count++;
  emit();
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    count--;
    emit();
  };
}

export function sandboxDemand(): number {
  return count;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useSandboxDemand(): number {
  return useSyncExternalStore(subscribe, sandboxDemand);
}
