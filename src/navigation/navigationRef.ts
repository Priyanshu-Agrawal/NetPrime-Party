import { createNavigationContainerRef } from "@react-navigation/native";
import type { RootStackParamList } from "./types";

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/** @deprecated Use @/src/navigation/actions instead */
export {
  openDetails as navigateDetails,
  openJoinParty,
  openLibrary,
  openPartyHost,
  openPlayer,
  exitMedia,
  finishOnboarding,
  goBack,
  enterParty,
  replaceWithParty,
} from "./actions";

/** @deprecated Use actions.openX instead */
export function navigate<RouteName extends keyof RootStackParamList>(
  name: RouteName,
  params?: RootStackParamList[RouteName],
) {
  if (navigationRef.isReady()) {
    // @ts-expect-error
    navigationRef.navigate(name, params);
  }
}
