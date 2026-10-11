/**
 * The sandbox page's only script (bundled by scripts/build-sandbox.mjs). It spawns one Worker per plugin call and
 * relays frames. A frame from a worker is attributed by which worker sent it, never by what the frame claims.
 */
import { MAX_RESULT_CHARS, SANDBOX_PROTOCOL, type HostFrame } from "./protocol";

declare const __WORKER_SOURCE__: string;

interface Page {
  ReactNativeWebView?: { postMessage(s: string): void };
  __bearoom?: (raw: string) => void;
}
const page = window as unknown as Page;

const bridge = page.ReactNativeWebView!;
const send = (m: unknown) => bridge.postMessage(JSON.stringify(m));
try {
  delete page.ReactNativeWebView; // defence in depth: plugin code runs in workers, which never see the page anyway
} catch {
  /* host object on some engines */
}

const workerUrl = URL.createObjectURL(new Blob([__WORKER_SOURCE__], { type: "text/javascript" }));
const sources = new Map<string, string>();
const workers = new Map<string, Worker>();

function finish(id: string): void {
  const w = workers.get(id);
  if (w) {
    w.terminate();
    workers.delete(id);
  }
}

function start(id: string, key: string, args: unknown[], env: unknown): void {
  const source = sources.get(key);
  if (source == null) return send({ t: "done", id, ok: false, error: "not-loaded", ms: 0 });
  let w: Worker;
  try {
    w = new Worker(workerUrl);
  } catch {
    return send({ t: "done", id, ok: false, error: "worker-failed", ms: 0 });
  }
  workers.set(id, w);
  w.onmessage = (e: MessageEvent) => {
    const f = e.data as { t?: string; reqId?: number; req?: unknown; level?: string; msg?: unknown; ok?: boolean; result?: unknown; error?: unknown; ms?: number };
    if (!f || typeof f !== "object" || !workers.has(id)) return;
    if (f.t === "fetch") send({ t: "fetch", id, reqId: f.reqId, req: f.req });
    else if (f.t === "log") send({ t: "log", id, level: f.level, msg: String(f.msg).slice(0, 2000) });
    else if (f.t === "done") {
      finish(id);
      let out = JSON.stringify(
        f.ok ? { t: "done", id, ok: true, result: f.result, ms: f.ms } : { t: "done", id, ok: false, error: String(f.error).slice(0, 500), ms: f.ms },
      );
      if (out.length > MAX_RESULT_CHARS) out = JSON.stringify({ t: "done", id, ok: false, error: "result-too-large", ms: f.ms });
      bridge.postMessage(out);
    }
  };
  w.onerror = (e: ErrorEvent) => {
    e.preventDefault();
    if (!workers.has(id)) return;
    finish(id);
    send({ t: "done", id, ok: false, error: `worker-error: ${String(e.message ?? "")}`.slice(0, 500), ms: 0 });
  };
  w.postMessage({ t: "run", source, args, env });
}

page.__bearoom = (raw: string) => {
  let m: HostFrame;
  try {
    m = JSON.parse(raw) as HostFrame;
  } catch {
    return;
  }
  if (m.t === "load") sources.set(m.key, m.source);
  else if (m.t === "kill") finish(m.id);
  else if (m.t === "fetchResult") workers.get(m.id)?.postMessage(m);
  else if (m.t === "run") start(m.id, m.key, m.args, m.env);
};

/** CSP self-check: a worker's real fetch of a data: URL must be refused. If it isn't, the host refuses to run plugins. */
function cspEnforced(): Promise<boolean> {
  return new Promise((resolve) => {
    const src =
      "try{fetch('data:text/plain,x').then(function(){postMessage('open')},function(){postMessage('blocked')})}catch(e){postMessage('blocked')}";
    let w: Worker;
    try {
      w = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
    } catch {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => {
      w.terminate();
      resolve(false);
    }, 5000);
    w.onmessage = (e: MessageEvent) => {
      clearTimeout(timer);
      w.terminate();
      resolve(e.data === "blocked");
    };
  });
}

void cspEnforced().then((csp) => send({ t: "ready", protocol: SANDBOX_PROTOCOL, csp }));
