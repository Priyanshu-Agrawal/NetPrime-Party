import React, { useRef } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useScrollToTopOnChange, type ScrollableToOffset } from "./useScrollToTopOnChange";

function Probe({ resultsKey, list }: { resultsKey: string; list: ScrollableToOffset }) {
  const ref = useRef<ScrollableToOffset | null>(list);
  useScrollToTopOnChange(ref, resultsKey);
  return null;
}

describe("useScrollToTopOnChange", () => {
  let renderer: ReactTestRenderer;
  const list = { scrollToOffset: jest.fn() };

  beforeEach(() => {
    list.scrollToOffset.mockClear();
    act(() => {
      renderer = create(<Probe resultsKey="batman|multi" list={list} />);
    });
  });

  it("leaves the list alone when it first appears", () => {
    expect(list.scrollToOffset).not.toHaveBeenCalled();
  });

  it("leaves the list alone when the same results re-render (pagination)", () => {
    act(() => renderer.update(<Probe resultsKey="batman|multi" list={list} />));
    expect(list.scrollToOffset).not.toHaveBeenCalled();
  });

  it("jumps to the top, without animating, when the results change", () => {
    act(() => renderer.update(<Probe resultsKey="joker|multi" list={list} />));
    expect(list.scrollToOffset).toHaveBeenCalledTimes(1);
    expect(list.scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: false });
  });
});
