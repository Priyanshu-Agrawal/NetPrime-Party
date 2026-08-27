import type { FeedManifest, FeedSection, FeedSectionType } from "@/types/feed";
import { FEED_SCHEMA_VERSION } from "@/types/feed";
import { HOME_FEED_FALLBACK } from "@/data/homeFeedFallback";

const KNOWN: FeedSectionType[] = [
  "continueWatching", "becauseYouWatched", "tmdbRail", "genreRow", "franchises", "editorialRow",
];

function normalizeSection(raw: any, i: number): FeedSection | null {
  if (!raw || typeof raw !== "object") return null;
  const type = raw.type as FeedSectionType;
  if (!KNOWN.includes(type)) return null;                 // forward-compat: unknown → drop
  if (raw.enabled === false) return null;
  if (type === "tmdbRail") {
    if (typeof raw.path !== "string" || !raw.path) return null;  // missing required prop → drop
    if (raw.kind !== "movie" && raw.kind !== "tv") return null;
  }
  return {
    ...raw,
    id: typeof raw.id === "string" && raw.id ? raw.id : `s${i}`,
    enabled: true,
  } as FeedSection;
}

/** Coerce ANY input into a valid FeedManifest. Undefined/garbage → the baked-in fallback. */
export function normalizeManifest(raw: unknown): FeedManifest {
  const m = raw as any;
  if (!m || typeof m !== "object" || !Array.isArray(m.sections)) return HOME_FEED_FALLBACK;
  const sections = m.sections
    .map((s: any, i: number) => normalizeSection(s, i))
    .filter(Boolean) as FeedSection[];
  if (sections.length === 0) return HOME_FEED_FALLBACK;   // empty after filtering → fallback
  return { version: typeof m.version === "number" ? m.version : FEED_SCHEMA_VERSION, sections };
}
