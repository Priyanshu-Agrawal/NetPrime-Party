import { Traffic } from "./traffic";

describe("Traffic", () => {
  it("counts a text body by length and a base64 body by its decoded size", () => {
    const t = new Traffic();
    t.add({ body: "hello", encoding: "text" });
    t.add({ body: "AAAA", encoding: "base64" }); // 3 bytes
    expect(t.bytes()).toBe(8);
  });
  it("ignores a response with no body", () => {
    const t = new Traffic();
    t.add({ body: undefined as unknown as string, encoding: "text" });
    expect(t.bytes()).toBe(0);
  });
});
