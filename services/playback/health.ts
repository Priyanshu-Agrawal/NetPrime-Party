import type { FailureReason } from "@/services/plugins/PluginHost";
import type { UniversalStorage } from "@/services/storage/universalStorage.types";

/**
 * Local source health (spec §5.6 rule 3): 5 failures in a row mark a source down for 1 h; each time it goes down
 * again the wait grows to 4 h, then 8 h; one success heals it fully. Kept on the device; keyed by `repoId/pluginId`.
 */
export const DOWN_AFTER = 5;
export const HEAL_MS = [60 * 60_000, 4 * 60 * 60_000, 8 * 60 * 60_000];
const KEY = "srchealth.v1";

interface Entry {
  fails: number;
  level: number;
  downUntil: number;
}

/** Host failures that say something about the source — not "nothing for this title", not sandbox trouble. */
export function countsAgainstSource(reason: FailureReason): boolean {
  return reason === "timeout" || reason === "error" || reason === "bad-shape";
}

export class SourceHealth {
  constructor(
    private readonly storage: Pick<UniversalStorage, "getString" | "set">,
    private readonly now: () => number = Date.now,
  ) {}

  isDown(sourceId: string): boolean {
    return (this.read()[sourceId]?.downUntil ?? 0) > this.now();
  }

  record(sourceId: string, ok: boolean): void {
    const all = this.read();
    if (ok) {
      if (all[sourceId]) {
        delete all[sourceId];
        this.write(all);
      }
      return;
    }
    const e = all[sourceId] ?? { fails: 0, level: 0, downUntil: 0 };
    e.fails += 1;
    if (e.fails >= DOWN_AFTER) {
      e.downUntil = this.now() + HEAL_MS[Math.min(e.level, HEAL_MS.length - 1)];
      e.level += 1;
      e.fails = 0;
    }
    all[sourceId] = e;
    this.write(all);
  }

  private read(): Record<string, Entry> {
    try {
      return JSON.parse(this.storage.getString(KEY) ?? "{}") as Record<string, Entry>;
    } catch {
      return {};
    }
  }

  private write(all: Record<string, Entry>): void {
    this.storage.set(KEY, JSON.stringify(all));
  }
}
