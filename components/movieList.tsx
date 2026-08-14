// src/components/MovieList.tsx

import { Image } from "expo-image";

import {
  Button, // For efficient list rendering
  Dimensions, // For pagination buttons
  FlatList,
  LayoutAnimation,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity, useColorScheme,
  View
} from "react-native";



import { useMovieContext } from "@/contexts/movieContext";
import { Series } from "@/contexts/movieContext/types";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { createShimmerPlaceholder } from "react-native-shimmer-placeholder";

const { width } = Dimensions.get("window"); // Get screen width

const MovieList: React.FC = React.memo(function MovieList() {
  const router = useRouter();
  const { loadingSeries, error, currentPage, series, fetchPopularMovies } =
    useMovieContext();
  const colorScheme = useColorScheme();
  const ShimmerPlaceholder = createShimmerPlaceholder(LinearGradient);
  const [showShimmer, setShowShimmer] = useState(false);

  useEffect(() => {
    if (loadingSeries) {
      setShowShimmer(true);
    } else {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      const timer = setTimeout(() => setShowShimmer(false), 250);
      return () => clearTimeout(timer);
    }
  }, [loadingSeries]);

  const handlePress = (id: number) => {
    router.push({
      pathname: "/(player)/tvDetails",
      params: { id: id.toString() },
    });
  };

  const renderMovieItem = ({ item }: { item: Series }) => (
    <TouchableOpacity
      onPress={() => handlePress(item.id)}
      style={styles.movieCard}
    >
      {item.poster_path ? (
        <Image
          source={{ uri: `https://image.tmdb.org/t/p/w200${item.poster_path}` }}
          style={[styles.posterImage, { backgroundColor: colorScheme === "dark" ? "#1a1a1a" : "#ebebeb" }]}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={600}
        />
      ) : (
        <View style={styles.noPoster}>
          <Text style={styles.noPosterText}>No Image</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  if (showShimmer) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {[1, 2, 3, 4].map((item, index) => (
          <ShimmerPlaceholder
            key={item}
            shimmerColors={
              colorScheme === "dark" ? ["#1a1a1a", "#2a2a2a", "#1a1a1a"] : ["#ebebeb", "#d3d3d3", "#ebebeb"]
            }
            duration={1200}
            delay={index * 150}
            style={{
              height: 150,
              width: width / 2.75 - 20,
              borderRadius: 10,
              marginLeft: 10,
              marginBottom: 10,
            }}
          />
        ))}
      </ScrollView>
    );
  }

  if (error) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.errorText}>Error: {error}</Text>
        <Button title="Retry" onPress={() => fetchPopularMovies(currentPage)} />
      </View>
    );
  }

  return (
    <View>
      <FlatList
        data={series.slice(0, 10)}
        horizontal={true}
        renderItem={renderMovieItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.flatListContent}
        showsHorizontalScrollIndicator={false}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  centeredContainer: {},
  errorText: {
    color: "red",
    fontSize: 16,
    marginBottom: 10,
    textAlign: "center",
  },
  flatListContent: {
    // paddingBottom: 20, // Space for pagination buttons
  },
  columnWrapper: {
    // justifyContent: "space-around", // Distribute items evenly
    width: 20,
    // marginBottom: 15,
  },
  movieCard: {
    marginLeft: 10,
    width: width / 2.75 - 20, // Roughly half screen width minus padding
  },
  posterImage: {
    width: "100%",
    height: 150, // Fixed height for posters
    borderRadius: 10,
    marginBottom: 10,
  },
  noPoster: {
    width: "100%",
    height: 150,
    backgroundColor: "#ccc",
    borderRadius: 8,
    marginBottom: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  noPosterText: {
    color: "#666",
    fontSize: 16,
    textAlign: "center",
  },
  movieTitle: {
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 5,
    color: "#333",
  },
  movieInfo: {
    fontSize: 13,
    color: "#555",
    textAlign: "center",
  },
  paginationContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  pageText: {
    fontSize: 16,
    marginHorizontal: 10,
    color: "#666",
  },
});

export default MovieList;
