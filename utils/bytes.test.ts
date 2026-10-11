import { base64ToBytes, decodeUtf8Strict } from "./bytes";

describe("decodeUtf8Strict", () => {
  it("decodes well-formed UTF-8, including astral characters", () => {
    const text = "plain ascii · हिंदी · 🎬";
    expect(decodeUtf8Strict(new Uint8Array(Buffer.from(text, "utf8")))).toBe(text);
  });

  it.each([
    ["a stray continuation byte", [0x61, 0x81]],
    ["a cut-off sequence", [0xe0, 0xa4]],
    ["an overlong form", [0xc0, 0xaf]],
    ["a surrogate", [0xed, 0xa0, 0x80]],
    ["beyond U+10FFFF", [0xf4, 0x90, 0x80, 0x80]],
  ])("refuses %s", (_, bytes) => expect(decodeUtf8Strict(new Uint8Array(bytes))).toBeNull());

  it("handles long input in chunks", () => {
    const text = "x".repeat(50_000) + "é";
    expect(decodeUtf8Strict(new Uint8Array(Buffer.from(text, "utf8")))).toBe(text);
  });
});

describe("base64ToBytes", () => {
  it("decodes", () => expect(Array.from(base64ToBytes("AAEC"))).toEqual([0, 1, 2]));
});
