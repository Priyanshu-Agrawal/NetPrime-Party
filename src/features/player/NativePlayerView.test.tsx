import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { NativePlayerView } from "./NativePlayerView";

let mockOffline = false;
const mockHandle = {
  play: jest.fn(),
  pause: jest.fn(),
  seek: jest.fn(async (s: number) => s - 0.05),
  setRate: jest.fn(),
  fullscreen: jest.fn(),
  readQuality: jest.fn(),
  setQuality: jest.fn(),
  readAudio: jest.fn(),
  setAudio: jest.fn(),
  reload: jest.fn(),
  getCapabilities: jest.fn(),
  getTracks: jest.fn(() => []),
  setSubtitle: jest.fn(),
};
let mockPlayerProps: any = null;

jest.mock("@/components/player/native/NativePlayer", () => {
  const R = jest.requireActual("react");
  return {
    NativePlayer: R.forwardRef((props: any, ref: any) => {
      mockPlayerProps = props;
      R.useImperativeHandle(ref, () => mockHandle);
      return null;
    }),
  };
});
let mockControlsProps: any = null;
jest.mock("@/components/player/PlayerControls", () => {
  const R = jest.requireActual("react");
  return {
    PlayerControls: R.forwardRef((p: any, ref: any) => {
      mockControlsProps = p;
      R.useImperativeHandle(ref, () => ({ setPlayback: jest.fn() }));
      return null;
    }),
  };
});
let mockSheetProps: any = null;
jest.mock("@/components/player/PlayerSettingsSheet", () => ({
  __esModule: true,
  default: (p: any) => {
    mockSheetProps = p;
    return null;
  },
}));
jest.mock("@/components/player/PlayerLoadingCard", () => {
  const { Text } = jest.requireActual("react-native");
  return { PlayerLoadingCard: ({ status }: { status: string }) => <Text>{status}</Text> };
});
jest.mock("@/hooks/useConnectivity", () => ({ useConnectivity: () => mockOffline }));
const mockRequestClose = jest.fn();
jest.mock("@/hooks/useMediaCloseGuard", () => ({ useMediaCloseGuard: () => ({ requestClose: mockRequestClose }) }));
let mockLandscape = false;
jest.mock("@/hooks/useResponsive", () => ({ useResponsive: () => ({ isLandscapeMobile: mockLandscape }) }));
jest.mock("@/utils/prefs", () => ({ getSubtitleSize: () => "m", setSubtitleSize: jest.fn() }));
const mockUnlock = jest.fn(async () => {});
jest.mock("expo-screen-orientation", () => ({
  lockAsync: jest.fn(async () => {}),
  unlockAsync: () => mockUnlock(),
  OrientationLock: { LANDSCAPE: 1 },
}));
jest.mock("@/src/ui/glass", () => {
  const { View } = jest.requireActual("react-native");
  return { GlassLayer: ({ children }: any) => <View>{children}</View>, GlassBackdrop: ({ children }: any) => <View>{children}</View> };
});
jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual("react-native");
  return { SafeAreaView: ({ children }: any) => <View>{children}</View>, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

const texts = (r: ReactTestRenderer) =>
  r.root.findAll((n) => typeof n.type === "string" && typeof n.props.children === "string").map((n) => n.props.children as string);

function view(extra: Partial<React.ComponentProps<typeof NativePlayerView>> = {}) {
  return (
    <NativePlayerView
      title="Angel One"
      source={{ uri: "https://example.test/master.m3u8" }}
      sourceLabel="Angel One"
      onClose={jest.fn()}
      onOpenSource={jest.fn()}
      {...extra}
    />
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  mockOffline = false;
  mockLandscape = false;
  mockRequestClose.mockClear();
  Object.values(mockHandle).forEach((f) => (f as jest.Mock).mockClear?.());
});
afterEach(() => jest.useRealTimers());

describe("NativePlayerView", () => {
  it("shows the loading card until the first frame, then fades it out", () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(view());
    });
    expect(texts(r)).toContain("Starting…");
    act(() => mockPlayerProps.onFirstFrame());
    act(() => jest.advanceTimersByTime(400));
    expect(texts(r)).not.toContain("Starting…");
  });

  it("shows the error card on a fatal error; Retry reloads and plays", () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(view());
    });
    act(() => mockPlayerProps.onFatalError("HTTP 404"));
    expect(texts(r)).toContain("Couldn’t play this stream");
    act(() => r.root.find((n) => n.props?.accessibilityLabel === "Retry" && n.props.onPress).props.onPress());
    expect(mockHandle.reload).toHaveBeenCalled();
    expect(mockHandle.play).toHaveBeenCalled();
    expect(texts(r)).not.toContain("Couldn’t play this stream");
  });

  it("pauses when the network drops and resumes playing when it returns", () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(view());
    });
    act(() => mockPlayerProps.onPlayerEvent({ event: "tick", currentTime: 42, duration: 600, paused: false }));
    mockOffline = true;
    act(() => r.update(view()));
    expect(mockHandle.pause).toHaveBeenCalled();
    mockOffline = false;
    act(() => r.update(view()));
    expect(mockHandle.play).toHaveBeenCalled();
    expect(mockHandle.reload).not.toHaveBeenCalled();
  });

  it("reloads on reconnect when the stream failed while offline", () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(view());
    });
    act(() => mockPlayerProps.onPlayerEvent({ event: "tick", currentTime: 42, duration: 600, paused: false }));
    mockOffline = true;
    act(() => r.update(view()));
    act(() => mockPlayerProps.onFatalError("Network request failed"));
    mockOffline = false;
    act(() => r.update(view()));
    expect(mockHandle.reload).toHaveBeenCalled();
    expect(texts(r)).not.toContain("Couldn’t play this stream");
  });

  it("shows TTFF from the Play press in the dev HUD", () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(view({ devHud: true, startedAt: Date.now() - 1500 }));
    });
    act(() => mockPlayerProps.onFirstFrame());
    expect(texts(r).some((t) => /^TTFF 1\.5\d s/.test(t))).toBe(true);
  });

  it("unlocks the orientation when it closes", () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(view());
    });
    act(() => r.unmount());
    expect(mockUnlock).toHaveBeenCalled();
  });

  const ev = (event: string, currentTime = 0) => ({ event, currentTime, duration: 900, paused: false });

  it("starts at the given position once the stream is ready, once", () => {
    act(() => {
      create(view({ startAt: 754 }));
    });
    act(() => mockPlayerProps.onPlayerEvent(ev("ready")));
    act(() => mockPlayerProps.onPlayerEvent(ev("ready")));
    expect(mockHandle.seek).toHaveBeenCalledTimes(1);
    expect(mockHandle.seek).toHaveBeenCalledWith(754);
  });

  it("passes every event on to the caller", () => {
    const onPlayerEvent = jest.fn();
    act(() => {
      create(view({ onPlayerEvent }));
    });
    act(() => mockPlayerProps.onPlayerEvent(ev("tick", 12)));
    expect(onPlayerEvent).toHaveBeenCalledWith(expect.objectContaining({ event: "tick", currentTime: 12 }));
  });

  it("lets the caller handle a fatal error instead of showing the card", () => {
    let r!: ReactTestRenderer;
    const onStreamError = jest.fn(() => true);
    act(() => {
      r = create(view({ onStreamError }));
    });
    act(() => mockPlayerProps.onFatalError("HTTP 403"));
    expect(onStreamError).toHaveBeenCalledWith("HTTP 403");
    expect(texts(r)).not.toContain("Couldn’t play this stream");
  });

  it("offers sibling languages when the stream has one audio track, and the picks go to the caller", () => {
    const onPick = jest.fn();
    act(() => {
      create(view({ audioChoices: { options: [{ label: "Hindi", active: true }, { label: "English", active: false }], onPick } }));
    });
    act(() => mockPlayerProps.onPlayerEvent({ ...ev("audio"), audios: [{ label: "English", active: true }] }));
    expect(mockSheetProps.audios).toEqual([{ label: "Hindi", active: true }, { label: "English", active: false }]);
    expect(mockSheetProps.showAudio).toBe(true);
    act(() => mockSheetProps.onSetAudio("English"));
    expect(onPick).toHaveBeenCalledWith("English");
    expect(mockHandle.setAudio).not.toHaveBeenCalled();
    expect(mockControlsProps.chips.audio).toBe("Hindi");
  });

  it("keeps the stream's own audio tracks when it has several", () => {
    const onPick = jest.fn();
    act(() => {
      create(view({ audioChoices: { options: [{ label: "Hindi", active: true }, { label: "English", active: false }], onPick } }));
    });
    act(() => mockPlayerProps.onPlayerEvent({ ...ev("audio"), audios: [{ label: "Tamil", active: true }, { label: "Telugu", active: false }] }));
    expect(mockSheetProps.audios.map((a: { label: string }) => a.label)).toEqual(["Tamil", "Telugu"]);
    act(() => mockSheetProps.onSetAudio("Telugu"));
    expect(mockHandle.setAudio).toHaveBeenCalledWith("Telugu");
    expect(onPick).not.toHaveBeenCalled();
  });

  it("shows a notice once the first frame is up, and passes episode controls to the controls layer", () => {
    let r!: ReactTestRenderer;
    const onNextEpisode = jest.fn();
    act(() => {
      r = create(view({ notice: { id: 1, message: "Hindi isn't available for this title — playing original audio" }, subtitle: "S1 · E3", onNextEpisode }));
    });
    expect(texts(r)).not.toContain("Hindi isn't available for this title — playing original audio");
    act(() => mockPlayerProps.onFirstFrame());
    expect(texts(r)).toContain("Hindi isn't available for this title — playing original audio");
    expect(mockControlsProps.subtitle).toBe("S1 · E3");
    expect(mockControlsProps.onNextEpisode).toBe(onNextEpisode);
  });
  it("on iPhone in landscape, back closes without the confirm (iOS can't present that alert sideways)", () => {
    const { Platform } = jest.requireActual("react-native");
    jest.replaceProperty(Platform, "OS", "ios");
    mockLandscape = true;
    const onClose = jest.fn();
    act(() => {
      create(view({ onClose }));
    });
    act(() => mockControlsProps.onBack());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockRequestClose).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it("in portrait, back asks first", () => {
    act(() => {
      create(view());
    });
    act(() => mockControlsProps.onBack());
    expect(mockRequestClose).toHaveBeenCalledTimes(1);
  });
  it("Change source closes settings first; on iPhone the source sheet waits until settings has gone (one sheet at a time)", () => {
    const { Platform } = jest.requireActual("react-native");
    const onOpenSource = jest.fn();
    act(() => {
      create(view({ onOpenSource }));
    });
    act(() => mockControlsProps.onOpenSettings());
    expect(mockSheetProps.visible).toBe(true);
    jest.replaceProperty(Platform, "OS", "ios");
    act(() => mockSheetProps.source.onOpen());
    expect(mockSheetProps.visible).toBe(false);
    expect(onOpenSource).not.toHaveBeenCalled();
    act(() => mockSheetProps.onDismissed());
    expect(onOpenSource).toHaveBeenCalledTimes(1);
    jest.restoreAllMocks();
  });

  it("on Android, Change source opens the source sheet straight away", () => {
    jest.replaceProperty(jest.requireActual("react-native").Platform, "OS", "android");
    const onOpenSource = jest.fn();
    act(() => {
      create(view({ onOpenSource }));
    });
    act(() => mockControlsProps.onOpenSettings());
    act(() => mockSheetProps.source.onOpen());
    expect(mockSheetProps.visible).toBe(false);
    expect(onOpenSource).toHaveBeenCalledTimes(1);
    jest.restoreAllMocks();
  });
});
