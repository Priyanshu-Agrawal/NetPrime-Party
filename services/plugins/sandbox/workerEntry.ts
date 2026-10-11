/**
 * The body of every per-call Worker (bundled by scripts/build-sandbox.mjs). Ambient network and storage are removed
 * before plugin code exists; the only way out is the captured `post`, which the document attributes to this call.
 */
import type { FetchResultPayload, RunEnv } from "./protocol";
import { runPlugin, serialiseResult, type ShimRequest, type WorkerIo } from "./workerCore";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const cheerio: unknown = require("cheerio/slim");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CryptoJS: unknown = require("crypto-js");

interface WorkerScope {
  postMessage(m: unknown): void;
  addEventListener(type: "message", cb: (e: { data: unknown }) => void): void;
}
const scope = globalThis as unknown as WorkerScope & Record<string, unknown>;

const post = scope.postMessage.bind(scope);
const pending = new Map<number, { resolve(p: FetchResultPayload): void; reject(e: Error): void }>();
let nextReq = 1;

const io: WorkerIo = {
  fetch: (req: ShimRequest) =>
    new Promise((resolve, reject) => {
      const reqId = nextReq++;
      pending.set(reqId, { resolve, reject });
      post({ t: "fetch", reqId, req });
    }),
  log: (level, msg) => post({ t: "log", level, msg }),
};

type Inbound =
  | { t: "fetchResult"; reqId: number; ok: true; res: FetchResultPayload }
  | { t: "fetchResult"; reqId: number; ok: false; error: string; code: string }
  | { t: "run"; source: string; args: unknown[]; env: RunEnv };

scope.addEventListener("message", (e) => {
  const m = e.data as Inbound;
  if (m?.t === "fetchResult") {
    const p = pending.get(m.reqId);
    if (!p) return;
    pending.delete(m.reqId);
    if (m.ok) p.resolve(m.res);
    else p.reject(Object.assign(new TypeError(m.error || "fetch failed"), { code: m.code }));
  } else if (m?.t === "run") {
    void execute(m.source, m.args, m.env);
  }
});

const BLOCKED = [
  "fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "Worker", "SharedWorker",
  "BroadcastChannel", "indexedDB", "caches", "WebTransport", "RTCPeerConnection", "postMessage", "close",
];
for (const name of BLOCKED) {
  try {
    Object.defineProperty(scope, name, { value: undefined, configurable: true, writable: true });
  } catch {
    /* absent in this engine */
  }
}

async function execute(source: string, args: unknown[], env: RunEnv): Promise<void> {
  const started = Date.now();
  let frame: unknown;
  try {
    const result = await runPlugin(source, args, env, io, { cheerio, CryptoJS }, scope);
    frame = { t: "done", ok: true, result: serialiseResult(result), ms: Date.now() - started };
  } catch (err) {
    frame = { t: "done", ok: false, error: String((err as Error)?.message ?? err).slice(0, 500), ms: Date.now() - started };
  }
  post(frame);
}
