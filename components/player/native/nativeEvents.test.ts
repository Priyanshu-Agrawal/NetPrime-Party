import type { PlayerEvent } from "../types";
import { NativeEventMachine, SEEK_TIMEOUT_MS } from "./nativeEvents";

function setup() {
  const events: PlayerEvent[] = [];
  let now = 1000;
  const m = new NativeEventMachine((e) => events.push(e), () => now);
  const names = () => events.map((e) => e.event);
  return { m, events, names, advance: (ms: number) => (now += ms) };
}

describe("NativeEventMachine", () => {
  it("emits ready once, with the duration", () => {
    const { m, events } = setup();
    m.onStatus("loading");
    m.onStatus("readyToPlay", 600);
    m.onStatus("readyToPlay", 600);
    const ready = events.filter((e) => e.event === "ready");
    expect(ready).toHaveLength(1);
    expect(ready[0].duration).toBe(600);
  });

  it("reports paused from the user's intent, not from isPlaying (which is also false while buffering)", () => {
    const { m, events } = setup();
    m.onStatus("readyToPlay", 600);
    m.setIntent(true);
    m.onPlaying(false);
    expect(events[events.length - 1]).toMatchObject({ event: "play", paused: false });
    expect(events.some((e) => e.event === "pause")).toBe(false);
  });

  it("flags a stall only after the first ready and only while meant to play", () => {
    const { m, events } = setup();
    m.setIntent(true);
    m.onStatus("loading"); // initial load: not a stall
    expect(events.some((e) => e.event === "buffering")).toBe(false);
    m.onStatus("readyToPlay", 600);
    m.onStatus("loading");
    expect(events[events.length - 1]).toMatchObject({ event: "buffering", buffering: true, readyState: 2 });
    m.setIntent(false);
    expect(events.filter((e) => e.event === "buffering").pop()).toMatchObject({ buffering: false });
  });

  it("resolves a seek with the landed position once time reaches the target", async () => {
    const { m, names } = setup();
    m.onStatus("readyToPlay", 600);
    const landed = m.beginSeek(120);
    m.onTime(119.9, 130);
    await expect(landed).resolves.toBe(119.9);
    expect(names()).toContain("seeked");
  });

  it("resolves a keyframe landing after loading → ready, wherever playback landed", async () => {
    const { m } = setup();
    m.onStatus("readyToPlay", 600);
    const landed = m.beginSeek(120);
    m.onStatus("loading");
    m.onTime(117.6, 117.6);
    m.onStatus("readyToPlay");
    await expect(landed).resolves.toBe(117.6);
  });

  it("never hangs: a seek with no landing resolves after the timeout", async () => {
    const { m, advance } = setup();
    m.onStatus("readyToPlay", 600);
    const landed = m.beginSeek(50);
    advance(SEEK_TIMEOUT_MS);
    m.expireSeek();
    await expect(landed).resolves.toBe(0);
  });

  it("clamps the target to the duration", async () => {
    const { m } = setup();
    m.onStatus("readyToPlay", 100);
    const landed = m.beginSeek(500);
    m.onTime(100, 100);
    await expect(landed).resolves.toBe(100);
  });

  it("a newer seek supersedes an older one", async () => {
    const { m } = setup();
    m.onStatus("readyToPlay", 600);
    m.onTime(5, 5);
    const first = m.beginSeek(10);
    const second = m.beginSeek(20);
    await expect(first).resolves.toBe(5);
    m.onTime(20, 30);
    await expect(second).resolves.toBe(20);
  });

  it("ticks with the buffered lead", () => {
    const { m, events } = setup();
    m.onStatus("readyToPlay", 600);
    m.onTime(10, 34);
    expect(events[events.length - 1]).toMatchObject({ event: "tick", currentTime: 10, bufferedAheadSec: 24 });
  });

  it("ends paused", () => {
    const { m, events } = setup();
    m.setIntent(true);
    m.onEnded();
    expect(events[events.length - 1]).toMatchObject({ event: "ended", paused: true });
  });
});
