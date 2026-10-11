/**
 * Dev-only proof, on a real device, that the plugin host's protections hold (spec §8). Every case runs through the
 * real sandbox page, bridge and BearoomFetch; the expectations are pure so jest pins them. Uses public echo services
 * (httpbin.org, nip.io, example.com) — never anything of the user's.
 */
export type Outcome = { ok: true; value: unknown } | { ok: false; code?: string; message: string };

export interface SelfTestCase {
  name: string;
  source: string;
  timeoutMs?: number;
  /** null = pass, else what went wrong. */
  check(o: Outcome): string | null;
}

export interface SelfTestResult {
  name: string;
  pass: boolean;
  detail: string;
  ms: number;
}

const plugin = (body: string) => `module.exports = { getStreams: async () => { ${body} } };`;
const explain = (o: Outcome) => (o.ok ? `got ${String(JSON.stringify(o.value)).slice(0, 160)}` : `${o.code ?? "error"}: ${o.message}`);
const blocked = (o: Outcome) => (o.ok && /^refused: .*blocked/i.test(String(o.value)) ? null : explain(o));
const equals = (want: unknown) => (o: Outcome) => (o.ok && JSON.stringify(o.value) === JSON.stringify(want) ? null : explain(o));
const refuse = (url: string) => plugin(`return fetch(${JSON.stringify(url)}).then(() => "reached", (e) => "refused: " + e.message);`);

export const SELF_TEST: SelfTestCase[] = [
  {
    name: "Network and storage globals are gone",
    source: plugin(
      `return ["XMLHttpRequest","WebSocket","EventSource","importScripts","indexedDB","caches","Worker","ReactNativeWebView"]` +
        `.map((n) => n + ":" + typeof self[n]);`,
    ),
    check: (o) => {
      if (!o.ok || !Array.isArray(o.value)) return explain(o);
      const left = (o.value as string[]).filter((s) => !s.endsWith(":undefined"));
      return left.length ? `still there: ${left.join(", ")}` : null;
    },
  },
  {
    name: "cheerio and CryptoJS work",
    source: plugin(`const $ = require("cheerio").load("<p class=a>hi</p>"); return [$("p.a").text(), CryptoJS.MD5("a").toString()];`),
    check: equals(["hi", "0cc175b9c0f1b6a831c399e269772661"]),
  },
  { name: "A private IP is refused", source: refuse("http://192.168.1.1/"), check: blocked },
  { name: "A name that resolves to a private address is refused", source: refuse("http://127.0.0.1.nip.io/"), check: blocked },
  { name: "A redirect to a private address is refused", source: refuse("https://httpbin.org/redirect-to?url=http%3A%2F%2F10.0.0.1%2F"), check: blocked },
  {
    name: "redirect: manual hands back the 3xx",
    source: plugin(
      `const r = await fetch("https://httpbin.org/redirect-to?url=https%3A%2F%2Fexample.com%2F", { redirect: "manual" }); return [r.status, r.headers.get("location")];`,
    ),
    check: equals([302, "https://example.com/"]),
  },
  {
    name: "Redirects are followed hop by hop",
    source: plugin(`const r = await fetch("https://httpbin.org/redirect-to?url=https%3A%2F%2Fexample.com%2F"); return [r.status, r.redirected, r.url];`),
    check: equals([200, true, "https://example.com/"]),
  },
  {
    name: "A plugin's cookie jar carries its cookies",
    source: plugin(
      `await fetch("https://httpbin.org/cookies/set?bearoom=1", { redirect: "manual" }); const r = await fetch("https://httpbin.org/cookies"); return (await r.json()).cookies;`,
    ),
    check: equals({ bearoom: "1" }),
  },
  {
    name: "TMDB calls go through the app's proxy",
    source: plugin(`const r = await fetch("https://api.themoviedb.org/3/movie/550?api_key=" + TMDB_API_KEY); return (await r.json()).title;`),
    check: equals("Fight Club"),
  },
  {
    name: "A runaway plugin is stopped",
    source: plugin(`for (;;) {}`),
    timeoutMs: 3000,
    check: (o) => (!o.ok && o.code === "timeout" ? null : explain(o)),
  },
  { name: "The sandbox still answers after a kill", source: plugin(`return 42;`), check: equals(42) },
];

export async function runSelfTest(
  run: (key: string, source: string, timeoutMs: number) => Promise<unknown>,
  onResult?: (r: SelfTestResult) => void,
  now: () => number = Date.now,
): Promise<SelfTestResult[]> {
  const out: SelfTestResult[] = [];
  for (const [i, c] of SELF_TEST.entries()) {
    const started = now();
    let o: Outcome;
    try {
      o = { ok: true, value: await run(`selftest/${i}@1`, c.source, c.timeoutMs ?? 15_000) };
    } catch (e) {
      o = { ok: false, code: (e as { code?: string })?.code, message: (e as Error)?.message ?? String(e) };
    }
    const problem = c.check(o);
    const r: SelfTestResult = { name: c.name, pass: problem === null, detail: problem ?? "ok", ms: now() - started };
    out.push(r);
    onResult?.(r);
  }
  return out;
}
