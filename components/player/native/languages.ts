/**
 * Language codes → names for track labels. Players report ISO-639-1 ("en"), ISO-639-2 ("eng") or a regional tag
 * ("pt-BR"); the UI shows one plain name per language and never guesses a missing one (spec §5.3).
 */
const NAMES: Record<string, string> = {
  ar: "Arabic", bn: "Bengali", cs: "Czech", da: "Danish", de: "German", el: "Greek", en: "English", es: "Spanish",
  fa: "Persian", fr: "French", gu: "Gujarati", he: "Hebrew", hi: "Hindi", hr: "Croatian", hu: "Hungarian",
  id: "Indonesian", it: "Italian", ja: "Japanese", kn: "Kannada", ko: "Korean", ml: "Malayalam", mr: "Marathi",
  nl: "Dutch", no: "Norwegian", pa: "Punjabi", pl: "Polish", pt: "Portuguese", "pt-br": "Portuguese (Brazil)",
  ru: "Russian", sv: "Swedish", ta: "Tamil", te: "Telugu", th: "Thai", tr: "Turkish", uk: "Ukrainian", ur: "Urdu",
  vi: "Vietnamese", zh: "Chinese",
};

const ISO_639_2: Record<string, string> = {
  ara: "ar", ben: "bn", chi: "zh", zho: "zh", ces: "cs", cze: "cs", dan: "da", deu: "de", ger: "de", ell: "el",
  gre: "el", eng: "en", spa: "es", fas: "fa", per: "fa", fra: "fr", fre: "fr", guj: "gu", heb: "he", hin: "hi",
  hrv: "hr", hun: "hu", ind: "id", ita: "it", jpn: "ja", kan: "kn", kor: "ko", mal: "ml", mar: "mr", nld: "nl",
  dut: "nl", nor: "no", pan: "pa", pol: "pl", por: "pt", rus: "ru", swe: "sv", tam: "ta", tel: "te", tha: "th",
  tur: "tr", ukr: "uk", urd: "ur", vie: "vi",
};

/** "eng" / "EN" / "en_US" → "en"; "pt-BR" → "pt-br"; unknown or "und" → undefined. */
export function normalizeLanguage(code?: string | null): string | undefined {
  if (!code) return undefined;
  const [raw, region] = code.trim().toLowerCase().replace(/_/g, "-").split("-");
  const base = ISO_639_2[raw] ?? raw;
  if (!/^[a-z]{2}$/.test(base)) return undefined;
  const regional = region ? `${base}-${region}` : undefined;
  return regional && NAMES[regional] ? regional : base;
}

/** "hi" → "Hindi"; codes we have no name for show as "XX". */
export function languageName(code: string): string {
  return NAMES[code] ?? NAMES[code.split("-")[0]] ?? code.toUpperCase();
}

export interface LabelSource {
  language?: string | null;
  label?: string | null;
  name?: string | null;
}

/**
 * One display label per track, in order: the language's name when known, else the track's own label or name, else
 * "Track N". Repeats get " · 2", " · 3" so every row stays distinct.
 */
export function trackLabels(tracks: LabelSource[]): string[] {
  const base = tracks.map((t, i) => {
    const lang = normalizeLanguage(t.language);
    if (lang) return languageName(lang);
    const own = (t.label || t.name || "").trim();
    return own || `Track ${i + 1}`;
  });
  const seen = new Map<string, number>();
  return base.map((b) => {
    const n = (seen.get(b) ?? 0) + 1;
    seen.set(b, n);
    return n === 1 ? b : `${b} · ${n}`;
  });
}
