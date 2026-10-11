/**
 * The Player route (spec §9 row 2): a title with a playable native stream opens in Bearoom's own player; everything
 * else — and everything when the plugin host or native lane is switched off (F14) — keeps today's web flow.
 */
import { nativeFetchAvailable } from "@/modules/bearoom-fetch";
import { TitlePlayer } from "@/src/features/player/TitlePlayer";
import { exitMediaBack } from "@/src/navigation/actions";
import type { PlayerStackParamList } from "@/src/navigation/types";
import { useFeatureFlags } from "@/src/store/features/providers/hooks";
import { img } from "@/utils/tmdbDetails";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import React, { useState } from "react";
import { Platform } from "react-native";
import { PlayerScreen } from "./PlayerScreen";

type Params = PlayerStackParamList["Player"];

function NativeLane({ params, onUseWeb }: { params: Params; onUseWeb: () => void }) {
  const navigation = useNavigation();
  // TTFF baseline: this episode's Play (or its Next).
  const [startedAt] = useState(() => Date.now());
  const toNumber = (v: unknown) => (v == null || v === "" ? undefined : Number(v));
  return (
    <TitlePlayer
      tmdbId={String(params.id)}
      type={params.type}
      season={toNumber(params.season)}
      episode={toNumber(params.ep)}
      title={params.title}
      posterUrl={img(typeof params.poster_path === "string" ? params.poster_path : null, "w342") ?? undefined}
      startedAt={startedAt}
      onUseWeb={onUseWeb}
      onClose={exitMediaBack}
      onEpisode={(season, ep) => (navigation as { setParams(p: Partial<Params>): void }).setParams({ season: String(season), ep: String(ep) })}
    />
  );
}

/**
 * One title's lane. The web player stays mounted across episodes (it handles its own `setParams` and keeps the
 * viewer's provider, fullscreen and speed); the native lane resolves each episode afresh. A title handed to the web
 * player stays there for its next episodes.
 */
function Lanes({ params, nativeFirst }: { params: Params; nativeFirst: boolean }) {
  const [lane, setLane] = useState<"native" | "web">(nativeFirst ? "native" : "web");
  if (lane === "web") return <PlayerScreen />;
  return <NativeLane key={`${params.season ?? ""}:${params.ep ?? ""}`} params={params} onUseWeb={() => setLane("web")} />;
}

export function PlayerLaneScreen() {
  const route = useRoute<RouteProp<PlayerStackParamList, "Player">>();
  const params = route.params ?? ({} as Params);
  const { pluginHost, nativeLane } = useFeatureFlags();
  const nativeFirst = pluginHost && nativeLane && Platform.OS !== "web" && nativeFetchAvailable && !!params.id;
  return <Lanes key={String(params.id ?? "")} params={params} nativeFirst={nativeFirst} />;
}

export default PlayerLaneScreen;
