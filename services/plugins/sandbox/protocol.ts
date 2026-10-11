/** Frames between the app (host), the sandbox page (document) and its per-call workers. JSON only. */
export const SANDBOX_PROTOCOL = 1;
export const MAX_RESULT_CHARS = 4 * 1024 * 1024;
export interface RunEnv { tmdbApiKey: string; settings: Record<string, unknown>; debug: boolean }
export interface FetchResultPayload { status: number; url: string; redirected: boolean; headers: Record<string, string>; body: string; encoding: "text" | "base64" }
export type HostFrame =
  | { t: "load"; key: string; source: string }
  | { t: "run"; id: string; key: string; args: unknown[]; env: RunEnv }
  | { t: "fetchResult"; id: string; reqId: number; ok: true; res: FetchResultPayload }
  | { t: "fetchResult"; id: string; reqId: number; ok: false; error: string; code: string }
  | { t: "kill"; id: string };
export type DocFrame =
  | { t: "ready"; protocol: number; csp: boolean }
  | { t: "fetch"; id: string; reqId: number; req: unknown }
  | { t: "done"; id: string; ok: true; result: unknown; ms: number }
  | { t: "done"; id: string; ok: false; error: string; ms: number }
  | { t: "log"; id: string; level: "log" | "warn" | "error"; msg: string };
