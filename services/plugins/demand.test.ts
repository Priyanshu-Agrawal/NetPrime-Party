import { holdSandbox, sandboxDemand } from "./demand";

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
