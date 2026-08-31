import "./devtools/execbro";
import "react-native-get-random-values";
import "react-native-url-polyfill/auto";
import { AlertHost } from "@/components/ui/BearAlert";
import { ConnectivityBanner } from "@/src/ui/ConnectivityBanner";
import { MovieContextProvider } from "@/contexts/movieContext";
import RootNavigator from "@/src/navigation/RootNavigator";
import { PartySessionProvider } from "@/services/party/PartySession";
import { PartyTray } from "@/components/party/PartyTray";
import { linking } from "@/src/navigation/linking";
import { navigationRef } from "@/src/navigation/navigationRef";
import { colors } from "@/theme/bearoom";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from "@expo-google-fonts/inter";
import {
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
} from "@expo-google-fonts/outfit";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { Provider as ReduxProvider } from "react-redux";
import { store } from "@/src/store";
import ConfigBootstrap from "@/src/store/ConfigBootstrap";
import { DarkTheme, NavigationContainer } from "@react-navigation/native";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import * as ScreenOrientation from "expo-screen-orientation";
import React, { useCallback, useEffect } from "react";
import { Appearance, Platform, useColorScheme, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";

if (Platform.OS !== "web") {
  SplashScreen.preventAutoHideAsync().catch(() => {});
  try {
    Appearance.setColorScheme("dark");
  } catch {}
} else if (typeof document !== "undefined") {
  document.documentElement.style.backgroundColor = colors.bg;
  document.body.style.backgroundColor = colors.bg;
}

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bg,
    border: colors.border,
    text: colors.text,
    primary: colors.honey,
  },
};

export default function App() {
  const colorScheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts({
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  const ready = fontsLoaded || !!fontError;

  useEffect(() => {
    if (fontError) {
      console.warn("[App] Custom fonts failed to load; using system fonts.", fontError);
    }
  }, [fontError]);

  const onLayoutRootView = useCallback(async () => {
    if (ready) {
      await SplashScreen.hideAsync();
    }
  }, [ready]);

  useEffect(() => {
    if (Platform.OS !== "web") {
      void SystemUI.setBackgroundColorAsync(colors.bg);
      // Lock portrait globally; only the Player / Party (and their alerts) may rotate.
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    }
  }, []);

  // Re-lock portrait on any non-rotatable screen. Player/Party unlock themselves on
  // focus, so leaving them snaps everything else back to portrait.
  const handleNavStateChange = useCallback(() => {
    if (Platform.OS === "web" || !navigationRef.isReady()) return;
    const routeName = navigationRef.getCurrentRoute()?.name;
    if (routeName !== "Player" && routeName !== "Party") {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    }
  }, []);

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} onLayout={onLayoutRootView} />;
  }

  return (
    <ReduxProvider store={store}>
      <GestureHandlerRootView
        style={{ flex: 1, backgroundColor: colors.bg }}
        onLayout={onLayoutRootView}
      >
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <KeyboardProvider preload={false}>
            <BottomSheetModalProvider>
            <MovieContextProvider>
              <ConfigBootstrap />
              <NavigationContainer ref={navigationRef} linking={linking} theme={navTheme} onStateChange={handleNavStateChange}>
                <StatusBar
                  style={colorScheme === "light" ? "dark" : "light"}
                  translucent
                />
                {/* The watch-party session lives ABOVE the navigator so leaving
                    PartyScreen no longer destroys the room. `children` is a stable
                    element, so session state changes re-render only the components
                    that actually read a party context — not the whole app. */}
                <PartySessionProvider>
                  <RootNavigator />
                  {/* The live room, carried across every browsing screen. Sits
                      above the tab bar, hides itself on Party/Player. */}
                  <PartyTray />
                  {/* App-global offline strip — rendered after RootNavigator so
                      it paints above every screen (insets from SafeAreaProvider). */}
                  <ConnectivityBanner />
                </PartySessionProvider>
              </NavigationContainer>
              <AlertHost />
            </MovieContextProvider>
          </BottomSheetModalProvider>
          </KeyboardProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ReduxProvider>
  );
}
