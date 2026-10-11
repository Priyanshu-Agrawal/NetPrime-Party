import { NavigationContext } from "@react-navigation/native";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

jest.mock("@/modules/bearoom-glass", () => {
  const R = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  return {
    NativeGlassBackdrop: R.forwardRef((p: object, ref: unknown) => <View ref={ref} {...p} />),
    NativeGlassView: null,
  };
});

// eslint-disable-next-line import/first
import { GlassBackdrop } from "./GlassBackdrop";
// eslint-disable-next-line import/first
import { screenBackdrops } from "./registry";

/** A screen's navigation object whose focus events we fire by hand. */
function fakeScreen(focused: boolean) {
  const handlers: Record<string, Set<() => void>> = { focus: new Set(), blur: new Set() };
  const nav = {
    isFocused: () => focused,
    addListener: (type: string, cb: () => void) => {
      handlers[type].add(cb);
      return () => handlers[type].delete(cb);
    },
  };
  const emit = (type: "focus" | "blur") => {
    focused = type === "focus";
    handlers[type].forEach((cb) => cb());
  };
  return { nav, emit };
}

describe("GlassBackdrop on a screen", () => {
  it("drops out the moment its screen blurs, even while the screen is frozen and can't re-render (freezeOnBlur)", () => {
    const { nav, emit } = fakeScreen(true);
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <NavigationContext.Provider value={nav as never}>
          <GlassBackdrop />
        </NavigationContext.Provider>,
      );
    });
    expect(screenBackdrops.current()).not.toBeNull();
    emit("blur"); // no act(): a frozen screen doesn't commit state updates
    expect(screenBackdrops.current()).toBeNull();
    emit("focus");
    expect(screenBackdrops.current()).not.toBeNull();
    act(() => r.unmount());
    expect(screenBackdrops.current()).toBeNull();
  });

  it("starts unregistered on a screen that mounts unfocused (a tab behind the current one)", () => {
    const { nav } = fakeScreen(false);
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <NavigationContext.Provider value={nav as never}>
          <GlassBackdrop />
        </NavigationContext.Provider>,
      );
    });
    expect(screenBackdrops.current()).toBeNull();
    act(() => r.unmount());
  });
});
