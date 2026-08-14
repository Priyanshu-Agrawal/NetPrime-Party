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
import { addToWatchHistory } from "@/utils/history";
import { genRoomCode } from "@/utils/roomCode";
import { Ionicons } from "@expo/vector-icons";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useKeepAwake } from "expo-keep-awake";
import { useGlobalSearchParams, useNavigation, useRouter } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
  const sheetRef = useRef<BottomSheetModal>(null);
  const [selected, setSelected] = useState<Provider>(PROVIDERS[0]);

  useEffect(() => {
    navigation.setOptions({ headerShown: false, animation: "fade" });
  }, [navigation]);

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

  const onMessage = useCallback((e: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(e.nativeEvent.data);
      if (data?.type === "fullscreenchange") {
        if (data.isFullscreen) {
          void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        } else {
          void ScreenOrientation.unlockAsync();
        }
      }
    } catch {
      /* ignore non-JSON page noise */
    }
  }, []);

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
                <ActivityIndicator size="large" color="#007bff" />
              </View>
            )}
            setSupportMultipleWindows={false}
            onOpenWindow={() => {
              /* swallow popups */
            }}
            onShouldStartLoadWithRequest={onShouldStartLoad}
            injectedJavaScriptBeforeContentLoaded={BLOCK_POPUPS_JS}
            onMessage={onMessage}
          />
        </View>

        <View style={styles.controlBar}>
          <TouchableOpacity
            style={styles.serverBtn}
            onPress={() => sheetRef.current?.present()}
          >
            <Ionicons name="server-outline" size={15} color="#fff" />
            <Text style={styles.serverBtnText} numberOfLines={1}>
              {selected.name}
            </Text>
            {canParty && <Ionicons name="people" size={12} color="#4ea1ff" />}
            <Ionicons name="chevron-up" size={15} color="#9aa0a6" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={startWatchParty}
            disabled={!canParty}
            style={[styles.partyBtn, !canParty && styles.partyBtnDisabled]}
          >
            <Ionicons name="people" size={15} color={canParty ? "#fff" : "#666"} />
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
  container: { flex: 1, backgroundColor: "#000" },
  playerArea: { flex: 1, backgroundColor: "#000" },
  webview: { flex: 1, backgroundColor: "#000" },
  center: { justifyContent: "center", alignItems: "center" },
  controlBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
    backgroundColor: "#0a0a0a",
  },
  serverBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1c1c1e",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  serverBtnText: { color: "#fff", fontWeight: "600", fontSize: 14, flexShrink: 1 },
  partyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#0a7ea4",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  partyBtnDisabled: { backgroundColor: "#1c1c1e" },
  partyText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  partyTextDisabled: { color: "#666" },
});

export default Player;
