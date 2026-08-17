import type { NavigatorScreenParams } from "@react-navigation/native";

export type PlayerStackParamList = {
  MovieDetails: { id: string; type?: "movie" };
  TvDetails: { id: string; type?: "tv" };
  Player: {
    id: string;
    type: "movie" | "tv";
    season?: string;
    ep?: string;
    title?: string;
    poster_path?: string;
    year?: string;
  };
};

export type MainTabParamList = {
  Home: undefined;
  Search: undefined;
  More: undefined;
};

export type RootStackParamList = {
  Onboarding: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  PlayerStack: NavigatorScreenParams<PlayerStackParamList>;
  Party: {
    role?: "host" | "guest" | string;
    room?: string;
    provider?: string;
    id?: string;
    type?: string;
    season?: string;
    ep?: string;
    title?: string;
  };
  JoinParty: undefined;
  MyList: undefined;
  WatchHistory: undefined;
  TrendingShows: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
