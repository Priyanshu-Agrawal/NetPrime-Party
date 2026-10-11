import type { PlayerHandle } from "@/components/player/types";
import type { QueueItem, QueueRefPlugin, StreamHandoff } from "@/services/party/protocol";
import type { PlaybackCandidate } from "@/services/playback/candidate";
import React, { createRef } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { NativeRoomPlayer } from "./NativeRoomPlayer";

let mockPlayer: any = null;
jest.mock("@/components/player/native/NativePlayer", () => {
  const R = jest.requireActual("react");
  return {
    NativePlayer: R.forwardRef((p: any, ref: any) => {
      mockPlayer = p;
      R.useImperativeHandle(ref, () => ({
        play: jest.fn(),
        pause: jest.fn(),
        seek: jest.fn(async (s: number) => s),
        setRate: jest.fn(),
        getCapabilities: () => ({ fractionalRate: true, preciseSeek: true, audioTracks: true, qualitySelect: true, subtitles: true, partySync: false }),
      }));
      return null;
    }),
  };
});
jest.mock("@/components/player/PlayerLoadingCard", () => {
  const { Text } = jest.requireActual("react-native");
  return { PlayerLoadingCard: ({ status }: { status: string }) => <Text>{status}</Text> };
});
jest.mock("@/components/player/PlayerErrorCard", () => {
  const { Text } = jest.requireActual("react-native");
  return { PlayerErrorCard: ({ title, message }: { title: string; message: string }) => <Text>{`${title} — ${message}`}</Text> };
});

const ITEM = { id: "movie:10378", ref: { source: "plugin", tmdbId: "10378", type: "movie", pluginId: "s/p", streamId: "s/p:k1", language: "en" }, status: "queued" } as unknown as QueueItem & { ref: QueueRefPlugin };
const cand = (over: Partial<PlaybackCandidate> = {}): PlaybackCandidate => ({
  key: "s/p:k1",
  sourceId: "s/p",
  label: "Src",
  url: "https://cdn.example.net/host.m3u8",
  headers: { Referer: "https://r.example.net/" },
  container: "hls",
  languages: ["en"],
  durationSec: 600,
  platforms: { ios: true, android: true },
  subtitles: [],
  verdict: "ok",
  order: 0,
  ...over,
});
function relay() {
  const streamCbs = new Set<(h: StreamHandoff) => void>();
  const reqCbs = new Set<(id: string) => void>();
  return {
    send: jest.fn(),
    request: jest.fn(),
    onStream: (cb: (h: StreamHandoff) => void) => (streamCbs.add(cb), () => streamCbs.delete(cb)),
    onRequest: (cb: (id: string) => void) => (reqCbs.add(cb), () => reqCbs.delete(cb)),
    deliver: (h: StreamHandoff) => streamCbs.forEach((cb) => cb(h)),
    ask: (id: string) => reqCbs.forEach((cb) => cb(id)),
  };
}
const texts = (r: ReactTestRenderer) => r.root.findAll((n) => (n.type as unknown) === "Text").map((n) => String(n.props.children));
const flush = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
const HOSTH: StreamHandoff = { itemId: ITEM.id, key: "s/p:k1", sourceId: "s/p", url: "https://cdn.example.net/host.m3u8", headers: { Referer: "https://r.example.net/" }, container: "hls", durationSec: 600, language: "en" };

let trees: ReactTestRenderer[] = [];
afterEach(() => {
  trees.forEach((t) => act(() => t.unmount()));
  trees = [];
  mockPlayer = null;
});
function mount(props: Partial<React.ComponentProps<typeof NativeRoomPlayer>>, ref = createRef<PlayerHandle>()) {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(
      <NativeRoomPlayer
        ref={ref}
        item={ITEM}
        isHost={false}
        roomCode="ABCD"
        relay={null}
        onPlayerEvent={jest.fn()}
        onBound={jest.fn()}
        relocate={jest.fn(async () => null)}
        takePending={() => null}
        {...props}
      />,
    );
  });
  trees.push(r);
  return { r, ref };
}

describe("NativeRoomPlayer — host", () => {
  it("plays its own stream and hands it to the room (no URL anywhere but the handoff)", async () => {
    const rl = relay();
    mount({ isHost: true, relay: rl as never, takePending: () => cand() });
    await flush();
    expect(mockPlayer.source).toEqual({ uri: "https://cdn.example.net/host.m3u8", headers: { Referer: "https://r.example.net/" }, contentType: "hls" });
    expect(mockPlayer.autoPlay).toBe(false);
    expect(rl.send).toHaveBeenCalledWith(HOSTH);
    rl.send.mockClear();
    act(() => rl.ask(ITEM.id));
    expect(rl.send).toHaveBeenCalledWith(HOSTH);
    act(() => rl.ask("movie:other"));
    expect(rl.send).toHaveBeenCalledTimes(1);
  });

  it("after an app restart (nothing pending) finds the same stream again", async () => {
    const relocate = jest.fn(async () => cand({ url: "https://cdn.example.net/again.m3u8" }));
    mount({ isHost: true, relay: relay() as never, relocate });
    await flush();
    expect(relocate).toHaveBeenCalledWith(expect.objectContaining({ key: "s/p:k1", sourceId: "s/p", language: "en", itemId: ITEM.id }));
    expect(mockPlayer.source.uri).toBe("https://cdn.example.net/again.m3u8");
  });
});

describe("NativeRoomPlayer — guest", () => {
  it("asks for the host's stream and plays it; a handoff for another item is ignored", async () => {
    const rl = relay();
    const { r } = mount({ relay: rl as never });
    expect(rl.request).toHaveBeenCalledWith(ITEM.id);
    expect(texts(r)).toContain("Waiting for the host's stream…");
    act(() => rl.deliver({ ...HOSTH, itemId: "movie:other", url: "https://cdn.example.net/wrong.m3u8" }));
    expect(mockPlayer).toBeNull();
    act(() => rl.deliver(HOSTH));
    expect(mockPlayer.source.uri).toBe(HOSTH.url);
  });

  it("when the host's link won't load here, plays its own copy of the same cut", async () => {
    const rl = relay();
    const relocate = jest.fn(async () => cand({ url: "https://cdn.example.net/mine.m3u8", durationSec: 601 }));
    mount({ relay: rl as never, relocate });
    act(() => rl.deliver(HOSTH));
    act(() => mockPlayer.onFatalError("HTTP 403"));
    await flush();
    expect(mockPlayer.source.uri).toBe("https://cdn.example.net/mine.m3u8");
  });

  it("a different cut (or none) says this source won't play here", async () => {
    const rl = relay();
    const { r } = mount({ relay: rl as never, relocate: jest.fn(async () => cand({ durationSec: 640 })) });
    act(() => rl.deliver(HOSTH));
    act(() => mockPlayer.onFatalError("HTTP 403"));
    await flush();
    expect(texts(r)).toContain("This source won't play here — Ask the host to pick another source.");
  });
});

describe("NativeRoomPlayer — the handle", () => {
  it("tells the party it's the native engine (buffering protocol on), and reports its first frame once", async () => {
    const onBound = jest.fn();
    const { ref } = mount({ isHost: true, relay: relay() as never, takePending: () => cand(), onBound });
    await flush();
    expect(ref.current?.engine).toBe("native");
    expect(ref.current?.getCapabilities().partySync).toBe(true);
    act(() => mockPlayer.onFirstFrame());
    act(() => mockPlayer.onFirstFrame());
    expect(onBound).toHaveBeenCalledTimes(1);
  });
});
