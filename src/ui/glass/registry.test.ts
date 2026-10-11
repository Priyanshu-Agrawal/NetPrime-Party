import { createRef } from "react";
import { createBackdropRegistry, resolveBackdrop, type BackdropEntry } from "./registry";

const entry = (id: number): BackdropEntry => ({ id, ref: createRef() });

describe("backdrop registry", () => {
  it("makes the most recently focused screen's backdrop current", () => {
    const r = createBackdropRegistry();
    const home = entry(1);
    const details = entry(2);
    r.add(home);
    r.add(details);
    expect(r.current()).toBe(details);
    r.remove(2);
    expect(r.current()).toBe(home);
  });
  it("re-adding an entry moves it to the top instead of duplicating it", () => {
    const r = createBackdropRegistry();
    const a = entry(1);
    const b = entry(2);
    r.add(a);
    r.add(b);
    r.add(a);
    expect(r.current()).toBe(a);
    r.remove(1);
    expect(r.current()).toBe(b);
  });
  it("tab switches: the focused tab is current, a blurred tab drops out", () => {
    const r = createBackdropRegistry();
    const home = entry(1);
    const search = entry(2);
    r.add(home);
    r.remove(1);
    r.add(search);
    expect(r.current()).toBe(search);
    r.remove(2);
    r.add(home);
    expect(r.current()).toBe(home);
  });
  it("has no current backdrop when the focused screen has none", () => {
    const r = createBackdropRegistry();
    r.add(entry(1));
    r.remove(1);
    expect(r.current()).toBeNull();
  });
  it("notifies subscribers on change only, and stops after unsubscribe", () => {
    const r = createBackdropRegistry();
    const seen = jest.fn();
    const off = r.subscribe(seen);
    r.add(entry(1));
    r.remove(99);
    expect(seen).toHaveBeenCalledTimes(1);
    off();
    r.remove(1);
    expect(seen).toHaveBeenCalledTimes(1);
  });
  it("keeps current() stable between changes (useSyncExternalStore needs it)", () => {
    const r = createBackdropRegistry();
    r.add(entry(1));
    expect(r.current()).toBe(r.current());
  });
});

describe("resolveBackdrop", () => {
  const home = entry(7);
  it("blurs an available backdrop", () => {
    expect(resolveBackdrop("auto", home, [])).toEqual({ entry: home, state: "available" });
  });
  it("reports 'inside' when the glass sits inside that backdrop", () => {
    expect(resolveBackdrop("auto", home, [3, 7])).toEqual({ entry: null, state: "inside" });
  });
  it("reports none with no backdrop, or when the caller opts out (modals)", () => {
    expect(resolveBackdrop("auto", null, [])).toEqual({ entry: null, state: "none" });
    expect(resolveBackdrop("none", home, [])).toEqual({ entry: null, state: "none" });
  });
});
