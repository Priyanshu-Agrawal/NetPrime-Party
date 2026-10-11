/**
 * What the title page's Play says once the preview is in (spec §6.1). Honest by construction: a language is named only
 * when a native stream has it, and "not available" is said only after every plugin answered and found other languages —
 * with no native stream at all, the web providers may still have it, so Play stays plain.
 */
import { languageName } from "@/components/player/native/languages";

export type PreviewStatus = "off" | "waiting" | "checking" | "done";

export interface PreviewAnswer {
  /** Each ranked candidate's languages, best candidate first. */
  langs: string[][];
  /** Every plugin answered — none still running, none failed — so a missing language is really missing. */
  complete: boolean;
}

export interface PlayButton {
  label: string;
  note?: string;
  others: { code: string; label: string }[];
}

/** Every language any stream has (multi-audio streams count for each of theirs), once, best stream first. */
export function foundLanguages(answer: PreviewAnswer): string[] {
  const out: string[] = [];
  for (const l of answer.langs) for (const code of l) if (!out.includes(code)) out.push(code);
  return out;
}

export function playButton(status: PreviewStatus, answer: PreviewAnswer | null, wanted: string[]): PlayButton {
  if (status === "checking") return { label: "Play", note: "Checking languages…", others: [] };
  if (status !== "done" || !answer) return { label: "Play", others: [] };
  const found = foundLanguages(answer);
  if (!found.length) return { label: "Play", others: [] };
  const play = wanted.find((w) => found.includes(w)) ?? null;
  const others = found.filter((l) => l !== play).map((code) => ({ code, label: languageName(code) }));
  if (play && play === wanted[0]) return { label: `Play in ${languageName(play)}`, others };
  const note = answer.complete && wanted[0] ? `${languageName(wanted[0])} not available for this title` : undefined;
  return note ? { label: "Play", note, others } : { label: "Play", others };
}
