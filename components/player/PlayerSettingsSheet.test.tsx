// components/player/PlayerSettingsSheet.test.tsx
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import PlayerSettingsSheet from "./PlayerSettingsSheet";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
// GlassCard pulls in the native blur module; the sheet's rows are what is under test.
jest.mock("@/components/ui/GlassCard", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});

const base = {
  visible: true,
  onClose: () => {},
  canControl: true,
  rate: 1,
  onSetRate: () => {},
  qualities: [],
  onSetQuality: () => {},
  audios: [],
  onSetAudio: () => {},
};
const texts = (r: ReactTestRenderer) =>
  r.root.findAll((n) => typeof n.props.children === "string").map((n) => n.props.children as string);

describe("PlayerSettingsSheet", () => {
  it("hides Audio and Quality when the source can't switch them", () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<PlayerSettingsSheet {...base} showAudio={false} showQuality={false} />);
    });
    expect(texts(r)).not.toContain("AUDIO");
    expect(texts(r)).not.toContain("QUALITY");
    expect(texts(r)).not.toContain("Loading…");
  });

  it("lists subtitles with an Off choice and reports the pick", () => {
    const onSetSubtitle = jest.fn();
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <PlayerSettingsSheet
          {...base}
          showAudio={false}
          showQuality={false}
          subtitles={[
            { id: "0", label: "English", language: "en", selected: false },
            { id: "2", label: "Hindi", language: "hi", selected: true },
          ]}
          onSetSubtitle={onSetSubtitle}
        />,
      );
    });
    expect(texts(r)).toEqual(expect.arrayContaining(["SUBTITLES", "Off", "English", "Hindi"]));
    const english = r.root.find((n) => n.props.accessibilityLabel === "Subtitles English");
    act(() => english.props.onPress());
    expect(onSetSubtitle).toHaveBeenCalledWith("0");
    const off = r.root.find((n) => n.props.accessibilityLabel === "Subtitles off");
    act(() => off.props.onPress());
    expect(onSetSubtitle).toHaveBeenCalledWith(null);
  });

  it("keeps today's rows for the legacy bridge (defaults)", () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<PlayerSettingsSheet {...base} />);
    });
    expect(texts(r)).toEqual(expect.arrayContaining(["AUDIO", "QUALITY"]));
  });
});

describe("PlayerSettingsSheet values", () => {
  it("shows each row's current value", () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <PlayerSettingsSheet
          {...base}
          rate={1.5}
          audios={[{ label: "English", active: false }, { label: "Hindi", active: true }]}
          qualities={[{ label: "Auto", active: true }, { label: "720p", active: false }]}
          qualitySummary="Auto (576p)"
          subtitles={[{ id: "in:0", label: "English", language: "en", selected: false }]}
        />,
      );
    });
    expect(texts(r)).toEqual(expect.arrayContaining(["AUDIO", "QUALITY", "Auto (576p)", "SUBTITLES", "Off", "SPEED", "1.5×"]));
    expect(texts(r).filter((t) => t === "Hindi").length).toBeGreaterThanOrEqual(2); // row value + chip
  });

  it("offers offset and size for subtitles we draw ourselves", () => {
    const onOffset = jest.fn();
    const onSize = jest.fn();
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <PlayerSettingsSheet
          {...base}
          subtitles={[{ id: "side:de", label: "German", language: "de", selected: true }]}
          subtitleAdjust={{ offsetSec: 0.5, size: "m", onOffset, onSize }}
        />,
      );
    });
    expect(texts(r)).toContain("+0.5 s");
    act(() => r.root.find((n) => n.props.accessibilityLabel === "Subtitles earlier").props.onPress());
    expect(onOffset).toHaveBeenCalledWith(0);
    act(() => r.root.find((n) => n.props.accessibilityLabel === "Subtitle size Large").props.onPress());
    expect(onSize).toHaveBeenCalledWith("l");
  });

  it("names the source and opens the picker", () => {
    const onOpen = jest.fn();
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<PlayerSettingsSheet {...base} source={{ label: "Angel One", onOpen }} />);
    });
    expect(texts(r)).toEqual(expect.arrayContaining(["SOURCE", "Angel One"]));
    act(() => r.root.find((n) => n.props.accessibilityLabel === "Change source").props.onPress());
    expect(onOpen).toHaveBeenCalled();
  });
});
