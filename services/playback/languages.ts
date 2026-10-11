/**
 * Which languages a stream offers, read from what its plugin says (spec §5.3, §5.5 step 4): the declared language,
 * then the stream's name and title. Full names (English or native script) and a fixed set of unambiguous 3-letter
 * codes only — a fragment is never guessed, and unknown stays unknown (an empty list).
 */
import { languageName, normalizeLanguage } from "@/components/player/native/languages";

// Latin names match as whole words; native-script names as substrings (\b does not work outside ASCII).
const NAMES: [RegExp, string][] = [
  [/\bhindi\b|हिन्दी|हिंदी/, "hi"],
  [/\benglish\b/, "en"],
  [/\btamil\b|தமிழ்/, "ta"],
  [/\btelugu\b|తెలుగు/, "te"],
  [/\bmalayalam\b|മലയാളം/, "ml"],
  [/\bkannada\b|ಕನ್ನಡ/, "kn"],
  [/\bbengali\b|\bbangla\b|বাংলা/, "bn"],
  [/\bmarathi\b|मराठी/, "mr"],
  [/\bgujarati\b|ગુજરાતી/, "gu"],
  [/\bpunjabi\b|ਪੰਜਾਬੀ/, "pa"],
  [/\burdu\b/, "ur"],
  [/\bjapanese\b/, "ja"],
  [/\bkorean\b/, "ko"],
  [/\bchinese\b|\bmandarin\b|\bcantonese\b/, "zh"],
  [/\bspanish\b|\bespa[nñ]ol\b|\bcastellano\b|\blatino\b/, "es"],
  [/\bfrench\b|\bfran[cç]ais\b/, "fr"],
  [/\bgerman\b|\bdeutsch\b/, "de"],
  [/\bitalian\b|\bitaliano\b/, "it"],
  [/\bportuguese\b|\bportugu[eê]s\b/, "pt"],
  [/\brussian\b/, "ru"],
  [/\barabic\b/, "ar"],
  [/\bturkish\b/, "tr"],
  [/\bthai\b/, "th"],
  [/\bindonesian\b/, "id"],
];

// ISO-639-2 codes that are not also everyday words ("ben", "mal", "kan", "pan", "mar", "ind", "urd", "spa", "por",
// "chi", "tha", "tur" all are).
const CODES = new Set(["hin", "eng", "tam", "tel", "jpn", "kor", "fre", "fra", "ger", "deu", "ita", "rus", "ara", "zho"]);

const SEP = "[\\s._\\-+()\\[\\]{}|/,:;•·]";
// "Hindi Subs", "English (soft) subtitles", "ENG-SUB": a subtitle language, not an audio one. Not "English | Subs: Hindi",
// where "Subs:" labels the language after it.
const SUB_AFTER = new RegExp(`^${SEP}*(?:(?:soft|hard|forced|full|cc|sdh)${SEP}+)?(?:sub|subs|subtitle|subtitles|subbed)\\b(?!\\s*[:\\-–])`);
// "Subs: English", "Subtitles - Hindi" (a colon or dash, so "ENG-SUB Korean" still reads Korean audio).
const SUB_BEFORE = /(?:sub|subs|subtitle|subtitles)\s*[:\-–]\s*$/;

function aboutSubtitles(lower: string, at: number, len: number): boolean {
  return SUB_AFTER.test(lower.slice(at + len)) || SUB_BEFORE.test(lower.slice(0, at));
}

export function textLanguages(text: string, originalLanguage?: string): string[] {
  const lower = text.toLowerCase();
  const hits: [number, string][] = [];
  for (const [re, code] of NAMES) {
    for (const m of lower.matchAll(new RegExp(re.source, "g"))) {
      const at = m.index ?? 0;
      if (!aboutSubtitles(lower, at, m[0].length)) {
        hits.push([at, code]);
        break;
      }
    }
  }
  for (const m of lower.matchAll(/[a-z]+/g)) {
    const at = m.index ?? 0;
    if (CODES.has(m[0]) && !aboutSubtitles(lower, at, m[0].length)) {
      const code = normalizeLanguage(m[0]);
      if (code) hits.push([at, code]);
    }
  }
  const orig = lower.search(/\borig(inal)?\b/);
  const origCode = normalizeLanguage(originalLanguage);
  if (orig >= 0 && origCode) hits.push([orig, origCode]);
  hits.sort((a, b) => a[0] - b[0]);
  const out: string[] = [];
  for (const [, code] of hits) if (!out.includes(code)) out.push(code);
  return out;
}

/** A code we can name ("hi", "hin", "en-US") or a full name ("Hindi"); anything else is unknown. */
export function languageOf(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const code = normalizeLanguage(value);
  if (code && languageName(code) !== code.toUpperCase()) return code;
  return textLanguages(value)[0];
}

const TOKEN_SEP = /[\s._\-+()[\]{}|/,:;•·'"!?]+/;

/**
 * The text minus every whole-word run of a title's words ("English.Vinglish.2012" loses "English Vinglish"). The
 * separators stay as they were, so "Subs: Hindi" still reads as a subtitle mention afterwards.
 */
function withoutTitles(text: string, titles: (string | undefined)[]): string {
  // Words at even indexes, the separators between them at odd ones.
  let parts = text.toLowerCase().split(new RegExp(`(${TOKEN_SEP.source})`));
  for (const title of titles) {
    const t = title?.toLowerCase().split(TOKEN_SEP).filter(Boolean) ?? [];
    if (!t.length) continue;
    const kept: string[] = [];
    for (let i = 0; i < parts.length; ) {
      if (i % 2 === 0 && t.every((w, k) => parts[i + 2 * k] === w)) {
        kept.push("·");
        i += 2 * t.length - 1; // the run's words and the separators inside it; one slot replaces an odd count
      } else kept.push(parts[i++]);
    }
    parts = kept;
  }
  return parts.join("");
}

export function streamLanguages(
  s: { language?: string; name: string; title: string },
  ctx: { originalLanguage?: string; titleName?: string; originalTitle?: string },
): string[] {
  const out: string[] = [];
  const declared = languageOf(s.language);
  if (declared) out.push(declared);
  const text = withoutTitles(`${s.name} ${s.title}`, [ctx.titleName, ctx.originalTitle]);
  for (const code of textLanguages(text, ctx.originalLanguage)) if (!out.includes(code)) out.push(code);
  return out;
}
