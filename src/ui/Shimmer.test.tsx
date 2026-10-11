import { NavigationContext } from "@react-navigation/native";
import React from "react";
import { act, create } from "react-test-renderer";

// The shimmer library animates natively; the prop it receives is what's under test.
const received: Record<string, unknown>[] = [];
jest.mock("react-native-shimmer-placeholder", () => ({
  createShimmerPlaceholder: () => (props: Record<string, unknown>) => {
    received.push(props);
    return null;
  },
}));
jest.mock("expo-linear-gradient", () => ({ LinearGradient: () => null }));

// eslint-disable-next-line import/first
import { Shimmer } from "./Shimmer";

const nav = (focused: boolean) => ({ isFocused: () => focused, addListener: () => () => {} });

beforeEach(() => {
  received.length = 0;
});

describe("Shimmer", () => {
  it("animates on a screen that's on screen", () => {
    act(() => {
      create(
        <NavigationContext.Provider value={nav(true) as never}>
          <Shimmer shimmerColors={["#000", "#111", "#000"]} />
        </NavigationContext.Provider>,
      );
    });
    expect(received[received.length - 1].stopAutoRun).toBe(false);
  });

  it("holds still on a screen that isn't (Search mounted behind the player looped every frame)", () => {
    act(() => {
      create(
        <NavigationContext.Provider value={nav(false) as never}>
          <Shimmer shimmerColors={["#000", "#111", "#000"]} />
        </NavigationContext.Provider>,
      );
    });
    expect(received[0].stopAutoRun).toBe(true);
  });
});
