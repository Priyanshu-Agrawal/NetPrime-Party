import "@/utils/polyfills";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import React from "react";
import { Appearance, useColorScheme } from "react-native";

// Bearoom is dark-first everywhere. Force the app's color scheme to dark at
// runtime so every screen (incl. ones that read useColorScheme) is consistent,
// regardless of the device's light/dark system setting — no native rebuild.
Appearance.setColorScheme("dark");
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { MovieContextProvider } from "./../contexts/movieContext";
import { useFonts } from "expo-font";
import {
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
} from "@expo-google-fonts/outfit";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from "@expo-google-fonts/inter";
import { colors } from "@/theme/bearoom";

export const unstable_settings = {
  initialRouteName: "index",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded] = useFonts({
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  SystemUI.setBackgroundColorAsync(colors.bg);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <MovieContextProvider>
          <StatusBar
            style={colorScheme === "light" ? "dark" : "light"}
            translucent
          />
          <Stack screenOptions={{ headerShown: false }} />
        </MovieContextProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}
