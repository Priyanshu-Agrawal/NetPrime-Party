import { Limiter, registrableDomain } from "./limiter";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("registrableDomain", () => {
  it.each([
    ["a.b.example.com", "example.com"],
    ["example.com", "example.com"],
    ["x.example.co.uk", "example.co.uk"],
    ["cdn.example.co.in", "example.co.in"],
    ["8.8.8.8", "8.8.8.8"],
    ["localhost", "localhost"],
  ])("%s → %s", (h, d) => expect(registrableDomain(h)).toBe(d));
});

describe("Limiter", () => {
  it("runs at most perKey tasks per key and overall in total", async () => {
    const lim = new Limiter(2, 3);
    const open: Record<string, () => void> = {};
    const task = (key: string, id: string) => lim.run(key, () => new Promise<void>((res) => (open[id] = res)));
    const all = [task("a", "a1"), task("a", "a2"), task("a", "a3"), task("b", "b1"), task("c", "c1")];
    await flush();
    expect(Object.keys(open).sort()).toEqual(["a1", "a2", "b1"]); // a3 waits for its key, c1 for the total
    open.a1();
    await flush();
    expect(Object.keys(open).sort()).toEqual(["a1", "a2", "a3", "b1"]);
    open.b1();
    await flush();
    expect(Object.keys(open)).toContain("c1");
    open.a2();
    open.a3();
    open.c1();
    await Promise.all(all);
  });

  it("passes results and failures through and frees the slot", async () => {
    const lim = new Limiter(1, 1);
    await expect(lim.run("k", async () => 7)).resolves.toBe(7);
    await expect(lim.run("k", async () => Promise.reject(new Error("x")))).rejects.toThrow("x");
    await expect(lim.run("k", async () => 8)).resolves.toBe(8);
  });
});
