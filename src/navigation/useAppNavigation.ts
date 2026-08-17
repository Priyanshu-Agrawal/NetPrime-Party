import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo } from "react";
import * as actions from "./actions";
import type { RootStackParamList } from "./types";

export type RootNavigation = NativeStackNavigationProp<RootStackParamList>;

/** Typed root navigation hook for screens that need stack access. */
export function useRootNavigation() {
  return useNavigation<RootNavigation>();
}

/** Imperative navigation actions — preferred for components without stack context. */
export function useAppNavigation() {
  return useMemo(
    () => ({
      openDetails: actions.openDetails,
      openPlayer: actions.openPlayer,
      openPartyHost: actions.openPartyHost,
      openJoinParty: actions.openJoinParty,
      enterParty: actions.enterParty,
      replaceWithParty: actions.replaceWithParty,
      openLibrary: actions.openLibrary,
      openSearchTab: actions.openSearchTab,
      exitMedia: actions.exitMedia,
      finishOnboarding: actions.finishOnboarding,
      goBack: actions.goBack,
    }),
    [],
  );
}
