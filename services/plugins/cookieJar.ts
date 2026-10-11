import type { NativeCookie } from "@/modules/bearoom-fetch";

const MAX_COOKIES = 300;

/**
 * One plugin's cookies (spec §5.4): plugins never share cookies with each other, with the app or with the system
 * store. In memory only — they matter for one resolve and the stream it yields.
 */
export class CookieJar {
  private cookies: NativeCookie[] = [];

  constructor(private readonly now: () => number = Date.now) {}

  store(list: NativeCookie[]): void {
    for (const raw of list) {
      const c = { ...raw, domain: raw.domain.toLowerCase().replace(/^\./, "") };
      this.cookies = this.cookies.filter((o) => !(o.name === c.name && o.domain === c.domain && o.path === c.path));
      if (c.expiresAt !== 0 && c.expiresAt <= this.now()) continue; // an expired Set-Cookie deletes
      this.cookies.push(c);
    }
    if (this.cookies.length > MAX_COOKIES) this.cookies = this.cookies.slice(-MAX_COOKIES);
  }

  /** The Cookie header for a request to `url`, or undefined. */
  header(url: string): string | undefined {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return undefined;
    }
    const host = u.hostname.toLowerCase();
    const path = u.pathname || "/";
    const now = this.now();
    const hits = this.cookies.filter(
      (c) =>
        (c.expiresAt === 0 || c.expiresAt > now) &&
        (c.hostOnly ? host === c.domain : host === c.domain || host.endsWith(`.${c.domain}`)) &&
        pathMatches(path, c.path) &&
        (!c.secure || u.protocol === "https:"),
    );
    hits.sort((a, b) => b.path.length - a.path.length); // RFC 6265 §5.4: longer paths first
    return hits.length ? hits.map((c) => `${c.name}=${c.value}`).join("; ") : undefined;
  }

  size(): number {
    return this.cookies.length;
  }
}

function pathMatches(reqPath: string, cookiePath: string): boolean {
  if (reqPath === cookiePath) return true;
  if (!reqPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith("/") || reqPath[cookiePath.length] === "/";
}
