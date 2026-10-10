import { useEffect, useRef, type RefObject } from "react";

/** Anything with FlatList/FlashList's scrollToOffset. */
export interface ScrollableToOffset {
  scrollToOffset(params: { offset: number; animated?: boolean }): void;
}

/**
 * Jump a list back to the top whenever `resultsKey` changes — i.e. when its
 * contents are replaced (a new query, tab or filter), not when more pages are
 * appended. Lists keep their scroll offset across data changes, so without
 * this a new search opens part-way down, hiding its first rows.
 */
export function useScrollToTopOnChange(
  ref: RefObject<ScrollableToOffset | null>,
  resultsKey: string,
): void {
  const shownKey = useRef(resultsKey);
  useEffect(() => {
    if (shownKey.current === resultsKey) return;
    shownKey.current = resultsKey;
    ref.current?.scrollToOffset({ offset: 0, animated: false });
  }, [ref, resultsKey]);
}
