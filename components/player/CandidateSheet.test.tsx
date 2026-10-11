import type { PlaybackCandidate } from "@/services/playback/candidate";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { CandidateSheet } from "./CandidateSheet";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const cand = (key: string, over: Partial<PlaybackCandidate> = {}): PlaybackCandidate => ({
  key,
  sourceId: "r/p",
  label: `Source ${key}`,
  url: `https://x.example.net/${key}`,
  headers: {},
  container: "hls",
  languages: ["hi"],
  quality: { label: "1080p", height: 1080 },
  platforms: { ios: true, android: true },
  subtitles: [],
  verdict: "ok",
  order: 0,
  ...over,
});
const texts = (r: ReactTestRenderer) =>
  r.root.findAll((n) => typeof n.type === "string" && typeof n.props.children === "string").map((n) => n.props.children as string);
const press = (r: ReactTestRenderer, label: string) =>
  act(() => r.root.find((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === "function").props.onPress());

function render(props: Partial<React.ComponentProps<typeof CandidateSheet>> = {}) {
  const all = {
    visible: true,
    candidates: [cand("a"), cand("b", { languages: [], verdict: "unverified", quality: undefined }), cand("c", { languages: ["ta"], platforms: { ios: false, android: true } })],
    currentKey: "a",
    onPick: jest.fn(),
    onUseWeb: jest.fn(),
    onClose: jest.fn(),
    ...props,
  };
  let r!: ReactTestRenderer;
  act(() => {
    r = create(<CandidateSheet {...all} />);
  });
  return { r, ...all };
}

describe("CandidateSheet", () => {
  it("lists every native source with its language and quality, and the web player last", () => {
    const { r } = render();
    expect(texts(r)).toEqual([
      "Source",
      "Source a",
      "Hindi · 1080p",
      "Source b",
      "Language unknown · Unverified",
      "Source c",
      "Tamil · 1080p · Android only",
      "Web player · other sources",
    ]);
  });

  it("marks the playing source", () => {
    const { r } = render();
    const row = r.root.find((n) => n.props.accessibilityLabel === "Source a, Hindi · 1080p" && n.props.accessibilityState);
    expect(row.props.accessibilityState).toEqual({ selected: true });
  });

  it("picks a source, or the web player", () => {
    const { r, onPick, onUseWeb, candidates } = render();
    press(r, "Source c, Tamil · 1080p · Android only");
    expect(onPick).toHaveBeenCalledWith(candidates[2]);
    press(r, "Use the web player");
    expect(onUseWeb).toHaveBeenCalled();
  });
});
