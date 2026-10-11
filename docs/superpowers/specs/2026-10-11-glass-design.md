# Glass that stays smooth — design

Date: 2026-10-11 · Status: approved by delegation (owner is vibe coding; decisions are mine) · Branch: `feat/improvements`

## 1. What the owner asked for

- "YouTube handles glass over video butter smooth … you can introduce any engine or library but it should be
  smooth at the end — Skia, Rive, or any other engine."
- "I have seen other apps on X with fluid smooth glass — VertX, BitChord." Both are native Kotlin apps that blur with
  Android 12+ `RenderEffect` inside the app's own draw pass (Haze / Kyant0 backdrop).
- "My physical device is decent … on lower end it may cry."

Success = real glass (blur you can see through) on normal screens **and** over the playing video, measured smooth
on the Nothing Phone 1 release build, with a cheap look-alike wherever real blur can't be smooth or safe.

## 2. What I measured (Nothing Phone 1, Android 15, 120 Hz, release build, 2026-10-11)

Home, 5 s of scripted scrolling (tab bar + header glass on screen):

| Glass engine | Frames in 5 s | Janky | GPU p50 / p90 | Notes |
|---|---|---|---|---|
| Today: `@sbaiahmed1/react-native-blur` (qmblurview) | 113–166 | **99–100 %** | — | main thread 600 ms/s in `traversal`; 59 836 `ReactTextView.onDraw` in 5 s — every blur re-draws the whole window in **software** every frame |
| No blur (plain tint) | 547–658 | 0.5–8 % | 5 / 6 ms | the target to beat |
| `expo-blur` 57 (Dimezis BlurView 3.1, RenderNode) | 492–597 | 21–39 % | 9–10 / 10–12 ms | main thread fine; GPU doubles because every glass blurs a **full-screen** copy of its backdrop |

Party, video playing, controls on screen (glass blur on the bottom bar, backdrop = the video box only):

| Engine | Janky | p99 | GPU p90 |
|---|---|---|---|
| `expo-blur` RenderNode over the WebView video | 1.1–1.4 % | 14 ms | 5 ms |
| No blur | 4.4 % | 15 ms | 3 ms |

Visual: the RenderNode blur shows the film blurred under the bar (screen recording, 12 frames) — the WebView's video
draws fine inside a RenderNode backdrop. One crash found: a glass placed **inside** the backdrop it blurs (the hero
chips inside Home's scroll content) makes the render tree contain itself → infinite recursion in `libhwui`
`prepareTree` → SIGSEGV. This must be impossible by construction.

Rejected after reading their sources:
- `@sbaiahmed1/react-native-blur` 6.x "Android liquid glass" — software-rasterises the screen 10–30×/s on the UI thread
  and a WebView's video draws black in software.
- CSS `backdrop-filter` inside the provider page — positions and fades would have to be mirrored across the bridge
  every frame; fragile.
- Skia / Rive — neither can see pixels outside its own canvas, so neither can blur the WebView or other RN views.

## 3. Decisions

**D1 — One `Glass` surface.** A single component renders the glass layer for every glassy thing in the app. Callers
pick a **material** and stay out of engine details:

| Material | Used for |
|---|---|
| `control` | round buttons, chips, small pills that float over content or video |
| `bar` | floating bars: tab bar, party peek bar, player bottom bar |
| `chrome` | edge-to-edge header backgrounds that fade in on scroll |
| `sheet` | sheets, alerts, big panels |

**D2 — Engines, picked per platform at render time by one pure function (`selectGlassEngine`).**

| Engine | When | How |
|---|---|---|
| `liquid` | iOS 26+ with the Liquid Glass API, materials `control`/`bar` | `expo-glass-effect` `GlassView` (`regular`, dark scheme, warm tint) |
| `material` | iOS for `chrome`/`sheet`, and every material on iOS < 26 | `expo-blur` `BlurView` (system blur, OS-composited) |
| `backdrop` | Android 12+ (API 31+) with a usable backdrop | our own small native view (`modules/bearoom-glass`, D3) |
| `crafted` | everything else | no blur: warm tint + top highlight + hairline (D6) |

`crafted` is also forced when iOS **Reduce Transparency** is on, on Android < 12, on Android inside a `Modal` (a
separate window — the caller passes `backdrop="none"`), and whenever the only backdrop is one the glass sits inside.

**D3 — Android engine: a shared quarter-resolution copy, tiny blurs.** `modules/bearoom-glass` (local Expo
module, Android only):
- `BearoomGlassBackdrop` — records its children into a `RenderNode` during its normal draw (no extra work: it is
  the draw that happens anyway) and keeps a **quarter-resolution copy** of that node as a compositing layer,
  rendered once per frame however many glass views use it.
- `BearoomGlassView` — samples the part of that copy under itself (plus a blur margin) into a tiny `RenderNode`
  with a `RenderEffect` blur (+ saturation lift), scales it back up, and lays an **opaque base** (the app
  background) under it and the material tint over it. The base matters: a backdrop records content, not the
  background behind it, so without it text and gaps in the blurred copy stay see-through.
- Freshness: the renderer caches these layers, so on every frame the window draws anyway the glass nudges a
  no-op property (pivot) on them; that never schedules a frame. Offset changes (scrolling, transitions) are
  checked in the same pre-draw pass.
- Native safety net: a glass inside its own backdrop draws only its tint.
- No window-wide capture, no software rasterising, no timers.
- **Never a WebView backdrop** (measured 2026-10-11): blurring the provider page makes Chromium draw the video
  again every frame (36–38 % janky with one draw per glass, 47–50 % with one shared draw), and drawing it scaled
  renders it black. Live blur over video waits for Phase 1B's native player (`TextureView`).

**D4 — Backdrops are explicit.** Glass may only blur what a `GlassBackdrop` wraps.
- **Screen backdrop**: a screen wraps its scrolling content in `<GlassBackdrop>`. While that screen is focused it is
  the app's *current screen backdrop* (registry: most recently focused wins; blurred/unmounted screens drop out).
  Floating chrome outside any layer — tab bar, party peek bar, headers, header buttons — blurs the current screen
  backdrop.
- **Local layer**: `<GlassLayer>` gives its subtree a private backdrop slot, so glass inside never blurs the
  screen. The players use a layer **without** a backdrop (see D3): their controls get crafted glass on Android and
  Liquid Glass on iOS.
- **Guard**: every `GlassBackdrop` tells its descendants "you are inside backdrop #id"; a glass whose resolved
  backdrop is one it sits inside renders `crafted`. (Hero chips inside Home's scroll content → crafted.)

**D5 — Fades.** `Glass` takes `visible` (default `true`). On `liquid`, `visible={false}` switches the glass style to
`none` (animated, 0.2 s) so a parent opacity fade never leaves Liquid Glass at alpha 0 (Expo issue #41024). On
Android a fully transparent parent is skipped by the renderer, so a hidden glass costs nothing.

**D6 — Look (starting values, tuned on the phone).** Warm charcoal `rgb(16,13,10)` tint over the blur; a top
highlight gradient `rgba(246,239,227,0.10) → 0` over the top 55 %; a hairline border `rgba(246,239,227,0.16)` drawn
by the caller's shape (unchanged). `crafted` uses the same layers with a stronger tint so text stays readable without
blur.

| Material | Blur radius (Android) | Tint over blur | Crafted tint |
|---|---|---|---|
| `control` | 20 dp | 0.30 | 0.58 |
| `bar` | 24 dp | 0.42 | 0.80 |
| `chrome` | 24 dp | 0.45 | 0.86 |
| `sheet` | 28 dp | 0.70 | 0.94 |

The honey play button stays solid honey (the one primary action).

**D7 — The "no blur on video screens" rule changes.** New rule: *no blur engine that captures the window, ever;
never a WebView as a backdrop; over video only OS-composited glass (iOS) until the native player lands.* `@sbaiahmed1/react-native-blur` is removed.
`Frost` stays as a thin alias (BearAlert uses it and must not be edited): `Frost` = `Glass material="sheet"
backdrop="none"`, so BearAlert gets system blur on iOS and crafted glass on Android.

## 4. Surfaces

| Surface | Material | Backdrop |
|---|---|---|
| Floating tab bar | `bar` | current screen |
| Party peek bar | `bar` | current screen |
| Party tray sheet (in a `Modal`) | `sheet` | none |
| Home / details / profile header backgrounds | `chrome` | current screen |
| Header icon buttons (`IconButton`) | `control` | current screen |
| `GlassCard` / `GlassButton` / `GlassChip` with blur | `control` (cards: `bar`) | auto (inside content → crafted) |
| Player bottom bar, ±10 s circles, top chips (solo + party) | `bar` / `control` | player layer, no backdrop (Android crafted, iOS liquid) |
| Party top buttons in immersive mode | `control` | player layer, no backdrop |
| Party top buttons in portrait (above the video, not over it) | `control` | auto (→ crafted) |
| Player settings sheet (`Modal`) | unchanged solid | — |
| BearAlert (via `Frost`) | `sheet` | none |

Screens that get a screen backdrop: Home, Search, Profile (More), Movie / TV / Person details. Others resolve to no
backdrop → crafted, which is still the designed look.

## 5. Acceptance (all on the Nothing Phone 1 **release** build unless noted)

1. Home scroll script (5 s): janky ≤ 10 %, GPU p90 ≤ no-blur baseline + 1.5 ms, no `traversal` hotspot.
2. Party, video playing, controls on screen: janky ≤ 5 %, p99 ≤ 16 ms.
3. Glass is real blur on the tab bar, peek bar and headers (screenshots); controls over the video are crafted on
   Android (D3) and Liquid Glass on iOS.
4. No crash with glass inside its own backdrop (Home hero chips) — unit test + device run.
5. iOS 27 simulator: Liquid Glass on controls/tab bar, system blur on headers; controls fade in/out with no pop.
6. `@sbaiahmed1/react-native-blur` gone from `package.json`, Podfile.lock and the APK.
7. `npm test` green, `tsc` clean, no new lint warnings.

If D3's engine misses (1), the fallback ruling is: Home chrome uses `crafted`, real blur stays over video and on
the tab/peek bars — recorded in the ledger with the numbers.

## 6. Testing

- Jest: `selectGlassEngine` truth table; the backdrop registry (focus order, unmount, subscribe); the inside-own-backdrop
  guard; `Glass` renders the right engine per platform (native views mocked); `Frost` stays crafted on Android; the
  liquid fade switches style with `visible`.
- Device: the scripted measurements above (`scroll-measure.sh`, `party-measure.sh`), screenshots, a screen recording
  over moving video to rule out tearing.

## 7. Out of scope (recorded in the backlog)

- Android Liquid-Glass refraction (AGSL lens shader on API 33+) — can chain onto D3's `RenderEffect` later.
- Remote kill switch for glass via the worker `/config`.
- Phase 1B native player: render expo-video into a `TextureView` so D3 keeps working (a `SurfaceView` is composited
  outside the view tree and can't be blurred this way).
