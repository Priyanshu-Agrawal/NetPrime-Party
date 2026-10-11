import { countsAgainstSource, DOWN_AFTER, HEAL_MS, SourceHealth } from "./health";

function memory() {
  const m = new Map<string, string>();
  return { getString: (k: string) => m.get(k), set: (k: string, v: string | number | boolean) => void m.set(k, String(v)) };
}
const HOUR = 3_600_000;

describe("SourceHealth", () => {
  it(`goes down after ${DOWN_AFTER} failures in a row and heals after an hour`, () => {
    const t = { now: 0 };
    const h = new SourceHealth(memory(), () => t.now);
    for (let i = 0; i < DOWN_AFTER - 1; i++) h.record("r/p", false);
    expect(h.isDown("r/p")).toBe(false);
    h.record("r/p", false);
    expect(h.isDown("r/p")).toBe(true);
    t.now = HOUR + 1;
    expect(h.isDown("r/p")).toBe(false);
  });

  it("escalates 1 h → 4 h → 8 h while it keeps failing; one success resets it", () => {
    const t = { now: 0 };
    const h = new SourceHealth(memory(), () => t.now);
    const fail5 = () => {
      for (let i = 0; i < DOWN_AFTER; i++) h.record("r/p", false);
    };
    fail5();
    t.now += HEAL_MS[0] + 1;
    fail5();
    expect(h.isDown("r/p")).toBe(true);
    t.now += HEAL_MS[0] + 1;
    expect(h.isDown("r/p")).toBe(true); // second time down: 4 h
    t.now += HEAL_MS[1];
    fail5();
    t.now += HEAL_MS[1] + 1;
    expect(h.isDown("r/p")).toBe(true); // third time: 8 h
    h.record("r/p", true);
    expect(h.isDown("r/p")).toBe(false);
    fail5();
    t.now += HEAL_MS[0] + 1;
    expect(h.isDown("r/p")).toBe(false); // back to 1 h after the success
  });

  it("a success in between resets the count", () => {
    const h = new SourceHealth(memory(), () => 0);
    for (let i = 0; i < DOWN_AFTER - 1; i++) h.record("r/p", false);
    h.record("r/p", true);
    h.record("r/p", false);
    expect(h.isDown("r/p")).toBe(false);
  });

  it("is kept on the device", () => {
    const store = memory();
    for (let i = 0; i < DOWN_AFTER; i++) new SourceHealth(store, () => 0).record("r/p", false);
    expect(new SourceHealth(store, () => 0).isDown("r/p")).toBe(true);
  });

  it("only real plugin failures count — not 'nothing for this title', not sandbox trouble", () => {
    expect(["timeout", "error", "bad-shape"].map((r) => countsAgainstSource(r as never))).toEqual([true, true, true]);
    expect(["empty-fast", "unsafe", "not-ready", "crashed"].map((r) => countsAgainstSource(r as never))).toEqual([false, false, false, false]);
  });
});
