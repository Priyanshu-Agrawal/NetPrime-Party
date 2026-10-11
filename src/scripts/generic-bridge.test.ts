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

  it("stops the hidden provider UI animating once chrome-off is on (VidFast churned ~70 style recalcs/s)", () => {
    load({ chromeOff: true });
    const css = () => document.getElementById("__vlChromeStyle")?.textContent ?? "";
    expect(css()).toContain("body *:not(video){transition:none!important}"); // video in a frame
    addVideo(8349);
    jest.advanceTimersByTime(700);
    expect(css()).toContain("body *:not(video){transition:none!important}"); // video in this page
    (window as any).__vlChromeOff(false);
    expect(css()).toBe(""); // provider UI back → its transitions back
  });

  it("keeps the bound video opaque when the provider fades it out (VidFast solo sets opacity 0)", () => {
    load({ chromeOff: true });
    const first = addVideo(30);
    jest.advanceTimersByTime(700);
    const feature = addVideo(8349);
    jest.advanceTimersByTime(700);
    const css = document.getElementById("__vlChromeStyle")?.textContent ?? "";
    expect(css).toContain("video[data-vl-bound]{opacity:1!important}");
    expect(feature.hasAttribute("data-vl-bound")).toBe(true);
    expect(first.hasAttribute("data-vl-bound")).toBe(false);
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
    const cues = [{}];
    const tracks = [
      { kind: "subtitles", label: "English", language: "en", mode: "hidden", cues },
      { kind: "metadata", label: "id3", language: "", mode: "hidden", cues },
      { kind: "subtitles", label: "Hindi", language: "hi", mode: "hidden", cues },
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

  it("lists only subtitle tracks that can show text (a <track> file, or cues already loaded)", () => {
    // VidFast: player-made tracks with no cues — it draws subtitles itself, so picking one shows nothing.
    const empty = { kind: "subtitles", label: "English", language: "en", mode: "disabled", cues: null };
    const loaded = { kind: "subtitles", label: "Hindi", language: "hi", mode: "hidden", cues: [{}] };
    const sidecar = { kind: "subtitles", label: "French", language: "fr", mode: "disabled", cues: null };
    load();
    const v = addVideo(8349, [empty, loaded, sidecar]);
    const el = document.createElement("track");
    Object.defineProperty(el, "track", { value: sidecar });
    v.appendChild(el);
    jest.advanceTimersByTime(700);
    expect(events("subs")[0].subs.map((s: Msg) => s.label)).toEqual(["Hindi", "French"]);
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

  it("holds the speed it was asked for when the provider resets it (VidFast goes back to 1× after a seek)", () => {
    load();
    const v = addVideo(8349);
    jest.advanceTimersByTime(700);
    (window as any).__vlCmd({ action: "rate", rate: 1.1 });
    v.playbackRate = 1; // the provider's own player puts it back
    v.dispatchEvent(new Event("ratechange"));
    expect(v.playbackRate).toBe(1.1);
    v.playbackRate = 1; // …or does so without an event
    jest.advanceTimersByTime(1000);
    expect(v.playbackRate).toBe(1.1);
    v.remove();
    const swapped = addVideo(8349); // the provider swaps the element: the new one gets the speed too
    jest.advanceTimersByTime(700);
    expect(swapped.playbackRate).toBe(1.1);
  });

  it("keeps a play asked for before the stream was ready, until a pause cancels it", () => {
    load();
    const v = addVideo(8349);
    jest.advanceTimersByTime(700);
    (window as any).__vlCmd({ action: "play" });
    expect(v.play).toHaveBeenCalledTimes(1); // too early — the provider hasn't attached the stream
    v.dispatchEvent(new Event("canplay"));
    expect(v.play).toHaveBeenCalledTimes(2); // now it can, so ask again
    (window as any).__vlCmd({ action: "pause" });
    v.dispatchEvent(new Event("canplay"));
    expect(v.play).toHaveBeenCalledTimes(2); // a pause cancels the pending play
    (window as any).__soloCmd({ action: "play" }); // lock-screen play arms it again…
    v.dispatchEvent(new Event("canplay"));
    expect(v.play).toHaveBeenCalledTimes(4);
    (window as any).__soloCmd({ action: "pause" }); // …and lock-screen pause cancels it
    v.dispatchEvent(new Event("canplay"));
    expect(v.play).toHaveBeenCalledTimes(4);
  });

  it("ignores the pause a video fires when the provider removes it (element swap mid-play)", () => {
    load();
    const v = addVideo(8349);
    jest.advanceTimersByTime(700);
    v.remove(); // browsers run the pause steps on removal, before our next scan
    v.dispatchEvent(new Event("pause"));
    expect(events("pause")).toHaveLength(0);
  });

  it("clicks the provider's start again when the bound video already ended (a pre-roll ad)", () => {
    load({ startSelectors: ["#start"] });
    const ad = addVideo(30);
    jest.advanceTimersByTime(700);
    Object.defineProperty(ad, "ended", { value: true, configurable: true });
    const btn = document.createElement("button");
    btn.id = "start";
    const onClick = jest.fn();
    btn.addEventListener("click", onClick);
    document.body.appendChild(btn);
    (window as any).__vlCmd({ action: "play" });
    expect(onClick).toHaveBeenCalled();
  });

  it("never hands its messages to the page's JSON.stringify (the page could read the nonce)", () => {
    load();
    const seen: unknown[] = [];
    const real = JSON.stringify;
    JSON.stringify = ((v: unknown, ...rest: unknown[]) => {
      seen.push(v);
      return (real as (...a: unknown[]) => string)(v, ...rest);
    }) as typeof JSON.stringify;
    try {
      addVideo(8349);
      jest.advanceTimersByTime(700);
    } finally {
      JSON.stringify = real;
    }
    expect(events("ready")).toHaveLength(1);
    expect(seen.some((v) => !!v && typeof v === "object" && "__n" in (v as object))).toBe(false);
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
