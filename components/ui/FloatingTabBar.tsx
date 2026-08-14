/**
 * FloatingTabBar — a floating frosted-glass bottom tab bar with a honey pill on
 * the active tab. Edge-to-edge aware: it lifts above the gesture/nav area using
 * the bottom safe-area inset (Android 15 enforced edge-to-edge + older + iOS).
 *
 * Route-agnostic: icons are looked up by route name with a fallback, so it
 * renders whatever tabs the navigator declares (index/search/party/more/…).
 */
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius } from "@/theme/bearoom";
import GlassCard from "./GlassCard";

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: "home",
  home: "home",
  search: "search",
  party: "people",
  more: "person",
  profile: "person",
};

export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <GlassCard rounded={radius.pill} bordered padded={6} style={styles.bar}>
        <View style={styles.row}>
          {state.routes.map((route, i) => {
            const focused = state.index === i;
            const icon = ICONS[route.name] ?? "ellipse-outline";
            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityState={focused ? { selected: true } : {}}
                onPress={() => {
                  void Haptics.selectionAsync();
                  const event = navigation.emit({
                    type: "tabPress",
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
                }}
                style={styles.tab}
              >
                <View style={[styles.iconWrap, focused && styles.iconActive]}>
                  <Ionicons name={icon} size={22} color={focused ? colors.onHoney : colors.textDim} />
                </View>
              </Pressable>
            );
          })}
        </View>
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
  },
  bar: { marginHorizontal: 40 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  tab: { paddingHorizontal: 6 },
  iconWrap: {
    width: 46,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  iconActive: { backgroundColor: colors.honey },
});

export default FloatingTabBar;
