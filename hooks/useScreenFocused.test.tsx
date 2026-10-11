import { NavigationContext } from "@react-navigation/native";
import React from "react";
import { act, create } from "react-test-renderer";
import { useScreenFocused } from "./useScreenFocused";

type Listener = () => void;
function fakeNavigation(focused: boolean) {
  const listeners: Record<string, Listener[]> = { focus: [], blur: [] };
  return {
    isFocused: () => focused,
    addListener: (type: "focus" | "blur", cb: Listener) => {
      listeners[type].push(cb);
      return () => {
        listeners[type] = listeners[type].filter((l) => l !== cb);
      };
    },
    emit(type: "focus" | "blur") {
      focused = type === "focus";
      listeners[type].forEach((l) => l());
    },
  };
}

let seen: boolean[];
function Probe() {
  seen.push(useScreenFocused());
  return null;
}

beforeEach(() => {
  seen = [];
});

describe("useScreenFocused", () => {
  it("counts as on screen outside any navigator", () => {
    act(() => {
      create(<Probe />);
    });
    expect(seen[seen.length - 1]).toBe(true);
  });

  it("is off from the first render for a screen that isn't focused (a tab mounted behind another)", () => {
    const nav = fakeNavigation(false);
    act(() => {
      create(
        <NavigationContext.Provider value={nav as never}>
          <Probe />
        </NavigationContext.Provider>,
      );
    });
    expect(seen[0]).toBe(false);
    expect(seen[seen.length - 1]).toBe(false);
  });

  it("follows focus and blur", () => {
    const nav = fakeNavigation(true);
    act(() => {
      create(
        <NavigationContext.Provider value={nav as never}>
          <Probe />
        </NavigationContext.Provider>,
      );
    });
    act(() => nav.emit("blur"));
    expect(seen[seen.length - 1]).toBe(false);
    act(() => nav.emit("focus"));
    expect(seen[seen.length - 1]).toBe(true);
  });
});
