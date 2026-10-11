import { colors } from "@/theme/bearoom";
import { hasOnboarded } from "@/utils/prefs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import JoinPartyScreen from "../screens/JoinPartyScreen";
import MyListScreen from "../screens/MyListScreen";
import OnboardingScreen from "../screens/OnboardingScreen";
import PartyScreen from "../screens/PartyScreen";
import HomePrefsScreen from "../screens/HomePrefsScreen";
import PlaybackPrefsScreen from "../screens/PlaybackPrefsScreen";
import TrendingShowsScreen from "../screens/TrendingShowsScreen";
import TestStreamsScreen from "../screens/TestStreamsScreen";
import PluginLabScreen from "../screens/PluginLabScreen";
import WatchHistoryScreen from "../screens/WatchHistoryScreen";
import MainTabsNavigator from "./MainTabsNavigator";
import PlayerNavigator from "./PlayerNavigator";
import type { RootStackParamList } from "./types";

const RootStack = createNativeStackNavigator<RootStackParamList>();

const stackScreenOptions = {
  headerShown: false,
  // Native iOS-style push (also restores the native swipe-back gesture). Runs on
  // the native thread — no JS/perf cost. Per-screen overrides below.
  animation: "slide_from_right" as const,
  contentStyle: { backgroundColor: colors.bg },
};

export default function RootNavigator() {
  const initialRouteName = hasOnboarded() ? "MainTabs" : "Onboarding";

  return (
    <RootStack.Navigator initialRouteName={initialRouteName} screenOptions={stackScreenOptions}>
      <RootStack.Screen name="Onboarding" component={OnboardingScreen} options={{ animation: "fade" }} />
      <RootStack.Screen name="MainTabs" component={MainTabsNavigator} options={{ animation: "fade" }} />
      <RootStack.Screen name="PlayerStack" component={PlayerNavigator} />
      {/* Watch-party entry points rise like a modal sheet. */}
      <RootStack.Screen name="Party" component={PartyScreen} options={{ animation: "slide_from_bottom" }} />
      <RootStack.Screen name="JoinParty" component={JoinPartyScreen} options={{ animation: "slide_from_bottom" }} />
      <RootStack.Screen name="MyList" component={MyListScreen} />
      <RootStack.Screen name="WatchHistory" component={WatchHistoryScreen} />
      <RootStack.Screen name="TrendingShows" component={TrendingShowsScreen} />
      <RootStack.Screen name="HomePrefs" component={HomePrefsScreen} />
      <RootStack.Screen name="PlaybackPrefs" component={PlaybackPrefsScreen} />
      <RootStack.Screen name="TestStreams" component={TestStreamsScreen} />
      <RootStack.Screen name="PluginLab" component={PluginLabScreen} />
    </RootStack.Navigator>
  );
}
