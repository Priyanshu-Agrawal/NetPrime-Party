import { NavigationContext } from "@react-navigation/native";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

// The native blur is what's under test: whether Frost mounts it at all.
jest.mock("@sbaiahmed1/react-native-blur", () => {
  const { View } = jest.requireActual("react-native");
  return { BlurView: (props: Record<string, unknown>) => <View testID="native-blur" {...props} /> };
});

// eslint-disable-next-line import/first
import { Frost } from "./Frost";

const nav = (focused: boolean) => ({ isFocused: () => focused, addListener: () => () => {} });
const render = (focused: boolean): ReactTestRenderer => {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(
      <NavigationContext.Provider value={nav(focused) as never}>
        <Frost />
      </NavigationContext.Provider>,
    );
  });
  return r;
};
const hasBlur = (r: ReactTestRenderer) => r.root.findAll((n) => n.props.testID === "native-blur").length > 0;

describe("Frost", () => {
  it("blurs on the screen that's on screen", () => {
    expect(hasBlur(render(true))).toBe(true);
  });

  it("drops the native blur on a covered screen (the tab bar's glass re-blurred every party video frame)", () => {
    expect(hasBlur(render(false))).toBe(false);
  });
});
