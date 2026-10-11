import React from "react";
import { Switch } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import PlaybackPrefsScreen from "./PlaybackPrefsScreen";

let mockOptIn = false;
const mockSet = jest.fn((v: boolean) => void (mockOptIn = v));
jest.mock("@/utils/prefs", () => ({ getPreviewOnMetered: () => mockOptIn, setPreviewOnMetered: (v: boolean) => mockSet(v) }));
jest.mock("@/src/ui", () => {
  const { Text, View } = jest.requireActual("react-native");
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    LibraryScreenHeader: ({ title }: { title: string }) => <Text>{title}</Text>,
    Text,
  };
});

describe("PlaybackPrefsScreen", () => {
  it("starts from the saved choice and saves a change", () => {
    mockOptIn = false;
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<PlaybackPrefsScreen />);
    });
    const sw = r.root.findByType(Switch);
    expect(sw.props.value).toBe(false);
    act(() => sw.props.onValueChange(true));
    expect(mockSet).toHaveBeenCalledWith(true);
    expect(r.root.findByType(Switch).props.value).toBe(true);
  });
});
