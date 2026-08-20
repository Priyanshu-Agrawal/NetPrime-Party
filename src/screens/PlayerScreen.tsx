import { HijackHint } from "@/components/player/HijackHint";
import {
  HijackPlayer,
  type FatalError,
  type PlayerEvent,
  type PlayerHandle,
  type QualityLevel,
} from "@/components/player/HijackPlayer";
import { EpisodeSheet } from "@/components/player/EpisodeSheet";
import { PlayerControls, type PlayerControlsHandle } from "@/components/player/PlayerControls";
import PlayerSettingsSheet from "@/components/player/PlayerSettingsSheet";
import { ProviderSheet } from "@/components/player/ProviderSheet";
import {
  getProvider,
  isPartyCapable,
  type Provider,
} from "@/components/player/providerRegistry";
import { useProviders } from "@/src/store/features/providers/hooks";
import {
  getDataSaver,
  getPreferredAudio,
  getPreferredQuality,
  setPreferredAudio,
  setPreferredQuality,
} from "@/utils/prefs";
import { matchAudio, matchQuality } from "@/utils/trackMatch";
import {
  clearProviderFailure,
  getRecentlyFailed,
  mediaKey,
  recordProviderFailure,
} from "@/utils/failureMemory";
import { useReportOutcomeMutation } from "@/src/store/services/workerApi";
import type { ReportArgs, ReportOutcome } from "@/src/types/worker.types";
import Constants from "expo-constants";
import {
  isBackgroundPlaybackAvailable,
  startBackgroundPlaybackSession,
  stopBackgroundPlaybackSession,
  updateBackgroundPlaybackState,
} from "@/components/player/backgroundPlayback";
import { useMediaCloseGuard } from "@/hooks/useMediaCloseGuard";
import { colors, font, glow, ms, radius } from "@/theme/bearoom";
import { addToWatchHistory } from "@/utils/history";
import { genRoomCode } from "@/utils/roomCode";
import { img } from "@/utils/tmdbDetails";
import { Ionicons } from "@expo/vector-icons";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useKeepAwake } from "expo-keep-awake";
import { exitMedia, openPartyHost } from "@/src/navigation/actions";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { PlayerStackParamList } from "@/src/navigation/types";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useResponsive } from "@/hooks/useResponsive";

/**
 * SOLO playback = the SAME native player as the watch party (HijackPlayer + our
 * PlayerControls overlay + settings sheet), just driven LOCALLY (no room authority).
 * A provider selector switches the source; hijackable providers get the overlay,
 * others fall back to the provider's own web controls. Background audio, fullscreen,
 * and the close-guard carry over. The "Watch Party" button launches the synced party.
 */
export const PlayerScreen: React.FC = () => {
  useKeepAwake();

  const route = useRoute<RouteProp<PlayerStackParamList, "Player">>();
  const { id, type, season, ep, title, poster_path, providerId } = route.params;

  const navigation = useNavigation<NativeStackNavigationProp<PlayerStackParamList>>();

  // Hardware back is handled contextually first (exit fullscreen before prompting
  // "Stop watching?"), mirroring the overlay back button. Assigned live below, once
  // fullscreen state + toggleFullscreen exist.
  const backInterceptRef = useRef<() => boolean>(() => false);
  // Resist accidental exit: hardware back confirms before closing the player.
  const { requestClose } = useMediaCloseGuard({
    title: "Stop watching?",
    message: "This will close the player.",
    confirmLabel: "Close",
    onConfirm: exitMedia,
    beforeClose: () => backInterceptRef.current(),
  });

  const sheetRef = useRef<BottomSheetModal>(null);
  // A present() issued while the sheet is mid-dismiss (pick → instant-fail) is
  // swallowed by @gorhom. Arm this and flush it in the sheet's onDismiss.
  const pendingPresentRef = useRef(false);
  const episodeSheetRef = useRef<BottomSheetModal>(null);
  const playerRef = useRef<PlayerHandle>(null);
  const controlsRef = useRef<PlayerControlsHandle>(null);
  const posRef = useRef(0);
  const sessionStarted = useRef(false);
  const focusedRef = useRef(true);
  const [reportOutcome] = useReportOutcomeMutation();
  // Two independent telemetry locks per provider session:
  //  • initialOutcomeRef — success XOR a startup failure XOR manual_switch (once).
  //  • stallReportedRef   — a mid-stream death (playback_stall), which MUST be able
  //    to fire even after a success (a stream that played 30s then died at 20min on
  //    token expiry is the most important cat-and-mouse signal). Phase 8 fires it.
  const initialOutcomeRef = useRef(false);
  const stallReportedRef = useRef(false);
  const mountTsRef = useRef(0); // Date.now() at provider mount, for timeToFailMs
  // Phase 8 fallback signals.
  const userGesturedRef = useRef(false); // first WebView interaction = play-intent
  const anyPlaybackRef = useRef(false); // did the video ever actually play?
  const lastProgressTsRef = useRef(0); // last time currentTime advanced (stall detection)
  const pausedRef = useRef(true);
  const [fallbackBanner, setFallbackBanner] = useState(false); // actionable "try another source"
  const [excludedIds, setExcludedIds] = useState<string[]>([]); // providers that failed this session
  const providers = useProviders();
  // Bias the initial/default source away from providers that recently failed for
  // THIS title (cross-session, MMKV). Never strands — falls back to the top one.
  const pickInitialProvider = useCallback(
    (list: Provider[]): Provider | undefined => {
      if (!list.length) return undefined;
      const failed = getRecentlyFailed(
        mediaKey({
          tmdbId: id ?? "",
          type: type === "tv" ? "tv" : "movie",
          season: season ? Number(season) : undefined,
          episode: ep ? Number(ep) : undefined,
        }),
      );
      const requested = providerId ? list.find((p) => p.id === providerId) : undefined;
      if (requested && !failed.has(requested.id)) return requested;
      return list.find((p) => !failed.has(p.id)) ?? requested ?? list[0];
    },
    [id, type, season, ep, providerId],
  );
  const [selected, setSelected] = useState<Provider | undefined>(() =>
    pickInitialProvider(providers),
  );
  // Our overlay mounts once the bridge binds a <video> (past the pre-play gate).
  const [playerBound, setPlayerBound] = useState(false);
  const [rate, setRate] = useState(1);
  const [qualities, setQualities] = useState<QualityLevel[]>([]);
  const [audios, setAudios] = useState<QualityLevel[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const { isLandscapeMobile } = useResponsive();
  const isImmersive = fullscreen || isLandscapeMobile;

  const displayTitle = title || "Bearoom";
  const artworkUrl = img(typeof poster_path === "string" ? poster_path : null, "w342");
  const canParty = isPartyCapable(selected);

  // Providers load async from /config (no baked-in fallback), so adopt the
  // requested provider (or the top one) once the list arrives if nothing is
  // selected yet. Empty stays unselected.
  useEffect(() => {
    if (!selected && providers.length) {
      setSelected(pickInitialProvider(providers));
    }
  }, [providers, selected, pickInitialProvider]);

  // Provider OR episode changed → back to the pre-play gate; drop stale settings.
  useEffect(() => {
    setPlayerBound(false);
    setRate(1);
    setQualities([]);
    setAudios([]);
    sessionStarted.current = false;
    initialOutcomeRef.current = false; // new provider session → allow one initial report
    stallReportedRef.current = false; // ...and one independent mid-stream stall report
    mountTsRef.current = Date.now(); // baseline for timeToFailMs
    userGesturedRef.current = false;
    anyPlaybackRef.current = false;
    lastProgressTsRef.current = Date.now();
    pausedRef.current = true;
    setFallbackBanner(false);
    stopBackgroundPlaybackSession();
  }, [selected?.id, season, ep]);

  // Silent memory: once the bridge binds, read the provider's track lists in the
  // background so saved audio/quality prefs auto-apply (via onEvent) WITHOUT the
  // user opening settings. Reading is passive; applying is guarded by matcher +
  // the track's `active` flag, so a pref that's already default causes no re-buffer.
  useEffect(() => {
    if (!playerBound) return;
    const t1 = setTimeout(() => playerRef.current?.readQuality(), 900);
    const t2 = setTimeout(() => playerRef.current?.readAudio(), 1600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [playerBound, selected?.id, season, ep]);

  // Phase 8 no-bind safety net. Timers count from provider mount; once bound they
  // clear and the banner hides. 10s → actionable banner (user chooses). 25s →
  // hard fallback, but ONLY if the user gestured (play-intent) and NO playback
  // ever started, and the app is focused — so an idle pre-play gate never pops.
  useEffect(() => {
    if (playerBound || !id || !selected) {
      setFallbackBanner(false);
      return;
    }
    const soft = setTimeout(() => {
      // Only nudge once the user actually expressed play-intent (a gesture inside
      // the WebView) but nothing bound — never while idling at the provider's
      // pre-play / ad gate. Same gate as the 25s hard timeout below.
      if (!playerBound && userGesturedRef.current) setFallbackBanner(true);
    }, 10000);
    const hard = setTimeout(() => {
      if (playerBound || !focusedRef.current) return;
      if (!userGesturedRef.current || anyPlaybackRef.current) return; // idle gate / already playing
      if (!initialOutcomeRef.current) {
        initialOutcomeRef.current = true;
        report("no_bind", { timeToFailMs: 25000 });
      }
      triggerFallback();
    }, 25000);
    return () => {
      clearTimeout(soft);
      clearTimeout(hard);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerBound, selected?.id, season, ep]);

  // Phase 8 mid-stream stall detector. While bound and playing, if currentTime
  // stops advancing for >20s (token expiry / dead segment), report playback_stall
  // ONCE — independent of `success`, since a stream that plays then dies is the
  // key cat-and-mouse signal — and surface the fallback banner.
  useEffect(() => {
    if (!playerBound) return;
    lastProgressTsRef.current = Date.now();
    const iv = setInterval(() => {
      if (stallReportedRef.current || !focusedRef.current) return;
      if (!anyPlaybackRef.current || pausedRef.current) return;
      if (Date.now() - lastProgressTsRef.current > 20000) {
        stallReportedRef.current = true;
        report("playback_stall", { timeToFailMs: Date.now() - mountTsRef.current });
        setFallbackBanner(true);
      }
    }, 5000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerBound, selected?.id, season, ep]);

  // Leaving the screen (e.g. tapping "Watch Party", which PUSHES the party on top so
  // this screen stays mounted) must not leave the video playing behind it — pause it.
  // (Blur does NOT fire on Home, so background audio still works.)
  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      return () => {
        focusedRef.current = false;
        playerRef.current?.pause();
      };
    }, []),
  );

  // Teardown: stop the background session + release orientation.
  // This screen may rotate freely; snap back to portrait when leaving.
  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(() => {});
    return () => {
      sessionStarted.current = false;
      stopBackgroundPlaybackSession();
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      if (maskTimer.current) clearTimeout(maskTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    void addToWatchHistory({
      id,
      title: title || `${type === "tv" ? "TV" : "Movie"} ${id}`,
      type,
      season,
      episode: ep,
      poster_path,
    });
  }, [id, title, type, season, ep, poster_path]);

  const media = useMemo(
    () => ({
      tmdbId: id ?? "",
      type: (type === "tv" ? "tv" : "movie") as "movie" | "tv",
      season: season ? Number(season) : undefined,
      episode: ep ? Number(ep) : undefined,
    }),
    [id, type, season, ep],
  );

  // Phase 7 telemetry — fire-and-forget provider health report. `providerId` is
  // explicit so failure hooks can report the OLD provider (e.g. manual_switch).
  const report = useCallback(
    (outcome: ReportOutcome, extra?: Partial<ReportArgs>) => {
      if (!selected || !id) return;
      reportOutcome({
        providerId: selected.id,
        tmdbId: media.tmdbId,
        mediaType: media.type,
        outcome,
        scriptVersion: selected.scriptVersion ?? undefined, // which served bridge was live
        platform: Platform.OS as ReportArgs["platform"],
        appVersion: Constants.expoConfig?.version,
        ...extra,
      });
    },
    [reportOutcome, selected, id, media],
  );

  // Present the source picker, surviving the case where a present() is fired while
  // the sheet is still animating closed (see pendingPresentRef).
  const presentSheet = useCallback(() => {
    pendingPresentRef.current = true;
    sheetRef.current?.present();
  }, []);

  // Fallback: open the source picker, excluding the provider that just failed so
  // we never loop back to a corpse.
  const triggerFallback = useCallback(() => {
    if (selected) {
      setExcludedIds((prev) => (prev.includes(selected.id) ? prev : [...prev, selected.id]));
      recordProviderFailure(mediaKey(media), selected.id); // cross-session: bias future default away
    }
    setFallbackBanner(false);
    presentSheet();
  }, [selected, presentSheet, media]);

  // Fatal main-frame error → report telemetry once. HijackPlayer shows the
  // branded error overlay + auto-retries; its "Try another source" calls
  // triggerFallback (which excludes the failed provider + opens the picker).
  const onFatalError = useCallback(
    (info: FatalError) => {
      if (!initialOutcomeRef.current) {
        initialOutcomeRef.current = true;
        report(info.kind, {
          errorMessage:
            info.description ?? (info.statusCode ? `HTTP ${info.statusCode}` : undefined),
          timeToFailMs: Date.now() - mountTsRef.current,
        });
      }
    },
    [report],
  );

  // Resume-after-switch. A dub/quality/provider switch makes the provider reload
  // the stream from 0:00. We snapshot the position whenever WE trigger a switch,
  // then (in onEvent) seek back once the reloaded stream is playable and has
  // visibly restarted (currentTime dropped well below the snapshot). Guarded by a
  // start threshold (ignore near-0) + a short expiry, so it can NEVER fire on an
  // ordinary buffer or a switch that preserved position. App-layer only — the OTA
  // legacy bridge is untouched.
  const resumeSeekRef = useRef<{ at: number; until: number } | null>(null);
  const armResume = useCallback(() => {
    const at = posRef.current;
    if (at > 8) resumeSeekRef.current = { at, until: Date.now() + 12000 };
  }, []);
  const applyAudio = useCallback((label: string) => {
    armResume();
    playerRef.current?.setAudio(label);
  }, [armResume]);
  const applyQuality = useCallback((label: string) => {
    armResume();
    playerRef.current?.setQuality(label);
  }, [armResume]);

  const onEvent = (e: PlayerEvent) => {
    if (e.event === "gesture") {
      userGesturedRef.current = true; // play-intent — gates the no-bind hard-timeout
      return;
    }
    if (e.event === "quality") {
      const q = e.qualities ?? [];
      setQualities(q);
      // Silent memory: apply the saved quality (or data-saver cap) if this
      // provider carries a matching rung that isn't already active.
      const ql = matchQuality(getPreferredQuality(), q, { dataSaver: getDataSaver() });
      if (ql && !q.find((t) => t.label === ql)?.active) applyQuality(ql);
      return;
    }
    if (e.event === "audio") {
      const a = e.audios ?? [];
      setAudios(a);
      // Silent memory: apply the saved dub/language if available & not active.
      const al = matchAudio(getPreferredAudio(), a);
      if (al && !a.find((t) => t.label === al)?.active) applyAudio(al);
      return;
    }
    // Resume the pre-switch position once the reloaded stream restarts from ~0.
    const rs = resumeSeekRef.current;
    if (rs) {
      if (Date.now() > rs.until) {
        resumeSeekRef.current = null;
      } else if (
        (e.event === "playing" || e.event === "canplay" || (e.readyState ?? 0) >= 3) &&
        (Number(e.currentTime) || 0) < rs.at - 2
      ) {
        resumeSeekRef.current = null;
        playerRef.current?.seek(rs.at);
      }
    }
    // Track real playback progress for stall detection + play-intent.
    const t = Number(e.currentTime) || 0;
    if (t > posRef.current + 0.25) lastProgressTsRef.current = Date.now();
    if (Number.isFinite(e.currentTime)) posRef.current = e.currentTime;
    pausedRef.current = !!e.paused;
    if (e.event === "play" || e.event === "playing" || t > 0) anyPlaybackRef.current = true;
    // Telemetry: report a one-time 'success' once playback sustains past 30s —
    // the denominator that makes provider_health a failure RATE, not a raw count.
    if (!initialOutcomeRef.current && (Number(e.currentTime) || 0) >= 30) {
      initialOutcomeRef.current = true;
      report("success");
      if (selected) clearProviderFailure(mediaKey(media), selected.id); // works now — forget it
    }
    controlsRef.current?.setPlayback({
      currentTime: e.currentTime || 0,
      duration: e.duration || 0,
      paused: !!e.paused,
      readyState: e.readyState,
    });
    // Background audio (Android): start the FGS on real playback, keep it fed. Skip
    // while blurred (e.g. behind the party) so we don't fight it for the shared session.
    if (!focusedRef.current || !isBackgroundPlaybackAvailable()) return;
    if (e.event === "ended") {
      const dur = Number(e.duration) || 0;
      const t = Number(e.currentTime) || 0;
      if (dur > 5 && t >= dur - 1.5) {
        sessionStarted.current = false;
        stopBackgroundPlaybackSession();
      }
      return;
    }
    if (
      e.event !== "play" &&
      e.event !== "pause" &&
      e.event !== "seeked" &&
      e.event !== "tick" &&
      e.event !== "playing" &&
      e.event !== "ready"
    ) {
      return;
    }
    if (!sessionStarted.current) {
      sessionStarted.current = true;
      void startBackgroundPlaybackSession(displayTitle, artworkUrl);
    }
    updateBackgroundPlaybackState(e.paused, Number(e.currentTime) || 0, Number(e.duration) || 0);
  };

  // Black cover over the WebView reflow + OS rotation, faded out once it settles. State-
  // driven so it mounts opaque in the SAME commit as the layout change (no one-frame leak
  // on expand); rendered as a sibling of the whole screen (below), not nested in the
  // player, so it also covers the UI that re-appears on collapse.
  const [masking, setMasking] = useState(false);
  const maskFade = useRef(new Animated.Value(1)).current;
  const maskTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toggleFullscreen = () => {
    const next = !fullscreen;
    if (maskTimer.current) clearTimeout(maskTimer.current);
    maskFade.stopAnimation();
    maskFade.setValue(1);
    setMasking(true);
    setFullscreen(next);
    (async () => {
      try {
        if (next) await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        else await ScreenOrientation.unlockAsync();
      } catch {
        /* best-effort */
      }
    })();
    maskTimer.current = setTimeout(() => {
      Animated.timing(maskFade, { toValue: 0, duration: 300, useNativeDriver: true }).start(
        ({ finished }) => finished && setMasking(false),
      );
    }, 560);
  };

  // Hardware back exits fullscreen first (like the overlay back button) before it
  // ever prompts "Stop watching?". Live-assigned each render so the guard's
  // interceptor always sees the current fullscreen state.
  backInterceptRef.current = fullscreen
    ? () => {
        toggleFullscreen();
        return true;
      }
    : () => false;

  const startWatchParty = useCallback(() => {
    if (!selected || !isPartyCapable(selected) || !id) return;
    openPartyHost({
      role: "host",
      room: genRoomCode(),
      provider: selected.id,
      id,
      type: media.type,
      ...(media.season ? { season: String(media.season) } : {}),
      ...(media.episode ? { ep: String(media.episode) } : {}),
      ...(title ? { title } : {}),
    });
  }, [selected, id, media, title]);

  const onSelectProvider = useCallback(
    (pid: string) => {
      const p = getProvider(pid);
      if (!p) return;
      // Telemetry: leaving a bound provider for another is a weak negative signal
      // about the OLD one (buffering / wrong title / bad dub). Report it for the
      // provider being left, not the new pick.
      if (selected && p.id !== selected.id && playerBound && !initialOutcomeRef.current) {
        initialOutcomeRef.current = true;
        reportOutcome({
          providerId: selected.id,
          tmdbId: media.tmdbId,
          mediaType: media.type,
          outcome: "manual_switch",
          timeToFailMs: Date.now() - mountTsRef.current,
          scriptVersion: selected.scriptVersion ?? undefined,
          platform: Platform.OS as ReportArgs["platform"],
          appVersion: Constants.expoConfig?.version,
        });
      }
      // Picking a provider (even a recently-failed, dimmed one) gives it a fresh
      // chance — drop it from the session exclusion list.
      setExcludedIds((prev) => prev.filter((id) => id !== pid));
      // Re-picking the SAME provider (e.g. a dimmed "tap to retry" row) won't
      // remount HijackPlayer (keyed by id), so force it to reload.
      if (selected && pid === selected.id) playerRef.current?.reload();
      // Same title, new source — resume where we were once the new provider binds.
      armResume();
      setSelected(p);
    },
    [selected, playerBound, media, reportOutcome, armResume],
  );

  return (
    <>
      <StatusBar style="light" translucent hidden={isImmersive} />
      <SafeAreaView style={styles.container}>
        <View style={isImmersive ? styles.playerFs : styles.playerArea}>
          {id && selected ? (
            <>
              <HijackPlayer
                ref={playerRef}
                key={selected.id}
                providerId={selected.id}
                tmdbId={media.tmdbId}
                type={media.type}
                season={media.season}
                episode={media.episode}
                onPlayerEvent={onEvent}
                onBound={() => setPlayerBound(true)}
                onFatalError={onFatalError}
                onSwitchSource={triggerFallback}
                onRecovered={() =>
                  setExcludedIds((prev) => prev.filter((pid) => pid !== selected.id))
                }
                nativeControls={playerBound}
                party={false}
              />
              {playerBound ? (
                <PlayerControls
                  ref={controlsRef}
                  canControl
                  roomPlaying={false}
                  onPlay={() => playerRef.current?.play()}
                  onPause={() => playerRef.current?.pause()}
                  onSeekTo={(sec) => playerRef.current?.seek(sec)}
                  onSeekBy={(d) => playerRef.current?.seek(Math.max(0, posRef.current + d))}
                  onToggleFullscreen={isLandscapeMobile && !fullscreen ? undefined : toggleFullscreen}
                  fullscreen={isImmersive}
                  title={displayTitle}
                  subtitle={
                    media.type === "tv" && media.season && media.episode
                      ? `S${media.season} · E${media.episode}`
                      : undefined
                  }
                  onBack={() => (fullscreen ? toggleFullscreen() : requestClose())}
                  onOpenSettings={() => {
                    playerRef.current?.readQuality();
                    setTimeout(() => playerRef.current?.readAudio(), 750);
                    setShowSettings(true);
                  }}
                  onEpisodes={media.type === "tv" ? () => episodeSheetRef.current?.present() : undefined}
                />
              ) : null}
            </>
          ) : null}
        </View>

        {/* Phase 8: actionable no-bind / stall banner — never auto-pops; the user
            chooses. Opening the sheet lands them on their alternatives. */}
        {fallbackBanner ? (
          <View style={styles.fallbackBanner}>
            <Text style={styles.fallbackText} numberOfLines={1}>
              Taking too long? Try another source.
            </Text>
            <TouchableOpacity
              onPress={() => {
                setFallbackBanner(false);
                presentSheet();
              }}
              style={styles.fallbackBtn}
              hitSlop={8}
            >
              <Text style={styles.fallbackBtnText}>Sources</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Kept mounted in fullscreen (the absolute player covers it) to avoid an
            extra layout reflow during the rotation. */}
        <View style={styles.controlBar}>
          <TouchableOpacity style={styles.serverBtn} onPress={presentSheet}>
            <Ionicons name="server-outline" size={15} color={colors.textDim} />
            <Text style={styles.serverBtnText} numberOfLines={1}>
              {selected?.name ?? "No sources"}
            </Text>
            {canParty && <Ionicons name="paw" size={12} color={colors.honey} />}
            <Ionicons name="chevron-up" size={15} color={colors.textDim} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={startWatchParty}
            disabled={!canParty}
            style={[styles.partyBtn, !canParty && styles.partyBtnDisabled]}
          >
            <Ionicons name="people" size={15} color={canParty ? colors.onHoney : colors.textFaint} />
            <Text style={[styles.partyText, !canParty && styles.partyTextDisabled]}>Watch Party</Text>
          </TouchableOpacity>
        </View>
        {selected ? <HijackHint provider={selected} /> : null}
      </SafeAreaView>

      {/* Fullscreen-rotation cover — a sibling of the whole screen so it hides the WebView
          reflow, the OS rotation, AND the UI that re-appears on collapse. Mounted only
          during a toggle; opaque on mount (same commit as the layout change → no leak),
          then fades out once the rotation settles. */}
      {masking ? (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.black, opacity: maskFade, zIndex: 1000, elevation: 1000 },
          ]}
        />
      ) : null}

      <PlayerSettingsSheet
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        canControl
        rate={rate}
        onSetRate={(r) => {
          setRate(r);
          playerRef.current?.setRate(r);
        }}
        qualities={qualities}
        onSetQuality={(label) => {
          setPreferredQuality(label); // silent memory: remember the manual pick
          applyQuality(label);
        }}
        audios={audios}
        onSetAudio={(label) => {
          setPreferredAudio(label);
          applyAudio(label);
        }}
      />

      {media.type === "tv" ? (
        <EpisodeSheet
          ref={episodeSheetRef}
          tmdbId={media.tmdbId}
          season={media.season}
          episode={media.episode}
          onSelect={(s, e) => navigation.setParams({ season: String(s), ep: String(e) })}
        />
      ) : null}

      <ProviderSheet
        ref={sheetRef}
        selectedId={selected?.id ?? ""}
        onSelect={onSelectProvider}
        excludeIds={excludedIds}
        onChange={(index) => {
          if (index >= 0) pendingPresentRef.current = false; // opened — nothing pending
        }}
        onDismiss={() => {
          // A fatal error requested the sheet while it was closing (pick → instant
          // fail) and present() was swallowed — retry now that it's fully closed.
          if (pendingPresentRef.current) {
            pendingPresentRef.current = false;
            sheetRef.current?.present();
          }
        }}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  playerArea: { flex: 1, backgroundColor: colors.black },
  // Portrait: a 16:9 pane pinned to the top, so the overlay header sits ON the video
  // (not floating in the black margin above a centered video).
  playerPane: { width: "100%", aspectRatio: 16 / 9, backgroundColor: colors.black, overflow: "hidden" },
  playerSpacer: { flex: 1 },
  playerFs: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.black,
    zIndex: 50,
    elevation: 50,
  },
  controlBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
    backgroundColor: colors.bg,
  },
  fallbackBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginHorizontal: 12,
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  fallbackText: { flex: 1, color: colors.text, fontFamily: font.body, fontSize: ms(12) },
  fallbackBtn: {
    paddingHorizontal: ms(12),
    paddingVertical: ms(6),
    borderRadius: radius.pill,
    backgroundColor: colors.honey,
  },
  fallbackBtnText: { color: colors.onHoney, fontFamily: font.label, fontSize: ms(12) },
  serverBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: radius.pill,
  },
  serverBtnText: { color: colors.text, fontFamily: font.bodySemi, fontSize: ms(14), flexShrink: 1 },
  partyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.honey,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: radius.pill,
    ...glow.honey,
  },
  partyBtnDisabled: { backgroundColor: colors.surfaceStrong, ...({ shadowOpacity: 0, elevation: 0 } as const) },
  partyText: { color: colors.onHoney, fontFamily: font.label, fontSize: ms(13) },
  partyTextDisabled: { color: colors.textFaint },
});

export default PlayerScreen;
