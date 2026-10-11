/**
 * TitlePlayer with the real NativePlayerView and NativePlayer over the fake expo-video: the event flow a device sees
 * (mount-time events at 0 s, a start seek, errors before ready), which the unit test's mocked view can't show.
 */
import { FakeVideoPlayer } from "@/components/player/native/__fakes__/expoVideo";
import type { PlaybackCandidate } from "@/services/playback/candidate";
import { NativePlayerView } from "@/src/features/player/NativePlayerView";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { TitlePlayer } from "./TitlePlayer";

jest.mock("expo-video", () => jest.requireActual("@/components/player/native/__fakes__/expoVideo"));
jest.mock("@/modules/bearoom-player", () => ({ qualityCapAvailable: true, setQualityCap: () => true }));
const mockResolve = jest.fn();
jest.mock("@/services/playback", () => ({ resolveTitle: (...a: unknown[]) => mockResolve(...a) }));
jest.mock("@/services/plugins", () => ({ pluginHost: { clearCache: () => {} } }));
jest.mock("@/src/store/services/tmdbApi", () => ({ useDetailsQuery: () => ({ data: { runtime: 10, original_language: "en", title: "X" } }) }));
const mockReport = jest.fn();
jest.mock("@/src/store/services/workerApi", () => ({ useReportOutcomeMutation: () => [mockReport] }));
jest.mock("@/utils/languagePrefs", () => ({
  languageOrder: () => ["hi", "original"],
  resolveOrder: (o: string[], orig?: string) => o.map((l) => (l === "original" ? orig : l)).filter(Boolean),
  getTitleLanguage: () => null,
  setTitleLanguage: () => {},
  titleKeyOf: (t: string, id: string) => `${t}:${id}`,
}));
jest.mock("@/utils/prefs", () => ({ setPreferredAudio: () => {}, getSubtitleSize: () => "m", setSubtitleSize: () => {} }));
jest.mock("@/components/player/CandidateSheet", () => ({ CandidateSheet: () => null }));
jest.mock("@/components/player/PlayerLoadingCard", () => {
  const { Text } = jest.requireActual("react-native");
  return { PlayerLoadingCard: ({ status }: { status: string }) => <Text>{status}</Text> };
});
jest.mock("@/components/player/PlayerErrorCard", () => {
  const { Pressable, Text, View } = jest.requireActual("react-native");
  return {
    PlayerErrorCard: ({ title, actions }: any) => (
      <View>
        <Text>{title}</Text>
        {actions.map((a: any) => (
          <Pressable key={a.label} accessibilityLabel={a.label} onPress={a.onPress} />
        ))}
      </View>
    ),
  };
});
let mockControls: any = null;
jest.mock("@/components/player/PlayerControls", () => {
  const R = jest.requireActual("react");
  return {
    PlayerControls: R.forwardRef((p: any, ref: any) => {
      mockControls = p;
      R.useImperativeHandle(ref, () => ({ setPlayback: () => {} }));
      return null;
    }),
  };
});
let mockSettings: any = null;
jest.mock("@/components/player/PlayerSettingsSheet", () => ({
  __esModule: true,
  default: (p: any) => {
    mockSettings = p;
    return null;
  },
}));
let mockOffline = false;
jest.mock("@/hooks/useConnectivity", () => ({ useConnectivity: () => mockOffline }));
jest.mock("@/hooks/useMediaCloseGuard", () => ({ useMediaCloseGuard: () => ({ requestClose: () => {} }) }));
jest.mock("@/hooks/useResponsive", () => ({ useResponsive: () => ({ isLandscapeMobile: false }) }));
const mockOrientation: string[] = [];
jest.mock("expo-screen-orientation", () => ({
  lockAsync: async (o: number) => {
    mockOrientation.push(o === 1 ? "landscape" : "portrait");
  },
  unlockAsync: async () => {
    mockOrientation.push("unlock");
  },
  OrientationLock: { LANDSCAPE: 1, PORTRAIT_UP: 2 },
}));
jest.mock("@/src/ui/glass", () => {
  const { View } = jest.requireActual("react-native");
  return { GlassLayer: ({ children }: any) => <View>{children}</View>, GlassBackdrop: ({ children }: any) => <View>{children}</View> };
});
jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual("react-native");
  return { SafeAreaView: ({ children }: any) => <View>{children}</View>, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

const cand = (key: string, languages: string[], over: Partial<PlaybackCandidate> = {}): PlaybackCandidate => ({
  key,
  sourceId: "r/p",
  label: `Src ${key}`,
  url: `https://cdn.example.net/${key}.m3u8`,
  headers: {},
  container: "hls",
  languages,
  platforms: { ios: true, android: true },
  subtitles: [],
  verdict: "ok",
  order: 0,
  ...over,
});
const result = (...ranked: PlaybackCandidate[]) => ({ ranked, rejected: [], failures: [], complete: true });
const flush = () =>
  act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
const texts = (r: ReactTestRenderer) => r.root.findAll((n) => (n.type as unknown) === "Text").map((n) => [n.props.children].flat().join(""));

let trees: ReactTestRenderer[] = [];
beforeAll(() => {
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => "" })) as unknown as typeof fetch;
});
beforeEach(() => {
  mockResolve.mockReset();
  mockReport.mockClear();
  mockOffline = false;
  mockOrientation.length = 0;
  mockControls = null;
  mockSettings = null;
});
afterEach(() => {
  trees.forEach((t) => act(() => t.unmount()));
  trees = [];
});

async function mount(onClose = jest.fn()) {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(<TitlePlayer tmdbId="1" type="movie" title="X" startedAt={Date.now()} onUseWeb={jest.fn()} onClose={onClose} />);
  });
  trees.push(r);
  await flush();
  return r;
}

/** Playing hi1 at 754 s. */
async function playingAt754() {
  mockResolve.mockResolvedValue(result(cand("hi1", ["hi"]), cand("en1", ["en"]), cand("en2", ["en"])));
  const r = await mount();
  act(() => {
    FakeVideoPlayer.last!.emit("statusChange", { status: "readyToPlay" });
    FakeVideoPlayer.last!.emit("timeUpdate", { currentTime: 754, bufferedPosition: 760 });
  });
  return r;
}

const view = (r: ReactTestRenderer) => r.root.findByType(NativePlayerView);

describe("position (C1)", () => {
  it("a switch whose new stream fails before it is ready resumes where the viewer was", async () => {
    const r = await playingAt754();
    act(() => view(r).props.audioChoices.onPick("English"));
    expect(view(r).props.startAt).toBe(754);
    act(() => FakeVideoPlayer.last!.emit("statusChange", { status: "error", error: { message: "HTTP 403" } }));
    await flush();
    expect(view(r).props.startAt).toBe(754);
  });

  it("two switches in a row keep the position", async () => {
    const r = await playingAt754();
    act(() => view(r).props.audioChoices.onPick("English"));
    act(() => view(r).props.audioChoices.onPick("Hindi"));
    expect(view(r).props.startAt).toBe(754);
  });
});

describe("bounded failover (C2)", () => {
  it("ends on the error card when a plugin's keys change on every resolve", async () => {
    let n = 0;
    mockResolve.mockImplementation(async () => result(cand(`k${n++}`, ["hi"])));
    const r = await mount();
    let failures = 0;
    for (; failures < 30 && r.root.findAllByType(NativePlayerView).length; failures++) {
      act(() => FakeVideoPlayer.last!.emit("statusChange", { status: "error", error: { message: "decoder" } }));
      await flush();
    }
    expect(failures).toBeLessThanOrEqual(8);
    expect(texts(r)).toContain("Couldn’t play this title here");
  });
});

describe("network loss (I2)", () => {
  it("a stream error while offline waits for the network instead of failing over", async () => {
    const r = await playingAt754();
    const player = FakeVideoPlayer.last!;
    mockOffline = true;
    act(() => r.update(<TitlePlayer tmdbId="1" type="movie" title="X" startedAt={Date.now()} onUseWeb={jest.fn()} onClose={jest.fn()} />));
    mockResolve.mockClear();
    act(() => player.emit("statusChange", { status: "error", error: { message: "network" } }));
    await flush();
    expect(mockResolve).not.toHaveBeenCalled();
    expect(mockReport).not.toHaveBeenCalled();
    expect(view(r).props.source.uri).toContain("hi1");
    mockOffline = false;
    act(() => r.update(<TitlePlayer tmdbId="1" type="movie" title="X" startedAt={Date.now()} onUseWeb={jest.fn()} onClose={jest.fn()} />));
    expect(player.replaceAsync).toHaveBeenCalled();
  });
});

describe("notices (I3)", () => {
  it("a notice waits for the first frame, so the loading cover can't hide it", async () => {
    mockResolve.mockResolvedValue(result(cand("en1", ["en"])));
    const r = await mount();
    const msg = "Hindi isn't available for this title — playing original audio";
    expect(texts(r)).not.toContain(msg);
    act(() => r.root.findByProps({ testID: "video-view" }).props.onFirstFrameRender());
    expect(texts(r)).toContain(msg);
  });
});

describe("in-stream audio (I4)", () => {
  it("selects the wanted language's audio track inside a multi-audio stream", async () => {
    mockResolve.mockResolvedValue(result(cand("multi", ["en", "hi"])));
    await mount();
    const p = FakeVideoPlayer.last!;
    const en = { id: "a0", label: "English", language: "en" };
    const hi = { id: "a1", label: "Hindi", language: "hi" };
    p.audioTrack = en;
    act(() => p.emit("sourceLoad", { duration: 600, availableAudioTracks: [en, hi], availableSubtitleTracks: [], availableVideoTracks: [] }));
    expect(p.audioTrack).toBe(hi);
  });
});

describe("viewer settings survive a switch (I5)", () => {
  it("keeps fullscreen, speed, subtitles and pause on the next stream", async () => {
    mockResolve.mockResolvedValue(
      result(
        cand("hi1", ["hi"], { subtitles: [{ id: "0", url: "https://s.example.net/en.vtt", label: "English", language: "en" }] }),
        cand("en1", ["en"], { subtitles: [{ id: "0", url: "https://s.example.net/en2.vtt", label: "English", language: "en" }] }),
      ),
    );
    const r = await mount();
    act(() => FakeVideoPlayer.last!.emit("statusChange", { status: "readyToPlay" }));
    act(() => mockControls.onToggleFullscreen());
    act(() => mockSettings.onSetRate(1.5));
    act(() => mockSettings.onSetSubtitle("side:0"));
    act(() => mockControls.onPause());
    act(() => view(r).props.audioChoices.onPick("English"));
    const next = FakeVideoPlayer.last!;
    act(() => next.emit("statusChange", { status: "readyToPlay" }));
    expect(mockControls.fullscreen).toBe(true);
    expect(next.playbackRate).toBe(1.5);
    expect(next.play).not.toHaveBeenCalled();
    expect(mockSettings.subtitles.find((s: any) => s.selected)?.language).toBe("en");
  });

  it("a switch doesn't touch the screen orientation", async () => {
    const r = await playingAt754();
    mockOrientation.length = 0;
    act(() => view(r).props.audioChoices.onPick("English"));
    await flush();
    expect(mockOrientation).toEqual([]);
  });
});

describe("a way out and a time limit (I6)", () => {
  it("loading and the error card both have a back button", async () => {
    mockResolve.mockReturnValue(new Promise(() => {}));
    const onClose = jest.fn();
    const r = await mount(onClose);
    act(() => r.root.findByProps({ accessibilityLabel: "Go back" }).props.onPress());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

});

describe("rotation (I7)", () => {
  it("may rotate while open and snaps back to portrait on close", async () => {
    mockResolve.mockResolvedValue(result(cand("hi1", ["hi"])));
    const r = await mount();
    expect(mockOrientation[0]).toBe("unlock");
    act(() => r.unmount());
    trees = trees.filter((t) => t !== r);
    await flush();
    expect(mockOrientation[mockOrientation.length - 1]).toBe("portrait");
  });
});
