import { NavigationContext } from "@react-navigation/native";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const mockPlatform = { os: "android", androidApi: 35, liquidAvailable: false };
jest.mock("./glass/platform", () => ({
  get glassPlatform() {
    return mockPlatform; // read at render time: the factory runs before this file's consts exist
  },
  nativeTagOf: () => 1,
}));
jest.mock("@/modules/bearoom-glass", () => {
  const R = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  return {
    NativeGlassBackdrop: R.forwardRef((p: object, ref: unknown) => <View ref={ref} {...p} />),
    NativeGlassView: (p: object) => <View testID="native-glass" {...p} />,
  };
});
jest.mock("expo-blur", () => {
  const { View } = jest.requireActual("react-native");
  return { BlurView: (p: object) => <View testID="system-blur" {...p} /> };
});

// eslint-disable-next-line import/first
import { Frost } from "./Frost";
// eslint-disable-next-line import/first
import { GlassBackdrop } from "./glass";

const focused = { isFocused: () => true, addListener: () => () => {} };
function render(el: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(<NavigationContext.Provider value={focused as never}>{el}</NavigationContext.Provider>);
  });
  return r;
}
const has = (r: ReactTestRenderer, id: string) => r.root.findAll((n) => n.props?.testID === id).length > 0;

describe("Frost (BearAlert's glass)", () => {
  it("never blurs the screen behind on Android — BearAlert lives in a Modal, a separate window", () => {
    mockPlatform.os = "android";
    const r = render(<><GlassBackdrop /><Frost /></>);
    expect(has(r, "native-glass")).toBe(false);
    act(() => r.unmount());
  });

  it("gets the system blur on iOS", () => {
    mockPlatform.os = "ios";
    const r = render(<Frost />);
    expect(has(r, "system-blur")).toBe(true);
    act(() => r.unmount());
  });
});
