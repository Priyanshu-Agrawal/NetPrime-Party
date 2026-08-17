import { createNavigationContainerRef } from "@react-navigation/native";
import { detailsRoute, type MediaItem } from "@/utils/tmdbLists";
import type { RootStackParamList } from "./types";

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigate<RouteName extends keyof RootStackParamList>(
  name: RouteName,
  params?: RootStackParamList[RouteName],
) {
  if (navigationRef.isReady()) {
    // @ts-expect-error — param union is validated at call sites
    navigationRef.navigate(name, params);
  }
}

export function navigateDetails(item: MediaItem, fallback: "movie" | "tv") {
  navigate("PlayerStack", detailsRoute(item, fallback));
}
