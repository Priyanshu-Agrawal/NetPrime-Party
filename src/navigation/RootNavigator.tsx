import FloatingTabBar from "@/components/ui/FloatingTabBar";
import { colors } from "@/theme/bearoom";
import { hasOnboarded } from "@/utils/prefs";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import HomeScreen from "../screens/HomeScreen";
import JoinPartyScreen from "../screens/JoinPartyScreen";
import MoreScreen from "../screens/MoreScreen";
import MovieDetailsScreen from "../screens/MovieDetailsScreen";
import MyListScreen from "../screens/MyListScreen";
import OnboardingScreen from "../screens/OnboardingScreen";
import PartyScreen from "../screens/PartyScreen";
import PlayerScreen from "../screens/PlayerScreen";
import SearchScreen from "../screens/SearchScreen";
import TrendingShowsScreen from "../screens/TrendingShowsScreen";
import TvDetailsScreen from "../screens/TvDetailsScreen";
import WatchHistoryScreen from "../screens/WatchHistoryScreen";
import type { MainTabParamList, PlayerStackParamList, RootStackParamList } from "./types";

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const PlayerStack = createNativeStackNavigator<PlayerStackParamList>();

const stackScreenOptions = {
  headerShown: false,
  animation: "slide_from_right" as const,
  contentStyle: { backgroundColor: colors.bg },
};

function MainTabsNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: "Home" }} />
      <Tab.Screen name="Search" component={SearchScreen} options={{ title: "Search" }} />
      <Tab.Screen name="More" component={MoreScreen} options={{ title: "More" }} />
    </Tab.Navigator>
  );
}

function PlayerStackNavigator() {
  return (
    <PlayerStack.Navigator screenOptions={stackScreenOptions}>
      <PlayerStack.Screen name="MovieDetails" component={MovieDetailsScreen} />
      <PlayerStack.Screen name="TvDetails" component={TvDetailsScreen} />
      <PlayerStack.Screen name="Player" component={PlayerScreen} />
    </PlayerStack.Navigator>
  );
}

export default function RootNavigator() {
  const initialRouteName = hasOnboarded() ? "MainTabs" : "Onboarding";

  return (
    <RootStack.Navigator initialRouteName={initialRouteName} screenOptions={stackScreenOptions}>
      <RootStack.Screen name="Onboarding" component={OnboardingScreen} />
      <RootStack.Screen name="MainTabs" component={MainTabsNavigator} />
      <RootStack.Screen name="PlayerStack" component={PlayerStackNavigator} />
      <RootStack.Screen name="Party" component={PartyScreen} />
      <RootStack.Screen name="JoinParty" component={JoinPartyScreen} />
      <RootStack.Screen name="MyList" component={MyListScreen} />
      <RootStack.Screen name="WatchHistory" component={WatchHistoryScreen} />
      <RootStack.Screen name="TrendingShows" component={TrendingShowsScreen} />
    </RootStack.Navigator>
  );
}
