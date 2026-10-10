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
