import type { PlayerEvent } from "@/components/player/types";
import type { PartyClient } from "./PartyClient";
import { PartySyncEngine, type PlayerControl } from "./PartySyncEngine";
import type { PlaybackAnchor } from "./protocol";

let serverNow = 1_000_000;
const client = (isHost: boolean) =>
  ({ isHost, now: () => serverNow, play: jest.fn(async () => {}), pause: jest.fn(async () => {}), seek: jest.fn(async () => {}) }) as unknown as PartyClient;
const player = (caps?: { fractionalRate: boolean; partySync: boolean }): jest.Mocked<PlayerControl> => ({
  play: jest.fn(),
  pause: jest.fn(),
  seek: jest.fn(),
  setRate: jest.fn(),
  ...(caps ? { capabilities: () => caps } : {}),
});
const anchor = (over: Partial<PlaybackAnchor> = {}): PlaybackAnchor => ({ status: "playing", positionMs: 100_000, rate: 1, anchorServerTimeMs: serverNow, epoch: 1, seq: 1, ...over });
const ev = (event: PlayerEvent["event"], currentTime: number, extra: Partial<PlayerEvent> = {}): PlayerEvent => ({ event, currentTime, duration: 600, paused: false, ...extra });
const NATIVE = { fractionalRate: true, partySync: true };

beforeEach(() => {
  jest.useFakeTimers();
  serverNow = 1_000_000;
});
afterEach(() => jest.useRealTimers());

describe("PartySyncEngine — native rooms (partySync)", () => {
  it("a host stall over 3 s pauses the room, and recovery resumes it; a shorter one does nothing", () => {
    const onHostStall = jest.fn();
    const e = new PartySyncEngine(client(true), player(NATIVE), { onHostStall });
    e.setAnchor(anchor());
    e.onPlayerEvent(ev("buffering", 100, { buffering: true }));
    jest.advanceTimersByTime(2900);
    e.onPlayerEvent(ev("buffering", 100, { buffering: false }));
    jest.advanceTimersByTime(1000);
    expect(onHostStall).not.toHaveBeenCalled();
    e.onPlayerEvent(ev("buffering", 100, { buffering: true }));
    jest.advanceTimersByTime(3100);
    expect(onHostStall).toHaveBeenLastCalledWith(true);
    e.onPlayerEvent(ev("buffering", 100, { buffering: false }));
    expect(onHostStall).toHaveBeenLastCalledWith(false);
  });

  it("a host stall in a room that's already paused does nothing (and recovery never un-pauses it)", () => {
    const onHostStall = jest.fn();
    const e = new PartySyncEngine(client(true), player(NATIVE), { onHostStall });
    e.setAnchor(anchor({ status: "paused" }));
    e.onPlayerEvent(ev("buffering", 100, { buffering: true }));
    jest.advanceTimersByTime(5000);
    e.onPlayerEvent(ev("buffering", 100, { buffering: false }));
    expect(onHostStall).not.toHaveBeenCalled();
  });

  it("a guest's long stall never touches the room; on recovery it jumps to the live position + 1 s", () => {
    const onHostStall = jest.fn();
    const c = client(false);
    const p = player(NATIVE);
    const e = new PartySyncEngine(c, p, { onHostStall });
    e.setAnchor(anchor());
    p.seek.mockClear();
    e.onPlayerEvent(ev("buffering", 100, { buffering: true }));
    jest.advanceTimersByTime(10_000);
    serverNow += 10_000;
    e.onPlayerEvent(ev("buffering", 100, { buffering: false }));
    expect(onHostStall).not.toHaveBeenCalled();
    expect(c.pause).not.toHaveBeenCalled();
    expect(p.seek).toHaveBeenCalledWith(111);
  });

  it("a player without fractional rate is never nudged; it seeks once 2 s off", () => {
    const p = player({ fractionalRate: false, partySync: true });
    const e = new PartySyncEngine(client(false), p);
    e.setAnchor(anchor());
    p.setRate.mockClear();
    p.seek.mockClear();
    for (let i = 0; i < 6; i++) e.onPlayerEvent(ev("tick", 100.8));
    expect(p.setRate).not.toHaveBeenCalled();
    expect(p.seek).not.toHaveBeenCalled();
    for (let i = 0; i < 6; i++) e.onPlayerEvent(ev("tick", 102.5));
    expect(p.seek).toHaveBeenCalledWith(100);
  });
});

describe("PartySyncEngine — WebView rooms (no capabilities) are unchanged", () => {
  it("ignores buffering and nudges the rate at 0.5 s of drift, as before", () => {
    const onHostStall = jest.fn();
    const p = player();
    const e = new PartySyncEngine(client(true), p, { onHostStall });
    e.setAnchor(anchor());
    e.onPlayerEvent(ev("buffering", 100, { buffering: true }));
    jest.advanceTimersByTime(5000);
    expect(onHostStall).not.toHaveBeenCalled();
    p.setRate.mockClear();
    for (let i = 0; i < 6; i++) e.onPlayerEvent(ev("tick", 100.5));
    expect(p.setRate).toHaveBeenCalled();
  });
});

describe("PartySyncEngine — drift stats (the S5 gate's readout)", () => {
  it("reports p50/p95 of the absolute offset from the room over recent ticks", () => {
    const e = new PartySyncEngine(client(false), player(NATIVE));
    e.setAnchor(anchor());
    expect(e.driftStats()).toEqual({ n: 0, p50: 0, p95: 0 });
    const offsets = [0.1, -0.2, 0.05, 0.3, -0.1, 0.0, 0.4, -0.05, 0.2, 0.15];
    for (const o of offsets) e.onPlayerEvent(ev("tick", 100 + o));
    const s = e.driftStats();
    expect(s.n).toBe(10);
    expect(s.p50).toBeCloseTo(0.1, 5);
    expect(s.p95).toBeCloseTo(0.4, 5);
  });
});

