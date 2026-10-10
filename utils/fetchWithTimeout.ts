/**
 * fetch() with an abort timeout + one automatic retry on transient network
 * failure. Prevents an indefinitely-hanging request from leaving the UI stuck on
 * a skeleton forever: a stalled request now aborts after `timeoutMs` and surfaces
 * as an error, which the TMDB callers turn into a tap-to-retry state.
 *
 * The timeout covers the whole body, not just the headers: expo/fetch (the global
 * fetch since SDK 56) resolves as soon as headers arrive and streams the body
 * afterwards, so the body is read here, inside the timed window, and handed back
 * as a fully-buffered Response.
 *
 * Only network/abort failures are retried — HTTP errors (4xx/5xx) return a
 * Response with `ok:false` for the caller to handle, and are never retried.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  {
    timeoutMs = 10000,
    retries = 1,
    backoffMs = 400,
  }: { timeoutMs?: number; retries?: number; backoffMs?: number } = {},
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      const body = await untilAborted(res.text(), controller.signal);
      return new Response(NULL_BODY_STATUSES.has(res.status) ? null : body, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      });
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Network request failed");
}

/** Statuses a Response may not carry a body for. */
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

/** Reject once the signal aborts, even if the fetch implementation leaves the body read hanging. */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error("Request timed out"));
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}
