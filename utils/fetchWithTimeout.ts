/**
 * fetch() with an abort timeout + one automatic retry on transient network
 * failure. Prevents an indefinitely-hanging request from leaving the UI stuck on
 * a skeleton forever: a stalled request now aborts after `timeoutMs` and surfaces
 * as an error, which the TMDB callers turn into a tap-to-retry state.
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
      return await fetch(url, { ...init, signal: controller.signal });
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
