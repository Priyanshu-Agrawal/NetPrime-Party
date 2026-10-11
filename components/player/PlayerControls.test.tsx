// components/player/PlayerControls.test.tsx
import { ms } from "@/theme/bearoom";
import React from "react";
import { StyleSheet } from "react-native";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { PlayerControls, type PlayerControlsHandle } from "./PlayerControls";

const STATUS_BAR = 47;
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 0, left: 0, right: 0 }),
}));
// GlassCard pulls in the native blur module; the header is what is under test.
jest.mock("@/components/ui/GlassCard", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});
jest.mock("@/src/ui/glass", () => {
  const { View } = jest.requireActual("react-native");
  const actual = jest.requireActual("@/src/ui/glass/visibility");
  return { Glass: (p: object) => <View testID="glass" {...p} />, ...actual };
});

const base = {
  canControl: true,
  roomPlaying: false,
  onPlay: () => {},
  onPause: () => {},
  onSeekTo: () => {},
  onSeekBy: () => {},
};

// Every tree is unmounted after its test, so hide / unlock / ripple timers never outlive it.
const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  mounted.splice(0).forEach((r) => act(() => r.unmount()));
});

function render(el: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(el);
  });
  mounted.push(r);
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

describe("PlayerControls glass", () => {
  it("puts glass behind the transport and hides it with the controls (Liquid Glass must not sit at alpha 0)", () => {
    const r = render(<PlayerControls {...base} onBack={() => {}} />);
    const glass = () => r.root.findAll((n) => n.props?.testID === "glass");
    expect(glass().length).toBeGreaterThanOrEqual(3); // back button, −10, +10
    expect(glass().every((g) => g.props.visible === true)).toBe(true);
    // A tap on the video hides the controls (they start paused, so they never auto-hide here).
    const overlay = r.root.findAll((n) => typeof n.props?.onPress === "function")[0];
    act(() => overlay.props.onPress());
    expect(glass().every((g) => g.props.visible === false)).toBe(true);
  });
});

describe("PlayerControls top bar", () => {
  it("tells glass in the top bar when the controls hide (the party's back button and ROOM pill)", () => {
    const { GlassVisibleContext } = jest.requireActual("@/src/ui/glass/visibility");
    const seen: boolean[] = [];
    function Probe() {
      seen.push(React.useContext(GlassVisibleContext));
      return null;
    }
    const r = render(<PlayerControls {...base} topBar={<Probe />} />);
    expect(seen[seen.length - 1]).toBe(true);
    const overlay = r.root.findAll((n) => typeof n.props?.onPress === "function")[0];
    act(() => overlay.props.onPress());
    expect(seen[seen.length - 1]).toBe(false);
  });
});
const glassShown = (r: ReactTestRenderer) =>
  r.root.findAll((n) => n.props?.testID === "glass").every((g) => g.props.visible === true);
const surface = (r: ReactTestRenderer) =>
  r.root.find((n) => n.props?.accessibilityLabel === "Player surface" && typeof n.props.onPress === "function");
const byLabel = (r: ReactTestRenderer, label: string) =>
  r.root.find((n) => n.props?.accessibilityLabel === label && typeof n.props.onPress === "function");
const hasLabel = (r: ReactTestRenderer, label: string) =>
  r.root.findAll((n) => n.props?.accessibilityLabel === label).length > 0;
function sized(r: ReactTestRenderer) {
  act(() => surface(r).props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 200 } } }));
}

describe("PlayerControls gestures", () => {
  afterEach(() => jest.restoreAllMocks());

  it("a double-tap streak seeks from where it started: +10 s, then +20 s, even before the player catches up", () => {
    const onSeekTo = jest.fn();
    const onSeekBy = jest.fn();
    const now = jest.spyOn(Date, "now");
    const ref = React.createRef<PlayerControlsHandle>();
    const r = render(<PlayerControls ref={ref} {...base} onSeekTo={onSeekTo} onSeekBy={onSeekBy} onBack={() => {}} />);
    sized(r);
    act(() => ref.current!.setPlayback({ currentTime: 100, duration: 600, paused: true }));
    now.mockReturnValue(1000);
    act(() => surface(r).props.onPress({ nativeEvent: { locationX: 280 } }));
    now.mockReturnValue(1200);
    act(() => surface(r).props.onPress({ nativeEvent: { locationX: 280 } }));
    expect(onSeekTo).toHaveBeenLastCalledWith(110);
    expect(glassShown(r)).toBe(true);
    // The player hasn't reported the first seek yet (still 100) when the third tap lands.
    act(() => ref.current!.setPlayback({ currentTime: 100, duration: 600, paused: true }));
    now.mockReturnValue(1600);
    act(() => surface(r).props.onPress({ nativeEvent: { locationX: 280 } }));
    expect(onSeekTo).toHaveBeenLastCalledWith(120);
    expect(onSeekBy).not.toHaveBeenCalled();
    expect(texts(r)).toContain("20 s");
  });

  it("double-tapping the left third seeks back, never before the start", () => {
    const onSeekTo = jest.fn();
    const now = jest.spyOn(Date, "now");
    const ref = React.createRef<PlayerControlsHandle>();
    const r = render(<PlayerControls ref={ref} {...base} onSeekTo={onSeekTo} />);
    sized(r);
    act(() => ref.current!.setPlayback({ currentTime: 15, duration: 600, paused: true }));
    now.mockReturnValue(1000);
    act(() => surface(r).props.onPress({ nativeEvent: { locationX: 20 } }));
    now.mockReturnValue(1100);
    act(() => surface(r).props.onPress({ nativeEvent: { locationX: 20 } }));
    expect(onSeekTo).toHaveBeenLastCalledWith(5);
    now.mockReturnValue(1400);
    act(() => surface(r).props.onPress({ nativeEvent: { locationX: 20 } }));
    expect(onSeekTo).toHaveBeenLastCalledWith(0);
  });

  it("a guest's double tap only toggles", () => {
    const onSeekTo = jest.fn();
    const onSeekBy = jest.fn();
    const now = jest.spyOn(Date, "now");
    const r = render(<PlayerControls {...base} canControl={false} onSeekTo={onSeekTo} onSeekBy={onSeekBy} />);
    sized(r);
    now.mockReturnValue(1000);
    act(() => surface(r).props.onPress({ nativeEvent: { locationX: 280 } }));
    now.mockReturnValue(1100);
    act(() => surface(r).props.onPress({ nativeEvent: { locationX: 280 } }));
    expect(onSeekTo).not.toHaveBeenCalled();
    expect(onSeekBy).not.toHaveBeenCalled();
  });

  it("lock hides the controls; a tap shows only the unlock pill, which brings them back", () => {
    const r = render(<PlayerControls {...base} onBack={() => {}} />);
    act(() => byLabel(r, "Lock controls").props.onPress());
    expect(glassShown(r)).toBe(false);
    act(() => surface(r).props.onPress({ nativeEvent: { locationX: 150 } }));
    expect(glassShown(r)).toBe(false);
    act(() => byLabel(r, "Unlock controls").props.onPress());
    expect(glassShown(r)).toBe(true);
    expect(hasLabel(r, "Unlock controls")).toBe(false);
  });
});

describe("PlayerControls timing", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("hides itself 3 s after playback starts", () => {
    const ref = React.createRef<PlayerControlsHandle>();
    const r = render(<PlayerControls ref={ref} {...base} onBack={() => {}} />);
    act(() => ref.current!.setPlayback({ currentTime: 1, duration: 100, paused: false }));
    act(() => jest.advanceTimersByTime(2900));
    expect(glassShown(r)).toBe(true);
    act(() => jest.advanceTimersByTime(200));
    expect(glassShown(r)).toBe(false);
  });

  it("while the controls show, the spinner takes the play button's place instead of stacking on it", () => {
    const ref = React.createRef<PlayerControlsHandle>();
    const r = render(<PlayerControls ref={ref} {...base} />);
    act(() => ref.current!.setPlayback({ currentTime: 5, duration: 100, paused: false, readyState: 2 }));
    act(() => jest.advanceTimersByTime(350));
    const inButton = r.root.findAll((n) => n.props?.accessibilityLabel === "Buffering" && n.props?.testID === "play-buffering");
    expect(inButton.length).toBeGreaterThan(0);
    expect(r.root.findAll((n) => n.props?.testID === "buffer-layer")).toHaveLength(0);
  });

  it("shows the buffering spinner only after a 300 ms stall, and drops it at once", () => {
    const ref = React.createRef<PlayerControlsHandle>();
    const r = render(<PlayerControls ref={ref} {...base} />);
    const spinner = () => r.root.findAll((n) => n.props?.accessibilityLabel === "Buffering").length > 0;
    act(() => ref.current!.setPlayback({ currentTime: 5, duration: 100, paused: false, readyState: 2 }));
    act(() => jest.advanceTimersByTime(250));
    expect(spinner()).toBe(false);
    act(() => jest.advanceTimersByTime(100));
    expect(spinner()).toBe(true);
    act(() => ref.current!.setPlayback({ currentTime: 5, duration: 100, paused: false, readyState: 4 }));
    expect(spinner()).toBe(false);
  });
});

describe("PlayerControls bar", () => {
  it("shows the remaining time and toggles to the total", () => {
    const ref = React.createRef<PlayerControlsHandle>();
    const r = render(<PlayerControls ref={ref} {...base} />);
    act(() => ref.current!.setPlayback({ currentTime: 100, duration: 600, paused: true }));
    expect(texts(r)).toContain("−8:20");
    act(() => byLabel(r, "Toggle remaining time").props.onPress());
    expect(texts(r)).toContain("10:00");
  });

  it("draws the buffered range", () => {
    const ref = React.createRef<PlayerControlsHandle>();
    const r = render(<PlayerControls ref={ref} {...base} />);
    act(() => ref.current!.setPlayback({ currentTime: 100, duration: 600, paused: true, bufferedTime: 300 }));
    const buffered = r.root.find((n) => n.props?.testID === "buffered");
    expect(StyleSheet.flatten(buffered.props.style).width).toBe("50%");
  });

  it("shows one quick chip with the current audio, CC and quality, which opens the settings", () => {
    const onOpenSettings = jest.fn();
    const r = render(
      <PlayerControls {...base} onOpenSettings={onOpenSettings} chips={{ audio: "Hindi", subtitles: "English", quality: "1080p" }} />,
    );
    act(() => byLabel(r, "Playback options: Hindi · CC · 1080p").props.onPress());
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it("offers Next episode to whoever controls playback", () => {
    const onNextEpisode = jest.fn();
    const host = render(<PlayerControls {...base} onNextEpisode={onNextEpisode} />);
    act(() => byLabel(host, "Next episode").props.onPress());
    expect(onNextEpisode).toHaveBeenCalled();
    const guest = render(<PlayerControls {...base} canControl={false} onNextEpisode={onNextEpisode} />);
    expect(hasLabel(guest, "Next episode")).toBe(false);
  });
});
