// One mock whose native module each test sets; the rest of expo-modules-core stays real (jest-expo's runtime reads it).
let mockNative: { fetchOnce: jest.Mock } | null = null;
jest.mock("expo-modules-core", () => ({
  ...jest.requireActual("expo-modules-core"),
  requireOptionalNativeModule: () => mockNative,
}));

function load() {
  let mod!: typeof import("./index");
  jest.isolateModules(() => {
    mod = jest.requireActual("./index");
  });
  return mod;
}

const REQ = {
  url: "https://example.com/",
  method: "GET",
  headers: {},
  timeoutMs: 8000,
  maxBytes: 1024,
  responseType: "text" as const,
};

describe("fetchOnce", () => {
  it("hands the request to the native module and returns its answer", async () => {
    const answer = { status: 200, url: REQ.url, headers: {}, cookies: [], body: "ok", encoding: "text", truncated: false, sha256: "x" };
    mockNative = { fetchOnce: jest.fn().mockResolvedValue(answer) };
    const { fetchOnce, nativeFetchAvailable } = load();
    expect(nativeFetchAvailable).toBe(true);
    await expect(fetchOnce(REQ)).resolves.toEqual(answer);
    expect(mockNative.fetchOnce).toHaveBeenCalledWith(REQ);
  });

  it.each(["ERR_BLOCKED_ADDRESS", "ERR_TIMEOUT", "ERR_BAD_REQUEST"])("keeps the native error code %s", async (code) => {
    mockNative = { fetchOnce: jest.fn().mockRejectedValue(Object.assign(new Error("boom"), { code })) };
    const { fetchOnce } = load();
    await expect(fetchOnce(REQ)).rejects.toMatchObject({ name: "NativeFetchError", code });
  });

  it("reports any other failure as a network error", async () => {
    mockNative = { fetchOnce: jest.fn().mockRejectedValue(new Error("weird")) };
    const { fetchOnce } = load();
    await expect(fetchOnce(REQ)).rejects.toMatchObject({ code: "ERR_NETWORK" });
  });

  it("fails cleanly where the module is missing (web, old binary)", async () => {
    mockNative = null;
    const { fetchOnce, nativeFetchAvailable } = load();
    expect(nativeFetchAvailable).toBe(false);
    await expect(fetchOnce(REQ)).rejects.toMatchObject({ code: "ERR_NETWORK" });
  });
});
