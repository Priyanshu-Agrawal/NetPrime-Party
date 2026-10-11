import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useAutoAdvance } from "./useAutoAdvance";

function Probe({ active, onAdvance }: { active: boolean; onAdvance: () => void }) {
  useAutoAdvance(onAdvance, 6000, active);
  return null;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("useAutoAdvance", () => {
  it("advances on the interval while active", () => {
    const onAdvance = jest.fn();
    act(() => {
      create(<Probe active onAdvance={onAdvance} />);
    });
    act(() => jest.advanceTimersByTime(12_000));
    expect(onAdvance).toHaveBeenCalledTimes(2);
  });

  it("stays still while the screen is covered, and picks up again when it's back", () => {
    const onAdvance = jest.fn();
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<Probe active={false} onAdvance={onAdvance} />);
    });
    act(() => jest.advanceTimersByTime(30_000));
    expect(onAdvance).not.toHaveBeenCalled();
    act(() => r.update(<Probe active onAdvance={onAdvance} />));
    act(() => jest.advanceTimersByTime(6_000));
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });
});
