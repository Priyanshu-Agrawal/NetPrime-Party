import { DOUBLE_TAP_MS, NO_TAPS, onTap, STREAK_MS, zoneOf, type TapState } from "./doubleTap";

const W = 300;
function run(taps: [x: number, t: number][], canSeek = true) {
  let s: TapState = NO_TAPS;
  return taps.map(([x, t]) => {
    const r = onTap(s, x, W, t, canSeek);
    s = r.state;
    return r.action;
  });
}

describe("zoneOf", () => {
  it("splits the width in thirds; no width means centre", () => {
    expect(zoneOf(10, W)).toBe("left");
    expect(zoneOf(150, W)).toBe("center");
    expect(zoneOf(290, W)).toBe("right");
    expect(zoneOf(10, 0)).toBe("center");
  });
});

describe("onTap", () => {
  it("a single tap toggles the controls", () => {
    expect(run([[280, 0]])).toEqual([{ kind: "toggle" }]);
  });

  it("a double tap on the right seeks forward and undoes the first tap's toggle", () => {
    expect(run([[280, 0], [280, DOUBLE_TAP_MS - 1]])[1]).toEqual({ kind: "seek", zone: "right", streak: 1, undoToggle: true });
  });

  it("each further tap on the same side within the streak window adds 10 s", () => {
    const a = run([[20, 0], [20, 200], [20, 200 + STREAK_MS - 1], [20, 200 + 2 * STREAK_MS - 2]]);
    expect(a.slice(1).map((x) => (x.kind === "seek" ? x.streak : 0))).toEqual([1, 2, 3]);
  });

  it("taps too far apart, in the centre, on different sides, or by a guest only toggle", () => {
    expect(run([[280, 0], [280, DOUBLE_TAP_MS + 50]])[1]).toEqual({ kind: "toggle" });
    expect(run([[150, 0], [150, 100]])[1]).toEqual({ kind: "toggle" });
    expect(run([[20, 0], [280, 100]])[1]).toEqual({ kind: "toggle" });
    expect(run([[280, 0], [280, 100]], false)[1]).toEqual({ kind: "toggle" });
  });

  it("a streak ends after the window; the next tap toggles", () => {
    expect(run([[280, 0], [280, 100], [280, 100 + STREAK_MS + 1]])[2]).toEqual({ kind: "toggle" });
  });
});
