import { HijackHint } from "@/components/player/HijackHint";
import {
  HijackPlayer,
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
  isHijackable,
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
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
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

  // Resist accidental exit: hardware back confirms before closing the player.
  const { requestClose } = useMediaCloseGuard({
    title: "Stop watching?",
    message: "This will close the player.",
    confirmLabel: "Close",
    onConfirm: exitMedia,
  });

  const sheetRef = useRef<BottomSheetModal>(null);
  const episodeSheetRef = useRef<BottomSheetModal>(null);
  const playerRef = useRef<PlayerHandle>(null);
  const controlsRef = useRef<PlayerControlsHandle>(null);
  const posRef = useRef(0);
  const sessionStarted = useRef(false);
  const focusedRef = useRef(true);
  const providers = useProviders();
  const [selected, setSelected] = useState<Provider | undefined>(
    () => providers.find((p) => p.id === providerId) ?? providers[0],
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
  const canParty = isHijackable(selected);

  // Providers load async from /config (no baked-in fallback), so adopt the
  // requested provider (or the top one) once the list arrives if nothing is
  // selected yet. Empty stays unselected.
  useEffect(() => {
    if (!selected && providers.length) {
      setSelected(providers.find((p) => p.id === providerId) ?? providers[0]);
    }
  }, [providers, selected, providerId]);

  // Provider OR episode changed → back to the pre-play gate; drop stale settings.
  useEffect(() => {
    setPlayerBound(false);
    setRate(1);
    setQualities([]);
    setAudios([]);
    sessionStarted.current = false;
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

  const onEvent = (e: PlayerEvent) => {
    if (e.event === "quality") {
      const q = e.qualities ?? [];
      setQualities(q);
      // Silent memory: apply the saved quality (or data-saver cap) if this
      // provider carries a matching rung that isn't already active.
      const ql = matchQuality(getPreferredQuality(), q, { dataSaver: getDataSaver() });
      if (ql && !q.find((t) => t.label === ql)?.active) playerRef.current?.setQuality(ql);
      return;
    }
    if (e.event === "audio") {
      const a = e.audios ?? [];
      setAudios(a);
      // Silent memory: apply the saved dub/language if available & not active.
      const al = matchAudio(getPreferredAudio(), a);
      if (al && !a.find((t) => t.label === al)?.active) playerRef.current?.setAudio(al);
      return;
    }
    if (Number.isFinite(e.currentTime)) posRef.current = e.currentTime;
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

  const startWatchParty = useCallback(() => {
    if (!selected || !isHijackable(selected) || !id) return;
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

  const onSelectProvider = useCallback((pid: string) => {
    const p = getProvider(pid);
    if (p) setSelected(p);
  }, []);

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

        {/* Kept mounted in fullscreen (the absolute player covers it) to avoid an
            extra layout reflow during the rotation. */}
        <View style={styles.controlBar}>
          <TouchableOpacity style={styles.serverBtn} onPress={() => sheetRef.current?.present()}>
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
          playerRef.current?.setQuality(label);
        }}
        audios={audios}
        onSetAudio={(label) => {
          setPreferredAudio(label);
          playerRef.current?.setAudio(label);
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

      <ProviderSheet ref={sheetRef} selectedId={selected?.id ?? ""} onSelect={onSelectProvider} />
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
