import FloatingTabBar from "@/components/ui/FloatingTabBar";
import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export const unstable_settings = {
  initialRouteName: "index",
  // Only include these as tabs
  tabs: ["index", "search", "more"],
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView>
      <StatusBar style="light" translucent />
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarHideOnKeyboard: true,
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Home" }} />
        <Tabs.Screen name="search" options={{ title: "Search" }} />
        <Tabs.Screen name="more" options={{ title: "More" }} />
      </Tabs>
    </GestureHandlerRootView>
  );
}
