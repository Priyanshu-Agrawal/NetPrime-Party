import { sendBroadcast, type BroadcastChannel } from "./broadcast";

function fakeChannel(state: string, connected: boolean) {
  const send = jest.fn().mockResolvedValue("ok");
  const httpSend = jest.fn().mockResolvedValue({ success: true });
  const channel: BroadcastChannel = { state, socket: { isConnected: () => connected }, send, httpSend };
  return { channel, send, httpSend };
}

describe("sendBroadcast", () => {
  it("uses the socket once the channel has joined", async () => {
    const { channel, send, httpSend } = fakeChannel("joined", true);
    await sendBroadcast(channel, "snap", { seq: 1 });
    expect(send).toHaveBeenCalledWith({ type: "broadcast", event: "snap", payload: { seq: 1 } });
    expect(httpSend).not.toHaveBeenCalled();
  });

  it("goes over REST explicitly while the channel is still joining", async () => {
    const { channel, send, httpSend } = fakeChannel("joining", true);
    await sendBroadcast(channel, "chat", { text: "hi" });
    expect(httpSend).toHaveBeenCalledWith("chat", { text: "hi" });
    expect(send).not.toHaveBeenCalled();
  });

  it("goes over REST while the socket is reconnecting", async () => {
    const { channel, send, httpSend } = fakeChannel("joined", false);
    await sendBroadcast(channel, "reaction", { emoji: "🔥" });
    expect(httpSend).toHaveBeenCalledWith("reaction", { emoji: "🔥" });
    expect(send).not.toHaveBeenCalled();
  });

  it("never throws when delivery fails", async () => {
    const { channel, httpSend } = fakeChannel("joining", true);
    httpSend.mockRejectedValueOnce(new Error("503"));
    await expect(sendBroadcast(channel, "chat", { text: "hi" })).resolves.toBeUndefined();
  });

  it("does nothing without a channel", async () => {
    await expect(sendBroadcast(null, "snap", {})).resolves.toBeUndefined();
  });
});
