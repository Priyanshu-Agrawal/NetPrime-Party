import { selectGlassEngine, type EngineInput } from "./engine";

const base: EngineInput = {
  os: "android",
  androidApi: 35,
  liquidAvailable: false,
  reduceTransparency: false,
  material: "bar",
  backdrop: "available",
};
const pick = (o: Partial<EngineInput>) => selectGlassEngine({ ...base, ...o });

describe("selectGlassEngine", () => {
  it("blurs the backdrop on Android 12+", () => {
    expect(pick({})).toBe("backdrop");
  });
  it("blurs live on Android only for floating bars — every live glass re-renders the screen each frame", () => {
    // Nothing Phone 1, Home scroll A/B: bars only ≈ no blur (5–12 % janky); bars + header + buttons ≈ 2×.
    expect(pick({ material: "control" })).toBe("crafted");
    expect(pick({ material: "chrome" })).toBe("crafted");
    expect(pick({ material: "sheet" })).toBe("crafted");
  });
  it("falls back to crafted glass below Android 12 (no RenderEffect)", () => {
    expect(pick({ androidApi: 30 })).toBe("crafted");
  });
  it("uses crafted glass on Android with no backdrop (modals, screens without one)", () => {
    expect(pick({ backdrop: "none" })).toBe("crafted");
  });
  it("never blurs a backdrop the glass sits inside (the render tree would contain itself)", () => {
    expect(pick({ backdrop: "inside" })).toBe("crafted");
  });
  it("uses Liquid Glass for floating controls and bars on iOS 26+", () => {
    expect(pick({ os: "ios", liquidAvailable: true, material: "control" })).toBe("liquid");
    expect(pick({ os: "ios", liquidAvailable: true, material: "bar" })).toBe("liquid");
  });
  it("uses the system blur for headers and sheets, and everywhere before iOS 26", () => {
    expect(pick({ os: "ios", liquidAvailable: true, material: "chrome" })).toBe("material");
    expect(pick({ os: "ios", liquidAvailable: true, material: "sheet" })).toBe("material");
    expect(pick({ os: "ios", liquidAvailable: false, material: "control" })).toBe("material");
  });
  it("needs no backdrop on iOS (the OS composites system glass)", () => {
    expect(pick({ os: "ios", backdrop: "none" })).toBe("material");
  });
  it("honours Reduce Transparency everywhere", () => {
    expect(pick({ reduceTransparency: true })).toBe("crafted");
    expect(pick({ os: "ios", liquidAvailable: true, reduceTransparency: true })).toBe("crafted");
  });
  it("uses crafted glass on other platforms (web)", () => {
    expect(pick({ os: "web" })).toBe("crafted");
  });
});
