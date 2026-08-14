import { Image } from "expo-image";
import React, { useEffect, useRef, useState } from "react";
import {
  Button, // For efficient list rendering
  Dimensions,
  FlatList,
  LayoutAnimation, ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity, useColorScheme,
  View
} from "react-native";



import { Colors } from "@/constants/Colors";
import { Movie, useMovieContext } from "@/contexts/movieContext";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { createShimmerPlaceholder } from "react-native-shimmer-placeholder";

const { width } = Dimensions.get("window"); // Get screen width

interface PopularListProps {
  ListHeaderComponent?: React.ReactElement | null;
}

const PopularList: React.FC<PopularListProps> = ({ ListHeaderComponent }) => {
  const {
    movies,
    loadingMovies,
    error,
    currentPage,
    totalPages,
    fetchPopularMovies,
    hasMore,
  } = useMovieContext();

  const colorScheme = useColorScheme();
  const color = Colors[colorScheme ?? "dark"];
  const ShimmerPlaceholder = createShimmerPlaceholder(LinearGradient);

  const router = useRouter();

  const flatListRef = useRef<FlatList>(null);
  const [showShimmer, setShowShimmer] = useState(false);
  const [showGoToTop, setShowGoToTop] = useState(false);

  useEffect(() => {
    if (loadingMovies && movies.length === 0) {
      setShowShimmer(true);
    } else if (!loadingMovies) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      const timer = setTimeout(() => setShowShimmer(false), 250);
      return () => clearTimeout(timer);
    }
  }, [loadingMovies, movies.length]);

  const ShimmerGrid = () => (
    <View style={{ width: "100%" }}>
      {[1, 2].map((row) => (
        <View key={row} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 16 }}>
          {[1, 2].map((col) => (
            <ShimmerPlaceholder
              key={`${row}-${col}`}
              shimmerColors={
                colorScheme === "dark" ? ["#1a1a1a", "#2a2a2a", "#1a1a1a"] : ["#ebebeb", "#d3d3d3", "#ebebeb"]
              }
              style={{
                height: 250,
                width: (width - 30) / 2,
                borderRadius: 20,
              }}
              visible={!showShimmer}
              duration={1200}
              delay={(row * 2 + col) * 150}
              shimmerStyle={{
                opacity: showShimmer ? 1 : 0,
                transition: "opacity 0.3s",
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );

  if (showShimmer || (loadingMovies && movies.length === 0)) {
    return (
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {ListHeaderComponent}
        <ShimmerGrid />
      </ScrollView>
    );
  }

  if (error && movies.length === 0) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.errorText}>
          Error: {error} please change you dns
        </Text>
        <Button title="Retry" onPress={() => fetchPopularMovies(currentPage)} />
      </View>
    );
  }

  const handlePress = (id: number) => {
    router.push({
      pathname: "/(player)/details",
      params: { id: id.toString(), type: "movie" },
    });
  };
  const renderItem = ({ item }: { item: Movie }) => (
    <TouchableOpacity
      style={styles.movieCard}
      onPress={() => handlePress(item.id)}
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

  const handleEndReached = () => {
    if (!loadingMovies && hasMore && currentPage < totalPages) {
      fetchPopularMovies(currentPage + 1);
    }
  };

  const scrollToTop = () => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  return (
    <>
      <FlatList
        ref={flatListRef}
        onScroll={(e) => {
          const offsetY = e.nativeEvent.contentOffset.y;
          setShowGoToTop(offsetY > 400);
        }}
        scrollEventThrottle={16}
        ListHeaderComponent={ListHeaderComponent}
        showsVerticalScrollIndicator={false}
        data={movies}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        numColumns={2}
        contentContainerStyle={styles.container}
        columnWrapperStyle={styles.columnWrapper}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingMovies ? (
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 16 }}>
              <ShimmerPlaceholder
                shimmerColors={
                  colorScheme === "dark" ? ["#1a1a1a", "#2a2a2a", "#1a1a1a"] : ["#ebebeb", "#d3d3d3", "#ebebeb"]
                }
                duration={1200}
                style={{
                  height: 250,
                  width: (width - 30) / 2,
                  borderRadius: 8
                }}
              />
              <ShimmerPlaceholder
                shimmerColors={
                  colorScheme === "dark" ? ["#1a1a1a", "#2a2a2a", "#1a1a1a"] : ["#ebebeb", "#d3d3d3", "#ebebeb"]
                }
                duration={1200}
                delay={150}
                style={{
                  height: 250,
                  width: (width - 30) / 2,
                  borderRadius: 20,
                }}
              />
            </View>
          ) : null
        }
        ItemSeparatorComponent={() => <View style={{ height: 16 }} />} // 16px vertical space between rows
      />
      {showGoToTop && (
        <TouchableOpacity
          style={[styles.fabContainer, { backgroundColor: color.tint }]}
          onPress={scrollToTop}
          activeOpacity={0.8}
        >
          <View style={styles.fabInner}>
            <Ionicons name="arrow-up" size={20} color={color.background} />
            <Text style={[styles.fabText, { color: color.background }]}>Top</Text>
          </View>
        </TouchableOpacity>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 10,
  },
  columnWrapper: {
    justifyContent: "space-between",
  },
  centeredContainer: {
    // flex: 1,
    // justifyContent: "center",
    // alignItems: "center",
  },
  errorText: {
    color: "red",
    fontSize: 16,
    marginBottom: 10,
    textAlign: "center",
  },

  movieCard: {
    width: (width - 30) / 2,
    justifyContent: "center",
    alignItems: "center",
  },
  posterImage: {
    width: "100%",
    height: 250, // Fixed height for posters
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 10, height: 10 },
    // marginBottom: 30,
  },
  noPoster: {
    width: "100%",
    height: 250,
    backgroundColor: "#ccc",
    // borderRadius: 8,
    marginBottom: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  noPosterText: {
    color: "#666",
    fontSize: 16,
    textAlign: "center",
  },
  pageText: {
    fontSize: 16,
    marginHorizontal: 10,
    color: "#666",
  },
  fabContainer: {
    position: "absolute",
    bottom: 25,
    alignSelf: "center",
    zIndex: 1000,
    borderRadius: 30,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  fabInner: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  fabText: {
    fontSize: 15,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },
});

export default React.memo(PopularList);
