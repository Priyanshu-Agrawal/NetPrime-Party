import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { PlayerLaneScreen } from "./PlayerLaneScreen";

let mockParams: Record<string, unknown> = { id: "10378", type: "movie", title: "Big Buck Bunny", poster_path: "/p.jpg" };
const mockSetParams = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: mockParams }),
  useNavigation: () => ({ setParams: mockSetParams }),
}));
let mockFlags = { embedApiLane: false, nativeLane: true, pluginHost: true };
jest.mock("@/src/store/features/providers/hooks", () => ({ useFeatureFlags: () => mockFlags }));
let mockAvailable = true;
jest.mock("@/modules/bearoom-fetch", () => ({
  get nativeFetchAvailable() {
    return mockAvailable;
  },
}));
jest.mock("@/src/navigation/actions", () => ({ exitMediaBack: jest.fn() }));
let mockTitleProps: any = null;
jest.mock("@/src/features/player/TitlePlayer", () => {
  const { Text } = jest.requireActual("react-native");
  return {
    TitlePlayer: (p: any) => {
      mockTitleProps = p;
      jest.requireActual("react").useEffect(() => {
        mockNativeMounts++;
      }, []);
      return <Text>native</Text>;
    },
  };
});
let mockWebMounts = 0;
jest.mock("./PlayerScreen", () => {
  const R = jest.requireActual("react");
  const { Text } = jest.requireActual("react-native");
  return {
    PlayerScreen: () => {
      R.useEffect(() => {
        mockWebMounts++;
      }, []);
      return <Text>web</Text>;
    },
  };
});
let mockNativeMounts = 0;

const texts = (r: ReactTestRenderer) =>
  r.root.findAll((n) => typeof n.type === "string" && typeof n.props.children === "string").map((n) => n.props.children as string);
function render() {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(<PlayerLaneScreen />);
  });
  return r;
}

beforeEach(() => {
  mockParams = { id: "10378", type: "movie", title: "Big Buck Bunny", poster_path: "/p.jpg" };
  mockFlags = { embedApiLane: false, nativeLane: true, pluginHost: true };
  mockAvailable = true;
  mockTitleProps = null;
  mockWebMounts = 0;
  mockNativeMounts = 0;
});

describe("PlayerLaneScreen", () => {
  it("tries the native lane first when the plugin host and native lane are on", () => {
    const r = render();
    expect(texts(r)).toEqual(["native"]);
    expect(mockTitleProps).toMatchObject({ tmdbId: "10378", type: "movie", title: "Big Buck Bunny", posterUrl: expect.stringContaining("/p.jpg") });
  });

  it.each([
    ["the plugin host is off", () => (mockFlags = { ...mockFlags, pluginHost: false })],
    ["the native lane is off (F14)", () => (mockFlags = { ...mockFlags, nativeLane: false })],
    ["the binary has no BearoomFetch", () => (mockAvailable = false)],
    ["there is no title id", () => (mockParams = {})],
  ])("uses today's web flow when %s", (_, set) => {
    set();
    expect(texts(render())).toEqual(["web"]);
  });

  it("switches to the web flow when the native lane hands over", () => {
    const r = render();
    act(() => mockTitleProps.onUseWeb());
    expect(texts(r)).toEqual(["web"]);
  });

  it("passes episodes through and moves to the next one via the route", () => {
    mockParams = { id: "1396", type: "tv", season: "1", ep: "3", title: "Breaking Bad" };
    render();
    expect(mockTitleProps).toMatchObject({ type: "tv", season: 1, episode: 3 });
    act(() => mockTitleProps.onEpisode(1, 4));
    expect(mockSetParams).toHaveBeenCalledWith({ season: "1", ep: "4" });
  });

  it("a new episode resolves again in the native lane", () => {
    mockParams = { id: "1396", type: "tv", season: "1", ep: "3", title: "Breaking Bad" };
    const r = render();
    mockParams = { ...mockParams, ep: "4" };
    act(() => r.update(<PlayerLaneScreen />));
    expect(mockNativeMounts).toBe(2);
    expect(mockTitleProps).toMatchObject({ season: 1, episode: 4 });
  });

  it("the web player stays mounted across episodes (it keeps the provider, fullscreen and speed)", () => {
    mockFlags = { ...mockFlags, nativeLane: false };
    mockParams = { id: "1396", type: "tv", season: "1", ep: "3", title: "Breaking Bad" };
    const r = render();
    mockParams = { ...mockParams, ep: "4" };
    act(() => r.update(<PlayerLaneScreen />));
    expect(texts(r)).toEqual(["web"]);
    expect(mockWebMounts).toBe(1);
  });

  it("once the title is on the web lane, its next episode stays there", () => {
    mockParams = { id: "1396", type: "tv", season: "1", ep: "3", title: "Breaking Bad" };
    const r = render();
    act(() => mockTitleProps.onUseWeb());
    mockParams = { ...mockParams, ep: "4" };
    act(() => r.update(<PlayerLaneScreen />));
    expect(texts(r)).toEqual(["web"]);
    expect(mockWebMounts).toBe(1);
  });
});
