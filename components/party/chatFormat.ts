/**
 * Shared chat formatting for the watch party — used by BOTH the full-screen
 * chat on PartyScreen and the compact thread in PartyTray, so the two can never
 * drift into looking like different products.
 *
 * Grouping/bubble rules live here; each renderer keeps its own layout.
 */
import { chat, ms } from "@/theme/bearoom";

/** Consecutive messages from one sender inside this window read as one group. */
export const CHAT_GROUP_MS = 4 * 60 * 1000;

/** A stable, readable accent per sender (name + avatar) so a group chat scans easily. */
export function senderColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0;
  return chat.senderColors[Math.abs(h) % chat.senderColors.length];
}

// Instagram-style corners: the tail side (right for mine, left for incoming) keeps
// its OUTER corners round (top of first bubble, bottom of last) and FLATTENS where
// consecutive bubbles meet, so a sender's run reads as one connected stack.
const BUBBLE_ROUND = 19;
const BUBBLE_FLAT = 6;

export function bubbleCorners(mine: boolean, firstOfGroup: boolean, lastOfGroup: boolean) {
  const R = ms(BUBBLE_ROUND);
  const top = firstOfGroup ? R : ms(BUBBLE_FLAT);
  const bot = lastOfGroup ? R : ms(BUBBLE_FLAT);
  return mine
    ? { borderTopLeftRadius: R, borderBottomLeftRadius: R, borderTopRightRadius: top, borderBottomRightRadius: bot }
    : { borderTopRightRadius: R, borderBottomRightRadius: R, borderTopLeftRadius: top, borderBottomLeftRadius: bot };
}

/** Wall-clock send time → short local "h:mm AM/PM". */
export function fmtClock(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/** Is `msg` the first / last of its sender's run? */
export function groupFlags(
  prev: { userId: string; ts: number } | undefined,
  cur: { userId: string; ts: number },
  next: { userId: string; ts: number } | undefined,
): { firstOfGroup: boolean; lastOfGroup: boolean } {
  const sameAsPrev = !!prev && prev.userId === cur.userId && cur.ts - prev.ts < CHAT_GROUP_MS;
  const sameAsNext = !!next && next.userId === cur.userId && next.ts - cur.ts < CHAT_GROUP_MS;
  return { firstOfGroup: !sameAsPrev, lastOfGroup: !sameAsNext };
}
