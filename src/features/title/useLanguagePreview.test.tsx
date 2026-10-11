import React from "react";
import { Text } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { PREVIEW_DELAY_MS, useLanguagePreview } from "./useLanguagePreview";

const mockPreview = jest.fn();
jest.mock("@/services/playback", () => ({ previewTitle: (...a: unknown[]) => mockPreview(...a) }));
let mockFlags = { embedApiLane: false, nativeLane: true, pluginHost: true };
jest.mock("@/src/store/features/providers/hooks", () => ({ useFeatureFlags: () => mockFlags }));
let mockAvailable = true;
jest.mock("@/modules/bearoom-fetch", () => ({
  get nativeFetchAvailable() {
    return mockAvailable;
  },
}));
let mockOffline = false;
jest.mock("@/hooks/useConnectivity", () => ({ useConnectivity: () => mockOffline }));
let mockMetered = false;
let mockNetKnown = true;
jest.mock("@react-native-community/netinfo", () => ({
  useNetInfo: () =>
    mockNetKnown ? { type: "wifi", isConnected: true, details: { isConnectionExpensive: mockMetered } } : { type: "unknown", isConnected: null, details: null },
}));
let mockFocused = true;
jest.mock("@react-navigation/native", () => ({ useIsFocused: () => mockFocused }));
let mockDataSaver = false;
let mockMeteredOptIn = false;
jest.mock("@/utils/prefs", () => ({ getDataSaver: () => mockDataSaver, getPreviewOnMetered: () => mockMeteredOptIn }));
const mockTitleLang = new Map<string, string>();
const mockSetTitleLanguage = jest.fn((k: string, c: string) => void mockTitleLang.set(k, c));
jest.mock("@/utils/languagePrefs", () => ({
  languageOrder: () => ["hi", "original"],
  resolveOrder: (o: string[], orig?: string, choice?: string | null) =>
    [...(choice ? [choice] : []), ...o.map((l) => (l === "original" ? orig : l))].filter((l, i, a): l is string => !!l && a.indexOf(l) === i),
  getTitleLanguage: (k: string) => mockTitleLang.get(k) ?? null,
  setTitleLanguage: (k: string, c: string) => mockSetTitleLanguage(k, c),
  titleKeyOf: (t: string, id: string) => `${t}:${id}`,
}));

type Input = Parameters<typeof useLanguagePreview>[0];
let hook: ReturnType<typeof useLanguagePreview> | null = null;
const keep = (h: ReturnType<typeof useLanguagePreview>) => (hook = h);
function Probe(props: Input) {
  const h = useLanguagePreview(props);
  React.useEffect(() => {
    keep(h);
  });
  return <Text>{`${h.status}|${h.button.label}|${h.button.note ?? ""}`}</Text>;
}
const DETAILS = { original_language: "en", title: "Big Buck Bunny" };
const base: Input = { type: "movie", tmdbId: "1", details: DETAILS, enabled: true };
const answer = (...langs: string[][]) => ({ ranked: langs.map((l) => ({ languages: l })), complete: true });
const shown = (r: ReactTestRenderer) => String(r.root.findByType(Text).props.children);
const flush = () =>
  act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });

let trees: ReactTestRenderer[] = [];
function render(props: Input = base) {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(<Probe {...props} />);
  });
  trees.push(r);
  return r;
}

beforeEach(() => {
  jest.useFakeTimers();
  mockPreview.mockReset();
  mockFlags = { embedApiLane: false, nativeLane: true, pluginHost: true };
  mockAvailable = true;
  mockOffline = false;
  mockMetered = false;
  mockNetKnown = true;
  mockFocused = true;
  mockDataSaver = false;
  mockMeteredOptIn = false;
  mockTitleLang.clear();
  mockSetTitleLanguage.mockClear();
  hook = null;
});
afterEach(() => {
  trees.forEach((t) => act(() => t.unmount()));
  trees = [];
  jest.useRealTimers();
});

describe("useLanguagePreview", () => {
  it(`waits ${PREVIEW_DELAY_MS} ms, checks, then names the preferred language`, async () => {
    mockPreview.mockResolvedValue(answer(["hi"], ["en"]));
    const r = render();
    expect(shown(r)).toBe("waiting|Play|");
    act(() => jest.advanceTimersByTime(PREVIEW_DELAY_MS - 1));
    expect(mockPreview).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));
    expect(shown(r)).toBe("checking|Play|Checking languages…");
    expect(mockPreview).toHaveBeenCalledWith(
      expect.objectContaining({ tmdbId: "1", type: "movie", titleName: "Big Buck Bunny", originalLanguage: "en" }),
      ["hi", "en"],
      expect.any(Function),
    );
    await flush();
    expect(shown(r)).toBe("done|Play in Hindi|");
    expect(hook!.button.others).toEqual([{ code: "en", label: "English" }]);
  });

  it("leaving before the delay starts nothing; leaving mid-preview drops the answer", async () => {
    const r = render();
    act(() => jest.advanceTimersByTime(300));
    act(() => r.unmount());
    trees = [];
    act(() => jest.advanceTimersByTime(1000));
    expect(mockPreview).not.toHaveBeenCalled();

    let release!: (v: unknown) => void;
    mockPreview.mockReturnValue(new Promise((res) => (release = res)));
    const r2 = render();
    act(() => jest.advanceTimersByTime(PREVIEW_DELAY_MS));
    act(() => r2.unmount());
    trees = [];
    release(answer(["hi"]));
    await flush(); // no state update after unmount (React would warn)
  });

  it("a new episode mid-preview ignores the old answer and previews the new one", async () => {
    let releaseOld!: (v: unknown) => void;
    mockPreview.mockReturnValueOnce(new Promise((res) => (releaseOld = res))).mockResolvedValueOnce(answer(["en"]));
    const r = render({ ...base, type: "tv", season: 1, episode: 1 });
    act(() => jest.advanceTimersByTime(PREVIEW_DELAY_MS));
    act(() => r.update(<Probe {...base} type="tv" season={2} episode={1} />));
    releaseOld(answer(["hi"]));
    await flush();
    expect(shown(r)).toBe("waiting|Play|");
    act(() => jest.advanceTimersByTime(PREVIEW_DELAY_MS));
    await flush();
    expect(mockPreview).toHaveBeenLastCalledWith(expect.objectContaining({ season: 2, episode: 1 }), ["hi", "en"], expect.any(Function));
    expect(shown(r)).toBe("done|Play|Hindi not available for this title");
  });

  it.each([
    ["the flags are off", () => (mockFlags = { ...mockFlags, nativeLane: false })],
    ["the binary has no BearoomFetch", () => (mockAvailable = false)],
    ["the phone is offline", () => (mockOffline = true)],
    ["data saver is on", () => (mockDataSaver = true)],
    ["the network is metered and the user hasn't allowed it", () => (mockMetered = true)],
    ["the page is covered (another screen on top)", () => (mockFocused = false)],
    ["NetInfo doesn't know the network yet", () => (mockNetKnown = false)],
  ])("never runs when %s", (_, set) => {
    set();
    const r = render();
    act(() => jest.advanceTimersByTime(PREVIEW_DELAY_MS * 3));
    expect(mockPreview).not.toHaveBeenCalled();
    expect(shown(r)).toBe("off|Play|");
  });

  it("runs on a metered network when the user allowed it", async () => {
    mockMetered = true;
    mockMeteredOptIn = true;
    mockPreview.mockResolvedValue(answer(["hi"]));
    render();
    act(() => jest.advanceTimersByTime(PREVIEW_DELAY_MS));
    await flush();
    expect(mockPreview).toHaveBeenCalledTimes(1);
  });

  it("doesn't run until the page is ready (details loaded, title released)", () => {
    render({ ...base, enabled: false });
    act(() => jest.advanceTimersByTime(PREVIEW_DELAY_MS * 3));
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it("choosing another language remembers it for the title and relabels Play without asking again", async () => {
    mockPreview.mockResolvedValue(answer(["hi"], ["en"]));
    const r = render();
    act(() => jest.advanceTimersByTime(PREVIEW_DELAY_MS));
    await flush();
    act(() => hook!.choose("en"));
    expect(mockSetTitleLanguage).toHaveBeenCalledWith("movie:1", "en");
    expect(shown(r)).toBe("done|Play in English|");
    expect(hook!.button.others).toEqual([{ code: "hi", label: "Hindi" }]);
    expect(mockPreview).toHaveBeenCalledTimes(1);
  });

  it("a failed preview leaves Play plain", async () => {
    mockPreview.mockRejectedValue(new Error("sandbox"));
    const r = render();
    act(() => jest.advanceTimersByTime(PREVIEW_DELAY_MS));
    await flush();
    expect(shown(r)).toBe("off|Play|");
  });

  it("coming back to the page shows the answer again, without asking again or flickering", async () => {
    mockPreview.mockResolvedValue(answer(["hi"], ["en"]));
    const r = render();
    act(() => jest.advanceTimersByTime(PREVIEW_DELAY_MS));
    await flush();
    mockFocused = false;
    act(() => r.update(<Probe {...base} />));
    mockFocused = true;
    act(() => r.update(<Probe {...base} />));
    expect(shown(r)).toBe("done|Play in Hindi|");
    act(() => jest.advanceTimersByTime(PREVIEW_DELAY_MS * 2));
    await flush();
    expect(mockPreview).toHaveBeenCalledTimes(1);
  });

  it("re-reads the language the player stored for the title when the page is back in view", async () => {
    mockPreview.mockResolvedValue(answer(["hi"], ["en"]));
    const r = render();
    act(() => jest.advanceTimersByTime(PREVIEW_DELAY_MS));
    await flush();
    mockFocused = false;
    act(() => r.update(<Probe {...base} />));
    mockTitleLang.set("movie:1", "en"); // the player's Audio row picked English
    mockFocused = true;
    act(() => r.update(<Probe {...base} />));
    expect(shown(r)).toBe("done|Play in English|");
  });

  it("a language picked on one title doesn't follow the page to the next title", async () => {
    mockPreview.mockResolvedValue(answer(["hi"], ["en"]));
    const r = render();
    act(() => jest.advanceTimersByTime(PREVIEW_DELAY_MS));
    await flush();
    act(() => hook!.choose("en"));
    act(() => r.update(<Probe {...base} tmdbId="2" details={{ ...DETAILS, id: 2 }} />));
    act(() => jest.advanceTimersByTime(PREVIEW_DELAY_MS));
    await flush();
    expect(shown(r)).toBe("done|Play in Hindi|");
  });

  it("waits while the page still shows the previous title's details", () => {
    render({ ...base, details: { ...DETAILS, id: 99 } });
    act(() => jest.advanceTimersByTime(PREVIEW_DELAY_MS * 3));
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it("asks the shared queue to skip it once the page has moved on", async () => {
    let alive: (() => boolean) | undefined;
    mockPreview.mockImplementation((_r: unknown, _l: unknown, a: () => boolean) => {
      alive = a;
      return new Promise(() => {});
    });
    const r = render();
    act(() => jest.advanceTimersByTime(PREVIEW_DELAY_MS));
    expect(alive!()).toBe(true);
    act(() => r.unmount());
    trees = [];
    expect(alive!()).toBe(false);
  });
});
