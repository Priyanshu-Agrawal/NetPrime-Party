import React, { createRef } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { PlayerEvent, PlayerHandle } from "../types";
import { FakeVideoPlayer } from "./__fakes__/expoVideo";
import { NativePlayer } from "./NativePlayer";

jest.mock("expo-video", () => jest.requireActual("./__fakes__/expoVideo"));
const mockCap = jest.fn((..._args: unknown[]) => true);
jest.mock("@/modules/bearoom-player", () => ({
  qualityCapAvailable: true,
  setQualityCap: (...a: unknown[]) => mockCap(...a),
}));

const EN = { id: "a0", language: "en", label: "stream_5" };
const DE = { id: "a1", language: "de", label: "stream_4" };
const SUB_EN = { id: "s0", language: "en", label: "stream_0" };
const v = (w: number, h: number) => ({ id: `${w}x${h}`, url: null, size: { width: w, height: h }, isSupported: true });
const LOAD = {
  videoSource: null,
  duration: 600,
  availableAudioTracks: [EN, DE],
  availableSubtitleTracks: [SUB_EN],
  availableVideoTracks: [v(768, 576), v(640, 480), v(480, 360)],
};

function setup(extra: Partial<React.ComponentProps<typeof NativePlayer>> = {}) {
  const events: PlayerEvent[] = [];
  const ref = createRef<PlayerHandle>();
  const onFatalError = jest.fn();
  const onFirstFrame = jest.fn();
  let r!: ReactTestRenderer;
  act(() => {
    r = create(
      <NativePlayer
        ref={ref}
        source={{ uri: "https://example.test/master.m3u8", contentType: "hls" }}
        onPlayerEvent={(e) => events.push(e)}
        onFatalError={onFatalError}
        onFirstFrame={onFirstFrame}
        {...extra}
      />,
    );
  });
  const player = FakeVideoPlayer.last!;
  const fire = (name: string, payload?: unknown) => act(() => player.emit(name, payload));
  return { r, ref, player, events, fire, onFatalError, onFirstFrame };
}

beforeEach(() => mockCap.mockClear());
// Sidecar picks download their file; keep tests off the network.
beforeAll(() => {
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => "" })) as unknown as typeof fetch;
});

describe("NativePlayer", () => {
  it("starts playing on mount and says so", () => {
    const { player, events } = setup();
    expect(player.play).toHaveBeenCalled();
    expect(player.preservesPitch).toBe(true);
    expect(player.timeUpdateEventInterval).toBe(0.5);
    expect(events.some((e) => e.event === "play" && !e.paused)).toBe(true);
  });

  it("emits ready with the duration", () => {
    const { player, fire, events } = setup();
    player.duration = 600;
    fire("statusChange", { status: "readyToPlay" });
    expect(events.find((e) => e.event === "ready")?.duration).toBe(600);
  });

  it("seek sets the position and resolves with where playback landed", async () => {
    const { ref, player, fire } = setup();
    fire("statusChange", { status: "readyToPlay" });
    let landed: Promise<number> | undefined;
    act(() => {
      landed = ref.current!.seek(120);
    });
    expect(player.currentTime).toBe(120);
    fire("timeUpdate", { currentTime: 119.95, bufferedPosition: 140, currentLiveTimestamp: null, currentOffsetFromLive: null });
    await expect(landed).resolves.toBe(119.95);
  });

  it("a seek before the first frame still resolves (lands on the first tick near the target)", async () => {
    const { ref, fire } = setup();
    let landed: Promise<number> | undefined;
    act(() => {
      landed = ref.current!.seek(30);
    });
    fire("statusChange", { status: "readyToPlay" });
    fire("timeUpdate", { currentTime: 30, bufferedPosition: 40, currentLiveTimestamp: null, currentOffsetFromLive: null });
    await expect(landed).resolves.toBe(30);
  });

  it("lists audio by language and switches by label", () => {
    const { ref, player, fire, events } = setup();
    player.audioTrack = EN;
    fire("sourceLoad", LOAD);
    expect(events.filter((e) => e.event === "audio").pop()?.audios).toEqual([
      { label: "English", active: true },
      { label: "German", active: false },
    ]);
    act(() => ref.current!.setAudio("German"));
    expect(player.audioTrack).toBe(DE);
  });

  it("manual quality caps the player without reloading or touching the audio track", () => {
    const { ref, player, fire, events } = setup();
    player.audioTrack = DE;
    fire("sourceLoad", LOAD);
    act(() => ref.current!.setQuality("480p"));
    expect(mockCap).toHaveBeenCalledWith(player, { maxWidth: 854, maxHeight: 480 });
    expect(player.replaceAsync).not.toHaveBeenCalled();
    expect(player.audioTrack).toBe(DE);
    expect(events.filter((e) => e.event === "quality").pop()?.qualities?.find((q) => q.active)?.label).toBe("480p");
    act(() => ref.current!.setQuality("Auto"));
    expect(mockCap).toHaveBeenLastCalledWith(player, null);
  });

  it("lists in-stream and sidecar subtitles together and switches between them", () => {
    const { ref, player, fire, events, r } = setup({
      sidecarSubtitles: [{ id: "de", url: "https://example.test/de.srt", label: "German" }],
    });
    fire("sourceLoad", LOAD);
    const subs = () => events.filter((e) => e.event === "subs").pop()?.subs ?? [];
    expect(subs().map((s) => s.id)).toEqual(["in:0", "side:de"]);
    act(() => ref.current!.setSubtitle("in:0"));
    expect(player.subtitleTrack).toBe(SUB_EN);
    act(() => ref.current!.setSubtitle("side:de"));
    expect(player.subtitleTrack).toBeNull();
    expect(subs().find((s) => s.selected)?.id).toBe("side:de");
    expect(r.root.findAll((n) => typeof n.type === "string" && n.props?.testID === "subtitle-overlay-host")).toHaveLength(1);
    act(() => ref.current!.setSubtitle(null));
    expect(subs().some((s) => s.selected)).toBe(false);
  });

  it("reports a fatal error", () => {
    const { fire, onFatalError } = setup();
    fire("statusChange", { status: "error", error: { message: "HTTP 404" } });
    expect(onFatalError).toHaveBeenCalledWith("HTTP 404");
  });

  it("reload resumes from the same position once the new item is ready", async () => {
    const { ref, player, fire } = setup();
    fire("statusChange", { status: "readyToPlay" });
    fire("timeUpdate", { currentTime: 42, bufferedPosition: 50, currentLiveTimestamp: null, currentOffsetFromLive: null });
    player.play.mockClear();
    await act(async () => ref.current!.reload());
    expect(player.replaceAsync).toHaveBeenCalled();
    fire("statusChange", { status: "loading" });
    fire("statusChange", { status: "readyToPlay" });
    expect(player.currentTime).toBe(42);
    expect(player.play).toHaveBeenCalled();
  });

  it("forwards the first frame", () => {
    const { r, onFirstFrame } = setup();
    act(() => r.root.find((n) => n.props?.testID === "video-view").props.onFirstFrameRender());
    expect(onFirstFrame).toHaveBeenCalled();
  });

  it("reports honest capabilities", () => {
    const { ref, player, fire } = setup();
    player.audioTrack = EN;
    fire("sourceLoad", LOAD);
    expect(ref.current!.getCapabilities()).toMatchObject({ audioTracks: true, qualitySelect: true, subtitles: true });
  });
});
