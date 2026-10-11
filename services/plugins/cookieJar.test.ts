import type { NativeCookie } from "@/modules/bearoom-fetch";
import { CookieJar } from "./cookieJar";

const c = (over: Partial<NativeCookie>): NativeCookie => ({
  name: "a",
  value: "1",
  domain: "example.com",
  path: "/",
  hostOnly: false,
  secure: false,
  expiresAt: 0,
  ...over,
});

describe("CookieJar", () => {
  it("sends domain cookies to subdomains and host-only cookies to their host alone", () => {
    const jar = new CookieJar(() => 1000);
    jar.store([c({ name: "d" }), c({ name: "h", domain: "www.example.com", hostOnly: true })]);
    expect(jar.header("https://cdn.example.com/x")).toBe("d=1");
    expect(jar.header("https://www.example.com/x")).toBe("d=1; h=1");
    expect(jar.header("https://notexample.com/")).toBeUndefined();
  });

  it("matches paths on segment boundaries, longest first", () => {
    const jar = new CookieJar(() => 1000);
    jar.store([c({ name: "root", path: "/" }), c({ name: "deep", path: "/api" })]);
    expect(jar.header("https://example.com/api/x")).toBe("deep=1; root=1");
    expect(jar.header("https://example.com/apix")).toBe("root=1");
  });

  it("keeps secure cookies off plain http", () => {
    const jar = new CookieJar(() => 1000);
    jar.store([c({ name: "s", secure: true })]);
    expect(jar.header("http://example.com/")).toBeUndefined();
    expect(jar.header("https://example.com/")).toBe("s=1");
  });

  it("forgets expired cookies, and a server can delete one by expiring it", () => {
    const t = { now: 1000 };
    const jar = new CookieJar(() => t.now);
    jar.store([c({ name: "x", expiresAt: 2000 }), c({ name: "y" })]);
    expect(jar.header("https://example.com/")).toBe("x=1; y=1");
    t.now = 3000;
    expect(jar.header("https://example.com/")).toBe("y=1");
    jar.store([c({ name: "y", value: "gone", expiresAt: 500 })]);
    expect(jar.header("https://example.com/")).toBeUndefined();
  });

  it("replaces a cookie with the same name, domain and path", () => {
    const jar = new CookieJar(() => 1000);
    jar.store([c({ value: "old" })]);
    jar.store([c({ value: "new" })]);
    expect(jar.header("https://example.com/")).toBe("a=new");
  });

  it("caps how many cookies one plugin can hold", () => {
    const jar = new CookieJar(() => 1000);
    jar.store(Array.from({ length: 400 }, (_, i) => c({ name: `n${i}` })));
    expect(jar.size()).toBe(300);
  });
});
