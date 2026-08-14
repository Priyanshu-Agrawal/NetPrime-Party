/** Short, human-shareable watch-party room codes (ambiguous chars omitted). */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function genRoomCode(len = 6): string {
  let s = "";
  for (let i = 0; i < len; i++) {
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return s;
}

export function normalizeRoomCode(input: string): string {
  return (input || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}
