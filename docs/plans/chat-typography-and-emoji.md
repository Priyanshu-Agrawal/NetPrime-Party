# Chat typography + cross-platform emoji (DEFERRED — do NOT build until asked)

**Status:** PENDING · captured 2026-08-25 · owner: operator-triggered only.
**Goal (operator's words):** *"separate font for chat system, along with supported emojis for same visual feel in both apps."*

Give the watch-party **chat** its own typographic personality (distinct from the app-wide Outfit/Inter), and make **emoji render identically across platforms** so the chat looks and feels the same everywhere. Purely a chat-surface change — nothing here touches any screen that plays video.

---

## Scope note — what "both apps" means
Two readings; the plan supports either (confirm before building):
1. **Both platforms (iOS ↔ Android)** — the likely one. Native emoji differ (Apple on iOS, Noto/Google on Android); unify them. This is the concrete win.
2. **Two products (NetPrime + the operator's other app, e.g. GoTradeIndia)** — if the intent is a shared chat look across the operator's apps, ship the chosen font + emoji set as a tiny shared design-token snippet both apps import. Same mechanics, packaged for reuse.

Lead with (1); (2) is a packaging step on top.

---

## Workstream A — a dedicated chat font
Today all text resolves through `theme/bearoom.ts` → `font.*` (Outfit = headlines, Inter = body/label). Chat text (`PartyScreen` message rows, composer, empty-state) uses `font.body`/`font.label`.

**Plan:**
- Pick ONE chat family with a warmer/friendlier feel that reads well at small sizes in fast lists. Candidates (all on `@expo-google-fonts`, loaded exactly like Inter/Outfit): **Nunito** (rounded, "pack/bear" warmth — top pick), **Space Grotesk** (characterful, techy), **Plus Jakarta Sans** (clean, modern). Bring 2 weights (Regular + SemiBold).
- Add to the `useFonts({...})` map in [App.tsx:59](../../App.tsx#L59) (keep the splash held until loaded — already the pattern).
- Add roles to `theme/bearoom.ts` `font`: `chat`, `chatSemi` (+ maybe `type.chat` presets). Do NOT repurpose existing roles.
- Apply ONLY to chat surfaces in `PartyScreen` (message bubble text, sender name, timestamp, composer `TextInput`, "Say something to the pack" empty-state). Leave the rest of the app on Outfit/Inter.

**Risk:** none structural. Font weight bloat is ~2 files. Verify small-size legibility on a real Android device (hinting differs from iOS).

## Workstream B — cross-platform emoji parity
Chat emoji (message text + the quick-reaction chips ❤️😂🔥👏😮 + composer) are **native unicode** today → Apple emoji on iOS, Noto on Android. To unify:

**Approach (recommended): Twemoji-style image rendering on the chat surface only.**
- Render emoji as inline images from a single bundled set (**Twemoji** or **OpenMoji** — flat, open-licensed, identical on both OSes) so every viewer sees the same glyph regardless of device.
- Library options to evaluate: `react-native-twemoji`, a maintained emoji-parts renderer, or a hand-rolled unicode→asset map (most control, no dep rot). Whatever we pick must:
  - parse a message string into text + emoji runs and swap emoji runs for `<Image>`,
  - render the reaction chips from the same set (so the picker and the rendered reactions match),
  - **cache aggressively** — chat is a fast list; decode once, reuse. Bundle the ~common subset locally (don't fetch per-emoji).
- Keyboard input still yields native unicode; we store unicode and render via the set. The composer preview can stay native or also use the set (decide during build).

**Why not a color-emoji FONT (Noto Color Emoji as `fontFamily`)?** RN can't reliably drive COLR/CBDT color-emoji fonts through `Text` on iOS — it's the reason everyone uses Twemoji-as-images for cross-platform parity.

**Perf guardrail:** image-emoji only on chat surfaces. **Never** add per-emoji image work to any video screen (stutter rule — see [docs/investigations/playback-stutter.md](../investigations/playback-stutter.md)). Chat is off the video render path, so this is safe.

---

## Target files
- [App.tsx](../../App.tsx) — add chat font to `useFonts`.
- [theme/bearoom.ts](../../theme/bearoom.ts) — new `font.chat*` roles / `type.chat` presets.
- [src/screens/PartyScreen.tsx](../../src/screens/PartyScreen.tsx) — apply chat font; route message text + reaction chips through the emoji renderer.
- [services/party/usePartyChat.ts](../../services/party/usePartyChat.ts) — no data-model change expected (still store unicode); touch only if we normalize emoji.
- [components/party/GifPicker.tsx](../../components/party/GifPicker.tsx) — align the reaction/emoji picker with the bundled set if we add an emoji picker.
- NEW: an `emoji/` util (parser + unicode→asset map + cache) + the bundled emoji assets subset.

## Acceptance
- Chat message text + composer + empty-state render in the new chat font on both platforms; rest of app unchanged.
- The same emoji glyph appears on iOS and Android for messages AND reaction chips (side-by-side sim/emulator check).
- No new jank in the chat list (fast-scroll a long history); zero emoji-image work on video screens.
- tsc clean; splash still gates on fonts loaded.

## Open decisions (settle at build time)
- Which chat font (Nunito lead).
- Twemoji vs OpenMoji vs Noto-flat asset set; library vs hand-rolled map.
- Bundle full set (~size cost) vs common subset + fallback to native for the long tail.
- Does the composer preview use the set or stay native?
- Interpretation (1) platforms vs (2) shared cross-app package.
