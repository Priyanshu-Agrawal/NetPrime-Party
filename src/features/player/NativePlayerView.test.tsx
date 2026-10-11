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
jest.mock("@/components/player/PlayerControls", () => {
  const R = jest.requireActual("react");
  return {
    PlayerControls: R.forwardRef((_p: any, ref: any) => {
      R.useImperativeHandle(ref, () => ({ setPlayback: jest.fn() }));
      return null;
    }),
  };
});
jest.mock("@/components/player/PlayerSettingsSheet", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/player/PlayerLoadingCard", () => {
  const { Text } = jest.requireActual("react-native");
  return { PlayerLoadingCard: ({ status }: { status: string }) => <Text>{status}</Text> };
});
jest.mock("@/hooks/useConnectivity", () => ({ useConnectivity: () => mockOffline }));
jest.mock("@/hooks/useMediaCloseGuard", () => ({ useMediaCloseGuard: () => ({ requestClose: jest.fn() }) }));
jest.mock("@/hooks/useResponsive", () => ({ useResponsive: () => ({ isLandscapeMobile: false }) }));
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
});
