/**
 * Fuzzy track matching for "silent memory" playback prefs (Phase 5.5).
 *
 * Providers label audio/quality inconsistently ("Hindi" / "hin" / "FadeHindi";
 * "1080p" / "1080P" / "FHD"; some only offer "Auto"). A saved preference must
 * resolve to a concrete label on the CURRENT provider, or silently no-op when
 * that provider can't honor it — never guess wrong, never block playback.
 *
 * Deliberately NOT edit-distance: Levenshtein mis-matches short ISO codes
 * ("hi"↔"de" = 2, "en"↔"es" = 1) — exactly the tokens we care about. We use a
 * curated language synonym map + substring/word-boundary containment instead.
 */

export interface Track {
  label: string;
  active?: boolean;
}

// Canonical language → substrings that identify it (full names + 3-letter codes).
// Order matters: more specific / longer synonyms are safe as substrings.
const LANG_SYNONYMS: Record<string, string[]> = {
  hi: ["hindi", "hin"],
  en: ["english", "eng"],
  de: ["german", "deutsch", "ger", "deu"],
  es: ["spanish", "espanol", "espana", "spa"],
  pt: ["portuguese", "portugues", "por"],
  ta: ["tamil", "tam"],
  te: ["telugu", "tel"],
  fr: ["french", "francais", "fra", "fre"],
  ja: ["japanese", "jpn"],
  ko: ["korean", "kor"],
  it: ["italian", "italiano", "ita"],
  ru: ["russian", "rus"],
  ar: ["arabic", "ara"],
  original: ["original", "orig"],
};

const TWO_LETTER = new Set([
  "hi", "en", "de", "es", "pt", "ta", "te", "fr", "ja", "ko", "it", "ru", "ar",
]);

/** Reduce a provider audio label to a canonical language token, or null. */
export function canonLang(label: string): string | null {
  const lower = label.toLowerCase();
  const clean = lower.replace(/[^a-z]/g, "");
  for (const [canon, syns] of Object.entries(LANG_SYNONYMS)) {
    if (syns.some((syn) => clean.includes(syn))) return canon;
  }
  // 2-letter ISO code, but only as a standalone token (avoid "hi" inside "this").
  const m = lower.match(/\b([a-z]{2})\b/);
  if (m && TWO_LETTER.has(m[1])) return m[1];
  return null;
}

/**
 * Resolve a saved audio/dub preference to a concrete label on the available
 * tracks, or null if this provider doesn't carry that language.
 */
export function matchAudio(pref: string | null, available: Track[]): string | null {
  if (!pref || !available.length) return null;
  const want = canonLang(pref);
  if (!want) return null;
  const hit = available.find((t) => canonLang(t.label) === want);
  return hit ? hit.label : null;
}

/** Parse a vertical resolution from a quality label; null for adaptive ("Auto"). */
export function parseHeight(label: string): number | null {
  const s = label.toLowerCase();
  if (/\bauto\b/.test(s)) return null;
  if (/8k|4320/.test(s)) return 4320;
  if (/4k|2160|uhd/.test(s)) return 2160;
  if (/\bfhd\b|1080/.test(s)) return 1080;
  if (/\bhd\b|720/.test(s)) return 720;
  const m = s.match(/(\d{3,4})\s*p?/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Resolve a saved quality preference (or the data-saver cap) to a concrete
 * label. "Auto" pref → the provider's Auto rung. A numeric pref/cap → the
 * highest rung at-or-below it (don't exceed the cap); if none qualify, the
 * lowest available. null → leave the provider's default untouched.
 */
export function matchQuality(
  pref: string | null,
  available: Track[],
  opts: { dataSaver?: boolean } = {},
): string | null {
  if (!available.length) return null;

  if (pref && /\bauto\b/i.test(pref)) {
    const auto = available.find((t) => /\bauto\b/i.test(t.label));
    return auto ? auto.label : null;
  }

  const explicit = pref ? parseHeight(pref) : null;
  let cap = explicit;
  let fromDataSaver = false;
  if (cap == null && opts.dataSaver) {
    cap = 480; // data-saver cap only when the user hasn't picked a quality
    fromDataSaver = true;
  }
  if (cap == null) return null;

  const rungs = available
    .map((t) => ({ label: t.label, h: parseHeight(t.label) }))
    .filter((r): r is { label: string; h: number } => r.h != null);
  if (!rungs.length) return null;

  const atOrBelow = rungs.filter((r) => r.h <= cap!).sort((a, b) => b.h - a.h);
  if (atOrBelow.length) return atOrBelow[0].label;
  // Nothing qualifies. An explicit pref → give the closest (lowest) rung; a
  // data-saver cap → leave the provider's adaptive default (Auto uses less than
  // forcing the one high rung available).
  return fromDataSaver ? null : rungs.slice().sort((a, b) => a.h - b.h)[0].label;
}
