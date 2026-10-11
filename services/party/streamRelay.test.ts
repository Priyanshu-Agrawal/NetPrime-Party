import { StreamRelay } from "./streamRelay";

function fakeChannel() {
  const handlers = new Map<string, (m: { payload: unknown }) => void>();
  const sent: { event: string; payload: unknown }[] = [];
  return {
    sent,
    deliver: (event: string, payload: unknown) => handlers.get(event)?.({ payload }),
    channel: {
      state: "joined",
      socket: { isConnected: () => true },
      send: jest.fn(async (a: { event: string; payload: unknown }) => void sent.push({ event: a.event, payload: a.payload })),
      httpSend: jest.fn(async () => {}),
      on: (_type: "broadcast", filter: { event: string }, cb: (m: { payload: unknown }) => void) => {
        handlers.set(filter.event, cb);
      },
    },
  };
}
const H = { itemId: "movie:1", key: "s/p:k", sourceId: "s/p", url: "https://cdn.example.net/a.m3u8", headers: { Referer: "https://r.example.net/" }, durationSec: 600 };

describe("StreamRelay", () => {
  it("sends the host's handoff and a guest's request over the room channel", async () => {
    const f = fakeChannel();
    const relay = new StreamRelay();
    relay.attach(f.channel);
    relay.send(H);
    relay.request("movie:1");
    await Promise.resolve();
    expect(f.sent).toEqual([
      { event: "stream", payload: H },
      { event: "stream-req", payload: { itemId: "movie:1" } },
    ]);
  });

  it("hands a valid incoming handoff to listeners and drops a bad one", () => {
    const f = fakeChannel();
    const relay = new StreamRelay();
    relay.attach(f.channel);
    const got = jest.fn();
    const off = relay.onStream(got);
    f.deliver("stream", H);
    f.deliver("stream", { ...H, url: "http://plain.example.net/a.m3u8" });
    expect(got).toHaveBeenCalledTimes(1);
    expect(got).toHaveBeenCalledWith(H);
    off();
    f.deliver("stream", H);
    expect(got).toHaveBeenCalledTimes(1);
  });

  it("passes on a request's item id", () => {
    const f = fakeChannel();
    const relay = new StreamRelay();
    relay.attach(f.channel);
    const got = jest.fn();
    relay.onRequest(got);
    f.deliver("stream-req", { itemId: "movie:1" });
    f.deliver("stream-req", { itemId: 5 });
    expect(got).toHaveBeenCalledTimes(1);
    expect(got).toHaveBeenCalledWith("movie:1");
  });

  it("never logs a handoff", () => {
    const spies = (["log", "warn", "error", "info", "debug"] as const).map((k) => jest.spyOn(console, k).mockImplementation(() => {}));
    const f = fakeChannel();
    const relay = new StreamRelay();
    relay.attach(f.channel);
    relay.onStream(() => {});
    relay.send(H);
    f.deliver("stream", H);
    f.deliver("stream", { garbage: true });
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    spies.forEach((s) => s.mockRestore());
  });

  it("sends nothing before it has a channel", () => {
    const relay = new StreamRelay();
    expect(() => relay.send(H)).not.toThrow();
  });

  it("tells members when the host's player stalls and recovers (no URL in it)", async () => {
    const f = fakeChannel();
    const relay = new StreamRelay();
    relay.attach(f.channel);
    const got = jest.fn();
    relay.onStall(got);
    relay.sendStall(true);
    await Promise.resolve();
    expect(f.sent).toEqual([{ event: "stall", payload: { stalled: true } }]);
    f.deliver("stall", { stalled: false });
    f.deliver("stall", { stalled: "yes" });
    expect(got).toHaveBeenCalledTimes(1);
    expect(got).toHaveBeenCalledWith(false);
  });
});

