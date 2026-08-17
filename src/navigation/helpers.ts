import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { MediaItem } from "@/utils/tmdbLists";
import { detailsRoute } from "@/utils/tmdbLists";
import type { PlayerStackParamList, RootStackParamList } from "./types";

export type RootNavigation = NativeStackNavigationProp<RootStackParamList>;

export function openDetails(
  navigation: RootNavigation,
  item: MediaItem,
  fallback: "movie" | "tv",
) {
  navigation.navigate("PlayerStack", detailsRoute(item, fallback));
}

export function openPlayer(
  navigation: RootNavigation,
  params: PlayerStackParamList["Player"],
) {
  navigation.navigate("PlayerStack", { screen: "Player", params });
}

export function openParty(
  navigation: RootNavigation,
  params: RootStackParamList["Party"],
) {
  navigation.navigate("Party", params);
}
