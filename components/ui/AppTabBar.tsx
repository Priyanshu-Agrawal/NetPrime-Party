/**
 * Custom dark tab bar. Each tab is an icon + label; the active tab gets an
 * accent-tinted rounded pill behind the icon and an accent label. Replaces the
 * default (light) bar so it matches the app's dark-first UI.
 */
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BG = "#101014";
const BORDER = "#1e1e22";
const ACCENT = "#4ea1ff";
const INACTIVE = "#7d828a";

export function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label =
          typeof options.tabBarLabel === "string"
            ? options.tabBarLabel
            : options.title ?? route.name;
        const focused = state.index === index;
        const color = focused ? ACCENT : INACTIVE;

        const onPress = () => {
          if (Platform.OS !== "web") {
            void Haptics.selectionAsync().catch(() => {});
          }
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            style={styles.tab}
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
          >
            <View style={[styles.indicator, focused && styles.indicatorActive]} />
            <View style={styles.iconWrap}>
              {options.tabBarIcon?.({ focused, color, size: 26 })}
            </View>
            <Text style={[styles.label, { color }]} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: BG,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    paddingHorizontal: 8,
  },
  tab: { flex: 1, alignItems: "center" },
  // Slim rounded accent bar at the top of the active tab.
  indicator: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: "transparent",
    marginTop: 6,
    marginBottom: 7,
  },
  indicatorActive: { backgroundColor: ACCENT },
  iconWrap: { height: 28, alignItems: "center", justifyContent: "center" },
  label: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 3,
    includeFontPadding: false,
  },
});

export default AppTabBar;
