import { fetchWithTimeout } from "./fetchWithTimeout";

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

/** A response whose headers arrive at once (expo/fetch semantics) but whose body never finishes. */
function stalledBodyResponse(): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers({ "content-type": "application/json" }),
    text: () => new Promise<string>(() => {}),
    json: () => new Promise(() => {}),
  } as unknown as Response;
}

describe("fetchWithTimeout", () => {
  it("times out when the body stalls after the headers arrive", async () => {
    global.fetch = jest.fn().mockResolvedValue(stalledBodyResponse());
    await expect(
      fetchWithTimeout("https://x.test/a", {}, { timeoutMs: 30, retries: 0 }),
    ).rejects.toThrow();
  });

  it("retries a stalled body and returns the retry's data", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(stalledBodyResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [1, 2] }), { status: 200 }));
    const res = await fetchWithTimeout("https://x.test/b", {}, { timeoutMs: 30, retries: 1, backoffMs: 1 });
    expect(res.ok).toBe(true);
    await expect(res.json()).resolves.toEqual({ results: [1, 2] });
  });

  it("hands HTTP errors back without retrying, body intact", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ status_message: "nope" }), { status: 404 }));
    global.fetch = fetchMock;
    const res = await fetchWithTimeout("https://x.test/c", {}, { timeoutMs: 1000, retries: 1 });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ status_message: "nope" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
