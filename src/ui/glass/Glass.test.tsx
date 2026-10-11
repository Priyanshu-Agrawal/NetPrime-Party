import { NavigationContext } from "@react-navigation/native";
import React from "react";
import { processColor } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { colors } from "@/theme/bearoom";

const mockPlatform = { os: "android", androidApi: 35, liquidAvailable: false };
jest.mock("./platform", () => ({
  get glassPlatform() {
    return mockPlatform; // read at render time: the factory runs before this file's consts exist
  },
  nativeTagOf: () => 42,
}));
jest.mock("@/modules/bearoom-glass", () => {
  const R = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  return {
    NativeGlassBackdrop: R.forwardRef((p: object, ref: unknown) => <View ref={ref} testID="backdrop" {...p} />),
    NativeGlassView: (p: object) => <View testID="native-glass" {...p} />,
  };
});
jest.mock("expo-glass-effect", () => {
  const { View } = jest.requireActual("react-native");
  return { GlassView: (p: object) => <View testID="liquid" {...p} /> };
});
jest.mock("expo-blur", () => {
  const { View } = jest.requireActual("react-native");
  return { BlurView: (p: object) => <View testID="system-blur" {...p} /> };
});

// eslint-disable-next-line import/first
import { Glass } from "./Glass";
// eslint-disable-next-line import/first
import { GlassBackdrop, GlassLayer } from "./GlassBackdrop";
// eslint-disable-next-line import/first
import { GlassVisible } from "./visibility";

const focused = { isFocused: () => true, addListener: () => () => {} };
const onScreen = (el: React.ReactElement) => (
  <NavigationContext.Provider value={focused as never}>{el}</NavigationContext.Provider>
);
function render(el: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(onScreen(el));
  });
  return r;
}
const all = (r: ReactTestRenderer, id: string) => r.root.findAll((n) => n.props?.testID === id);
const has = (r: ReactTestRenderer, id: string) => all(r, id).length > 0;

describe("Glass on Android", () => {
  beforeEach(() => Object.assign(mockPlatform, { os: "android", androidApi: 35, liquidAvailable: false }));

  it("blurs the focused screen's backdrop", () => {
    const r = render(<><GlassBackdrop /><Glass material="bar" /></>);
    expect(has(r, "native-glass")).toBe(true);
    expect(all(r, "native-glass")[0].props.backdropTag).toBe(42);
    act(() => r.unmount());
  });

  it("paints the screen background under the blurred copy, so text behind the glass can't show through", () => {
    // The backdrop holds the screen's content, not its background: blurred on its own, text and gaps stay
    // see-through and the sharp originals show through the glass.
    const r = render(<><GlassBackdrop /><Glass material="bar" /></>);
    expect(all(r, "native-glass")[0].props.baseColor).toBe(processColor(colors.bg));
    act(() => r.unmount());
  });

  it("is crafted when it sits inside the backdrop it would blur (hero chips inside Home's content)", () => {
    const r = render(<GlassBackdrop><Glass material="bar" /></GlassBackdrop>);
    expect(has(r, "native-glass")).toBe(false);
    act(() => r.unmount());
  });

  it("is crafted with no backdrop on screen (party screen)", () => {
    const r = render(<Glass />);
    expect(has(r, "native-glass")).toBe(false);
    act(() => r.unmount());
  });

  it("is crafted when the caller opts out (inside a Modal, a separate window)", () => {
    const r = render(<><GlassBackdrop /><Glass material="bar" backdrop="none" /></>);
    expect(has(r, "native-glass")).toBe(false);
    act(() => r.unmount());
  });

  it("is crafted below Android 12", () => {
    mockPlatform.androidApi = 30;
    const r = render(<><GlassBackdrop /><Glass material="bar" /></>);
    expect(has(r, "native-glass")).toBe(false);
    act(() => r.unmount());
  });

  it("inside a GlassLayer blurs the layer's backdrop, never the screen's", () => {
    const r = render(<><GlassBackdrop /><GlassLayer><Glass material="bar" /></GlassLayer></>);
    expect(has(r, "native-glass")).toBe(false); // the layer's backdrop hasn't mounted yet
    act(() => r.update(onScreen(<><GlassBackdrop /><GlassLayer><GlassBackdrop /><Glass material="bar" /></GlassLayer></>)));
    expect(has(r, "native-glass")).toBe(true);
    act(() => r.unmount());
  });

  it("falls back to crafted when its backdrop unmounts (screen popped, player source switched)", () => {
    const r = render(<><GlassBackdrop /><Glass material="bar" /></>);
    expect(has(r, "native-glass")).toBe(true);
    act(() => r.update(onScreen(<Glass material="bar" />)));
    expect(has(r, "native-glass")).toBe(false);
    act(() => r.unmount());
  });
});

describe("Glass on iOS", () => {
  beforeEach(() => Object.assign(mockPlatform, { os: "ios", androidApi: 0, liquidAvailable: true }));

  it("uses Liquid Glass for controls and switches it off while faded out", () => {
    jest.useFakeTimers();
    const r = render(<Glass material="control" />);
    const liquid = () => all(r, "liquid")[0];
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(liquid().props.glassEffectStyle).toMatchObject({ style: "regular", animate: true });
    act(() => r.update(onScreen(<Glass material="control" visible={false} />)));
    expect(liquid().props.glassEffectStyle).toMatchObject({ style: "none" });
    act(() => r.unmount());
    jest.useRealTimers();
  });

  it("turns Liquid Glass on only once the parent's fade-in has left 0 (expo issue 41024)", () => {
    jest.useFakeTimers();
    const r = render(<Glass material="bar" visible={false} />);
    const style = () => all(r, "liquid")[0].props.glassEffectStyle.style;
    act(() => r.update(onScreen(<Glass material="bar" visible />)));
    expect(style()).toBe("none"); // the fade starts from opacity 0 in this same commit
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(style()).toBe("regular");
    act(() => r.unmount());
    jest.useRealTimers();
  });

  it("follows the visibility of the surface it sits in (party top buttons inside the fading controls)", () => {
    jest.useFakeTimers();
    const r = render(<GlassVisible value={false}><Glass material="control" /></GlassVisible>);
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(all(r, "liquid")[0].props.glassEffectStyle.style).toBe("none");
    act(() => r.unmount());
    jest.useRealTimers();
  });

  it("lets interactive Liquid Glass receive touches (its press effect) and keeps the rest out of the way", () => {
    const r = render(<><Glass material="control" interactive /><Glass material="control" /></>);
    const [interactive, plain] = all(r, "liquid").filter((n) => typeof n.type === "string"); // native views only
    expect(interactive.props.pointerEvents).toBe("auto");
    expect(plain.props.pointerEvents).toBe("none");
    act(() => r.unmount());
  });

  it("uses the system blur for sheets", () => {
    const r = render(<Glass material="sheet" />);
    expect(has(r, "system-blur")).toBe(true);
    expect(has(r, "liquid")).toBe(false);
    act(() => r.unmount());
  });
});
