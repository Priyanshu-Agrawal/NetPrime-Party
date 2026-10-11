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

function Lanes({ params, nativeFirst }: { params: Params; nativeFirst: boolean }) {
  const navigation = useNavigation();
  const [lane, setLane] = useState<"native" | "web">(nativeFirst ? "native" : "web");
  const [startedAt] = useState(() => Date.now());
  if (lane === "web") return <PlayerScreen />;
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
      onUseWeb={() => setLane("web")}
      onClose={exitMediaBack}
      onEpisode={(season, ep) => (navigation as { setParams(p: Partial<Params>): void }).setParams({ season: String(season), ep: String(ep) })}
    />
  );
}

export function PlayerLaneScreen() {
  const route = useRoute<RouteProp<PlayerStackParamList, "Player">>();
  const params = route.params ?? ({} as Params);
  const { pluginHost, nativeLane } = useFeatureFlags();
  const nativeFirst = pluginHost && nativeLane && Platform.OS !== "web" && nativeFetchAvailable && !!params.id;
  return <Lanes key={`${params.id}:${params.season ?? ""}:${params.ep ?? ""}`} params={params} nativeFirst={nativeFirst} />;
}

export default PlayerLaneScreen;
