import { runSelfTest, SELF_TEST } from "./pluginSelfTest";

const byName = (prefix: string) => SELF_TEST.find((c) => c.name.startsWith(prefix))!;

describe("plugin self-test cases", () => {
  it("every case is valid JavaScript", () => {
    for (const c of SELF_TEST) expect(() => new Function("module", c.source)).not.toThrow();
  });

  it.each(["A private IP", "A name that resolves", "A redirect to a private"])("%s passes only when the request was blocked", (prefix) => {
    const c = byName(prefix);
    expect(c.check({ ok: true, value: "refused: Blocked URL (host)" })).toBeNull();
    expect(c.check({ ok: true, value: "refused: Blocked non-public address" })).toBeNull();
    expect(c.check({ ok: true, value: "reached" })).not.toBeNull();
    expect(c.check({ ok: true, value: "refused: Unable to resolve host" })).not.toBeNull();
  });

  it("the runaway case passes only on a timeout", () => {
    const c = byName("A runaway");
    expect(c.timeoutMs).toBe(3000);
    expect(c.check({ ok: false, code: "timeout", message: "x" })).toBeNull();
    expect(c.check({ ok: true, value: 1 })).not.toBeNull();
  });

  it("the globals case lists anything left behind", () => {
    const c = byName("Network and storage");
    expect(c.check({ ok: true, value: ["XMLHttpRequest:undefined", "WebSocket:undefined"] })).toBeNull();
    expect(c.check({ ok: true, value: ["XMLHttpRequest:function"] })).toContain("XMLHttpRequest:function");
  });
});

describe("runSelfTest", () => {
  it("runs every case in order, each as its own plugin, and reports as it goes", async () => {
    const run = jest.fn(async (_key: string, _source: string, _timeoutMs: number): Promise<unknown> =>
      Promise.reject(Object.assign(new Error("nope"), { code: "plugin" })),
    );
    const seen: string[] = [];
    const out = await runSelfTest(run, (r) => seen.push(r.name));
    expect(out).toHaveLength(SELF_TEST.length);
    expect(out.every((r) => !r.pass)).toBe(true);
    expect(seen).toEqual(SELF_TEST.map((c) => c.name));
    expect(new Set(run.mock.calls.map((c) => c[0])).size).toBe(SELF_TEST.length);
    expect(run.mock.calls.find((c) => (c[1] as string).includes("for (;;)"))?.[2]).toBe(3000);
  });
});
