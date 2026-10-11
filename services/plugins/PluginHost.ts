import type { LoadedPlugin } from "./registry";
import type { PluginStream } from "./streams";

/**
 * Asks every loaded plugin for a title's streams within the spec's budgets (§5.4, Cove): ≤ 12 at once, 15 s each,
 * 20 s overall; returns early once ≥ 3 streams arrived and 1.2 s passed with nothing new. Plugins still running then
 * finish into a 15-minute per-title cache. Failures are never cached, and an empty answer in under 100 ms counts as
 * one (a silent contract break, e.g. a missing global).
 */
export interface ResolveRequest {
  tmdbId: string;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
}

export type FailureReason = "timeout" | "error" | "bad-shape" | "empty-fast" | "unsafe" | "not-ready" | "crashed";

export interface PluginFailure {
  pluginKey: string;
  reason: FailureReason;
  detail?: string;
  ms: number;
}

export interface HostResult {
  streams: PluginStream[];
  failures: PluginFailure[];
  /** Plugins started for this call (cached answers are not listed). */
  ran: string[];
  /** True when every plugin answered before the call returned. */
  complete: boolean;
}

export const BUDGET = {
  parallel: 12,
  perPluginMs: 15_000,
  overallMs: 20_000,
  earlyCount: 3,
  earlyIdleMs: 1_200,
  cacheMs: 15 * 60_000,
  emptyFastMs: 100,
} as const;

export interface HostDeps {
  /** Overrides for this host only (the dev scorecard waits for every plugin: no early return). */
  budget?: Partial<Record<keyof typeof BUDGET, number>>;
  plugins(): LoadedPlugin[];
  run(plugin: LoadedPlugin, req: ResolveRequest, timeoutMs: number): Promise<unknown>;
  normalise(plugin: LoadedPlugin, raw: unknown): PluginStream[] | null;
  now(): number;
}

export function titleKey(req: ResolveRequest): string {
  return req.type === "movie" ? `movie:${req.tmdbId}` : `tv:${req.tmdbId}:${req.season ?? 0}:${req.episode ?? 0}`;
}

const SANDBOX_REASONS = new Set<FailureReason>(["timeout", "unsafe", "not-ready", "crashed"]);

function reasonOf(e: unknown): FailureReason {
  const code = (e as { code?: unknown })?.code;
  return typeof code === "string" && SANDBOX_REASONS.has(code as FailureReason) ? (code as FailureReason) : "error";
}

export class PluginHost {
  private cache = new Map<string, { at: number; streams: PluginStream[] }>();
  /** Runs still going, by title|plugin: a second request joins one instead of running the plugin again. */
  private inflight = new Map<string, Promise<PluginStream[] | PluginFailure>>();

  private readonly budget: { [K in keyof typeof BUDGET]: number };

  constructor(private readonly deps: HostDeps) {
    this.budget = { ...BUDGET, ...deps.budget };
  }

  getStreams(
    req: ResolveRequest,
    opts: {
      onStreams?(pluginKey: string, streams: PluginStream[]): void;
      /** Once per plugin run, when it settles — also after the call returned early. No failure = it answered. */
      onSettled?(pluginKey: string, failure?: PluginFailure): void;
    } = {},
  ): Promise<HostResult> {
    const title = titleKey(req);
    const plugins = this.deps.plugins().filter((p) => p.supportedTypes.includes(req.type));
    const streams: PluginStream[] = [];
    const failures: PluginFailure[] = [];
    const ran: string[] = [];
    return new Promise<HostResult>((resolve) => {
      let finished = false;
      let settled = 0;
      let idle: ReturnType<typeof setTimeout> | undefined;
      const finish = (complete: boolean) => {
        if (finished) return;
        finished = true;
        clearTimeout(overall);
        clearTimeout(idle);
        resolve({ streams: [...streams], failures: [...failures], ran: [...ran], complete });
      };
      const overall = setTimeout(() => finish(false), this.budget.overallMs);
      const add = (p: LoadedPlugin, list: PluginStream[]) => {
        if (finished || !list.length) return;
        streams.push(...list);
        opts.onStreams?.(p.key, list);
        if (streams.length >= this.budget.earlyCount) {
          clearTimeout(idle);
          idle = setTimeout(() => finish(false), this.budget.earlyIdleMs);
        }
      };
      const settle = () => {
        if (++settled === plugins.length) finish(true);
      };
      if (!plugins.length) {
        finish(true);
        return;
      }
      // A fresh cache entry or a run already going (another caller's) answers for this plugin. Checked again when a
      // queued plugin gets its slot: another caller may have started it meanwhile. Joined runs report health to the
      // caller that started them only (once per run).
      const reuse = (p: LoadedPlugin): boolean => {
        const hit = this.cache.get(`${title}|${p.key}`);
        if (hit && this.deps.now() - hit.at < this.budget.cacheMs) {
          add(p, hit.streams);
          settle();
          return true;
        }
        const shared = this.inflight.get(`${title}|${p.key}`);
        if (!shared) return false;
        void shared.then((out) => {
          if (Array.isArray(out)) add(p, out);
          else failures.push(out);
          settle();
        });
        return true;
      };
      const queue = plugins.filter((p) => !reuse(p));
      let inFlight = 0;
      const pump = () => {
        while (inFlight < this.budget.parallel && queue.length) {
          const p = queue.shift()!;
          if (reuse(p)) continue;
          inFlight++;
          ran.push(p.key);
          void this.runOne(p, req, title, failures, add, opts.onSettled).finally(() => {
            inFlight--;
            settle();
            pump();
          });
        }
      };
      pump();
    });
  }

  clearCache(): void {
    this.cache.clear();
    this.inflight.clear(); // a fresh resolve (F6: new tokens) must not join an older run
  }

  private async runOne(
    p: LoadedPlugin,
    req: ResolveRequest,
    title: string,
    failures: PluginFailure[],
    add: (p: LoadedPlugin, list: PluginStream[]) => void,
    onSettled?: (pluginKey: string, failure?: PluginFailure) => void,
  ): Promise<void> {
    const key = `${title}|${p.key}`;
    const outcome = this.attempt(p, req, title);
    this.inflight.set(key, outcome);
    try {
      const out = await outcome;
      if (Array.isArray(out)) {
        add(p, out);
        onSettled?.(p.key);
      } else {
        failures.push(out);
        onSettled?.(out.pluginKey, out);
      }
    } finally {
      if (this.inflight.get(key) === outcome) this.inflight.delete(key);
    }
  }

  /** One plugin run: its streams (cached), or why it failed. Never rejects. */
  private async attempt(p: LoadedPlugin, req: ResolveRequest, title: string): Promise<PluginStream[] | PluginFailure> {
    const started = this.deps.now();
    try {
      const raw = await this.deps.run(p, req, this.budget.perPluginMs);
      const ms = this.deps.now() - started;
      const list = this.deps.normalise(p, raw);
      if (list === null) return { pluginKey: p.key, reason: "bad-shape", ms };
      if (list.length === 0 && ms < this.budget.emptyFastMs) return { pluginKey: p.key, reason: "empty-fast", ms };
      this.cache.set(`${title}|${p.key}`, { at: this.deps.now(), streams: list });
      return list;
    } catch (e) {
      return { pluginKey: p.key, reason: reasonOf(e), detail: String((e as Error)?.message ?? e).slice(0, 200), ms: this.deps.now() - started };
    }
  }
}
