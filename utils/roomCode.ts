/** Short, human-shareable watch-party room codes (ambiguous chars omitted). */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function genRoomCode(len = 6): string {
  let s = "";
  // Prefer CSPRNG (polyfilled app-wide via react-native-get-random-values) so codes
  // aren't Math.random-predictable/enumerable; fall back if crypto is unavailable.
  const rng = globalThis.crypto?.getRandomValues?.bind(globalThis.crypto);
  if (rng) {
    const buf = rng(new Uint32Array(len));
    for (let i = 0; i < len; i++) s += ALPHABET[buf[i] % ALPHABET.length];
  } else {
    for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return s;
}

export function normalizeRoomCode(input: string): string {
  return (input || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}
