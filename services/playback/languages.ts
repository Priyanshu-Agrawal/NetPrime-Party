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

// ISO-639-2 codes that are not also everyday words (no "ben", "mal", "kan", "pan", "mar", "ind", "urd").
const CODES = new Set(["hin", "eng", "tam", "tel", "jpn", "kor", "spa", "fre", "fra", "ger", "deu", "ita", "rus", "ara", "chi", "zho", "por", "tur", "tha"]);

export function textLanguages(text: string, originalLanguage?: string): string[] {
  const lower = text.toLowerCase();
  const hits: [number, string][] = [];
  for (const [re, code] of NAMES) {
    const at = lower.search(re);
    if (at >= 0) hits.push([at, code]);
  }
  for (const m of lower.matchAll(/[a-z]+/g)) {
    if (CODES.has(m[0])) {
      const code = normalizeLanguage(m[0]);
      if (code) hits.push([m.index ?? 0, code]);
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

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function streamLanguages(
  s: { language?: string; name: string; title: string },
  ctx: { originalLanguage?: string; titleName?: string },
): string[] {
  let text = `${s.name} ${s.title}`;
  if (ctx.titleName?.trim()) text = text.replace(new RegExp(escapeRe(ctx.titleName.trim()), "gi"), " ");
  const out: string[] = [];
  const declared = languageOf(s.language);
  if (declared) out.push(declared);
  for (const code of textLanguages(text, ctx.originalLanguage)) if (!out.includes(code)) out.push(code);
  return out;
}
