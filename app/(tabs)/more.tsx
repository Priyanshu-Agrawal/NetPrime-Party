import appJson from "@/app.json";
import { Colors } from "@/constants/Colors";
import { useThemeColor } from "@/contexts/colorContext/useThemeColor";
import { checkGithubRelease } from "@/utils/checkGithubRelease";
import { clearAppCache, clearWatchHistory } from "@/utils/history";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function MoreScreen() {
  const router = useRouter();
  const [aboutVisible, setAboutVisible] = useState(false);
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');

  async function handleClearCache() {
    Alert.alert("Clear cache", "Clear app cache and history?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "OK",
        onPress: async () => {
          await clearAppCache();
          Alert.alert("Done", "Cache cleared.");
        },
      },
    ]);
  }

  async function handleClearHistory() {
    Alert.alert("Clear watch history", "Remove all watch history?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "OK",
        onPress: async () => {
          await clearWatchHistory();
          Alert.alert("Done", "History cleared.");
        },
      },
    ]);
  }

  async function handleCheckUpdate() {
    const current = appJson.expo?.version || "0.0.0";
    const res = await checkGithubRelease("roshan669", "Uott", current);
    if (res.isNewer) {
      const releasePage = res.htmlUrl;
      Alert.alert("Update available", `Latest: ${res.latestVersion}`, [
        {
          text: "Open",
          onPress: () => releasePage && Linking.openURL(releasePage),
        },
        { text: "OK", style: "cancel" },
      ]);
    } else {
      Alert.alert("Up to date", `Current: ${current}`);
    }
  }

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor }]}
    >
      <Text style={[styles.header, { color: textColor }]}>Options</Text>

      <TouchableOpacity style={styles.partyItem} onPress={() => router.push("/joinParty")}>
        <View style={styles.left}>
          <Ionicons name="people" size={22} color="#fff" />
          <Text style={styles.partyLabel}>Join a Watch Party</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color="#fff" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.item} onPress={handleClearCache}>
        <View style={styles.left}>
          <MaterialIcons name="delete" size={22} color={textColor} />
          <Text style={[styles.label, { color: textColor }]}>
            Clear cache
          </Text>
        </View>
        <MaterialIcons
          name="chevron-right"
          size={22}
          color={textColor}
        />
      </TouchableOpacity>

      <TouchableOpacity style={styles.item} onPress={handleClearHistory}>
        <View style={styles.left}>
          <MaterialIcons name="history" size={22} color={textColor} />
          <Text style={[styles.label, { color: textColor }]}>
            Clear watch history
          </Text>
        </View>
        <MaterialIcons
          name="chevron-right"
          size={22}
          color={textColor}
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.item}
        onPress={() => router.push("/watchHistory")}
      >
        <View style={styles.left}>
          <MaterialIcons name="list" size={22} color={textColor} />
          <Text style={[styles.label, { color: textColor }]}>
            Watch history
          </Text>
        </View>
        <MaterialIcons
          name="chevron-right"
          size={22}
          color={textColor}
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.item}
        onPress={() => setAboutVisible(true)}
      >
        <View style={styles.left}>
          <MaterialIcons name="info" size={22} color={textColor} />
          <Text style={[styles.label, { color: textColor }]}>About</Text>
        </View>
        <MaterialIcons
          name="chevron-right"
          size={22}
          color={textColor}
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.item}
        onPress={() => Linking.openURL("https://github.com/roshan669/Uott")}
      >
        <View style={styles.left}>
          <MaterialIcons name="star-outline" size={22} color={textColor} />
          <Text style={[styles.label, { color: textColor }]}>
            Star this project
          </Text>
        </View>
        <MaterialIcons
          name="open-in-new"
          size={22}
          color={textColor}
        />
      </TouchableOpacity>

      <Modal visible={aboutVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalBox,
              { backgroundColor },
            ]}
          >
            <Text style={[styles.title, { color: textColor }]}>
              About
            </Text>
            <TouchableOpacity onPress={() => Linking.openURL("https://github.com/roshan669/Uott")} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Text style={{ color: textColor, fontSize: 18, fontWeight: "500" }}>Bearoom</Text>
              <Ionicons name="logo-github" size={22} color={textColor} />
            </TouchableOpacity>
            <Text style={{ color: textColor }}>
              Version: {appJson.expo?.version}
            </Text>
            <View style={{ height: 12 }} />
            <TouchableOpacity style={styles.cta} onPress={handleCheckUpdate}>
              <Text style={{ color: textColor }}>Check for update</Text>
            </TouchableOpacity>
            <View style={{ height: 8 }} />
            <TouchableOpacity
              style={styles.cta}
              onPress={() => setAboutVisible(false)}
            >
              <Text style={{ color: textColor }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  header: { fontSize: 20, fontWeight: "600", marginBottom: 12 },
  item: {
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",

  },
  left: { flexDirection: "row", alignItems: "center", gap: 12 },
  label: { marginLeft: 12, fontSize: 16 },
  partyItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0a7ea4",
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 14,
  },
  partyLabel: { marginLeft: 12, fontSize: 16, fontWeight: "700", color: "#fff" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalBox: {
    width: "86%",
    backgroundColor: "#fff",
    padding: 18,
    borderRadius: 10,
  },
  title: { fontSize: 18, fontWeight: "600", marginBottom: 8 },
  cta: { paddingVertical: 10, alignItems: "center", borderColor: Colors.dark.tabIconDefault, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10 },
  // footer: { textAlign: "center", marginTop: 32, opacity: 0.6, color: Colors.dark.text },
});
