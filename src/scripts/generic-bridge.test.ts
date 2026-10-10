/**
 * @jest-environment jsdom
 */
import { GENERIC_BRIDGE } from "./generic-bridge";

type Msg = Record<string, any>;
let posted: Msg[];

function load(cfg: Record<string, unknown> = {}) {
  posted = [];
  (window as any).ReactNativeWebView = { postMessage: (s: string) => posted.push(JSON.parse(s)) };
  (window as any).__vlMsgNonce = "n1";
  (window as any).__vlCfg = cfg;
  delete (window as any).__vlBridge;
  new Function(GENERIC_BRIDGE)();
}

function addVideo(duration: number, tracks: Msg[] = []): HTMLVideoElement {
  const v = document.createElement("video");
  Object.defineProperty(v, "duration", { value: duration, configurable: true });
  Object.defineProperty(v, "paused", { value: true, writable: true, configurable: true });
  Object.defineProperty(v, "currentTime", { value: 0, writable: true, configurable: true });
  Object.defineProperty(v, "playbackRate", { value: 1, writable: true, configurable: true });
  Object.defineProperty(v, "textTracks", { value: tracks, configurable: true });
  v.play = jest.fn(() => Promise.resolve());
  v.pause = jest.fn();
  document.body.appendChild(v);
  return v;
}

const events = (name: string) => posted.filter((m) => m.event === name);

beforeEach(() => {
  jest.useFakeTimers();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe("generic bridge", () => {
  it("binds the page's video and announces ready with the session nonce", () => {
    load();
    addVideo(8349);
    jest.advanceTimersByTime(700);
    const ready = events("ready");
    expect(ready).toHaveLength(1);
    expect(ready[0]).toMatchObject({ __n: "n1", duration: 8349 });
  });

  it("prefers the feature over a short ad", () => {
    load();
    addVideo(30);
    jest.advanceTimersByTime(700);
    addVideo(8349);
    jest.advanceTimersByTime(700);
    expect(events("ready").map((m) => m.duration)).toEqual([30, 8349]);
  });

  it("rebinds when the provider swaps the element", () => {
    load();
    const first = addVideo(8349);
    jest.advanceTimersByTime(700);
    first.remove();
    addVideo(8349);
    jest.advanceTimersByTime(700);
    expect(events("ready")).toHaveLength(2);
  });

  it("paints only the video once chrome-off is on, and can show the page again", () => {
    load({ chromeOff: true });
    const css = () => document.getElementById("__vlChromeStyle")?.textContent ?? "";
    expect(css()).toContain("iframe{visibility:visible");
    addVideo(8349);
    jest.advanceTimersByTime(700);
    expect(css()).toContain("video{visibility:visible");
    (window as any).__vlChromeOff(false);
    expect(css()).toBe("");
  });

  it("leaves the page alone without a config (older app builds turn chrome-off on after bind)", () => {
    (window as any).__vlCfg = undefined;
    posted = [];
    delete (window as any).__vlBridge;
    new Function(GENERIC_BRIDGE)();
    expect(document.getElementById("__vlChromeStyle")?.textContent ?? "").toBe("");
    (window as any).__vlChromeOff(true);
    expect(document.getElementById("__vlChromeStyle")?.textContent).toContain("iframe{visibility:visible");
  });

  it("lists subtitle tracks and switches between them", () => {
    const tracks = [
      { kind: "subtitles", label: "English", language: "en", mode: "disabled" },
      { kind: "metadata", label: "id3", language: "", mode: "hidden" },
      { kind: "subtitles", label: "Hindi", language: "hi", mode: "disabled" },
    ];
    load();
    addVideo(8349, tracks);
    jest.advanceTimersByTime(700);
    expect(events("caps")[0].caps).toEqual({ quality: false, audio: false, subtitles: true });
    expect(events("subs")[0].subs.map((s: Msg) => s.id)).toEqual(["0", "2"]);
    (window as any).__vlCmd({ action: "setSub", id: "2" });
    expect(tracks.map((t) => t.mode)).toEqual(["disabled", "hidden", "showing"]);
    (window as any).__vlCmd({ action: "setSub", id: null });
    expect(tracks.map((t) => t.mode)).toEqual(["disabled", "hidden", "disabled"]);
  });

  it("blocks popups", () => {
    load();
    expect(window.open("https://ads.test")).toBeNull();
  });

  it("starts a provider's player through its start selector", () => {
    load({ startSelectors: ["#start"] });
    const btn = document.createElement("button");
    btn.id = "start";
    const onClick = jest.fn();
    btn.addEventListener("click", onClick);
    document.body.appendChild(btn);
    (window as any).__vlCmd({ action: "play" });
    expect(onClick).toHaveBeenCalled();
  });

  it("drives seek, rate and pause on the bound video", () => {
    load();
    const v = addVideo(8349);
    jest.advanceTimersByTime(700);
    (window as any).__vlCmd({ action: "seek", time: 120 });
    (window as any).__vlCmd({ action: "rate", rate: 1.05 });
    (window as any).__vlCmd({ action: "pause" });
    expect(v.currentTime).toBe(120);
    expect(v.playbackRate).toBe(1.05);
    expect(v.pause).toHaveBeenCalled();
  });

  it("answers quality and audio reads with empty lists (no provider menus driven)", () => {
    load();
    addVideo(8349);
    jest.advanceTimersByTime(700);
    (window as any).__vlCmd({ action: "readQuality" });
    (window as any).__vlCmd({ action: "readAudio" });
    expect(events("quality")[0].qualities).toEqual([]);
    expect(events("audio")[0].audios).toEqual([]);
  });
});
