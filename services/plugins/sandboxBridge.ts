import { SANDBOX_PROTOCOL, type DocFrame, type FetchResultPayload, type HostFrame, type RunEnv } from "./sandbox/protocol";

/**
 * The app's side of the plugin sandbox (spec §5.4): queues calls until the page is ready, loads each plugin's source
 * once per page, runs calls with a deadline, answers the workers' fetches, and recovers from a dead or stuck page.
 */
export type SandboxErrorCode = "timeout" | "not-ready" | "crashed" | "plugin" | "unsafe";

export class SandboxError extends Error {
  code: SandboxErrorCode;
  constructor(code: SandboxErrorCode, message: string) {
    super(message);
    this.name = "SandboxError";
    this.code = code;
  }
}

export interface SandboxPlugin {
  key: string;
  source: string;
}

export interface SandboxState {
  attached: boolean;
  ready: boolean;
  csp: boolean;
  generation: number;
  running: number;
}

export interface BridgeDeps {
  /** `alive` stays true while the call that asked is running. */
  onFetch(pluginKey: string, req: unknown, alive: () => boolean): Promise<FetchResultPayload>;
  onLog?(pluginKey: string, level: string, msg: string): void;
}

export const READY_TIMEOUT_MS = 15_000;
/** After a kill the page must answer a ping this fast, or it is replaced (a stuck page, not a slow plugin). */
export const PING_TIMEOUT_MS = 2_000;
/** Per plugin call: how many fetches, and how many response characters in total (one call can't flood the app). */
export const MAX_FETCHES_PER_CALL = 150;
export const MAX_CALL_BYTES = 32 * 1024 * 1024;

/** A frame as a script for WebView.injectJavaScript (U+2028/2029 escaped so the literal always parses). */
export function frameScript(frame: HostFrame): string {
  const literal = JSON.stringify(JSON.stringify(frame)).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return `window.__bearoom&&window.__bearoom(${literal});true;`;
}

interface Call {
  pluginKey: string;
  fetches: number;
  bytes: number;
  resolve(v: unknown): void;
  reject(e: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

interface Waiter {
  resolve(): void;
  reject(e: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

export class SandboxBridge {
  private inject: ((js: string) => void) | null = null;
  private ready = false;
  private csp = false;
  private generation = 0;
  private loaded = new Set<string>();
  private calls = new Map<string, Call>();
  private waiters = new Set<Waiter>();
  private seq = 0;
  private pingSeq = 0;
  private pingTimer: ReturnType<typeof setTimeout> | null = null;
  private restart: () => void = () => {};
  private listeners = new Set<() => void>();
  private snapshot: SandboxState = { attached: false, ready: false, csp: false, generation: 0, running: 0 };

  constructor(private readonly deps: BridgeDeps) {}

  setRestartHandler(fn: () => void): void {
    this.restart = fn;
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getState = (): SandboxState => this.snapshot;

  /** A freshly mounted page; it announces `ready` when its CSP check is done. */
  attach(inject: (js: string) => void): void {
    this.clearPing();
    this.inject = inject;
    this.ready = false;
    this.csp = false;
    this.loaded.clear();
    this.generation++;
    this.failCalls("crashed", "The sandbox page was replaced");
    this.emit();
  }

  detach(): void {
    this.clearPing();
    this.inject = null;
    this.ready = false;
    this.loaded.clear();
    this.failCalls("crashed", "The sandbox went away");
    this.emit();
  }

  /** The page's process died (Android renderer gone / iOS content process terminated): drop it and mount a new one. */
  crashed(): void {
    this.detach();
    this.restart();
  }

  onMessage(raw: string): void {
    let m: DocFrame;
    try {
      m = JSON.parse(raw) as DocFrame;
    } catch {
      return;
    }
    if (m.t === "ready") {
      this.ready = m.protocol === SANDBOX_PROTOCOL;
      this.csp = m.csp === true;
      if (this.ready) {
        for (const w of this.waiters) {
          clearTimeout(w.timer);
          w.resolve();
        }
        this.waiters.clear();
      }
      this.emit();
      return;
    }
    if (m.t === "pong") {
      if (m.n === this.pingSeq) this.clearPing();
      return;
    }
    const call = this.calls.get(m.id);
    if (!call) return;
    if (m.t === "fetch") {
      const { id, reqId } = m;
      if (++call.fetches > MAX_FETCHES_PER_CALL) {
        this.send({ t: "fetchResult", id, reqId, ok: false, error: "Fetch budget exceeded", code: "budget" });
        return;
      }
      this.deps.onFetch(call.pluginKey, m.req, () => this.calls.has(id)).then(
        (res) => {
          call.bytes += res.body.length;
          if (call.bytes > MAX_CALL_BYTES) this.send({ t: "fetchResult", id, reqId, ok: false, error: "Byte budget exceeded", code: "budget" });
          else this.send({ t: "fetchResult", id, reqId, ok: true, res });
        },
        (e: Error & { code?: string }) =>
          this.send({ t: "fetchResult", id, reqId, ok: false, error: e?.message ?? "fetch failed", code: e?.code ?? "network" }),
      );
    } else if (m.t === "log") {
      this.deps.onLog?.(call.pluginKey, m.level, m.msg);
    } else if (m.t === "done") {
      this.calls.delete(m.id);
      clearTimeout(call.timer);
      if (m.ok) call.resolve(m.result);
      else call.reject(new SandboxError("plugin", m.error));
      this.emit();
    }
  }

  async run(plugin: SandboxPlugin, args: unknown[], env: RunEnv, timeoutMs: number): Promise<unknown> {
    await this.whenReady();
    if (!this.csp) throw new SandboxError("unsafe", "The sandbox does not block direct network; refusing to run plugins");
    if (!this.loaded.has(plugin.key)) {
      this.send({ t: "load", key: plugin.key, source: plugin.source });
      this.loaded.add(plugin.key);
    }
    const id = `c${++this.seq}`;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => this.expire(id), timeoutMs);
      this.calls.set(id, { pluginKey: plugin.key, fetches: 0, bytes: 0, resolve, reject, timer });
      this.send({ t: "run", id, key: plugin.key, args, env });
      this.emit();
    });
  }

  private whenReady(): Promise<void> {
    if (this.ready) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          this.waiters.delete(waiter);
          reject(new SandboxError("not-ready", "The sandbox did not start"));
          // A page that never announced itself is stuck: replace it (once, for every waiter that gives up).
          if (!this.ready && this.inject) this.crashed();
        }, READY_TIMEOUT_MS),
      };
      this.waiters.add(waiter);
    });
  }

  private expire(id: string): void {
    const call = this.calls.get(id);
    if (!call) return;
    this.calls.delete(id);
    this.send({ t: "kill", id });
    call.reject(new SandboxError("timeout", "The plugin took too long"));
    this.emit();
    this.checkAlive();
  }

  /** A killed worker can't hang the page, but a page can still get stuck: ask it, and replace it if it is silent. */
  private checkAlive(): void {
    if (this.pingTimer) return;
    const n = ++this.pingSeq;
    this.pingTimer = setTimeout(() => {
      this.pingTimer = null;
      this.crashed();
    }, PING_TIMEOUT_MS);
    this.send({ t: "ping", n });
  }

  private clearPing(): void {
    if (this.pingTimer) clearTimeout(this.pingTimer);
    this.pingTimer = null;
  }

  private failCalls(code: SandboxErrorCode, message: string): void {
    for (const c of this.calls.values()) {
      clearTimeout(c.timer);
      c.reject(new SandboxError(code, message));
    }
    this.calls.clear();
  }

  private send(frame: HostFrame): void {
    this.inject?.(frameScript(frame));
  }

  private emit(): void {
    this.snapshot = { attached: this.inject !== null, ready: this.ready, csp: this.csp, generation: this.generation, running: this.calls.size };
    this.listeners.forEach((l) => l());
  }
}
