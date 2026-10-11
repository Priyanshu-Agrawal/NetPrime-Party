import { colors } from "@/theme/bearoom";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import RailSeeAllScreen from "@/src/features/discovery/RailSeeAllScreen";
import CollectionScreen from "../screens/CollectionScreen";
import MovieDetailsScreen from "../screens/MovieDetailsScreen";
import PersonDetailsScreen from "../screens/PersonDetailsScreen";
import { PlayerScreen } from "../screens/PlayerScreen";
import NativePlayerScreen from "../screens/NativePlayerScreen";
import TvDetailsScreen from "../screens/TvDetailsScreen";
import type { PlayerStackParamList } from "./types";

const PlayerStack = createNativeStackNavigator<PlayerStackParamList>();

const playerScreenOptions = {
  headerShown: false,
  // Details/see-all push in from the right (native, with swipe-back).
  animation: "slide_from_right" as const,
  contentStyle: { backgroundColor: colors.bg },
};

export default function PlayerNavigator() {
  return (
    <PlayerStack.Navigator screenOptions={playerScreenOptions}>
      <PlayerStack.Screen name="MovieDetails" component={MovieDetailsScreen} />
      <PlayerStack.Screen name="TvDetails" component={TvDetailsScreen} />
      {/* Player fades in — gentle on the WebView, no hard cut. Swipe-back is
          disabled so an accidental edge-swipe can't dismiss the player (and
          trigger orientation re-lock churn) mid-playback; use its own back control. */}
      <PlayerStack.Screen
        name="Player"
        component={PlayerScreen}
        options={{ animation: "fade", gestureEnabled: false }}
      />
      {/* Native lane (expo-video) — Phase 1B opens it from the dev test streams. */}
      <PlayerStack.Screen
        name="NativePlayer"
        component={NativePlayerScreen}
        options={{ animation: "fade", gestureEnabled: false }}
      />
      <PlayerStack.Screen name="PersonDetails" component={PersonDetailsScreen} />
      <PlayerStack.Screen name="RailSeeAll" component={RailSeeAllScreen} />
      <PlayerStack.Screen name="Collection" component={CollectionScreen} />
    </PlayerStack.Navigator>
  );
}
