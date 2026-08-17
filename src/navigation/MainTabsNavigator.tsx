import { FloatingTabBar } from "@/src/ui/FloatingTabBar";
import { colors } from "@/theme/bearoom";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import React from "react";
import HomeScreen from "../screens/HomeScreen";
import MoreScreen from "../screens/MoreScreen";
import SearchScreen from "../screens/SearchScreen";
import type { MainTabParamList } from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();

const tabScreenOptions = {
  headerShown: false,
  tabBarHideOnKeyboard: true,
  sceneStyle: { backgroundColor: colors.bg },
  lazy: false,
  freezeOnBlur: true,
} as const;

export default function MainTabsNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={tabScreenOptions}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: "Home" }} />
      <Tab.Screen name="Search" component={SearchScreen} options={{ title: "Search" }} />
      <Tab.Screen name="More" component={MoreScreen} options={{ title: "More" }} />
    </Tab.Navigator>
  );
}
