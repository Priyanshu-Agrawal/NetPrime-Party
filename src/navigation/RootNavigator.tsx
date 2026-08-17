import { colors } from "@/theme/bearoom";
import { hasOnboarded } from "@/utils/prefs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import JoinPartyScreen from "../screens/JoinPartyScreen";
import MyListScreen from "../screens/MyListScreen";
import OnboardingScreen from "../screens/OnboardingScreen";
import PartyScreen from "../screens/PartyScreen";
import TrendingShowsScreen from "../screens/TrendingShowsScreen";
import WatchHistoryScreen from "../screens/WatchHistoryScreen";
import MainTabsNavigator from "./MainTabsNavigator";
import PlayerNavigator from "./PlayerNavigator";
import type { RootStackParamList } from "./types";

const RootStack = createNativeStackNavigator<RootStackParamList>();

const stackScreenOptions = {
  headerShown: false,
  animation: "none" as const,
  contentStyle: { backgroundColor: colors.bg },
};

export default function RootNavigator() {
  const initialRouteName = hasOnboarded() ? "MainTabs" : "Onboarding";

  return (
    <RootStack.Navigator initialRouteName={initialRouteName} screenOptions={stackScreenOptions}>
      <RootStack.Screen name="Onboarding" component={OnboardingScreen} />
      <RootStack.Screen name="MainTabs" component={MainTabsNavigator} />
      <RootStack.Screen name="PlayerStack" component={PlayerNavigator} />
      <RootStack.Screen name="Party" component={PartyScreen} />
      <RootStack.Screen name="JoinParty" component={JoinPartyScreen} />
      <RootStack.Screen name="MyList" component={MyListScreen} />
      <RootStack.Screen name="WatchHistory" component={WatchHistoryScreen} />
      <RootStack.Screen name="TrendingShows" component={TrendingShowsScreen} />
    </RootStack.Navigator>
  );
}
