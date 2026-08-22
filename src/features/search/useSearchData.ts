import { useCallback, useRef, useState, useEffect } from "react";
import {
  useLazyDiscoverByProviderQuery,
  useLazySearchMultiQuery,
  useLazyTrendingAllDayQuery,
} from "@/src/store/services/tmdbApi";
import type { MediaItem } from "@/utils/tmdbLists";

function filterResults(items: unknown[]): MediaItem[] {
  return (items ?? []).filter(
    (item: any) => item?.poster_path && item?.media_type !== "person"
  ) as MediaItem[];
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

  // Query refs
  const queryRef = useRef("");
  const providerRef = useRef<number | null>(null);

  // Debounce and race-condition refs
  const latestCallIdRef = useRef<number>(0);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // RTK Query hooks
  const [fetchTrending] = useLazyTrendingAllDayQuery();
  const [fetchDiscover] = useLazyDiscoverByProviderQuery();
  const [fetchSearch] = useLazySearchMultiQuery();

  const applyPageMeta = useCallback((nextPage: number, nextTotalPages: number) => {
    pageRef.current = nextPage;
    totalPagesRef.current = nextTotalPages;
    hasMoreRef.current = nextPage < nextTotalPages;
  }, []);

  const fetchBrowse = useCallback(
    async (providerId: number | null, pageNum: number, append: boolean): Promise<void> => {
      const callId = latestCallIdRef.current;
      
      let batch: MediaItem[] = [];
      let totalPages = 1;
      let returnedPage = pageNum;

      if (!providerId) {
        const data = await fetchTrending({ page: pageNum }).unwrap();
        if (callId !== latestCallIdRef.current) return;
        
        batch = filterResults(data.results ?? []);
        totalPages = data.total_pages ?? 1000;
        returnedPage = data.page ?? pageNum;
      } else {
        const { tv: tvData, movie: movieData } = await fetchDiscover({
          providerId,
          page: pageNum,
        }).unwrap();
        if (callId !== latestCallIdRef.current) return;
        
        batch = mergeProviderResults(tvData, movieData);
        totalPages = Math.max(tvData.total_pages ?? 1000, movieData.total_pages ?? 1000);
        returnedPage = pageNum;
      }

      setItems((prev) => {
        if (!append) return batch;
        
        // Compound dedup key
        const seen = new Set(prev.map((i) => `${i.media_type || "media"}:${i.id}`));
        const filteredBatch = batch.filter(
          (i) => !seen.has(`${i.media_type || "media"}:${i.id}`)
        );
        return [...prev, ...filteredBatch];
      });
      
      applyPageMeta(returnedPage, totalPages);
    },
    [applyPageMeta, fetchTrending, fetchDiscover]
  );

  const fetchSearchPage = useCallback(
    async (query: string, pageNum: number, append: boolean): Promise<void> => {
      const callId = latestCallIdRef.current;
      const data = await fetchSearch({ query, page: pageNum }).unwrap();
      
      if (callId !== latestCallIdRef.current) return;
      
      const batch = filterResults(data.results ?? []);
      setItems((prev) => {
        if (!append) return batch;
        
        const seen = new Set(prev.map((i) => `${i.media_type || "media"}:${i.id}`));
        const filteredBatch = batch.filter(
          (i) => !seen.has(`${i.media_type || "media"}:${i.id}`)
        );
        return [...prev, ...filteredBatch];
      });
      
      applyPageMeta(data.page ?? pageNum, data.total_pages ?? 1);
    },
    [applyPageMeta, fetchSearch]
  );

  const fetchInitial = useCallback(
    async (providerId: number | null = selectedProvider, query = ""): Promise<void> => {
      const thisCallId = ++latestCallIdRef.current;
      
      setIsInitialLoading(true);
      setError(null);
      setItems([]); // Clear stale results immediately so skeletons can render
      
      providerRef.current = providerId;
      queryRef.current = query;
      
      try {
        if (query) {
          await fetchSearchPage(query, 1, false);
        } else {
          await fetchBrowse(providerId, 1, false);
        }
      } catch (err) {
        if (thisCallId === latestCallIdRef.current) {
          setError(err instanceof Error ? err.message : "An unknown error occurred.");
          setItems([]);
          applyPageMeta(1, 1);
        }
      } finally {
        if (thisCallId === latestCallIdRef.current) {
          setIsInitialLoading(false);
        }
      }
    },
    [applyPageMeta, fetchBrowse, fetchSearchPage, selectedProvider]
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
        await fetchBrowse(providerRef.current, nextPage, true);
      }
    } catch {
      // Ignore errors for next pages to keep current items visible
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
        // Instant clear - don't show loading skeleton
        setSearchQuery("");
        fetchInitial(selectedProvider, "");
        return;
      }
      
      // Debounce the actual fetch
      searchTimeoutRef.current = setTimeout(() => {
        fetchInitial(null, query);
      }, 450);
    },
    [fetchInitial, selectedProvider]
  );

  const selectProvider = useCallback(
    (providerId: number | null) => {
      setSelectedProvider(providerId);
      // If we're in search mode, clear it
      if (searchQuery) {
        setSearchQuery("");
      }
      fetchInitial(providerId, "");
    },
    [fetchInitial, searchQuery]
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
    if (!isInitialLoading && !isLoadingMore && items.length > 0 && items.length < 18 && hasMoreRef.current) {
      loadMore();
    }
  }, [isInitialLoading, isLoadingMore, items.length, loadMore]);

  return {
    items,
    isInitialLoading,
    isLoadingMore,
    hasMore: hasMoreRef.current,
    error,
    searchQuery,
    selectedProvider,
    loadMore,
    handleSearch,
    selectProvider,
    mode: searchQuery ? ("search" as const) : ("browse" as const),
  };
}
