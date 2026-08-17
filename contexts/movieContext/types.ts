// Define the shape of a single movie object based on your API response
export interface Movie {
    adult: boolean;
    backdrop_path: string;
    genre_ids: number[];
    id: number;
    original_language: string;
    original_title: string;
    overview: string;
    popularity: number;
    poster_path: string;
    release_date: string;
    title: string;
    video: boolean;
    vote_average: number;
    vote_count: number;
    name?: string;
}

export interface Series {
    adult: boolean;
    backdrop_path: string;
    genre_ids: number[];
    id: number;
    origin_country: string[],
    original_language: string;
    original_name: string,
    overview: string;
    popularity: number;
    poster_path: string;
    first_air_date: string,
    name: string,
    vote_average: number;
    vote_count: number;
}

export interface MovieContextState {
    movies: Movie[];
    loading: boolean;
    error: string | null;
    currentPage: number;
    totalPages: number;
    totalResults: number;
}

export interface MovieContextActions {
    fetchPopularMovies: (page?: number) => Promise<void>;
}

export type MovieContextType = MovieContextState &
  MovieContextActions & { hasMore: boolean; loadingMovies: boolean };
