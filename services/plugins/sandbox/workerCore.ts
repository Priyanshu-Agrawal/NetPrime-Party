/**
 * Runs inside a fresh Web Worker per plugin call (spec §5.4). It touches nothing but what it is given, so jest can run
 * it with fakes; the worker entry wires `io` to postMessage and passes the worker global as `scope`.
 */
import type { FetchResultPayload, RunEnv } from "./protocol";

export interface ShimRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  redirect: "follow" | "manual" | "error";
  responseType: "text";
}

export interface WorkerIo {
  fetch(req: ShimRequest): Promise<FetchResultPayload>;
  log(level: "log" | "warn" | "error", msg: string): void;
}

export interface Libs {
  cheerio: unknown;
  CryptoJS: unknown;
}

export class ShimHeaders {
  private map = new Map<string, string>();

  constructor(init?: Record<string, string>) {
    if (init) for (const [k, v] of Object.entries(init)) this.map.set(k.toLowerCase(), String(v));
  }
  get(name: string): string | null {
    return this.map.get(String(name).toLowerCase()) ?? null;
  }
  has(name: string): boolean {
    return this.map.has(String(name).toLowerCase());
  }
  set(name: string, value: string): void {
    this.map.set(String(name).toLowerCase(), String(value));
  }
  append(name: string, value: string): void {
    const k = String(name).toLowerCase();
    const prev = this.map.get(k);
    this.map.set(k, prev != null ? `${prev}, ${value}` : String(value));
  }
  delete(name: string): void {
    this.map.delete(String(name).toLowerCase());
  }
  forEach(cb: (value: string, key: string) => void): void {
    this.map.forEach((v, k) => cb(v, k));
  }
  entries() {
    return this.map.entries();
  }
  keys() {
    return this.map.keys();
  }
  values() {
    return this.map.values();
  }
  [Symbol.iterator]() {
    return this.map.entries();
  }
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buf = 0;
  let bits = 0;
  let j = 0;
  for (const ch of clean) {
    buf = (buf << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (buf >> bits) & 0xff;
    }
  }
  return out.subarray(0, j);
}

function utf8Bytes(s: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s);
  return Uint8Array.from(unescape(encodeURIComponent(s)), (c) => c.charCodeAt(0));
}

function utf8Text(b: Uint8Array): string {
  if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(b);
  return decodeURIComponent(escape(String.fromCharCode(...b)));
}

export function makeResponse(p: FetchResultPayload) {
  const bytes = () => (p.encoding === "base64" ? base64ToBytes(p.body) : utf8Bytes(p.body));
  const text = () => (p.encoding === "base64" ? utf8Text(base64ToBytes(p.body)) : p.body);
  return {
    ok: p.status >= 200 && p.status < 300,
    status: p.status,
    statusText: "",
    url: p.url,
    redirected: p.redirected,
    type: "basic" as const,
    bodyUsed: false,
    headers: new ShimHeaders(p.headers),
    text: async () => text(),
    json: async () => JSON.parse(text()) as unknown,
    arrayBuffer: async () => {
      const b = bytes();
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    },
    clone: () => makeResponse(p),
  };
}

function headerRecord(init: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!init) return out;
  if (Array.isArray(init)) {
    for (const pair of init) if (Array.isArray(pair) && pair.length >= 2) out[String(pair[0])] = String(pair[1]);
    return out;
  }
  if (typeof (init as { forEach?: unknown }).forEach === "function") {
    (init as { forEach(cb: (v: unknown, k: string) => void): void }).forEach((v, k) => {
      out[k] = String(v);
    });
    return out;
  }
  if (typeof init === "object") {
    for (const [k, v] of Object.entries(init as Record<string, unknown>)) if (v != null) out[k] = String(v);
  }
  return out;
}

const abortError = () => Object.assign(new Error("The operation was aborted."), { name: "AbortError" });

export function makeFetch(io: WorkerIo) {
  return function fetch(input: unknown, init: Record<string, unknown> = {}): Promise<ReturnType<typeof makeResponse>> {
    const asRequest = input as { url?: unknown; headers?: unknown };
    const url = typeof input === "string" ? input : typeof asRequest?.url === "string" ? asRequest.url : String(input);
    const headers = headerRecord(init.headers ?? asRequest?.headers);
    let body: string | undefined;
    if (init.body != null) {
      if (typeof init.body === "string") body = init.body;
      else if (typeof URLSearchParams !== "undefined" && init.body instanceof URLSearchParams) {
        body = init.body.toString();
        if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) {
          headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
        }
      } else return Promise.reject(new TypeError("Unsupported request body"));
    }
    const req: ShimRequest = {
      url,
      method: String(init.method ?? "GET").toUpperCase(),
      headers,
      body,
      redirect: init.redirect === "manual" || init.redirect === "error" ? init.redirect : "follow",
      responseType: "text",
    };
    const signal = init.signal as { aborted?: boolean; addEventListener?: (t: string, cb: () => void) => void } | undefined;
    if (signal?.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      signal?.addEventListener?.("abort", () => reject(abortError()));
      io.fetch(req).then(
        (p) => resolve(makeResponse(p)),
        (e: unknown) => reject(e instanceof TypeError ? e : new TypeError((e as Error)?.message ?? "fetch failed")),
      );
    });
  };
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

function makeConsole(io: WorkerIo, debug: boolean) {
  const send =
    (level: "log" | "warn" | "error") =>
    (...args: unknown[]) => {
      if (debug) io.log(level, args.map((a) => (typeof a === "string" ? a : safeJson(a))).join(" ").slice(0, 2000));
    };
  return { log: send("log"), info: send("log"), debug: send("log"), warn: send("warn"), error: send("error") };
}

/** A plugin's answer as plain JSON data; cycles, throwing getters and the like fail here, inside its own call. */
export function serialiseResult(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value ?? null)) as unknown;
}

const CHEERIO_NAMES = new Set(["cheerio", "cheerio/slim", "cheerio-without-node-native", "react-native-cheerio"]);

export async function runPlugin(
  source: string,
  args: unknown[],
  env: RunEnv,
  io: WorkerIo,
  libs: Libs,
  scope: Record<string, unknown> = {},
): Promise<unknown> {
  const fetch = makeFetch(io);
  const console = makeConsole(io, env.debug);
  const globals: Record<string, unknown> = {
    fetch,
    console,
    TMDB_API_KEY: env.tmdbApiKey,
    SCRAPER_SETTINGS: env.settings,
    CryptoJS: libs.CryptoJS,
    cheerio: libs.cheerio,
  };
  for (const [k, v] of Object.entries(globals)) {
    try {
      Object.defineProperty(scope, k, { value: v, configurable: true, writable: true });
    } catch {
      /* a frozen scope only loses the globalThis.X spelling; the bare names below still work */
    }
  }
  const require = (name: string) => {
    if (CHEERIO_NAMES.has(name)) return libs.cheerio;
    if (name === "crypto-js") return libs.CryptoJS;
    throw new Error(`Cannot find module '${name}'`);
  };
  const module = { exports: {} as Record<string, unknown> };
  const names = ["module", "exports", "require", ...Object.keys(globals)];
  const factory = new Function(...names, `${source}\n;return typeof getStreams === "function" ? getStreams : undefined;`);
  const loose: unknown = factory(module, module.exports, require, ...Object.values(globals));
  const exported = module.exports as { getStreams?: unknown; default?: { getStreams?: unknown } };
  const fn =
    typeof exported.getStreams === "function"
      ? exported.getStreams
      : typeof exported.default?.getStreams === "function"
        ? exported.default.getStreams
        : loose;
  if (typeof fn !== "function") throw new Error("Plugin has no getStreams");
  return await (fn as (...a: unknown[]) => unknown)(...args);
}
