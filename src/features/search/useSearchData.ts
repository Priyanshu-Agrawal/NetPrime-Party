import { useCallback, useRef, useState, useEffect } from "react";
import {
  useLazyDiscoverCatalogQuery,
  useLazySearchMultiQuery,
  useLazySearchMovieQuery,
  useLazySearchTvQuery,
  useLazySearchPersonQuery,
  useLazySearchCollectionQuery,
  useLazyTrendingAllDayQuery,
} from "@/src/store/services/tmdbApi";
import type { MediaItem } from "@/utils/tmdbLists";

export type SearchType = "multi" | "movie" | "tv" | "person" | "collection";
/** Default browse sort preset — see DISCOVER_SORT in tmdbApi. */
export const DEFAULT_SORT = "popular";

function filterResults(items: unknown[], searchType: SearchType): MediaItem[] {
  return (items ?? []).filter((item: any) => {
    const hasImage = item?.poster_path || item?.profile_path;
    if (!hasImage) return false;
    if (searchType === "multi" || searchType === "person") return true;
    return item?.media_type !== "person";
  }) as MediaItem[];
}

function mergeProviderResults(tvData: any, movieData: any): MediaItem[] {
  return [
    ...(tvData.results ?? []).map((x: MediaItem) => ({ ...x, media_type: "tv" as const })),
    ...(movieData.results ?? []).map((x: MediaItem) => ({ ...x, media_type: "movie" as const })),
  ]
    .filter((m) => m.poster_path)
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
}

export function useSearchData() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<number | null>(null);
  const [searchType, setSearchType] = useState<SearchType>("multi");
  // D4 browse catalog filters (browse-only; a text query bypasses them).
  const [browseGenre, setBrowseGenre] = useState<number | null>(null);
  const [browseSort, setBrowseSort] = useState<string>(DEFAULT_SORT);

  // API Hooks
  const [fetchCatalog] = useLazyDiscoverCatalogQuery();
  const [fetchTrending] = useLazyTrendingAllDayQuery();
  const [fetchMulti] = useLazySearchMultiQuery();
  const [fetchMovie] = useLazySearchMovieQuery();
  const [fetchTv] = useLazySearchTvQuery();
  const [fetchPerson] = useLazySearchPersonQuery();
  const [fetchCollection] = useLazySearchCollectionQuery();

  // Data State
  const [items, setItems] = useState<MediaItem[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pagination refs (Source of Truth)
  const pageRef = useRef(1);
  const totalPagesRef = useRef(1);
  const hasMoreRef = useRef(true);
  const loadingMoreRef = useRef(false);

  // Query / filter refs (carried into loadMore so pagination stays on-context)
  const queryRef = useRef("");
  const providerRef = useRef<number | null>(null);
  const genreRef = useRef<number | null>(null);
  const sortRef = useRef<string>(DEFAULT_SORT);

  // Debounce and race-condition refs
  const latestCallIdRef = useRef<number>(0);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Guards against pathological pagination: consecutive loadMore failures (stop
  // retrying a dead page on every scroll) and runaway short-list auto-fills.
  const loadMoreFailuresRef = useRef(0);
  const autoFillRef = useRef(0);

  const applyPageMeta = useCallback((nextPage: number, nextTotalPages: number) => {
    pageRef.current = nextPage;
    totalPagesRef.current = nextTotalPages;
    hasMoreRef.current = nextPage < nextTotalPages;
  }, []);

  const fetchBrowse = useCallback(
    async (
      providerId: number | null,
      genreId: number | null,
      sort: string,
      pageNum: number,
      append: boolean,
    ): Promise<void> => {
      const callId = latestCallIdRef.current;

      let batch: MediaItem[] = [];
      let totalPages = 1;
      let returnedPage = pageNum;

      // No filters engaged → the default browse landing is Trending (mixed).
      // Any filter (provider / genre / non-default sort) → a discover catalog.
      const noFilters = !providerId && !genreId && sort === DEFAULT_SORT;
      if (noFilters) {
        const data = await fetchTrending({ page: pageNum }).unwrap();
        if (callId !== latestCallIdRef.current) return;

        batch = filterResults(data.results ?? [], "multi");
        totalPages = data.total_pages ?? 1000;
        returnedPage = data.page ?? pageNum;
      } else {
        const { tv: tvData, movie: movieData } = await fetchCatalog({
          providerId,
          genreId,
          sort,
          page: pageNum,
        }).unwrap();
        if (callId !== latestCallIdRef.current) return;

        batch = mergeProviderResults(tvData, movieData);
        totalPages = Math.max(tvData.total_pages ?? 1000, movieData.total_pages ?? 1000);
        returnedPage = pageNum;
      }

      setItems((prev) => {
        if (!append) return batch;

        const seen = new Set(prev.map((i) => `${i.media_type || "media"}:${i.id}`));
        const filteredBatch = batch.filter(
          (i) => !seen.has(`${i.media_type || "media"}:${i.id}`),
        );
        return [...prev, ...filteredBatch];
      });

      applyPageMeta(returnedPage, totalPages);
    },
    [applyPageMeta, fetchTrending, fetchCatalog],
  );

  const fetchSearchPage = useCallback(
    async (query: string, pageNum: number, append: boolean, type: SearchType = searchType): Promise<void> => {
      const callId = latestCallIdRef.current;

      let data: any;
      if (type === "movie") {
        data = await fetchMovie({ query, page: pageNum }).unwrap();
      } else if (type === "tv") {
        data = await fetchTv({ query, page: pageNum }).unwrap();
      } else if (type === "person") {
        data = await fetchPerson({ query, page: pageNum }).unwrap();
      } else if (type === "collection") {
        data = await fetchCollection({ query, page: pageNum }).unwrap();
      } else {
        data = await fetchMulti({ query, page: pageNum }).unwrap();
      }

      if (callId !== latestCallIdRef.current) return;

      let batch = filterResults(data.results ?? [], type);
      // Ensure media_type is set for specific endpoints (RTK Query data is frozen)
      if (type !== "multi") {
        batch = batch.map((item: any) => ({ ...item, media_type: type }));
      }

      setItems((prev) => {
        if (!append) return batch;
        const seen = new Set(prev.map((i) => `${i.media_type || "media"}:${i.id}`));
        const filteredBatch = batch.filter(
          (i) => !seen.has(`${i.media_type || "media"}:${i.id}`),
        );
        return [...prev, ...filteredBatch];
      });

      applyPageMeta(data.page ?? pageNum, data.total_pages ?? 1);
    },
    [applyPageMeta, fetchMulti, fetchMovie, fetchTv, fetchPerson, fetchCollection, searchType],
  );

  const fetchInitial = useCallback(
    async (
      providerId: number | null = selectedProvider,
      query = searchQuery,
      type: SearchType = searchType,
      genreId: number | null = browseGenre,
      sort: string = browseSort,
    ): Promise<void> => {
      const thisCallId = ++latestCallIdRef.current;

      setIsInitialLoading(true);
      setError(null);
      setItems([]); // Clear stale results immediately so skeletons can render

      // Reset pagination guards for the new query/browse context
      loadMoreFailuresRef.current = 0;
      autoFillRef.current = 0;

      providerRef.current = providerId;
      queryRef.current = query;
      genreRef.current = genreId;
      sortRef.current = sort;

      try {
        if (query) {
          await fetchSearchPage(query, 1, false, type);
        } else {
          await fetchBrowse(providerId, genreId, sort, 1, false);
        }
      } catch (err) {
        if (thisCallId === latestCallIdRef.current) {
          // RTK's fakeBaseQuery rejects with a plain string (not an Error), so
          // surface that directly instead of collapsing to a generic message.
          const msg =
            typeof err === "string"
              ? err
              : err instanceof Error
                ? err.message
                : "An unknown error occurred.";
          setError(msg);
          setItems([]);
          applyPageMeta(1, 1);
        }
      } finally {
        if (thisCallId === latestCallIdRef.current) {
          setIsInitialLoading(false);
        }
      }
    },
    [applyPageMeta, fetchBrowse, fetchSearchPage, searchQuery, searchType, selectedProvider, browseGenre, browseSort],
  );

  const selectSearchType = useCallback(
    (type: SearchType) => {
      if (type === searchType) return;
      setSearchType(type);
      if (searchQuery) {
        fetchInitial(selectedProvider, searchQuery, type);
      }
    },
    [fetchInitial, searchQuery, searchType, selectedProvider],
  );

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || isInitialLoading || !hasMoreRef.current) return;

    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    setError(null);

    try {
      const nextPage = pageRef.current + 1;
      if (queryRef.current) {
        await fetchSearchPage(queryRef.current, nextPage, true);
      } else {
        await fetchBrowse(providerRef.current, genreRef.current, sortRef.current, nextPage, true);
      }
      loadMoreFailuresRef.current = 0;
    } catch {
      // Keep current items visible, but don't let a dead page retry forever on
      // every onEndReached — stop paginating after a few consecutive failures.
      loadMoreFailuresRef.current += 1;
      if (loadMoreFailuresRef.current >= 3) hasMoreRef.current = false;
    } finally {
      loadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [fetchBrowse, fetchSearchPage, isInitialLoading]);

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);

      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }

      if (!query) {
        // Instant clear - don't show loading skeleton. Return to the current
        // browse context (provider + filters), not a blank slate.
        setSearchQuery("");
        fetchInitial(selectedProvider, "", searchType, browseGenre, browseSort);
        return;
      }

      // Debounce the actual fetch
      searchTimeoutRef.current = setTimeout(() => {
        fetchInitial(null, query);
      }, 450);
    },
    [fetchInitial, selectedProvider, searchType, browseGenre, browseSort],
  );

  const selectProvider = useCallback(
    (providerId: number | null) => {
      setSelectedProvider(providerId);
      // If we're in search mode, clear it
      if (searchQuery) {
        setSearchQuery("");
      }
      fetchInitial(providerId, "", searchType, browseGenre, browseSort);
    },
    [fetchInitial, searchQuery, searchType, browseGenre, browseSort],
  );

  const selectGenre = useCallback(
    (genreId: number | null) => {
      const next = genreId === browseGenre ? null : genreId; // tap active genre to clear
      setBrowseGenre(next);
      if (searchQuery) setSearchQuery("");
      fetchInitial(selectedProvider, "", searchType, next, browseSort);
    },
    [fetchInitial, searchQuery, selectedProvider, searchType, browseGenre, browseSort],
  );

  const selectSort = useCallback(
    (sort: string) => {
      setBrowseSort(sort);
      if (searchQuery) setSearchQuery("");
      fetchInitial(selectedProvider, "", searchType, browseGenre, sort);
    },
    [fetchInitial, searchQuery, selectedProvider, searchType, browseGenre],
  );

  // Initial mount load
  useEffect(() => {
    fetchInitial(selectedProvider, searchQuery);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fix FlatList/FlashList "short list" bug:
  // If the initial page returns very few items (e.g., after filtering), the content
  // won't fill the screen. Since the user can't scroll, onEndReached never fires.
  // We manually force a load if there are items, but too few to scroll, and more exist.
  useEffect(() => {
    if (
      !isInitialLoading &&
      !isLoadingMore &&
      items.length > 0 &&
      items.length < 18 &&
      hasMoreRef.current &&
      autoFillRef.current < 6 // cap auto-fills so heavy dedup can't burst-page forever
    ) {
      autoFillRef.current += 1;
      loadMore();
    }
  }, [isInitialLoading, isLoadingMore, items.length, loadMore]);

  // Re-run the current (browse or search) fetch — for the error view's Retry.
  const retry = useCallback(() => {
    fetchInitial(providerRef.current, queryRef.current, searchType, genreRef.current, sortRef.current);
  }, [fetchInitial, searchType]);

  return {
    items,
    isInitialLoading,
    isLoadingMore,
    hasMore: hasMoreRef.current,
    error,
    searchQuery,
    selectedProvider,
    searchType,
    browseGenre,
    browseSort,
    loadMore,
    handleSearch,
    selectProvider,
    selectSearchType,
    selectGenre,
    selectSort,
    retry,
    mode: searchQuery ? ("search" as const) : ("browse" as const),
  };
}
