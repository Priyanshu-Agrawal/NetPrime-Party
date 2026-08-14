import React, { useRef, useState } from "react";
import {
  Button,
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useMovieContext } from "@/contexts/movieContext";
import { Series } from "@/contexts/movieContext/types";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { createShimmerPlaceholder } from "react-native-shimmer-placeholder";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";

const { width } = Dimensions.get("window");

export default function TrendingShowsScreen() {
  const {
    series,
    loadingSeries,
    error,
    seriesCurrentPage,
    seriesTotalPages,
    fetchPopularSeries,
    seriesHasMore,
  } = useMovieContext();

  const colorScheme = useColorScheme();
  const color = Colors[colorScheme ?? "dark"];
  const ShimmerPlaceholder = createShimmerPlaceholder(LinearGradient);
  const router = useRouter();
  
  const flatListRef = useRef<FlatList>(null);
  const [showGoToTop, setShowGoToTop] = useState(false);

  const handlePress = (id: number) => {
    router.push({
      pathname: "/(player)/tvDetails",
      params: { id: id.toString() },
    });
  };

  const renderItem = ({ item }: { item: Series }) => (
    <TouchableOpacity
      style={styles.movieCard}
      activeOpacity={0.85}
      onPress={() => handlePress(item.id)}
    >
      <View>
        {item.poster_path ? (
          <Image
            source={{ uri: `https://image.tmdb.org/t/p/w342${item.poster_path}` }}
            style={styles.posterImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={400}
          />
        ) : (
          <View style={[styles.posterImage, styles.noPoster]}>
            <MaterialIcons name="live-tv" size={30} color="#555" />
          </View>
        )}
        {item.vote_average ? (
          <View style={styles.ratingBadge}>
            <MaterialIcons name="star" size={11} color="#f5c518" />
            <Text style={styles.ratingText}>{item.vote_average.toFixed(1)}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.cardTitle} numberOfLines={1}>
        {item.name || (item as any).title}
      </Text>
      {item.first_air_date ? (
        <Text style={styles.cardYear}>{item.first_air_date.slice(0, 4)}</Text>
      ) : null}
    </TouchableOpacity>
  );

  const handleEndReached = () => {
    if (!loadingSeries && seriesHasMore && seriesCurrentPage < seriesTotalPages) {
      fetchPopularSeries(seriesCurrentPage + 1);
    }
  };

  const scrollToTop = () => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  if (error && series.length === 0) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: color.background }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={28} color={color.icon} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: color.text }]}>Trending Shows</Text>
        </View>
        <View style={styles.centeredContainer}>
          <Text style={styles.errorText}>Error: {error}</Text>
          <Button title="Retry" onPress={() => fetchPopularSeries(1)} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: color.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={28} color={color.icon} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: color.text }]}>Trending Shows</Text>
      </View>
      
      <FlatList
        ref={flatListRef}
        onScroll={(e) => {
          const offsetY = e.nativeEvent.contentOffset.y;
          setShowGoToTop(offsetY > 400);
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        data={series}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        numColumns={2}
        contentContainerStyle={styles.container}
        columnWrapperStyle={styles.columnWrapper}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingSeries ? (
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 16 }}>
              <ShimmerPlaceholder
                shimmerColors={
                  colorScheme === "dark" ? ["#1a1a1a", "#2a2a2a", "#1a1a1a"] : ["#ebebeb", "#d3d3d3", "#ebebeb"]
                }
                duration={1200}
                style={{
                  height: 250,
                  width: (width - 30) / 2,
                  borderRadius: 20,
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
        ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
      />
      {showGoToTop && (
        <TouchableOpacity
          style={[styles.fabContainer, { backgroundColor: color.tint }]}
          onPress={scrollToTop}
          activeOpacity={0.8}
        >
          <View style={styles.fabInner}>
            <MaterialIcons name="arrow-upward" size={20} color={color.background} />
            <Text style={[styles.fabText, { color: color.background }]}>Top</Text>
          </View>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginBottom: 10,
  },
  backButton: {
    padding: 5,
    marginRight: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
  },
  container: {
    paddingHorizontal: 10,
    paddingBottom: 20,
  },
  columnWrapper: {
    justifyContent: "space-between",
  },
  centeredContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    color: "red",
    fontSize: 16,
    marginBottom: 10,
    textAlign: "center",
  },
  movieCard: {
    width: (width - 30) / 2,
  },
  posterImage: {
    width: "100%",
    height: (width - 30) / 2 * 1.5,
    borderRadius: 12,
    backgroundColor: "#1a1a1e",
  },
  noPoster: {
    justifyContent: "center",
    alignItems: "center",
  },
  ratingBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  ratingText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  cardTitle: { color: "#f2f2f4", fontSize: 13, fontWeight: "600", marginTop: 7 },
  cardYear: { color: "#9aa0a6", fontSize: 11, marginTop: 1 },
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
