import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { NOTICE_MS, PlayerToast } from "./PlayerToast";

const texts = (r: ReactTestRenderer) =>
  r.root.findAll((n) => typeof n.type === "string" && typeof n.props.children === "string").map((n) => n.props.children as string);

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("PlayerToast", () => {
  it("shows nothing without a notice", () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<PlayerToast notice={null} onDone={jest.fn()} />);
    });
    expect(texts(r)).toEqual([]);
  });

  it("shows the message and its action, and is done after a few seconds", () => {
    const onPress = jest.fn();
    const onDone = jest.fn();
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<PlayerToast notice={{ id: 1, message: "Switched to Castle — Hindi isn't on this one.", action: { label: "Change", onPress } }} onDone={onDone} />);
    });
    expect(texts(r)).toEqual(["Switched to Castle — Hindi isn't on this one.", "Change ▸"]);
    act(() => r.root.find((n) => n.props.accessibilityLabel === "Change" && typeof n.props.onPress === "function").props.onPress());
    expect(onPress).toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(NOTICE_MS - 1));
    expect(onDone).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("a new notice restarts the clock", () => {
    const onDone = jest.fn();
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<PlayerToast notice={{ id: 1, message: "a" }} onDone={onDone} />);
    });
    act(() => jest.advanceTimersByTime(NOTICE_MS - 100));
    act(() => r.update(<PlayerToast notice={{ id: 2, message: "b" }} onDone={onDone} />));
    act(() => jest.advanceTimersByTime(NOTICE_MS - 100));
    expect(onDone).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(100));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
