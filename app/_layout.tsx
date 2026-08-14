import "@/utils/polyfills";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import React, { useEffect, useState } from "react";
import {
  Appearance,
  Button,
  Linking,
  Modal,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";

// NetPrime is dark-first everywhere. Force the app's color scheme to dark at
// runtime so every screen (incl. ones that read useColorScheme) is consistent,
// regardless of the device's light/dark system setting — no native rebuild.
Appearance.setColorScheme("dark");
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { MovieContextProvider } from "./../contexts/movieContext";
import appJson from "../app.json";
import { checkGithubRelease } from "../utils/checkGithubRelease";
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
  // Only include these as tabs
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [modalVisible, setModalVisible] = useState(false);
  const [releaseUrl, setReleaseUrl] = useState<string | undefined>(undefined);
  const [latestVersion, setLatestVersion] = useState<string | undefined>(
    undefined,
  );
  const [fontsLoaded] = useFonts({
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  SystemUI.setBackgroundColorAsync(colors.bg);

  useEffect(() => {
    let mounted = true;
    async function runCheck() {
      try {
        const currentVersion = appJson.expo?.version || "0.0.0";
        const res = await checkGithubRelease(
          "roshang1t",
          "NetPrime",
          currentVersion,
        );
        if (!mounted) return;
        if (res.isNewer) {
          setLatestVersion(res.latestVersion);
          setReleaseUrl(res.htmlUrl);
          setModalVisible(true);
        }
      } catch {
        // ignore
      }
    }
    runCheck();
    return () => {
      mounted = false;
    };
  }, []);

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

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.backdrop}>
          <View style={styles.container}>
            <Text style={styles.title}>New version available</Text>
            <Text style={styles.body}>
              {latestVersion
                ? `Latest: ${latestVersion}`
                : "A new release is available."}
            </Text>
            <View style={styles.buttons}>
              <Button
                title="Open release"
                onPress={() => {
                  if (releaseUrl) Linking.openURL(releaseUrl);
                }}
              />
              <Button title="Dismiss" onPress={() => setModalVisible(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </MovieContextProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    width: "86%",
    backgroundColor: "#111",
    padding: 20,
    borderRadius: 12,
    alignItems: "center",
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "600", marginBottom: 8 },
  body: { color: "#ddd", fontSize: 14, marginBottom: 16, textAlign: "center" },
  buttons: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
    justifyContent: "space-between",
  },
});
