import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Movie, MovieContextType } from "./types";
import { fetchWithTimeout } from "@/utils/fetchWithTimeout";

// TMDB's API host (api.themoviedb.org) is blocked/RST on many Indian ISPs, so
// data flows through YOUR OWN Cloudflare Worker proxy (tmdb-proxy-worker.js),
// which reaches TMDB from Cloudflare's network AND injects your TMDB token
// server-side (Worker secret TMDB_TOKEN). The token is therefore NOT in the app.
export const API_URL =
  process.env.EXPO_PUBLIC_TMDB_PROXY_URL || "https://tmdb.spiderfan-no1.workers.dev/";

// Deprecated: the proxy injects the token; nothing sensitive lives in the app.
export const API_BEARER_TOKEN = "";

// Only `accept`. We deliberately ALLOW gzip/br compression (React Native's native
// fetch negotiates + decompresses transparently; the Cloudflare proxy compresses on
// request) and normal HTTP caching. Do NOT re-add `Accept-Encoding: identity` or
// `Cache-Control/Pragma: no-cache` — measured, they bloated every TMDB response
// 2–5× (a details call was 244 KB vs 46 KB gzipped) and defeated caching.
export const API_HEADERS = {
  accept: "application/json",
};

// Default context value for initial creation and for cases where it's used outside a Provider.
// Ensure all properties from MovieContextType are present.
const MovieContext = createContext<MovieContextType | undefined>(undefined);

interface MovieContextProviderProps {
  children: React.ReactNode;
}

export const MovieContextProvider: React.FC<MovieContextProviderProps> = ({
  children,
}) => {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loadingMovies, setLoadingMovies] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalResults, setTotalResults] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(true);

  const fetchPopularMovies = useCallback(async (page: number = 1) => {
    setLoadingMovies(true);
    setError(null);

    try {
      const response = await fetchWithTimeout(
        `${API_URL}movie/now_playing?language=en-US&page=${page}`,
        {
          headers: API_HEADERS,
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.status_message || `HTTP error! status: ${response.status}`,
        );
      }

      const data = await response.json();

      if (page === 1) {
        setMovies(data.results);
      } else {
        setMovies((prev) => {
          const newItems = data.results.filter(
            (newItem: Movie) => !prev.some((prevItem) => prevItem.id === newItem.id)
          );
          return [...prev, ...newItems];
        });
      }
      setLoadingMovies(false);
      setCurrentPage(data.page);
      setTotalPages(data.total_pages);
      setTotalResults(data.total_results);
      setHasMore(data.page < data.total_pages);
    } catch (err) {
      console.error("Failed to fetch movies:", err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unknown error occurred.");
      }
      setMovies([]);
      setHasMore(false);
    } finally {
      setLoadingMovies(false);
    }
  }, []);

  useEffect(() => {
    fetchPopularMovies(1);
  }, [fetchPopularMovies]);

  const contextValue = useMemo<
    MovieContextType & {
      hasMore: boolean;
      loadingMovies: boolean;
    }
  >(
    () => ({
      movies,
      loading: loadingMovies,
      loadingMovies,
      error,
      currentPage,
      totalPages,
      totalResults,
      fetchPopularMovies,
      hasMore,
    }),
    [
      movies,
      loadingMovies,
      error,
      currentPage,
      totalPages,
      totalResults,
      fetchPopularMovies,
      hasMore,
    ],
  );

  return (
    <MovieContext.Provider value={contextValue}>
      {children}
    </MovieContext.Provider>
  );
};

export const useMovieContext = () => {
  const context = useContext(MovieContext);
  if (context === undefined) {
    throw new Error(
      "useMovieContext must be used within a MovieContextProvider",
    );
  }
  return context;
};
