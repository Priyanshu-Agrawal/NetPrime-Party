import { NativeFetchError, type NativeRequest, type NativeResponse } from "@/modules/bearoom-fetch";
import type { CookieJar } from "./cookieJar";
import { registrableDomain, type Limiter } from "./limiter";
import { checkUrl, cleanHeaders, hasHeader, withoutHeader } from "./urlGuard";

/**
 * A plugin's fetch (spec §5.4): walks redirects itself so every hop is re-checked (public addresses only), keeps the
 * plugin's own cookie jar, never carries credentials to another host, and routes direct TMDB calls through the app's
 * proxy (TMDB is blocked on Indian networks).
 */
export interface PluginFetchRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  redirect?: "follow" | "manual" | "error";
  responseType?: "text" | "base64";
}

export interface PluginFetchResponse {
  status: number;
  url: string;
  redirected: boolean;
  headers: Record<string, string>;
  body: string;
  encoding: "text" | "base64";
  sha256: string;
}

export type PluginFetchErrorCode = "blocked" | "timeout" | "network" | "too-large" | "redirects" | "bad-request";

export class PluginFetchError extends Error {
  code: PluginFetchErrorCode;
  constructor(code: PluginFetchErrorCode, message: string) {
    super(message);
    this.name = "PluginFetchError";
    this.code = code;
  }
}

export interface PluginFetchDeps {
  fetchOnce: (req: NativeRequest) => Promise<NativeResponse>;
  limiter: Limiter;
  /** The app's TMDB proxy, e.g. "https://tmdb.example.workers.dev/". */
  tmdbProxyBase: string;
}

export const MAX_HOPS = 5;
export const REQUEST_TIMEOUT_MS = 8000;
export const MAX_BODY_BYTES = 20 * 1024 * 1024;
const TMDB_API_HOST = "api.themoviedb.org";
const MAX_REQUEST_BODY = 1024 * 1024;
const METHODS = new Set(["GET", "POST", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"]);

const NATIVE_TO_PLUGIN: Record<NativeFetchError["code"], PluginFetchErrorCode> = {
  ERR_BLOCKED_ADDRESS: "blocked",
  ERR_TIMEOUT: "timeout",
  ERR_BAD_REQUEST: "bad-request",
  ERR_NETWORK: "network",
};

/** A direct TMDB API call goes to the proxy instead; the proxy holds the token, so `api_key` is dropped. */
export function rewriteTmdb(url: URL, proxyBase: string): URL {
  if (url.hostname !== TMDB_API_HOST) return url;
  const out = new URL(proxyBase.replace(/\/$/, "") + url.pathname.replace(/^\/3(?=\/|$)/, ""));
  url.searchParams.forEach((v, k) => {
    if (k !== "api_key") out.searchParams.append(k, v);
  });
  return out;
}

/** `alive`: the sandbox call that asked is still running; a request it queued is dropped once it isn't. */
export async function pluginFetch(
  jar: CookieJar,
  req: PluginFetchRequest,
  deps: PluginFetchDeps,
  alive?: () => boolean,
): Promise<PluginFetchResponse> {
  let method = (req.method ?? "GET").toUpperCase();
  let body = req.body;
  let headers = cleanHeaders(req.headers ?? {});
  let current = req.url;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const verdict = checkUrl(current);
    if (!verdict.ok) throw new PluginFetchError("blocked", `Blocked URL (${verdict.reason})`);
    const target = rewriteTmdb(verdict.url, deps.tmdbProxyBase).toString();
    const send = { ...headers };
    if (!hasHeader(send, "cookie")) {
      const fromJar = jar.header(target);
      if (fromJar) send.Cookie = fromJar;
    }
    let res: NativeResponse;
    // The app's own TMDB proxy is not a plugin backend: it never waits behind one (most plugins call TMDB first).
    const viaProxy = target !== verdict.url.toString();
    try {
      const exchange = () =>
        deps.fetchOnce({
          url: target,
          method,
          headers: send,
          body,
          timeoutMs: REQUEST_TIMEOUT_MS,
          maxBytes: MAX_BODY_BYTES,
          responseType: req.responseType ?? "text",
        });
      if (alive && !alive()) throw new Error("cancelled");
      res = viaProxy ? await exchange() : await deps.limiter.run(registrableDomain(new URL(target).hostname), exchange, alive);
    } catch (e) {
      if (e instanceof NativeFetchError) throw new PluginFetchError(NATIVE_TO_PLUGIN[e.code], e.message);
      throw new PluginFetchError("network", (e as Error)?.message ?? "fetch failed");
    }
    if (res.truncated) throw new PluginFetchError("too-large", "Response over 20 MiB");
    jar.store(res.cookies);
    const location = res.headers.location;
    const isRedirect = res.status >= 300 && res.status < 400 && res.status !== 304 && !!location;
    if (!isRedirect || req.redirect === "manual") {
      return { status: res.status, url: current, redirected: hop > 0, headers: res.headers, body: res.body, encoding: res.encoding, sha256: res.sha256 };
    }
    if (req.redirect === "error") throw new PluginFetchError("redirects", "Redirect not allowed");
    const next = new URL(location, current).toString();
    // 303 → GET; 301/302 after POST → GET (what browsers do); 307/308 keep the method and body.
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) {
      method = "GET";
      body = undefined;
      headers = withoutHeader(headers, "content-type");
    }
    if (new URL(next).hostname !== new URL(current).hostname) {
      headers = withoutHeader(withoutHeader(headers, "authorization"), "cookie");
    }
    current = next;
  }
  throw new PluginFetchError("redirects", "Too many redirects");
}

/** What a sandbox worker sent, checked field by field (it is untrusted). */
export function toPluginFetchRequest(v: unknown): PluginFetchRequest {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  if (typeof o.url !== "string" || o.url.length > 8192) throw new PluginFetchError("bad-request", "Bad URL");
  const method = typeof o.method === "string" ? o.method.toUpperCase() : "GET";
  if (!METHODS.has(method)) throw new PluginFetchError("bad-request", `Method ${method} not allowed`);
  const headers: Record<string, string> = {};
  if (o.headers && typeof o.headers === "object") {
    for (const [k, val] of Object.entries(o.headers as Record<string, unknown>)) if (typeof val === "string") headers[k] = val;
  }
  if (typeof o.body === "string" && o.body.length > MAX_REQUEST_BODY) throw new PluginFetchError("bad-request", "Request body over 1 MiB");
  return {
    url: o.url,
    method,
    headers,
    body: typeof o.body === "string" ? o.body : undefined,
    redirect: o.redirect === "manual" || o.redirect === "error" ? o.redirect : "follow",
    responseType: o.responseType === "base64" ? "base64" : "text",
  };
}
