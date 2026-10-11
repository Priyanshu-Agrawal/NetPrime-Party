import fs from "fs";
import path from "path";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("./BouncyPressable", () => {
  const { Pressable } = jest.requireActual("react-native");
  return { BouncyPressable: Pressable, default: Pressable };
});
jest.mock("./glass", () => {
  const { View } = jest.requireActual("react-native");
  return { Glass: () => <View /> };
});

// eslint-disable-next-line import/first
import { DetailsError } from "./DetailsError";

const pressables = (r: ReactTestRenderer) =>
  r.root.findAll((n) => typeof n.props?.onPress === "function" && typeof n.type !== "string");
/** The first pressable labelled `name`, by accessibility label or by the text inside it. */
const button = (r: ReactTestRenderer, name: string) =>
  pressables(r).find(
    (n) =>
      n.props.accessibilityLabel === name ||
      n.findAll((c) => c.props?.children === name).length > 0,
  )!;

describe("DetailsError", () => {
  it("is never a dead end: a way back and a retry, in plain words", () => {
    const onBack = jest.fn();
    const onRetry = jest.fn();
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<DetailsError what="this title" onBack={onBack} onRetry={onRetry} />);
    });
    const text = JSON.stringify(r.toJSON());
    expect(text).toContain("Couldn't load this title");
    expect(text).not.toMatch(/fetch failed/i);
    act(() => button(r, "Go back").props.onPress());
    expect(onBack).toHaveBeenCalledTimes(1);
    act(() => button(r, "Try again").props.onPress());
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(pressables(r).length).toBeGreaterThanOrEqual(2);
  });

  it.each(["src/screens/MovieDetailsScreen.tsx", "src/screens/TvDetailsScreen.tsx"])(
    "%s shows it when the title fails to load",
    (f) => {
      const src = fs.readFileSync(path.join(__dirname, "../..", f), "utf8");
      expect(src).toMatch(/<DetailsError[^>]*onBack=\{goBack\}[^>]*onRetry=\{refetch\}/);
    },
  );
});
