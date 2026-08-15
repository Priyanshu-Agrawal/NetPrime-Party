# Bearoom — Architecture Overview

> Handoff doc for humans + AI agents. Start here, then follow the links.
> Kept current as the app evolves — update it when you change these subsystems.

Bearoom is a React Native (Expo) **streaming + synchronized watch-party** app.
Android package `com.cody669.Uott`. Cozy cinema skin (honey `#F0A93C`,
`theme/bearoom.ts`).

## Stack
- **Expo SDK 53 / React Native 0.79 / React 19**, New Architecture (Bridgeless) ON.
- **expo-router** file-based navigation (`app/`).
- **Supabase** (`kdcghbuknadvcmjctsqk`) — anon auth, Postgres RPCs, Realtime.
- **react-native-webview 13.13.5** — provider video embeds.
- **react-native-mmkv v4**, **reanimated**, **@gorhom/bottom-sheet**, **expo-blur**.
- **expo-video ~2.2.3** — installed, not yet wired (see native-player plan).
- Dev tooling: **execbro-sdk** (feeds the ExecBro MCP; `devtools/execbro.ts`) + **Chrome DevTools over CDP via adb** (see `player-and-injection.md`).

## Screens (`app/`)
- `(tabs)/index.tsx` Home · `(tabs)/search.tsx` · `(tabs)/more.tsx` Profile
- `(player)/details.tsx`, `(player)/tvDetails.tsx` — title detail
- `(player)/player.tsx` — **solo** playback (plain WebView, no bridge)
- `party.tsx` — **watch party** (hijacked WebView + sync) · `joinParty.tsx`
- `onboarding.tsx`, `myList.tsx`, `watchHistory.tsx`

## Subsystems
| Area | Where | Doc |
|---|---|---|
| **Player + WebView injection** | `components/player/*` | [player-and-injection.md](./player-and-injection.md) |
| **Providers (embeds + per-provider quirks)** | `components/player/providerRegistry.ts`, `hijackCapabilities.ts`, `providers.json` | [../providers/README.md](../providers/README.md) |
| **Watch-party authority + sync** | `services/party/*`, `supabase/migrations/*` | [watch-party-sync.md](./watch-party-sync.md) |
| **Chat / GIFs / reactions / timestamps** | `services/party/usePartyChat.ts`, `services/gifs.ts`, `components/party/*` | [chat-and-reactions.md](./chat-and-reactions.md) |
| **App shell / navigation / data / storage** | `app/*`, `contexts/*`, `utils/*`, `theme/*` | [app-shell-and-data.md](./app-shell-and-data.md) |
| **Native player (planned)** | `components/player/*` (POC) | [native-player.md](./native-player.md) |
| **Streaming-integration research** | notes (p-stream / providers landscape) | [../research/streaming-integration-research.md](../research/streaming-integration-research.md) |

## Playback model (two players today)
- **Solo** (`app/(player)/player.tsx`): a plain `WebView` of the provider embed — the provider's own page + controls, no injection.
- **Party** (`app/party.tsx`): `components/player/HijackPlayer.tsx` — a WebView with an **injected JS bridge** so the app can BOTH observe (play/pause/seek/time) AND drive the `<video>`. This powers sync. See [player-and-injection.md](./player-and-injection.md).
- **Native (planned)**: `expo-video` fed by an `.m3u8` **sniffed from a hidden resolver WebView** — unlocks PiP/cast/background + a native dub picker. See [native-player.md](./native-player.md).

## Watch party (`services/party/*`)
> **Deep dive: [watch-party-sync.md](./watch-party-sync.md)** (anchor math, epoch/seq, the
> full RPC surface, drift correction, host lease, security-fix history). Summary below.

Fully **Supabase-only authority** (replaced an older Realtime relay that lived in `services/sync/*`, now deleted):
- **Postgres is the single writer.** `SECURITY DEFINER` RPCs serialize a room row with `SELECT … FOR UPDATE` (`supabase/migrations/0001_party_core.sql` + `0002–0006`).
- **Playback = a timeline ANCHOR** (`protocol.ts` `PlaybackAnchor`: status/positionMs/rate/anchorServerTimeMs + `epoch`/`seq`). `effectivePositionMs(anchor, serverNow)` is the single source of truth. Server `now()` is the stable clock.
- **Host is a leased role** (`HostLease`, 6s lease). Handoff = epoch bump + re-anchor; no clock/authority reshuffle.
- Key files: `PartyClient.ts` (transport: RPCs + Realtime broadcast + clock offset; `party_set_playback` for play/pause/seek), `PartySyncEngine.ts` (drives the local player toward the anchor + routes user controls back to the authority), `useParty.ts` (React glue), `identity.ts` (install/user/connection ids in MMKV).
- **Access modes + admin**: open/locked/private/password (bcrypt via pgcrypto in the `extensions` schema — schema-qualify `crypt`/`gen_salt`), kick, per-member permissions, approve, grab-control (`0002_party_admin.sql`).
- Chat + reactions are a **separate ephemeral Realtime channel** (`usePartyChat.ts`, `party-chat:<code>`), not persisted, never touches the sync channel. GIFs/stickers via **KLIPY** (direct client calls, ToS forbids proxying — `services/gifs.ts`).

## Data / metadata
- TMDB via a **Cloudflare Worker proxy** (`contexts/movieContext/movieContext.tsx` → `tmdb.spiderfan-no1.workers.dev`; token injected server-side). Helpers: `utils/tmdbDetails.ts`, `utils/tmdbLists.ts`.
- Provider list: **bundled** `providers.json`, merged with hijack caps in `components/player/providerRegistry.ts` (`import … from "@/providers.json"`). (The old remote `GITHUB_RAW_JSON_URL` fetch was removed; resolver scaffolding now lives at `utils/streamResolver.old.ts`.)
- Local: MMKV — watch history (`utils/history.ts`), watchlist (`utils/watchlist.ts`), prefs (`utils/prefs.ts`).

## Gotchas (don't relitigate)
- **`@movie-web/providers` was REMOVED** (uninstalled) — its native scrapers resolved nothing (source sites rotted), so `resolveNativeStream` + `utils/polyfills.ts` are gone. Native playback resolves via the **hidden-WebView sniff** instead. (If we ever revisit on-device extraction, the maintained `@p-stream/providers` fork is the candidate — a fresh install, not this package.)
- Emulator `screencap` returns **black once a provider `<video>` binds** (hardware surface) — verify via CDP/fiber, not pixels.
- `bearoom://` scheme + PiP/background need a **native rebuild** (config in `app.json`, but the installed dev build may predate it).
