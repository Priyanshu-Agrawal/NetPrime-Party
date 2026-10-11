/**
 * Caps requests in flight per backend and overall (spec §5.4: playimdb/zevran's hostnames share one backend that
 * 429s under parallel load). A backend is approximated by its registrable domain.
 */
export class Limiter {
  private active = new Map<string, number>();
  private total = 0;
  private queue: { key: string; start: () => boolean }[] = [];

  constructor(private readonly perKey: number, private readonly overall: number) {}

  /** `alive` is asked when the task's turn comes: a task whose caller is gone is dropped without using a slot. */
  run<T>(key: string, task: () => Promise<T>, alive?: () => boolean): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        if (alive && !alive()) {
          reject(new Error("cancelled"));
          return false;
        }
        this.total++;
        this.active.set(key, (this.active.get(key) ?? 0) + 1);
        task()
          .then(resolve, reject)
          .finally(() => {
            this.total--;
            this.active.set(key, (this.active.get(key) ?? 1) - 1);
            this.pump();
          });
        return true;
      };
      this.queue.push({ key, start });
      this.pump();
    });
  }

  private pump(): void {
    for (let i = 0; i < this.queue.length && this.total < this.overall; ) {
      const next = this.queue[i];
      if ((this.active.get(next.key) ?? 0) < this.perKey) {
        this.queue.splice(i, 1);
        next.start(); // a dropped task frees nothing; the loop just moves on
      } else i++;
    }
  }
}

const TWO_LEVEL = new Set(["co", "com", "net", "org", "gov", "ac", "edu"]);
// Hosting where every tenant is a different backend: the tenant's label is part of the "domain".
const MULTI_TENANT = [
  "workers.dev", "pages.dev", "r2.dev", "github.io", "vercel.app", "netlify.app", "herokuapp.com", "onrender.com",
  "fly.dev", "appspot.com", "web.app", "firebaseapp.com", "glitch.me", "replit.app", "azurewebsites.net",
  "cloudfront.net", "b-cdn.net",
];

/** "a.b.example.co.uk" → "example.co.uk". No full suffix list: good enough to group one backend's hostnames. */
export function registrableDomain(host: string): string {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (/^\d+(\.\d+){3}$/.test(h) || h.includes(":")) return h;
  const tenant = MULTI_TENANT.find((s) => h.endsWith(`.${s}`));
  if (tenant) return h.split(".").slice(-(tenant.split(".").length + 1)).join(".");
  const parts = h.split(".");
  if (parts.length <= 2) return h;
  const twoLevel = parts[parts.length - 1].length === 2 && TWO_LEVEL.has(parts[parts.length - 2]);
  return parts.slice(twoLevel ? -3 : -2).join(".");
}
