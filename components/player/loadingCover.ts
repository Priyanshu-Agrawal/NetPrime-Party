/**
 * Our branded loading cover over the WebView. A provider our skin binds keeps it up until
 * the bind (or until the bind times out, so a stuck stream reveals the provider's own UI);
 * a plain embed can never bind, so its own page shows as soon as it loads. Every terminal
 * state (slow banner, not-found card, error card) takes the cover down.
 */
export function loadingCoverVisible(s: {
  bindable: boolean;
  bound: boolean;
  slow: boolean;
  noSource: boolean;
  fatal: boolean;
  pageLoaded: boolean;
}): boolean {
  if (s.bound || s.slow || s.noSource || s.fatal) return false;
  return s.bindable || !s.pageLoaded;
}
