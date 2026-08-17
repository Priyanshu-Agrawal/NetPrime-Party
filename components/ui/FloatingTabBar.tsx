/**
 * FloatingTabBar — a floating frosted-glass bottom bar (Stitch "Bearoom" nav):
 * Home · Search · Party · Profile. The active tab gets a honey pill. A dedicated
 * Party action sits between Search and Profile and launches the watch-party
 * join/host flow (it is not a tab route, so it's injected here).
 *
 * Edge-to-edge aware: lifts above the gesture/nav area via the bottom safe-area
 * inset. Route-agnostic for the real tabs (index/search/more), with a strong
 * blur so it reads as glass over any screen.
 */
import { colors, ms, radius } from "@/theme/bearoom";
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { navigate } from "@/src/navigation/navigationRef";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import GlassCard from "./GlassCard";

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Home: "home-sharp",
  Search: "search",
  More: "person",
  index: "home-sharp",
  home: "home-sharp",
  search: "search",
  more: "person",
  profile: "person",
};

export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  const goTab = (routeName: string, key: string, focused: boolean) => {
    void Haptics.selectionAsync();
    const event = navigation.emit({ type: "tabPress", target: key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigation.navigate(routeName);
  };

  // Split real tabs so the Party action can sit in the middle (after Search).
  const tabs = state.routes.map((route, i) => ({ route, focused: state.index === i }));
  const searchIdx = tabs.findIndex((t) => t.route.name === "Search");
  const head = searchIdx >= 0 ? tabs.slice(0, searchIdx + 1) : tabs;
  const tail = searchIdx >= 0 ? tabs.slice(searchIdx + 1) : [];

  const Tab = ({ route, focused }: { route: BottomTabBarProps["state"]["routes"][number]; focused: boolean }) => (
    <Pressable
      key={route.key}
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      onPress={() => goTab(route.name, route.key, focused)}
      style={styles.tab}
    >
      <View style={[styles.iconWrap, focused && styles.iconActive]}>
        <Ionicons
          name={ICONS[route.name] ?? "ellipse-outline"}
          size={ms(22)}
          color={focused ? colors.onHoney : colors.textDim}
        />
      </View>
    </Pressable>
  );

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, ms(12)) }]}>
      <GlassCard rounded={radius.pill} intensity={40} bordered padded={ms(6)} style={styles.bar}>
        <View style={styles.row}>
          {head.map((t) => (
            <Tab key={t.route.key} route={t.route} focused={t.focused} />
          ))}
          {/* Party action (not a tab route) */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Watch party"
            onPress={() => {
              void Haptics.selectionAsync();
              navigate("JoinParty");
            }}
            style={styles.tab}
          >
            <View style={styles.iconWrap}>
              <Ionicons name="people" size={ms(22)} color={colors.textDim} />
              <View style={styles.partyDot} />
            </View>
          </Pressable>
          {tail.map((t) => (
            <Tab key={t.route.key} route={t.route} focused={t.focused} />
          ))}
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
  bar: { marginHorizontal: ms(32) },
  row: { flexDirection: "row", alignItems: "center", gap: ms(6) },
  tab: { paddingHorizontal: ms(4) },
  iconWrap: {
    width: ms(46),
    height: ms(40),
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  iconActive: { backgroundColor: colors.honey },
  partyDot: {
    position: "absolute",
    top: ms(6),
    right: ms(9),
    width: ms(6),
    height: ms(6),
    borderRadius: ms(3),
    backgroundColor: colors.honey,
  },
});

export default FloatingTabBar;
