import type { LinkingOptions } from "@react-navigation/native";
import * as Linking from "expo-linking";
import type { RootStackParamList } from "./types";

const prefix = Linking.createURL("/");

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [prefix, "bearoom://", "exp+bearoom://"],
  config: {
    screens: {
      Onboarding: "onboarding",
      MainTabs: {
        screens: {
          Home: "",
          Search: "search",
          More: "more",
        },
      },
      PlayerStack: {
        screens: {
          MovieDetails: "movie/:id",
          TvDetails: "tv/:id",
          PersonDetails: "person/:id",
          Player: "player",
        },
      },
      Party: {
        path: "party",
        parse: {
          role: String,
          room: String,
          provider: String,
          id: String,
          type: String,
          season: String,
          ep: String,
          title: String,
        },
      },
      JoinParty: "join",
      MyList: "my-list",
      WatchHistory: "history",
      TrendingShows: "trending",
    },
  },
};
