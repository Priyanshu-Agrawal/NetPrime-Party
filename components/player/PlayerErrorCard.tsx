/** The §7 error card both lanes show over the player: opaque, no blur or elevation (video screen). */
import { colors } from "@/theme/bearoom";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

export interface CardAction {
  label: string;
  icon?: IoniconName;
  kind: "primary" | "ghost";
  onPress: () => void;
}

export function PlayerErrorCard({
  icon = "cloud-offline-outline",
  title,
  message,
  actions,
}: {
  icon?: IoniconName;
  title: string;
  message: string;
  actions: CardAction[];
}) {
  return (
    <View style={styles.errorOverlay}>
      <Ionicons name={icon} size={46} color={colors.textDim} />
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.errorSub} numberOfLines={2}>
        {message}
      </Text>
      <View style={styles.errorBtns}>
        {actions.map((a) => (
          <TouchableOpacity
            key={a.label}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            onPress={a.onPress}
            style={a.kind === "primary" ? styles.errorPrimary : styles.errorGhost}
            hitSlop={8}
          >
            {a.icon ? <Ionicons name={a.icon} size={16} color={a.kind === "primary" ? colors.onHoney : colors.text} /> : null}
            <Text style={a.kind === "primary" ? styles.errorPrimaryText : styles.errorGhostText}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  errorOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 28,
    backgroundColor: colors.playerBg,
  },
  errorTitle: { color: colors.text, fontSize: 16, fontWeight: "700", textAlign: "center" },
  errorSub: { color: colors.textDim, fontSize: 13, textAlign: "center", lineHeight: 18 },
  errorBtns: { flexDirection: "row", gap: 10, marginTop: 10 },
  errorPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.honey,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
  },
  errorPrimaryText: { color: colors.onHoney, fontSize: 14, fontWeight: "700" },
  errorGhost: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  errorGhostText: { color: colors.text, fontSize: 14, fontWeight: "600" },
});
