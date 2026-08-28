/**
 * Single navigation API — all UI entry points call these actions instead of
 * scattering navigate/goBack/replace across screens and components.
 */
import { CommonActions } from "@react-navigation/native";
import { detailsRoute, type MediaItem } from "@/utils/tmdbLists";
import { navigationRef } from "./navigationRef";
import type { PlayerStackParamList, RootStackParamList } from "./types";

type PartyParams = RootStackParamList["Party"];
type LibraryScreen = "MyList" | "WatchHistory" | "TrendingShows";

function dispatch(action: Parameters<typeof navigationRef.dispatch>[0]) {
  if (navigationRef.isReady()) navigationRef.dispatch(action);
}

function navigate<RouteName extends keyof RootStackParamList>(
  name: RouteName,
  params?: RootStackParamList[RouteName],
) {
  if (navigationRef.isReady()) {
    // @ts-expect-error — validated at call sites
    navigationRef.navigate(name, params);
  }
}

export function openDetails(item: MediaItem, fallback: "movie" | "tv" = "movie") {
  navigate("PlayerStack", detailsRoute(item, fallback));
}

export function openPerson(id: number | string) {
  navigate("PlayerStack", { screen: "PersonDetails", params: { id } } as any);
}

export function openPlayer(params: PlayerStackParamList["Player"]) {
  navigate("PlayerStack", { screen: "Player", params });
}

export function openSeeAll(title: string, path: string, kind: "movie" | "tv") {
  navigate("PlayerStack", { screen: "RailSeeAll", params: { title, path, kind } });
}

export function openCollection(id: number | string) {
  navigate("PlayerStack", { screen: "Collection", params: { id } });
}

export function openPartyHost(params: PartyParams) {
  navigate("Party", params);
}

export function openJoinParty() {
  navigate("JoinParty");
}

export function enterParty(params: PartyParams) {
  navigate("Party", params);
}

export function replaceWithParty(params: PartyParams) {
  if (!navigationRef.isReady()) return;
  navigationRef.dispatch(
    CommonActions.reset({
      index: 1,
      routes: [{ name: "MainTabs" }, { name: "Party", params }],
    }),
  );
}

export function openLibrary(screen: LibraryScreen) {
  navigate(screen);
}

export function openHomePrefs() {
  navigate("HomePrefs");
}

export function openSearchTab() {
  navigate("MainTabs", { screen: "Search" });
}

/** Leave player/party/details — always land on MainTabs (predictable exit). */
export function exitMedia() {
  if (!navigationRef.isReady()) return;
  navigationRef.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [{ name: "MainTabs" }],
    }),
  );
}

/** Leave the player back to where the user actually came from — a real stack pop
 *  (Player → Details → Collection → …), so closing a title opened from a Collection
 *  returns to that Collection, not Home. Falls back to the hard reset only when
 *  there is no history to pop (e.g. a param-less `bearoom://player` deep link that
 *  opened straight into the Player). */
export function exitMediaBack() {
  if (!navigationRef.isReady()) return;
  if (navigationRef.canGoBack()) navigationRef.goBack();
  else exitMedia();
}

export function finishOnboarding() {
  if (!navigationRef.isReady()) return;
  navigationRef.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [{ name: "MainTabs" }],
    }),
  );
}

export function goBack() {
  if (navigationRef.isReady() && navigationRef.canGoBack()) {
    navigationRef.goBack();
  }
}
