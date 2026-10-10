// components/player/PlayerControls.test.tsx
import { ms } from "@/theme/bearoom";
import React from "react";
import { StyleSheet } from "react-native";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { PlayerControls } from "./PlayerControls";

const STATUS_BAR = 47;
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 0, left: 0, right: 0 }),
}));
// GlassCard pulls in the native blur module; the header is what is under test.
jest.mock("@/components/ui/GlassCard", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});

const base = {
  canControl: true,
  roomPlaying: false,
  onPlay: () => {},
  onPause: () => {},
  onSeekTo: () => {},
  onSeekBy: () => {},
};

function render(el: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(el);
  });
  return r;
}

const texts = (r: ReactTestRenderer) =>
  r.root.findAll((n) => typeof n.props.children === "string").map((n) => n.props.children as string);

/** The `top` of the absolutely-positioned header that holds the title. */
function headerTop(r: ReactTestRenderer, title: string): number | undefined {
  let n: ReactTestInstance | null = r.root.find((x) => x.props.children === title);
  while (n) {
    const top = StyleSheet.flatten(n.props.style)?.top;
    if (typeof top === "number") return top;
    n = n.parent;
  }
  return undefined;
}

describe("PlayerControls header", () => {
  it("shows what's playing, hugging the video's top edge when the player sits under the screen's own header", () => {
    const r = render(<PlayerControls {...base} title="Fight Club" subtitle="S1 · E2" embedded />);
    expect(texts(r)).toEqual(expect.arrayContaining(["Fight Club", "S1 · E2"]));
    expect(headerTop(r, "Fight Club")).toBe(ms(10));
  });

  it("clears the status bar when the player is full-bleed", () => {
    const r = render(<PlayerControls {...base} title="Fight Club" />);
    expect(headerTop(r, "Fight Club")).toBe(STATUS_BAR);
  });
});
