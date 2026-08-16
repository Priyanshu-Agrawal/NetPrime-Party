/**
 * Solo-player Android background audio.
 *
 * Chromium pauses <video> when document.hidden; Android 16 also mutes
 * background media without a MediaSession. This file is the JS half:
 * keep-alive (re-play only if wasPlaying) + a thin wrapper around the
 * BearoomPlayback native module (FGS + MediaSession).
 *
 * ⚠ Party must NOT import this — visibility-induced pause/play would
 * look like user controls and desync the room. ASK CLAUDE before any
 * party wiring.
 */
import {
  DeviceEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from "react-native";

type NativePlayback = {
  start: (title: string, artworkUrl: string) => void;
  updateState: (paused: boolean, positionSec: number, durationSec: number) => void;
  stop: () => void;
};

const Native = NativeModules.BearoomPlayback as NativePlayback | undefined;

export function isSoloPlaybackNativeAvailable(): boolean {
  return Platform.OS === "android" && Native != null;
}

export async function startSoloPlaybackSession(
  title: string,
  artworkUrl: string | null,
): Promise<void> {
  if (!isSoloPlaybackNativeAvailable() || !Native) return;
  if (Platform.OS === "android" && Platform.Version >= 33) {
    try {
      await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
    } catch {
      /* session still starts; notification may be hidden */
    }
  }
  Native.start(title, artworkUrl ?? "");
}

export function updateSoloPlaybackState(
  paused: boolean,
  positionSec: number,
  durationSec: number,
): void {
  Native?.updateState(paused, positionSec, durationSec);
}

export function stopSoloPlaybackSession(): void {
  Native?.stop();
}

export type SoloRemoteCommand = {
  action: "play" | "pause" | "seek";
  positionMs?: number;
};

export function subscribeSoloRemoteCommands(
  onCommand: (cmd: SoloRemoteCommand) => void,
): () => void {
  if (!isSoloPlaybackNativeAvailable()) return () => {};
  const sub = DeviceEventEmitter.addListener("BearoomRemoteCommand", (raw: unknown) => {
    const data = raw as { action?: string; positionMs?: number } | null;
    if (!data || (data.action !== "play" && data.action !== "pause" && data.action !== "seek")) {
      return;
    }
    onCommand({ action: data.action, positionMs: data.positionMs });
  });
  return () => sub.remove();
}

/**
 * Injected before content load on the SOLO WebView only.
 * Tracks wasPlaying; never force-plays a user-paused video.
 */
export const SOLO_BG_JS = `
(function(){
  if (window.__soloBg) return true;
  window.__soloBg = true;
  var wasPlaying = false;
  function findVideo(doc){
    try {
      var v = doc.querySelector('video');
      if (v) return v;
      var iframes = doc.querySelectorAll('iframe');
      for (var i = 0; i < iframes.length; i++) {
        try {
          var child = iframes[i].contentDocument;
          if (child) {
            var nested = findVideo(child);
            if (nested) return nested;
          }
        } catch (e) {}
      }
    } catch (e) {}
    return null;
  }
  function post(type, v, extra){
    try {
      extra = extra || {};
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: type,
        currentTime: v && isFinite(v.currentTime) ? v.currentTime : 0,
        duration: v && isFinite(v.duration) ? v.duration : 0,
        paused: !v || !!v.paused,
        hidden: !!document.hidden,
        user: !!extra.user
      }));
    } catch (e) {}
  }
  function keepAlive(){
    var v = findVideo(document);
    if (!v) return;
    if (document.hidden && wasPlaying && v.paused) {
      var p = v.play();
      if (p && p.catch) p.catch(function(){});
    }
  }
  function bind(v){
    if (!v || v.__soloBgBound) return;
    v.__soloBgBound = true;
    v.addEventListener('play', function(){
      wasPlaying = true;
      post('play', v);
    });
    v.addEventListener('pause', function(){
      if (document.hidden && wasPlaying) {
        keepAlive();
        return;
      }
      wasPlaying = false;
      post('pause', v);
    });
    v.addEventListener('seeked', function(){ post('seeked', v); });
    v.addEventListener('ended', function(){
      wasPlaying = false;
      post('ended', v);
    });
  }
  document.addEventListener('visibilitychange', function(){
    if (!document.hidden) return;
    keepAlive();
    setTimeout(keepAlive, 50);
    setTimeout(keepAlive, 250);
    setTimeout(keepAlive, 1000);
  });
  setInterval(function(){
    var v = findVideo(document);
    if (!v) return;
    bind(v);
    keepAlive();
    if (!v.paused) wasPlaying = true;
    post('tick', v);
  }, 1000);
  window.__soloKeepAlive = keepAlive;
  window.__soloCmd = function(cmd){
    var v = findVideo(document);
    if (!v || !cmd) return;
    if (cmd.action === 'play') {
      wasPlaying = true;
      var p = v.play();
      if (p && p.catch) p.catch(function(){});
      post('play', v, { user: true });
    } else if (cmd.action === 'pause') {
      wasPlaying = false;
      v.pause();
      post('pause', v, { user: true });
    } else if (cmd.action === 'seek' && typeof cmd.time === 'number') {
      try { v.currentTime = cmd.time; } catch (e) {}
    }
  };
  true;
})();
`;
