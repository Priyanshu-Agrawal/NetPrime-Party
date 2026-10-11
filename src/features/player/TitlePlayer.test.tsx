import type { PlaybackCandidate } from "@/services/playback/candidate";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { RESOLVE_CAP_MS, TitlePlayer } from "./TitlePlayer";

const mockResolve = jest.fn();
jest.mock("@/services/playback", () => ({ resolveTitle: (...a: unknown[]) => mockResolve(...a) }));
const mockClearCache = jest.fn();
jest.mock("@/services/plugins", () => ({ pluginHost: { clearCache: () => mockClearCache() } }));
let mockDetails: Record<string, unknown> | undefined;
jest.mock("@/src/store/services/tmdbApi", () => ({ useDetailsQuery: () => ({ data: mockDetails }) }));
const mockReport = jest.fn();
jest.mock("@/src/store/services/workerApi", () => ({ useReportOutcomeMutation: () => [mockReport] }));
const mockSetTitleLanguage = jest.fn();
jest.mock("@/utils/languagePrefs", () => ({
  languageOrder: () => ["hi", "original"],
  resolveOrder: (order: string[], original?: string) => order.map((l) => (l === "original" ? original : l)).filter(Boolean),
  getTitleLanguage: () => null,
  setTitleLanguage: (...a: unknown[]) => mockSetTitleLanguage(...a),
  titleKeyOf: (t: string, id: string) => `${t}:${id}`,
}));
const mockSetPreferredAudio = jest.fn();
jest.mock("@/utils/prefs", () => ({ setPreferredAudio: (...a: unknown[]) => mockSetPreferredAudio(...a) }));
let mockViewProps: any = null;
jest.mock("@/src/features/player/NativePlayerView", () => ({
  NativePlayerView: (props: any) => {
    mockViewProps = props;
    return null;
  },
}));
let mockSheetProps: any = null;
jest.mock("@/components/player/CandidateSheet", () => ({
  CandidateSheet: (p: any) => {
    mockSheetProps = p;
    return null;
  },
}));
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
jest.mock("@/hooks/useConnectivity", () => ({ useConnectivity: () => false }));
const mockOpenPartyHost = jest.fn();
jest.mock("@/src/navigation/actions", () => ({ openPartyHost: (p: unknown) => mockOpenPartyHost(p) }));
jest.mock("@/utils/roomCode", () => ({ genRoomCode: () => "PARTY1" }));
jest.mock("expo-screen-orientation", () => ({ lockAsync: async () => {}, unlockAsync: async () => {}, OrientationLock: { LANDSCAPE: 1, PORTRAIT_UP: 2 } }));
jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual("react-native");
  return { SafeAreaView: ({ children }: any) => <View>{children}</View> };
});

const cand = (key: string, languages: string[], over: Partial<PlaybackCandidate> = {}): PlaybackCandidate => ({
  key,
  sourceId: "open-movies/open-movies",
  label: `Src ${key}`,
  url: `https://cdn.example.net/${key}.m3u8`,
  headers: { Referer: "https://r.example.net/" },
  container: "hls",
  languages,
  platforms: { ios: true, android: true },
  subtitles: [],
  verdict: "ok",
  order: 0,
  ...over,
});
const result = (...ranked: PlaybackCandidate[]) => ({ ranked, rejected: [], failures: [], complete: true });
const texts = (r: ReactTestRenderer) =>
  r.root.findAll((n) => typeof n.type === "string" && typeof n.props.children === "string").map((n) => n.props.children as string);
const flush = () => act(async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
});
/** A tick the view has vouched for: an event, and (as NativePlayerView does once the start seek landed) a position. */
const tick = (t: number, paused = false) =>
  act(() => {
    mockViewProps.onPlayerEvent({ event: "tick", currentTime: t, duration: 600, paused });
    mockViewProps.onPosition(t);
  });

async function mount(props: Partial<React.ComponentProps<typeof TitlePlayer>> = {}) {
  const onUseWeb = jest.fn();
  let r!: ReactTestRenderer;
  act(() => {
    r = create(<TitlePlayer tmdbId="10378" type="movie" title="Big Buck Bunny" startedAt={Date.now()} onUseWeb={onUseWeb} onClose={jest.fn()} {...props} />);
  });
  await flush();
  mounted.push(r);
  return { r, onUseWeb };
}
const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach((t) => t.unmount()));
});

beforeEach(() => {
  mockResolve.mockReset();
  mockReport.mockReset();
  mockClearCache.mockReset();
  mockSetTitleLanguage.mockReset();
  mockSetPreferredAudio.mockReset();
  mockViewProps = null;
  mockSheetProps = null;
  mockDetails = { runtime: 10, original_language: "en", title: "Big Buck Bunny" };
});

describe("TitlePlayer", () => {
  it("finds the best source, then plays it with its headers, subtitles and source line", async () => {
    const hi = cand("hi1", ["hi"], { subtitles: [{ id: "0", url: "https://s.example.net/en.srt", label: "English", language: "en" }], quality: { label: "1080p", height: 1080 } });
    let release!: (v: unknown) => void;
    mockResolve.mockReturnValue(new Promise((r) => (release = r)));
    const { r } = await mount();
    expect(texts(r)).toContain("Finding the best source…");
    expect(mockResolve).toHaveBeenCalledWith(
      { tmdbId: "10378", type: "movie", season: undefined, episode: undefined, titleName: "Big Buck Bunny", runtimeMin: 10, originalLanguage: "en" },
      ["hi", "en"],
    );
    release(result(hi, cand("en1", ["en"])));
    await flush();
    expect(mockViewProps).toMatchObject({
      source: { uri: "https://cdn.example.net/hi1.m3u8", headers: { Referer: "https://r.example.net/" }, contentType: "hls" },
      sidecarSubtitles: [{ id: "0", url: "https://s.example.net/en.srt", label: "English", language: "en" }],
      sourceLabel: "Src hi1 · Hindi · 1080p",
      startAt: 0,
    });
  });

  it("hands over to the web player when no stream plays here", async () => {
    mockResolve.mockResolvedValue(result());
    const { onUseWeb } = await mount();
    expect(onUseWeb).toHaveBeenCalledTimes(1);
    expect(mockViewProps).toBeNull();
  });

  it(`hands over after ${RESOLVE_CAP_MS / 1000} s, and ignores a late answer`, async () => {
    jest.useFakeTimers();
    try {
      let release!: (v: unknown) => void;
      mockResolve.mockReturnValue(new Promise((r) => (release = r)));
      const { onUseWeb } = await mount();
      act(() => jest.advanceTimersByTime(RESOLVE_CAP_MS));
      expect(onUseWeb).toHaveBeenCalledTimes(1);
      release(result(cand("hi1", ["hi"])));
      await flush();
      expect(mockViewProps).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("passes the original title so a language word in it isn't read as the stream's language", async () => {
    mockDetails = { runtime: 134, original_language: "hi", title: "Hindi Medium", original_title: "हिंदी मीडियम" };
    mockResolve.mockResolvedValue(result());
    await mount();
    expect(mockResolve.mock.calls[0][0]).toMatchObject({ titleName: "Hindi Medium", originalTitle: "हिंदी मीडियम", runtimeMin: 134 });
  });

  it("says when the wanted language isn't available (spec §6.3)", async () => {
    mockResolve.mockResolvedValue(result(cand("en1", ["en"])));
    await mount();
    expect(mockViewProps.notice.message).toBe("Hindi isn't available for this title — playing original audio");
  });

  it("offers sibling languages; a pick switches at the same position and is remembered for the title", async () => {
    const hi = cand("hi1", ["hi"]);
    const en = cand("en1", ["en"]);
    mockResolve.mockResolvedValue(result(hi, en));
    await mount();
    tick(754);
    expect(mockViewProps.audioChoices.options).toEqual([
      { label: "Hindi", active: true },
      { label: "English", active: false },
    ]);
    act(() => mockViewProps.audioChoices.onPick("English"));
    expect(mockViewProps.source.uri).toBe(en.url);
    expect(mockViewProps.startAt).toBe(754);
    expect(mockSetTitleLanguage).toHaveBeenCalledWith("movie:10378", "en");
    expect(mockSetPreferredAudio).toHaveBeenCalledWith("English");
    expect(mockReport).toHaveBeenCalledWith(expect.objectContaining({ outcome: "manual_switch", lane: "native", providerId: "open-movies/open-movies" }));
  });

  it("the source sheet switches sources, or hands over to the web player", async () => {
    const a = cand("a", ["hi"]);
    const b = cand("b", ["hi"]);
    mockResolve.mockResolvedValue(result(a, b));
    const { onUseWeb } = await mount();
    act(() => mockViewProps.onOpenSource());
    expect(mockSheetProps).toMatchObject({ visible: true, currentKey: "a", candidates: [a, b] });
    act(() => mockSheetProps.onPick(b));
    expect(mockViewProps.source.uri).toBe(b.url);
    act(() => mockViewProps.onOpenSource());
    act(() => mockSheetProps.onUseWeb());
    expect(onUseWeb).toHaveBeenCalledTimes(1);
  });

  it("F6: re-resolves the same stream once and resumes where it was", async () => {
    mockResolve.mockResolvedValueOnce(result(cand("hi1", ["hi"]), cand("hi2", ["hi"])));
    const { r } = await mount();
    tick(300);
    mockResolve.mockResolvedValueOnce(result(cand("hi1", ["hi"], { url: "https://cdn.example.net/hi1-fresh.m3u8" }), cand("hi2", ["hi"])));
    let handled = false;
    act(() => {
      handled = mockViewProps.onStreamError("HTTP 403");
    });
    expect(handled).toBe(true);
    expect(texts(r)).toContain("Reconnecting…");
    expect(mockClearCache).toHaveBeenCalled();
    await flush();
    expect(mockViewProps.source.uri).toBe("https://cdn.example.net/hi1-fresh.m3u8");
    expect(mockViewProps.startAt).toBe(300);
  });

  it("a re-resolve that hangs gives up at the cap and fails over", async () => {
    jest.useFakeTimers();
    try {
      mockResolve.mockResolvedValueOnce(result(cand("hi1", ["hi"]), cand("hi2", ["hi"])));
      const { r } = await mount();
      mockResolve.mockReturnValue(new Promise(() => {}));
      act(() => {
        mockViewProps.onStreamError("HTTP 403");
      });
      expect(texts(r)).toContain("Reconnecting…");
      act(() => jest.advanceTimersByTime(RESOLVE_CAP_MS));
      await flush();
      expect(mockViewProps.source.uri).toContain("hi2");
    } finally {
      jest.useRealTimers();
    }
  });

  it("F6: then the next stream in the same language, then another language with a notice, then the error card", async () => {
    mockResolve.mockResolvedValue(result(cand("hi1", ["hi"]), cand("hi2", ["hi"]), cand("en1", ["en"])));
    const { r } = await mount();
    const fail = async () => {
      act(() => {
        mockViewProps.onStreamError("boom");
      });
      await flush();
    };
    await fail(); // hi1: re-resolve, same key comes back
    expect(mockViewProps.source.uri).toContain("hi1");
    await fail(); // hi1 again: next in Hindi
    expect(mockViewProps.source.uri).toContain("hi2");
    expect(mockViewProps.notice).toBeNull();
    await fail(); // hi2: re-resolve once
    await fail(); // hi2 again: only English left
    expect(mockViewProps.source.uri).toContain("en1");
    expect(mockViewProps.notice.message).toBe("Switched to Src en1 — Hindi isn't on this one.");
    act(() => mockViewProps.notice.action.onPress());
    expect(mockSheetProps.visible).toBe(true);
    await fail(); // en1: re-resolve
    await fail(); // en1 again: nothing left
    expect(texts(r)).toContain("Couldn’t play this title here");
    mockResolve.mockResolvedValue(result(cand("hi3", ["hi"])));
    act(() => r.root.find((n) => n.props.accessibilityLabel === "Retry" && n.props.onPress).props.onPress());
    await flush();
    expect(mockViewProps.source.uri).toContain("hi3");
  });

  it("reports success once after 30 s of real playback, on the native lane with the source id", async () => {
    mockResolve.mockResolvedValue(result(cand("hi1", ["hi"])));
    await mount();
    tick(1);
    tick(2);
    tick(31);
    tick(32);
    const successes = mockReport.mock.calls.filter(([a]) => a.outcome === "success");
    expect(successes).toHaveLength(1);
    expect(successes[0][0]).toMatchObject({ providerId: "open-movies/open-movies", lane: "native", stage: "playing" });
    expect(typeof successes[0][0].ttffMs).toBe("number");
    expect(JSON.stringify(successes[0][0])).not.toContain("cdn.example.net");
  });

  it("shows the episode and moves to the next one", async () => {
    mockDetails = { original_language: "en", name: "Show", episode_run_time: [45], seasons: [{ season_number: 1, episode_count: 8 }] };
    mockResolve.mockResolvedValue(result(cand("e", ["en"])));
    const onEpisode = jest.fn();
    await mount({ type: "tv", season: 1, episode: 3, onEpisode });
    // A show-level runtime would wrongly reject long pilots at ±3 min: episodes go unchecked until we know their own.
    expect(mockResolve.mock.calls[0][0]).toMatchObject({ type: "tv", season: 1, episode: 3, runtimeMin: undefined });
    expect(mockViewProps.subtitle).toBe("S1 · E3");
    act(() => mockViewProps.onNextEpisode());
    expect(onEpisode).toHaveBeenCalledWith(1, 4);
  });

  it("Watch together starts a party with this stream — kept in memory, never in the route", async () => {
    const { pendingHostStream } = jest.requireActual("@/src/features/party/pendingHostStream");
    mockResolve.mockResolvedValue(result(cand("hi1", ["hi"])));
    await mount({ title: "Big Buck Bunny" });
    act(() => mockViewProps.onWatchParty());
    expect(pendingHostStream.peek("PARTY1")?.candidate.key).toBe("hi1");
    expect(mockOpenPartyHost).toHaveBeenCalledWith({ role: "host", room: "PARTY1", id: "10378", type: "movie", title: "Big Buck Bunny", native: "1" });
    expect(JSON.stringify(mockOpenPartyHost.mock.calls)).not.toMatch(/https?:/);
  });
});
