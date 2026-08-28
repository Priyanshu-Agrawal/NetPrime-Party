/**
 * Release-status guard.
 *
 * TMDB surfaces titles in lists / collections long before they exist to stream
 * (announced sequels, "Post Production" tentpoles). Pressing Play on those hits
 * a provider dead-end ("We couldn't find that…"), so we gate the Play affordance
 * on this instead of letting the user walk into the wall.
 *
 * Works on BOTH shapes the app holds:
 *   - list item (MediaItem):  release_date / first_air_date [+ media_type], NO status
 *   - full details (raw TMDB): the above + status ("Released" | "Post Production" | …)
 *
 * Principle: only block when there is POSITIVE evidence the title isn't out yet
 * (a future/absent release day, or an explicit pre-release status). Anything
 * uncertain is allowed through, so we never falsely hide Play on a real title.
 */

export interface ReleaseInput {
  media_type?: string | null;
  release_date?: string | null;
  first_air_date?: string | null;
  status?: string | null;
}

// TMDB *movie* status values that mean "not out yet". TV status ("Returning
// Series" / "In Production" / "Planned") describes future seasons, not whether
// episode 1 has aired, so it is deliberately NOT treated as pre-release.
const PRE_RELEASE_MOVIE_STATUS = new Set([
  "Rumored",
  "Planned",
  "In Production",
  "Post Production",
]);

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Parse a TMDB "YYYY-MM-DD" date to an epoch ms (UTC midnight), or null. */
function parseDay(s?: string | null): number | null {
  if (!s || typeof s !== "string") return null;
  const t = Date.parse(s.length === 10 ? `${s}T00:00:00Z` : s);
  return Number.isNaN(t) ? null : t;
}

function resolveKind(
  item: ReleaseInput,
  hint?: "movie" | "tv",
): "movie" | "tv" | undefined {
  if (item.media_type === "movie" || item.media_type === "tv") return item.media_type;
  if (hint) return hint;
  if (item.first_air_date && !item.release_date) return "tv";
  if (item.release_date && !item.first_air_date) return "movie";
  return undefined;
}

function pickDate(item: ReleaseInput, kind?: "movie" | "tv"): string | null {
  if (kind === "tv") return item.first_air_date ?? null;
  if (kind === "movie") return item.release_date ?? null;
  return item.release_date ?? item.first_air_date ?? null;
}

/**
 * True unless we can positively tell the title has not been released yet.
 * @param item a list item or a full details object
 * @param hint the rail/screen's kind, used when `media_type` is absent
 */
export function isReleased(
  item: ReleaseInput | null | undefined,
  hint?: "movie" | "tv",
): boolean {
  if (!item) return true; // nothing to judge on → don't block
  const kind = resolveKind(item, hint);
  const day = parseDay(pickDate(item, kind));

  // #1 — a known release day still in the future.
  if (day != null && day > Date.now()) return false;

  // #2 — movie with an explicit pre-release status and no past date to rebut it.
  if (
    kind !== "tv" &&
    item.status &&
    PRE_RELEASE_MOVIE_STATUS.has(item.status) &&
    day == null
  ) {
    return false;
  }

  return true;
}

/** Short CTA label for an unreleased title, e.g. "Coming Dec 2026" / "Coming soon". */
export function releaseLabel(
  item: ReleaseInput | null | undefined,
  hint?: "movie" | "tv",
): string {
  if (!item) return "Coming soon";
  const dateStr = pickDate(item, resolveKind(item, hint));
  if (dateStr && dateStr.length >= 7) {
    const y = dateStr.slice(0, 4);
    const mi = Number(dateStr.slice(5, 7)) - 1;
    if (MONTHS[mi] && /^\d{4}$/.test(y)) return `Coming ${MONTHS[mi]} ${y}`;
  }
  return "Coming soon";
}
