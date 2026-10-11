import { holdSandbox, sandboxDemand, warmSandbox } from "./demand";

describe("sandbox demand", () => {
  it("counts holders, and a release only counts once", () => {
    const a = holdSandbox();
    const b = holdSandbox();
    expect(sandboxDemand()).toBe(2);
    a();
    a();
    expect(sandboxDemand()).toBe(1);
    b();
    expect(sandboxDemand()).toBe(0);
  });
});

describe("warmSandbox", () => {
  it("holds the sandbox for a while after the latest call", () => {
    jest.useFakeTimers();
    try {
      warmSandbox(1000);
      expect(sandboxDemand()).toBe(1);
      jest.advanceTimersByTime(800);
      warmSandbox(1000); // a new resolve extends it, without a second hold
      expect(sandboxDemand()).toBe(1);
      jest.advanceTimersByTime(900);
      expect(sandboxDemand()).toBe(1);
      jest.advanceTimersByTime(200);
      expect(sandboxDemand()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
