import HijackHint from "@/components/player/HijackHint";
import ProviderSheet from "@/components/player/ProviderSheet";
import {
  buildEmbedUrl,
  getProvider,
  isAllowedTopNav,
  isHijackable,
  PROVIDERS,
  providerHosts,
  type Provider,
} from "@/components/player/providerRegistry";
import { useMediaCloseGuard } from "@/hooks/useMediaCloseGuard";
import { colors, font, glow, ms, radius } from "@/theme/bearoom";
import {
  SOLO_BG_JS,
  isBackgroundPlaybackAvailable,
  startBackgroundPlaybackSession,
  stopBackgroundPlaybackSession,
  subscribeRemoteCommands,
  updateBackgroundPlaybackState,
} from "@/components/player/backgroundPlayback";
import { addToWatchHistory } from "@/utils/history";
import { img } from "@/utils/tmdbDetails";
import { genRoomCode } from "@/utils/roomCode";
import { Ionicons } from "@expo/vector-icons";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useKeepAwake } from "expo-keep-awake";
import { useFocusEffect, useGlobalSearchParams, useNavigation, useRouter } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import WebView from "react-native-webview";

/**
 * SOLO playback = the multi-aggregator embed with a provider selector (full
 * catalog; solo watching only needs the embed to PLAY, no injection). Providers
 * we've verified are HIJACKABLE additionally expose a "Watch Party" button, which
 * launches the synchronized party on that provider (see providerRegistry /
 * hijackCapabilities). The server list lives in a bottom sheet (search + filter).
 */
const ALL_HOSTS = Array.from(new Set(PROVIDERS.flatMap(providerHosts)));

/** Popup / ad-redirect blocking + fullscreen relay. */
const BLOCK_POPUPS_JS = `
(function(){
  try { window.open = function(){ return null; }; } catch(e){}
  try {
    document.addEventListener('click', function(ev){
      var a = ev.target && ev.target.closest && ev.target.closest('a[target=_blank]');
      if (a){ ev.preventDefault(); ev.stopPropagation(); }
    }, true);
  } catch(e){}
  try {
    document.addEventListener('fullscreenchange', function(){
      window.ReactNativeWebView.postMessage(JSON.stringify({ type:'fullscreenchange', isFullscreen: !!document.fullscreenElement }));
    });
  } catch(e){}
  true;
})();
`;

export const Player: React.FC = () => {
  useKeepAwake();

  const { id, type, season, ep, title, poster_path } = useGlobalSearchParams<{
    id: string;
    type: string;
    season?: string;
    ep?: string;
    title?: string;
    poster_path?: string;
  }>();

  const navigation = useNavigation();
  const router = useRouter();

  // Resist accidental exit: hardware back confirms before closing the player.
  useMediaCloseGuard({
    title: "Stop watching?",
    message: "This will close the player.",
    confirmLabel: "Close",
    onConfirm: () => router.back(),
  });

  const sheetRef = useRef<BottomSheetModal>(null);
  const webRef = useRef<WebView>(null);
  const sessionStarted = useRef(false);
  const [selected, setSelected] = useState<Provider>(PROVIDERS[0]);

  const displayTitle = title || "Bearoom";
  const artworkUrl = img(typeof poster_path === "string" ? poster_path : null, "w342");

  useEffect(() => {
    navigation.setOptions({ headerShown: false, animation: "fade" });
  }, [navigation]);

  // Leaving the solo screen (e.g. tapping "Watch Party", which PUSHES the party
  // on top so this screen stays mounted) must not leave our <video> playing
  // behind it: AlwaysVisibleRNCWebView + the foreground service keep the WebView
  // decoding while it's off-top. Pause on blur. We do NOT stop the background
  // session here — it's activity-wide and the party may have just started its own.
  // (Blur does NOT fire on Home, so background audio for solo still works.)
  useFocusEffect(
    useCallback(() => {
      return () => {
        webRef.current?.injectJavaScript(
          "try{var v=document.querySelector('video');if(v)v.pause();if(window.__soloCmd)window.__soloCmd({action:'pause'});}catch(e){} true;",
        );
      };
    }, []),
  );

  useEffect(() => {
    if (!isBackgroundPlaybackAvailable()) return;
    const unsub = subscribeRemoteCommands((cmd) => {
      const payload =
        cmd.action === "seek"
          ? { action: "seek", time: (cmd.positionMs ?? 0) / 1000 }
          : { action: cmd.action };
      webRef.current?.injectJavaScript(
        `try{window.__soloCmd(${JSON.stringify(payload)});}catch(e){} true;`,
      );
    });
    return () => {
      unsub();
      sessionStarted.current = false;
      stopBackgroundPlaybackSession();
    };
  }, []);

  useEffect(() => {
    sessionStarted.current = false;
    stopBackgroundPlaybackSession();
  }, [selected.id]);

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

  const uri = useMemo(
    () => (id ? buildEmbedUrl(selected, media) : "about:blank"),
    [selected, media, id],
  );

  const onShouldStartLoad = useCallback(
    (req: { url: string; isTopFrame?: boolean }) => isAllowedTopNav(ALL_HOSTS, req),
    [],
  );

  const onMessage = useCallback(
    (e: { nativeEvent: { data: string } }) => {
      try {
        const data = JSON.parse(e.nativeEvent.data) as {
          type?: string;
          isFullscreen?: boolean;
          currentTime?: number;
          duration?: number;
          paused?: boolean;
          hidden?: boolean;
          user?: boolean;
        };
        if (data?.type === "fullscreenchange") {
          if (data.isFullscreen) {
            void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
          } else {
            void ScreenOrientation.unlockAsync();
          }
          return;
        }
        if (
          data?.type === "play" ||
          data?.type === "pause" ||
          data?.type === "seeked" ||
          data?.type === "tick" ||
          data?.type === "ended"
        ) {
          if (!isBackgroundPlaybackAvailable()) return;
          if (data.type === "ended") {
            sessionStarted.current = false;
            stopBackgroundPlaybackSession();
            return;
          }
          // Chromium pauses on hide — ignore unless this is a user/lock-screen command.
          if (data.hidden && data.paused && !data.user) return;
          if (!sessionStarted.current) {
            if (data.type !== "play" && data.paused) return;
            sessionStarted.current = true;
            void startBackgroundPlaybackSession(displayTitle, artworkUrl);
          }
          updateBackgroundPlaybackState(
            !!data.paused,
            Number(data.currentTime) || 0,
            Number(data.duration) || 0,
          );
        }
      } catch {
        /* ignore non-JSON page noise */
      }
    },
    [artworkUrl, displayTitle],
  );

  const startWatchParty = useCallback(() => {
    if (!isHijackable(selected) || !id) return;
    router.push({
      pathname: "/party",
      params: {
        role: "host",
        room: genRoomCode(),
        provider: selected.id,
        id,
        type: media.type,
        ...(media.season ? { season: String(media.season) } : {}),
        ...(media.episode ? { ep: String(media.episode) } : {}),
        ...(title ? { title } : {}),
      },
    });
  }, [selected, id, media, router, title]);

  const onSelectProvider = useCallback((pid: string) => {
    const p = getProvider(pid);
    if (p) setSelected(p);
  }, []);

  const canParty = isHijackable(selected);

  return (
    <>
      <StatusBar style="light" translucent />
      <SafeAreaView style={styles.container}>
        <View style={styles.playerArea}>
          <WebView
            ref={webRef}
            key={selected.id}
            style={styles.webview}
            source={{ uri }}
            javaScriptEnabled
            allowsFullscreenVideo
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            overScrollMode="never"
            startInLoadingState
            renderLoading={() => (
              <View style={[StyleSheet.absoluteFill, styles.center]}>
                <ActivityIndicator size="large" color={colors.honey} />
              </View>
            )}
            setSupportMultipleWindows={false}
            onOpenWindow={() => {
              /* swallow popups */
            }}
            onShouldStartLoadWithRequest={onShouldStartLoad}
            injectedJavaScriptBeforeContentLoaded={
              BLOCK_POPUPS_JS + (Platform.OS === "android" ? SOLO_BG_JS : "")
            }
            onMessage={onMessage}
          />
        </View>

        <View style={styles.controlBar}>
          <TouchableOpacity
            style={styles.serverBtn}
            onPress={() => sheetRef.current?.present()}
          >
            <Ionicons name="server-outline" size={15} color={colors.textDim} />
            <Text style={styles.serverBtnText} numberOfLines={1}>
              {selected.name}
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
            <Text style={[styles.partyText, !canParty && styles.partyTextDisabled]}>
              Watch Party
            </Text>
          </TouchableOpacity>
        </View>
        <HijackHint provider={selected} />
      </SafeAreaView>

      <ProviderSheet
        ref={sheetRef}
        selectedId={selected.id}
        onSelect={onSelectProvider}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  playerArea: { flex: 1, backgroundColor: colors.black },
  webview: { flex: 1, backgroundColor: colors.black },
  center: { justifyContent: "center", alignItems: "center" },
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

export default Player;
