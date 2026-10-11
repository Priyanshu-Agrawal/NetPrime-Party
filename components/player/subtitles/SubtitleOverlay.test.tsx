import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { loadCues, subtitleFontSize, SubtitleOverlay, type PlaybackClock } from "./SubtitleOverlay";

const cues = [
  { start: 23, end: 24.5, text: "You're a jerk, Thom." },
  { start: 25, end: 27, text: "Look Celia" },
];
const texts = (r: ReactTestRenderer) =>
  // Host nodes only: the Text component and its native host both carry the string.
  r.root.findAll((n) => typeof n.type === "string" && typeof n.props.children === "string").map((n) => n.props.children as string);

describe("SubtitleOverlay", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("shows each cue at its time, scheduling to the next change instead of polling", () => {
    const clock: PlaybackClock = { time: 22.9, at: Date.now(), playing: true, rate: 1 };
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<SubtitleOverlay cues={cues} clock={clock} />);
    });
    expect(texts(r)).toEqual([]);
    act(() => jest.advanceTimersByTime(150));
    expect(texts(r)).toEqual(["You're a jerk, Thom."]);
    act(() => jest.advanceTimersByTime(1500));
    expect(texts(r)).toEqual([]);
  });

  it("applies the offset (positive = later)", () => {
    const clock: PlaybackClock = { time: 23.2, at: Date.now(), playing: false, rate: 1 };
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<SubtitleOverlay cues={cues} clock={clock} offsetSec={0.5} />);
    });
    expect(texts(r)).toEqual([]);
    act(() => r.update(<SubtitleOverlay cues={cues} clock={clock} offsetSec={-0.5} />));
    expect(texts(r)).toEqual(["You're a jerk, Thom."]);
  });
});

describe("loadCues", () => {
  it("downloads a file once and parses it", async () => {
    const fetcher = jest.fn(async () => ({ ok: true, text: async () => "1\n00:00:01,000 --> 00:00:02,000\nHi\n" }));
    const url = "https://example.test/a.srt";
    await expect(loadCues(url, undefined, fetcher as unknown as typeof fetch)).resolves.toEqual([
      { start: 1, end: 2, text: "Hi" },
    ]);
    await loadCues(url, undefined, fetcher as unknown as typeof fetch);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failure", async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "" })
      .mockResolvedValueOnce({ ok: true, text: async () => "1\n00:00:01,000 --> 00:00:02,000\nBack\n" });
    const url = "https://example.test/b.vtt";
    await expect(loadCues(url, undefined, fetcher as unknown as typeof fetch)).rejects.toThrow("HTTP 503");
    await expect(loadCues(url, undefined, fetcher as unknown as typeof fetch)).resolves.toEqual([
      { start: 1, end: 2, text: "Back" },
    ]);
  });
});

describe("subtitleFontSize", () => {
  it("scales with the player's height so a small portrait player isn't buried in text", () => {
    expect(subtitleFontSize("m", 231)).toBeCloseTo(12.7, 1); // portrait player on a phone
    expect(subtitleFontSize("m", 411)).toBeCloseTo(22.6, 1); // landscape fullscreen
    expect(subtitleFontSize("l", 231)).toBeGreaterThan(subtitleFontSize("m", 231));
    expect(subtitleFontSize("s", 100)).toBe(11); // never below a readable floor
  });
});
