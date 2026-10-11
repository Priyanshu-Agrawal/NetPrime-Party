// One mock whose native module each test sets; the rest of expo-modules-core stays real (jest-expo's runtime reads it).
let mockNative: { setMaxVideoSize: jest.Mock; clearMaxVideoSize: jest.Mock } | null = null;
jest.mock("expo-modules-core", () => ({
  ...jest.requireActual("expo-modules-core"),
  requireOptionalNativeModule: () => mockNative,
}));

function load() {
  let mod!: typeof import("./index");
  jest.isolateModules(() => {
    mod = jest.requireActual("./index");
  });
  return mod;
}

describe("setQualityCap", () => {
  it("caps through the native module, and lifts the cap for Auto", () => {
    mockNative = { setMaxVideoSize: jest.fn(), clearMaxVideoSize: jest.fn() };
    const { setQualityCap, qualityCapAvailable } = load();
    const player = {};
    expect(qualityCapAvailable).toBe(true);
    expect(setQualityCap(player, { maxWidth: 1280, maxHeight: 720 })).toBe(true);
    expect(mockNative.setMaxVideoSize).toHaveBeenCalledWith(player, 1280, 720);
    setQualityCap(player, null);
    expect(mockNative.clearMaxVideoSize).toHaveBeenCalledWith(player);
  });

  it("is a no-op where the module is missing (web, old binary)", () => {
    mockNative = null;
    const { setQualityCap, qualityCapAvailable } = load();
    expect(qualityCapAvailable).toBe(false);
    expect(setQualityCap({}, { maxWidth: 1, maxHeight: 1 })).toBe(false);
  });
});
