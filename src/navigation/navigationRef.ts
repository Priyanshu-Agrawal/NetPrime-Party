import { createNavigationContainerRef } from "@react-navigation/native";
import type { RootStackParamList } from "./types";

/** Imperative navigation target — use @/src/navigation/actions for navigate helpers. */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
