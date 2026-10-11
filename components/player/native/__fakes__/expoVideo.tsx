/** Test double for expo-video: a player whose events tests fire by hand, and a VideoView that renders a View. */
import React from "react";
import { View } from "react-native";

type Listener = (payload?: any) => void;

export class FakeVideoPlayer {
  static last: FakeVideoPlayer | null = null;
  source: unknown;
  playing = false;
  currentTime = 0;
  duration = 0;
  playbackRate = 1;
  preservesPitch = false;
  timeUpdateEventInterval = 0;
  keepScreenOnWhilePlaying = false;
  audioTrack: any = null;
  subtitleTrack: any = null;
  videoTrack: any = null;
  play = jest.fn(() => {
    this.playing = true;
  });
  pause = jest.fn(() => {
    this.playing = false;
  });
  replay = jest.fn(() => {
    this.currentTime = 0;
    this.playing = true;
  });
  replaceAsync = jest.fn(async (source: unknown) => {
    this.source = source;
  });
  private listeners = new Map<string, Set<Listener>>();

  constructor(source: unknown) {
    this.source = source;
    FakeVideoPlayer.last = this;
  }

  addListener(name: string, l: Listener) {
    const set = this.listeners.get(name) ?? new Set<Listener>();
    set.add(l);
    this.listeners.set(name, set);
    return { remove: () => set.delete(l) };
  }

  emit(name: string, payload?: any) {
    this.listeners.get(name)?.forEach((l) => l(payload));
  }
}

export function useVideoPlayer(source: unknown, setup?: (p: FakeVideoPlayer) => void): FakeVideoPlayer {
  const [player] = React.useState(() => {
    const p = new FakeVideoPlayer(source);
    setup?.(p);
    return p;
  });
  return player;
}

export function VideoView(props: Record<string, unknown>) {
  return <View testID="video-view" {...props} />;
}
