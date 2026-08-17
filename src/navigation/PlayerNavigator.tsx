import { colors } from "@/theme/bearoom";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import MovieDetailsScreen from "../screens/MovieDetailsScreen";
import PlayerScreen from "../screens/PlayerScreen";
import TvDetailsScreen from "../screens/TvDetailsScreen";
import type { PlayerStackParamList } from "./types";

const PlayerStack = createNativeStackNavigator<PlayerStackParamList>();

const playerScreenOptions = {
  headerShown: false,
  animation: "none" as const,
  contentStyle: { backgroundColor: colors.bg },
};

export default function PlayerNavigator() {
  return (
    <PlayerStack.Navigator screenOptions={playerScreenOptions}>
      <PlayerStack.Screen name="MovieDetails" component={MovieDetailsScreen} />
      <PlayerStack.Screen name="TvDetails" component={TvDetailsScreen} />
      <PlayerStack.Screen name="Player" component={PlayerScreen} />
    </PlayerStack.Navigator>
  );
}
