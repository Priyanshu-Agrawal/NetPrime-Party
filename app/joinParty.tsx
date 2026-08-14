/**
 * Join a Watch Party — enter the host's short room code to join. The guest
 * learns what + where to play from the host's broadcast once connected, so only
 * the code is needed here.
 */
import { normalizeRoomCode } from "@/utils/roomCode";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function JoinParty() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const valid = code.length >= 4;

  const join = () => {
    if (!valid) return;
    router.replace({
      pathname: "/party",
      params: { role: "guest", room: code },
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.bar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.body}
      >
        <Ionicons name="people-circle" size={64} color="#4ea1ff" />
        <Text style={styles.title}>Join a Watch Party</Text>
        <Text style={styles.subtitle}>Enter the room code the host shared with you.</Text>

        <TextInput
          value={code}
          onChangeText={(t) => setCode(normalizeRoomCode(t))}
          placeholder="CODE"
          placeholderTextColor="#4a4a52"
          style={styles.input}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={8}
          returnKeyType="go"
          onSubmitEditing={join}
        />

        <TouchableOpacity
          style={[styles.joinBtn, !valid && styles.joinBtnDisabled]}
          onPress={join}
          disabled={!valid}
        >
          <Text style={[styles.joinText, !valid && styles.joinTextDisabled]}>Join Party</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0c" },
  bar: { paddingHorizontal: 12, paddingVertical: 8 },
  body: { flex: 1, alignItems: "center", paddingHorizontal: 24, paddingTop: 40, gap: 14 },
  title: { color: "#fff", fontSize: 24, fontWeight: "800", marginTop: 8 },
  subtitle: { color: "#9aa0a6", fontSize: 14, textAlign: "center" },
  input: {
    marginTop: 20,
    width: "100%",
    backgroundColor: "#17171b",
    color: "#fff",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 10,
    textAlign: "center",
    paddingVertical: 16,
    borderRadius: 14,
  },
  joinBtn: {
    marginTop: 12,
    width: "100%",
    backgroundColor: "#007bff",
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  joinBtnDisabled: { backgroundColor: "#1c1c21" },
  joinText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  joinTextDisabled: { color: "#555" },
});
