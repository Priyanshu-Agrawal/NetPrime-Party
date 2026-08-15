# Party Chat, Reactions & Media Timestamps

> The party's **social layer**: ephemeral text/GIF/sticker chat, floating emoji
> reactions, and the YouTube-style **media-timestamp** feature. This layer is
> deliberately isolated from the sync-critical path — read
> [watch-party-sync.md](./watch-party-sync.md) for the playback authority it sits
> beside. Everything here is **verified against the current code**; keep it current.

## One-paragraph model
Chat runs on its **own Supabase Realtime broadcast channel**, completely separate
from the `PartyClient` sync channel, so a chat storm can never perturb playback
sync. It is **ephemeral** — nothing is persisted; messages live only for the
session and the buffer is capped at the **last 200**. GIFs/stickers come from
**KLIPY, called DIRECTLY from the device** (proxying is forbidden — see the ToS box
below). Media timestamps are **not a message field** — they're plain text tokens
(`1:27`) parsed and made tappable at render time.

## Files
| File | Role |
|---|---|
| `services/party/usePartyChat.ts` | The chat hook: channel, message buffer, send/receive, reactions |
| `services/gifs.ts` | KLIPY client (direct calls; the only place the key is used) |
| `components/party/GifPicker.tsx` | The GIF/sticker picker sheet UI |
| `app/party.tsx` | Chat UI: input bar, bubbles, **the media-timestamp feature**, reaction bar |

## Chat transport (`usePartyChat.ts`)
- **Channel:** `supabase.channel(`party-chat:${code}`)` with
  `{ config: { broadcast: { self: false } } }`. `self:false` means the server does
  **not** echo our own messages back → the hook does **optimistic local echo**
  manually (append `mine:true` immediately on send). `ensurePartyAuth()` is awaited
  before subscribe; `ready` flips true on channel status `"SUBSCRIBED"`.
- **Ephemeral:** header comment is explicit — messages/reactions are NOT persisted.
  Every append does `.slice(-200)` (keep last 200). Persisted history / moderation
  are future work.
- **Broadcast events:**
  - `"chat"` → inbound payload is `Omit<ChatMessage,"mine">`; dedup by `id`, append
    `{ ...p, mine: p.userId === userId }`, slice to 200.
  - `"reaction"` → payload `{ emoji }` → `popReaction`.
- **No typing indicator / no presence** in this layer. Member avatars come from the
  separate `useParty` snapshot (`snap.members`), not from chat.

### `ChatMessage` shape
```ts
interface ChatMessage {
  id: string;        // uid(): `${Date.now().toString(36)}-${(_seq++).toString(36)}`
  userId: string;
  name: string;
  text: string;      // for GIFs this is "" ; media timestamps live INLINE here as text
  ts: number;        // wall-clock send time (Date.now()) — NOT a media position
  mine: boolean;     // derived on receive (p.userId === userId)
  kind?: "text" | "gif";
  gifUrl?: string; gifW?: number; gifH?: number;
  sticker?: boolean; // true → transparent sticker; kind is STILL "gif"
}
```
- **Stickers are not a separate `kind`.** `kind` stays `"gif"`; `sticker:boolean`
  distinguishes them (transparent, square, `contentFit:"contain"`).
- **Send API:** `sendChat(text)`, `sendGif(gif, sticker=false)`, `sendReaction(emoji)`
  — each builds the message, echoes locally, then `channel.send({type:"broadcast",…})`.

## Reactions (floating emoji)
- `QUICK_REACTIONS = ["❤️","😂","🔥","👏","😮"]` (party.tsx). Rendered when
  `reactionsOn && canParticipate`; each taps `chat.sendReaction(e)`.
- `popReaction(emoji)` pushes `{id,emoji}` into a `FloatingReaction[]` and
  self-expires via `setTimeout(…, 3000)`.
- `FloatingEmoji`: `Animated.timing` over **2800ms**, `Easing.out(Easing.quad)`;
  rises `translateY 0→-130`, opacity in/out, scale pop; horizontal jitter
  `right: 10 + (offset%3)*26`. Rendered in a `pointerEvents="none"` `reactionLayer`
  pinned bottom-right.
- ⚠ **Timing mismatch (harmless):** the animation is 2800ms but the item is removed
  at 3000ms (200ms buffer). Intentional, but note it if you touch the timing.

## The media-timestamp feature (YouTube-style)
The headline chat feature. There is **NO timestamp field on the message** — a
timestamp is just text like `1:27` inside `text`, made tappable at render.

**Position source**
- `posRef = useRef(0)` — latest playback position (seconds), updated in `onEvent`
  from `e.currentTime` (the `PlayerEvent` tick stream).
- `livePos` state — the mm:ss shown on the in-field button; only re-renders while
  `inputFocused`, throttled to ~1/sec.

**Insert (the in-input stamp button)** — lives *inside* the input box, like YouTube's
comment composer, shown only when `hasMedia`:
```ts
const insertTimestamp = () => {
  const stamp = fmtMedia(posRef.current);
  setDraft((d) => (d && !/\s$/.test(d) ? `${d} ` : d) + `${stamp} `);
};
```

**Formatter** `fmtMedia(sec)` → **`m:ss` under an hour** (unpadded minutes, e.g.
`1:27`), **`h:mm:ss` past an hour**. Distinct from `fmtClock(ts)`, which formats the
**send time** (`h:mm AM/PM`) in the message `Meta` row.

**Render as tappable text**
- `TS_RE = /\b\d{1,2}:\d{2}(?::\d{2})?\b/g` — matches `1:27`, `12:04`, `1:02:03`.
- `MessageText({text,onSeek})` walks `TS_RE.exec` (resets `TS_RE.lastIndex=0` first —
  the regex is module-level `/g`, so this avoids stateful-regex bugs). Each match is
  validated by `parseClock`; invalid → left as plain text. Valid → a
  `<Text style={tsLink} onPress={()=>onSeek(sec)}>` (honey, semibold).
- Only **text** bubbles parse timestamps; `GifBubble` does not.

**Tap → seek** (`seekToMoment`):
```ts
if (canSeek) party.seekTo(sec);          // controllers move the WHOLE room
else playerRef.current?.seek(sec);        // everyone else peeks LOCALLY
```
where `canSeek = party.isHost || selfMember?.permissions?.canControlPlayback === true`.
This is the one place the chat layer reaches into playback — and it correctly routes
through the [room authority](./watch-party-sync.md) for controllers vs. a local-only
seek for spectators.

> ⚠ **Two different "timestamps" — don't conflate them.** `msg.ts` = wall-clock send
> time (`fmtClock`, in the Meta row). Media timestamps = inline text tokens
> (`fmtMedia`/`parseClock`/`TS_RE`/`seekToMoment`). Different units, different code.

## GIFs & stickers via KLIPY (`services/gifs.ts`)

> ### ⚠⚠ KLIPY MUST be called DIRECTLY from the client — proxying is PROHIBITED
> KLIPY's Integration Requirements mandate that **API requests and media loads
> originate from the user's device** — **no proxy, no server relay, no caching
> layer, no reordering/filtering/rewriting of results**. `services/gifs.ts` calls
> `api.klipy.com` straight from the app with the per-user `customer_id`, preserves
> result order + delivery URLs, fires the Share Trigger on send, and exposes Report.
> **Do not "optimize" this behind a proxy/CDN/cache — that breaks the ToS.**
>
> 🐛 **Known stale comment:** `components/party/GifPicker.tsx`'s header once claimed
> *"All calls go through our KLIPY Cloudflare proxy."* That is **false and dangerous**
> (it contradicts both the code and the ToS). It has been corrected — if you see any
> "proxy" language for KLIPY again, it is wrong.

- **Key:** `process.env.EXPO_PUBLIC_KLIPY_KEY` — a **client** `app_key`, read from
  gitignored `.env.local` + EAS secrets, **never committed**. Unset → all fetchers
  return `[]` gracefully. The key is a **path segment**: `${BASE}/${KEY}/${kind}/…`,
  `BASE = "https://api.klipy.com/api/v1"`.
- **Endpoints:** `trendingMedia`, `searchMedia` (empty `q` → falls back to trending),
  `recentMedia`, `getCategories`, `shareTrigger` (POST on send — personalization +
  KLIPY reporting), `reportMedia` (POST). `MediaKind = "gifs"|"stickers"|"clips"`.
- **`MediaItem`:** `{ id, slug, url, previewUrl, width, height, blur? }` — `blur` is a
  `data:` JPEG placeholder (KLIPY `blur_preview`). `pickMedia` prefers `md→sm→hd→xs`
  for **display** (`url`) and `sm→md→display` for **preview** (`previewUrl`), so small
  grid tiles stay sharp. A sent message stores `item.url` (display); the grid shows
  `previewUrl`.
- **GifPicker UI:** 3-col grid, tabs **GIFs / Stickers** (no `clips` tab though
  `MediaKind` supports it), 14 curated discovery chips (`REACTIONS`, watch-party
  themed) shown when the search box is empty, debounced search (350ms; empty query
  searches the literal `"reaction"`, not trending), blur-up `expo-image` tiles,
  long-press → Report (maps 3 of 9 reasons), `"Powered by KLIPY"` attribution.
  Props `{ visible, onClose, onPick(item,kind), customerId }`; wired in party.tsx as
  `onPick={(g,k)=>chat.sendGif(g, k==="stickers")}`, `customerId={party.userId}`.

## Gating (who can chat / react)
- `reactionsOn = config?.gifsEnabled !== false` — ⚠ the **same** `gifsEnabled` flag
  gates **both** emoji reactions **and** the GIF button.
- `canSendChat` needs `config.chatEnabled` **and** `selfMember.permissions.canChat`.
- Muted / disabled states render a `chatOffRow` instead of the composer.

## Future (noted in memory, not built)
- **Slash-commands → polls**: guest quick-actions like `/request-replay {ts}`,
  `/skip-to {ts}` become room polls; host applies directly. See memory
  `party-chat-commands-polls`.
- **Reply / @-tagging**: quoted-reply threads and @-mentions. See memory
  `party-chat-reply-tagging`.
- Persisted history, GIF moderation surfacing (KLIPY Partner Panel handles the actual
  ads/moderation config, not code).

## Gotchas
- Ephemeral by design — a late joiner sees **no backscroll**. (Persistence is future.)
- `parseClock`'s 2-part branch rejects `sec>59` but **not** `min>59` (so `90:00`
  parses to 5400s). Minor; harmless for real timestamps.
- Optimistic echo + `self:false` means a dropped broadcast shows the sender their
  message but not others — no delivery receipts (acceptable for ephemeral chat).
