/**
 * Shared virtualization tuning for horizontal poster / media rails.
 *
 * A rail holds ~20 fixed-width cards. Without these props a FlatList renders the
 * WHOLE list synchronously on mount — and a screen like a details page mounts
 * several rails at once, so the main thread stalls building dozens of off-screen
 * cards (React Native's "VirtualizedList: large list is slow to update" warning
 * + a visible frame drop / entrance jank). These cap the initial and per-batch
 * render window to roughly what's near the viewport; the rest fill in as the
 * user scrolls the rail.
 *
 * `removeClippedSubviews` is intentionally omitted — on horizontal iOS lists it
 * can blank out cards, a worse artifact than the warning it silences.
 */
export const RAIL_LIST_PROPS = {
  initialNumToRender: 4,
  maxToRenderPerBatch: 6,
  windowSize: 5,
} as const;
