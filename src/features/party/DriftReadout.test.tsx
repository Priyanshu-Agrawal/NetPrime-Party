import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { DriftReadout } from "./DriftReadout";

let mockOn = true;
jest.mock("@/src/features/dev/testStreamsGate", () => ({ useTestStreamsEnabled: () => mockOn }));
const texts = (r: ReactTestRenderer) => r.root.findAll((n) => (n.type as unknown) === "Text").map((n) => String(n.props.children));

describe("DriftReadout", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("shows p50/p95 drift every 2 s in test builds", () => {
    let stats = { n: 0, p50: 0, p95: 0 };
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<DriftReadout stats={() => stats} />);
    });
    stats = { n: 120, p50: 0.08, p95: 0.213 };
    act(() => jest.advanceTimersByTime(2000));
    expect(texts(r)).toEqual(["drift p50 0.08 s · p95 0.21 s · n 120"]);
    act(() => r.unmount());
  });

  it("renders nothing in a shipped build", () => {
    mockOn = false;
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<DriftReadout stats={() => ({ n: 1, p50: 0, p95: 0 })} />);
    });
    expect(r.toJSON()).toBeNull();
    mockOn = true;
  });
});
